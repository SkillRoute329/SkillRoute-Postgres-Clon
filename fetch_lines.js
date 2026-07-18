const http = require('http');
['10', '20', '50', '70'].forEach(agency => {
  http.get(`http://localhost:3001/api/gtfs/lines?agencyId=${agency}`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        const codes = json.data.map(d => d.codigo).sort();
        console.log(`Agency ${agency}: ${codes.length} lines -> ${codes.join(', ')}`);
      } catch (e) {
        console.error(`Agency ${agency} Error parsing JSON:`, data.substring(0, 50));
      }
    });
  }).on('error', err => console.error(err));
});
