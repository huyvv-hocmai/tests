const fs = require('fs');
const path = require('path');
// use the supported sync entry points
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const repoPrefix = 'https://raw.githubusercontent.com/huyvv-hocmai/tests/main/';
const input = path.join(__dirname, '..', 'data_clear.csv');
const output = path.join(__dirname, '..', 'done.csv');

const raw = fs.readFileSync(input, 'utf8');
const records = parse(raw, { columns: true, skip_empty_lines: false });

const updated = records.map(row => {
  if (row.href && row.href.startsWith('src/')) {
    row.href = repoPrefix + row.href.replace(/\\\\/g, '/');
  }
  return row;
});

const out = stringify(updated, { header: true });
fs.writeFileSync(output, out);
console.log('Wrote', output);
