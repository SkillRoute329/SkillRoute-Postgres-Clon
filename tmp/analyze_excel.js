const XLSX = require('xlsx');
const path = require('path');

const filePath = "C:\\Users\\jonat\\Desktop\\CARTONES Hábil verano 2026 desde 26.12.2025 (1).xls";

try {
  const workbook = XLSX.readFile(filePath);
  console.log('📂 Workbook loaded:', workbook.SheetNames);
  
  workbook.SheetNames.slice(0, 5).forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }).slice(0, 10);
    console.log(`\n📄 Sheet: ${sheetName}`);
    console.log(JSON.stringify(data, null, 2));
  });
} catch (error) {
  console.error('❌ Error reading file:', error);
}
