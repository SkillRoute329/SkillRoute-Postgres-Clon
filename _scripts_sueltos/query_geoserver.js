/**
 * Consultar el GeoServer oficial de Montevideo para obtener los recorridos
 * reales de la línea 17 (y potencialmente todas las líneas UCOT).
 * 
 * Endpoints descubiertos en map.js y env.js:
 * - v_uptu_sentido_variante: recorridos geométricos
 * - v_uptu_paradas: paradas con coordenadas
 * 
 * Los datos vienen en EPSG:32721 (UTM zona 21S), hay que convertir a WGS84 (lat/lng).
 */
const https = require('https');
const fs = require('fs');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      rejectUnauthorized: false
    }, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => resolve({ status: r.statusCode, body: d }));
    }).on('error', reject);
  });
}

// Conversión UTM Zone 21S (EPSG:32721) a WGS84 (lat/lng)
function utmToLatLng(easting, northing) {
  // Simplified UTM Zone 21S to WGS84 conversion
  const a = 6378137; // WGS84 major axis
  const f = 1 / 298.257223563;
  const e = Math.sqrt(2 * f - f * f);
  const e2 = e * e / (1 - e * e);
  const k0 = 0.9996;
  const x = easting - 500000;
  const y = northing - 10000000; // Southern hemisphere
  const zone = 21;
  const lon0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
  
  const M = y / k0;
  const mu = M / (a * (1 - e * e / 4 - 3 * e * e * e * e / 64));
  const e1 = (1 - Math.sqrt(1 - e * e)) / (1 + Math.sqrt(1 - e * e));
  const phi1 = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
    + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu);
  
  const sinPhi = Math.sin(phi1);
  const cosPhi = Math.cos(phi1);
  const tanPhi = sinPhi / cosPhi;
  const N1 = a / Math.sqrt(1 - e * e * sinPhi * sinPhi);
  const T1 = tanPhi * tanPhi;
  const C1 = e2 * cosPhi * cosPhi;
  const R1 = a * (1 - e * e) / Math.pow(1 - e * e * sinPhi * sinPhi, 1.5);
  const D = x / (N1 * k0);
  
  const lat = phi1 - (N1 * tanPhi / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * e2) * Math.pow(D, 4) / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * e2 - 3 * C1 * C1) * Math.pow(D, 6) / 720);
  
  const lon = lon0 + (D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * e2 + 24 * T1 * T1) * Math.pow(D, 5) / 120) / cosPhi;
  
  return { lat: lat * 180 / Math.PI, lng: lon * 180 / Math.PI };
}

async function main() {
  const geoBase = 'https://geoserver.montevideo.gub.uy/geoserver/ows';
  
  // Paso 1: Buscar las variantes de la línea 17
  // Usamos v_uptu_sentido_variante con filtro por desc_linea
  console.log('=== Paso 1: Buscar variantes de la línea 17 ===\n');
  
  const queries = [
    // Buscar por desc_linea = '17'
    `${geoBase}?service=wfs&version=2.0.0&request=GetFeature&typename=imm:v_uptu_sentido_variante&CQL_FILTER=desc_linea='17'&outputFormat=application/json&srsname=EPSG:32721&count=2`,
    // Buscar por desc_linea LIKE '017'
    `${geoBase}?service=wfs&version=2.0.0&request=GetFeature&typename=imm:v_uptu_sentido_variante&CQL_FILTER=desc_linea='017'&outputFormat=application/json&srsname=EPSG:32721&count=2`,
    // Buscar por cod_linea = 17
    `${geoBase}?service=wfs&version=2.0.0&request=GetFeature&typename=imm:v_uptu_sentido_variante&CQL_FILTER=cod_linea=17&outputFormat=application/json&srsname=EPSG:32721&count=2`,
  ];
  
  for (const url of queries) {
    console.log(`Query: ...CQL_FILTER=${url.split('CQL_FILTER=')[1]?.split('&')[0]}`);
    try {
      const res = await fetch(url);
      console.log(`  Status: ${res.status}, Size: ${res.body.length}`);
      
      if (res.status === 200 && res.body.length > 200) {
        const data = JSON.parse(res.body);
        if (data.features && data.features.length > 0) {
          console.log(`  ✓ Encontradas ${data.features.length} features!`);
          fs.writeFileSync('geoserver_line17_raw.json', JSON.stringify(data, null, 2));
          
          data.features.forEach((f, i) => {
            const props = f.properties;
            console.log(`\n  Feature ${i}:`);
            console.log(`    cod_variante: ${props.cod_variante}`);
            console.log(`    desc_linea: ${props.desc_linea}`);
            console.log(`    destino: ${props.destino || props.desc_destino || 'N/A'}`);
            console.log(`    tipo: ${f.geometry?.type}`);
            
            if (f.geometry?.coordinates) {
              const coords = f.geometry.type === 'MultiLineString' 
                ? f.geometry.coordinates.flat()
                : f.geometry.coordinates;
              console.log(`    Puntos GPS: ${coords.length}`);
              
              // Convertir UTM a WGS84
              const wgs84Coords = coords.map(c => utmToLatLng(c[0], c[1]));
              console.log(`    Primer punto (WGS84): ${JSON.stringify(wgs84Coords[0])}`);
              console.log(`    Último punto (WGS84): ${JSON.stringify(wgs84Coords[wgs84Coords.length - 1])}`);
              
              // Guardar coordenadas convertidas
              const variantId = props.cod_variante || i;
              const outputData = {
                cod_variante: props.cod_variante,
                desc_linea: props.desc_linea,
                destino: props.destino || props.desc_destino,
                totalPuntos: wgs84Coords.length,
                coordinates: wgs84Coords
              };
              fs.writeFileSync(`linea_17_var${variantId}_wgs84.json`, JSON.stringify(outputData, null, 2));
              console.log(`    ✓ Guardado en linea_17_var${variantId}_wgs84.json`);
            }
          });
          
          break; // Encontramos resultados, salir
        } else {
          console.log('  (sin features)');
        }
      } else {
        console.log(`  ${res.body.substring(0, 200)}`);
      }
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }
  
  // Paso 2: Si no encontramos por línea, intentar listar todas las variantes para descubrir el formato
  console.log('\n\n=== Paso 2: Descubrir campo desc_linea (sample de variantes) ===');
  try {
    const sampleUrl = `${geoBase}?service=wfs&version=2.0.0&request=GetFeature&typename=imm:v_uptu_sentido_variante&outputFormat=application/json&srsname=EPSG:32721&count=3&propertyName=cod_variante,desc_linea,destino,desc_destino,cod_linea`;
    const res = await fetch(sampleUrl);
    if (res.status === 200) {
      const data = JSON.parse(res.body);
      if (data.features) {
        console.log('\nSample de variantes (primeras 3):');
        data.features.forEach(f => {
          console.log(`  ${JSON.stringify(f.properties)}`);
        });
        fs.writeFileSync('geoserver_sample.json', res.body);
      }
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
}

main().catch(console.error);
