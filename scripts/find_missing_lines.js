/**
 * Busca en el GeoServer de la IMM todas las líneas disponibles 
 * para encontrar las variantes de 8SR, 11A, 221
 */
const https = require('https');

const WFS_BASE = 'https://montevideo.gub.uy/app/geoserver/wfs';
const LAYER = 'mapstore-tematicas:vyt_v_uptu_lsv';

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'TransformaFacil-UCOT/1.0' },
      timeout: 60000,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

(async () => {
  console.log('Descargando features...');
  const url = `${WFS_BASE}?service=WFS&version=1.1.0&request=GetFeature&typeName=${LAYER}&outputFormat=application/json&maxFeatures=5000`;
  const data = await fetchJSON(url);
  console.log(`Total features: ${data.features?.length || 0}\n`);

  // Collect unique line names
  const lineNames = new Map();
  for (const f of data.features) {
    const desc = String(f.properties.desc_linea || '').trim();
    if (!lineNames.has(desc)) {
      lineNames.set(desc, {
        count: 0,
        sublineas: new Set(),
        empresa: f.properties.desc_empresa || '',
      });
    }
    const entry = lineNames.get(desc);
    entry.count++;
    entry.sublineas.add(String(f.properties.desc_sublinea || '').trim());
  }

  // Sort by line name
  const sorted = [...lineNames.entries()].sort((a, b) => {
    const numA = parseInt(a[0]) || 9999;
    const numB = parseInt(b[0]) || 9999;
    return numA - numB || a[0].localeCompare(b[0]);
  });

  console.log('=== TODAS LAS LÍNEAS EN EL GEOSERVER ===\n');
  for (const [name, info] of sorted) {
    const empresa = info.empresa;
    const subs = [...info.sublineas].join(' | ');
    console.log(`  ${name.padEnd(10)} [${empresa}] x${info.count} — ${subs}`);
  }

  // Find lines that might match 8SR, 11A, 221
  console.log('\n=== BÚSQUEDA DE 8SR, 11A, 221 ===');
  const searchTerms = ['8', '11', '221', 'SR', '8SR', '11A'];
  for (const term of searchTerms) {
    const matches = sorted.filter(([name]) => 
      name.includes(term) || name.toLowerCase().includes(term.toLowerCase())
    );
    if (matches.length > 0) {
      console.log(`\n  Búsqueda "${term}":`);
      for (const [name, info] of matches) {
        console.log(`    → ${name} [${info.empresa}] x${info.count}`);
      }
    }
  }

  // Also look specifically for UCOT lines
  console.log('\n=== LÍNEAS DE UCOT ===');
  const ucotLines = sorted.filter(([, info]) => 
    info.empresa.toUpperCase().includes('UCOT')
  );
  for (const [name, info] of ucotLines) {
    const subs = [...info.sublineas].join(' | ');
    console.log(`  ${name.padEnd(10)} x${info.count} — ${subs}`);
  }
})();
