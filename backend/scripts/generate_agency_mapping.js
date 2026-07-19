const fs = require('fs');
const path = require('path');
const https = require('https');

const STM_ONLINE_URL = 'https://www.montevideo.gub.uy/buses/rest/stm-online';
const OUTPUT_PATH = path.join(__dirname, '../src/data/gtfs/agency_mapping.json');

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'Referer': 'https://www.montevideo.gub.uy/buses/',
  'Origin': 'https://www.montevideo.gub.uy',
};

async function generateMapping() {
  console.log("Consultando stm-online para mapear líneas a empresas...");
  
  const body = JSON.stringify({ empresa: '-1' });

  return new Promise((resolve, reject) => {
    const req = https.request(STM_ONLINE_URL, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP Error ${res.statusCode}`));
        }
        try {
          const json = JSON.parse(data);
          const mapping = {};
          
          if (json.features) {
            json.features.forEach(f => {
              const p = f.properties;
              if (p && p.linea && p.codigoEmpresa) {
                // Ensure the route short name has no spaces and is uppercase
                let k = String(p.linea).trim().toUpperCase();
                
                // Some routes might have a letter appended, but we want to map the base prefix
                // e.g. "300" or "104" or "17"
                const m = k.match(/^(\d+[A-Z]?)/);
                if (m) k = m[1];
                
                mapping[k] = String(p.codigoEmpresa);
              }
            });
          }
          
          // Fallbacks and manual overrides for known missing edge cases
          mapping['17'] = '70'; // UCOT
          mapping['71'] = '70'; // UCOT
          mapping['79'] = '70'; // UCOT
          mapping['317'] = '70'; // UCOT (internal UCOT name)
          mapping['379'] = '70'; // UCOT (internal UCOT name)
          mapping['371'] = '70'; // UCOT (internal UCOT name)
          
          fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
          fs.writeFileSync(OUTPUT_PATH, JSON.stringify(mapping, null, 2));
          console.log(`✅ Mapping guardado en ${OUTPUT_PATH} con ${Object.keys(mapping).length} líneas.`);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
    
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

generateMapping().catch(e => {
  console.error("❌ Error generando mapping:", e);
  process.exit(1);
});
