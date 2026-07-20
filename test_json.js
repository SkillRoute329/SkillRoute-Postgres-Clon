const fs = require('fs');
const data = JSON.parse(fs.readFileSync('frontend/src/data/shapesAllOperators.json', 'utf8'));
const lines = data.filter(d => ['317', '371', '379', 'PB', 'XA1', 'XA2'].includes(d.linea));
console.log(`Found ${lines.length} matching lines`);
const uniqueLines = [...new Set(lines.map(l => l.linea))];
console.log('Unique lines found:', uniqueLines);
