const https = require('https');
https.get('https://catalogodatos.gub.uy/api/3/action/package_search?q=stm+gtfs', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      const results = json.result.results;
      results.forEach(r => {
        console.log(`PACKAGE: ${r.title}`);
        r.resources.forEach(res => {
          if (res.format.toLowerCase().includes('zip') || res.url.endsWith('.zip')) {
             console.log(`MATCH: ${res.url}`);
          }
        });
      });
    } catch(e) { console.error(e); }
  });
}).on("error", console.error);
