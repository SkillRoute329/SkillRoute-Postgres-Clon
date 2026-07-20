import https from 'https';

const url = 'https://catalogodatos.gub.uy/api/3/action/package_search?q=viajes+stm';

https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      const results = json.result.results;
      for (const pkg of results) {
        console.log('Package:', pkg.title);
        for (const res of pkg.resources) {
          console.log(' - Resource:', res.name, '| Format:', res.format, '| URL:', res.url);
        }
      }
    } catch (e) {
      console.error(e);
    }
  });
}).on('error', e => console.error(e));
