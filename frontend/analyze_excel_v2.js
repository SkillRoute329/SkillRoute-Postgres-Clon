const XLSX = require('xlsx');
const path = require('path');

const filePath = "C:\\Users\\jonat\\Desktop\\CARTONES Hábil verano 2026 desde 26.12.2025 (1).xls";

try {
  const workbook = XLSX.readFile(filePath);
  console.log('📂 Total Sheets:', workbook.SheetNames.length);
  console.log('📄 Sheet Names:', workbook.SheetNames.slice(0, 10));
} catch (error) {
  console.error('❌ Error reading file:', error);
}
