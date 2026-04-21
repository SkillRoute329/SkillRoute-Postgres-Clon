const xlsx = require('./node_modules/xlsx');
const path = require('path');

const DOC_DIR = 'C:\\Users\\jonat\\Desktop\\doc Ucot';

function findFile(pattern) {
  const files = require('fs').readdirSync(DOC_DIR);
  return files.find(f => f.toLowerCase().includes(pattern.toLowerCase()));
}

function parseFile(filename, maxRows = 30) {
  const filepath = path.join(DOC_DIR, filename);
  console.log('\n\n===== ' + filename + ' =====');
  const wb = xlsx.readFile(filepath);
  console.log('Sheets:', wb.SheetNames);

  for (const sheetName of wb.SheetNames.slice(0, 3)) {
    const ws = wb.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
    console.log('\n--- Sheet:', sheetName, '(', data.length, 'rows) ---');
    data.slice(0, maxRows).forEach((row, i) => {
      if (row.some(c => c !== '')) console.log(i + ':', JSON.stringify(row));
    });
  }
}

parseFile('R-21.01.2026.xls', 30);
const boletinVerano = findFile('boletin') && require('fs').readdirSync(DOC_DIR).find(f => f.toLowerCase().includes('boletin') && f.toLowerCase().includes('verano'));
if (boletinVerano) parseFile(boletinVerano, 30);
else console.log('Boletin verano not found');
