const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../../frontend/src/data/shapesAllOperators.json'), 'utf8'));
const map = {};
Object.values(data).forEach(entry => {
    const ag = entry.agencyId || 'UNKNOWN';
    if (!map[ag]) map[ag] = new Set();
    map[ag].add(entry.linea);
});
Object.keys(map).forEach(ag => {
    console.log(ag + ': ' + Array.from(map[ag]).sort().join(', '));
});
