const https = require('https');
const fs = require('fs');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      rejectUnauthorized: false
    }, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

async function main() {
  const geoBase = 'https://geoserver.montevideo.gub.uy/geoserver';
  
  // 1. Ver respuesta de error cruda
  console.log('=== Error crudo del GeoServer ===');
  const url1 = `${geoBase}/ows?service=wfs&version=2.0.0&request=GetFeature&typename=imm:v_uptu_sentido_variante&CQL_FILTER=desc_linea%3D%2717%27&outputFormat=application/json&srsname=EPSG:32721&count=1`;
  const r1 = await fetch(url1);
  console.log(r1);
  
  // 2. Probar con GetCapabilities
  console.log('\n\n=== GetCapabilities (parcial) ===');
  const url2 = `${geoBase}/wfs?service=wfs&version=2.0.0&request=GetCapabilities`;
  const r2 = await fetch(url2);
  // Buscar FeatureType que contenga "uptu" o "variante"
  const matches = r2.match(/<Name>[^<]*uptu[^<]*<\/Name>/gi) || [];
  console.log('Capas con "uptu":');
  matches.forEach(m => console.log('  ', m));
  
  // 3. Probar con el namespace correcto del env.js
  console.log('\n\n=== Prueba con namespace imm ===');
  const url3 = `${geoBase}/imm/ows?service=wfs&version=2.0.0&request=GetFeature&typename=imm:v_uptu_sentido_variante&outputFormat=application/json&srsname=EPSG:32721&count=1`;
  const r3 = await fetch(url3);
  console.log('Size:', r3.length);
  fs.writeFileSync('geoserver_test.txt', r3);
  
  // Si es JSON parseable
  try {
    const data = JSON.parse(r3);
    console.log('Features:', data.features?.length);
    if (data.features?.[0]) {
      console.log('Properties:', JSON.stringify(data.features[0].properties));
    }
  } catch (_) {
    console.log('Response:', r3.substring(0, 500));
  }
}

main().catch(console.error);
