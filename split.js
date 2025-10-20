'use strict';

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const { stringify } = require('csv-stringify');

/**
 * Parse CLI args like --input a.csv --out-csv b.csv --html-dir src
 */
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function safeSlug(input, fallback) {
  const base = String(input ?? fallback ?? 'item')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
  return base;
}

async function main() {
  const args = parseArgs(process.argv);
  const inputCsv = args['input'] || 'data.csv';
  const outCsv = args['out-csv'] || 'data_clear.csv';
  const htmlDir = args['html-dir'] || 'src';
  const hrefPrefix = args['href-prefix'] || '';

  ensureDir(htmlDir);
  const inputStream = fs.createReadStream(inputCsv);

  const records = [];
  const parser = inputStream.pipe(
    parse({
      columns: true,
      bom: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
      trim: true,
    })
  );

  const htmlColumnNameCandidates = ['HTML', 'html', 'Html', 'HTML nội dung'];

  for await (const row of parser) {
    // Determine HTML column name once lazily
    let htmlCol = htmlColumnNameCandidates.find((c) => Object.prototype.hasOwnProperty.call(row, c));
    if (!htmlCol) {
      // If no html column, just push row as-is and keep going
      records.push({ row, htmlCol: null });
      continue;
    }
    records.push({ row, htmlCol });
  }

  if (records.length === 0) {
    console.error('Không có bản ghi nào trong input CSV.');
    return;
  }

  // Collect headers
  const sample = records[0].row;
  const allHeaders = Object.keys(sample);
  const detectedHtmlCol = records[0].htmlCol || htmlColumnNameCandidates.find((c) => allHeaders.includes(c));
  const outputHeaders = allHeaders.filter((h) => h !== detectedHtmlCol);
  if (!outputHeaders.includes('href')) outputHeaders.push('href');

  // Prepare CSV stringifier
  const stringifier = stringify({ header: true, columns: outputHeaders });
  const outStream = fs.createWriteStream(outCsv);
  stringifier.pipe(outStream);

  // Write rows and HTML files
  let indexCounter = 0;
  for (const item of records) {
    const row = { ...item.row };
    const htmlContent = detectedHtmlCol ? row[detectedHtmlCol] : undefined;
    delete row[detectedHtmlCol];

    let hrefValue = '';
    if (htmlContent && String(htmlContent).trim().length > 0) {
      const baseName = safeSlug(row['tohop_id'] || row['school_id'] || row['Trường'] || row['Tổ hợp'] || `row-${indexCounter}`, `row-${indexCounter}`);
      const fileName = `${baseName || 'row'}-${indexCounter}.html`;
      const filePath = path.join(htmlDir, fileName);

      try {
        fs.writeFileSync(filePath, String(htmlContent), { encoding: 'utf8' });
        hrefValue = hrefPrefix ? path.posix.join(hrefPrefix.replace(/\\/g, '/'), fileName) : path.join(htmlDir, fileName).replace(/\\/g, '/');
      } catch (err) {
        console.error(`Lỗi ghi file HTML cho bản ghi ${indexCounter}:`, err.message);
        hrefValue = '';
      }
    }

    row['href'] = hrefValue;
    stringifier.write(row);
    indexCounter++;
  }

  stringifier.end();
  await new Promise((resolve, reject) => {
    outStream.on('finish', resolve);
    outStream.on('error', reject);
  });

  console.log(`Đã xuất CSV nhẹ: ${outCsv}`);
  console.log(`Đã lưu HTML files vào: ${path.resolve(htmlDir)}`);
}

main().catch((err) => {
  console.error('Lỗi không mong muốn:', err);
  process.exitCode = 1;
});


