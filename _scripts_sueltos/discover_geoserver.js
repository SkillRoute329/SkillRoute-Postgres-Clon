const https = require('https');
const fs = require('fs');

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      rejectUnauthorized: false,
      timeout: 15000
    }, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function main() {
  const geoBase = 'https://geoserver.montevideo.gub.uy/geoserver';
  
  // 1. DescribeFeatureType para v_uptu_lsv_destinos (tiene línea+destino)
  console.log('=== DescribeFeatureType: v_uptu_lsv_destinos ===');
  try {
    const url1 = `${geoBase}/wfs?service=wfs&version=2.0.0&request=DescribeFeatureType&typename=imm:v_uptu_lsv_destinos`;
    const r1 = await fetch(url1);
    const fields1 = r1.match(/name="([^"]+)"/g)?.map(m => m.match(/name="([^"]+)"/)[1]) || [];
    console.log('Campos:', fields1.join(', '));
    fs.writeFileSync('describe_lsv_destinos.xml', r1);
  } catch (e) { console.log('Error:', e.message); }

  // 2. DescribeFeatureType para v_uptu_sentido_variante (recorrido geométrico)
  console.log('\n=== DescribeFeatureType: v_uptu_sentido_variante ===');
  try {
    const url2 = `${geoBase}/wfs?service=wfs&version=2.0.0&request=DescribeFeatureType&typename=imm:v_uptu_sentido_variante`;
    const r2 = await fetch(url2);
    const fields2 = r2.match(/name="([^"]+)"/g)?.map(m => m.match(/name="([^"]+)"/)[1]) || [];
    console.log('Campos:', fields2.join(', '));
    fs.writeFileSync('describe_sentido_variante.xml', r2);
  } catch (e) { console.log('Error:', e.message); }

  // 3. Obtener sample de v_uptu_lsv_destinos
  console.log('\n=== Sample v_uptu_lsv_destinos ===');
  try {
    const url3 = `${geoBase}/ows?service=wfs&version=2.0.0&request=GetFeature&typename=imm:v_uptu_lsv_destinos&outputFormat=application/json&count=5`;
    const r3 = await fetch(url3);
    const data = JSON.parse(r3);
    if (data.features) {
      data.features.forEach(f => {
        console.log(JSON.stringify(f.properties));
      });
      fs.writeFileSync('sample_lsv_destinos.json', JSON.stringify(data, null, 2));
    }
  } catch (e) { console.log('Error:', e.message); }

  // 4. Obtener sample de v_uptu_sentido_variante (sin geometría para speed)
  console.log('\n=== Sample v_uptu_sentido_variante (propiedades only) ===');
  try {
    const url4 = `${geoBase}/ows?service=wfs&version=2.0.0&request=GetFeature&typename=imm:v_uptu_sentido_variante&outputFormat=application/json&count=3&propertyName=cod_variante`;
    const r4 = await fetch(url4);
    const data = JSON.parse(r4);
    if (data.features) {
      data.features.forEach(f => {
        console.log(JSON.stringify(f.properties));
      });
    }
  } catch (e) { console.log('Error:', e.message); }
}

main().catch(console.error);
