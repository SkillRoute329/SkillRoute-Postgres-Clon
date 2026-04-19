const XLSX = require('xlsx');
const fs = require('fs');

function parseTime(v) {
  if (v == null || v === '') return null;
  // Handle Excel Date objects/numbers
  if (typeof v === 'number') {
    const totalMinutes = Math.round(v * 24 * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[:\s.](\d{2})$/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  return s || null;
}

const filePaths = [
  'C:\\Users\\jonat\\Desktop\\PROYECTOS\\TransformaFacil-2.0\\CARTONES Hábil verano 2026 desde 26.12.2025.xls',
  'C:\\Users\\jonat\\Desktop\\PROYECTOS\\TransformaFacil-2.0\\CARTONES Hábil verano 2026 desde 26.12.2025 (1).xls',
];

filePaths.forEach((filePath) => {
  if (!fs.existsSync(filePath)) return;
  console.log(`\n--- Inspecting ${filePath} ---`);
  const wb = XLSX.readFile(filePath);
  const sheetNames = wb.SheetNames;
  console.log(`Sheets found: ${sheetNames.length}`);

  sheetNames.forEach((name) => {
    if (name.includes('221')) {
      console.log(`\nFound sheet matching 221: "${name}"`);
      const sheet = wb.Sheets[name];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      console.log(`Rows: ${data.length}`);
      // Print first 5 rows
      data.slice(0, 10).forEach((row, i) => {
        console.log(
          `Row ${i}: ${row.map((c) => (typeof c === 'number' ? c.toFixed(4) : c)).join(' | ')}`,
        );
      });
    }
  });
});
