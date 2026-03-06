const XLSX = require('xlsx');
const path = require('path');

const filePath = "C:\\Users\\jonat\\Desktop\\CARTONES Hábil verano 2026 desde 26.12.2025 (1).xls";

try {
  const workbook = XLSX.readFile(filePath);
  const sheetNames = workbook.SheetNames;
  console.log('📂 Total Sheets:', sheetNames.length);
  
  const sheetName = sheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  
  console.log(`\n📄 Content of sheet '${sheetName}':`);
  data.slice(0, 50).forEach((row, i) => {
    const rowStr = row.map(c => String(c).trim()).join(' | ');
    if (rowStr.replace(/[| ]/g, '').length > 0) {
      console.log(`${String(i).padStart(2, ' ')}: ${rowStr}`);
    }
  });

} catch (error) {
  console.error('❌ Error reading file:', error);
}
