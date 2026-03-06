const fs = require('fs');
try {
  const content = fs.readFileSync('creds.txt', 'utf16le'); // Try UTF-16LE first
  console.log(content);
} catch (e) {
  try {
    const content = fs.readFileSync('creds.txt', 'utf8');
    console.log(content);
  } catch (e2) {
    console.error(e2);
  }
}
