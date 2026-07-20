const fs = require('fs');
const path = 'backend/src/modules/gtfs-core/data/gtfs/agency_mapping.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
// Because JSON.parse drops duplicates (keeps the last one), we can just write it back.
fs.writeFileSync(path, JSON.stringify(data, null, 2));
console.log('Fixed duplicates in agency_mapping.json');
