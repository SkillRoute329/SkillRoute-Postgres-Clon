const https = require('https');
const fs = require('fs');

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      rejectUnauthorized: false,
      timeout: 30000
    }, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// UTM Zone 21S (EPSG:32721) → WGS84
function utmToLatLng(easting, northing) {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const e = Math.sqrt(2 * f - f * f);
  const e2 = e * e / (1 - e * e);
  const k0 = 0.9996;
  const x = easting - 500000;
  const y = northing - 10000000;
  const lon0 = ((21 - 1) * 6 - 180 + 3) * Math.PI / 180;
  
  const M = y / k0;
  const mu = M / (a * (1 - e * e / 4 - 3 * Math.pow(e, 4) / 64));
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
  
  return { lat: Number((lat * 180 / Math.PI).toFixed(6)), lng: Number((lon * 180 / Math.PI).toFixed(6)) };
}

async function main() {
  const geoBase = 'https://geoserver.montevideo.gub.uy/geoserver/ows';
  
  // PASO 1: Obtener variantes de la línea 17
  console.log('=== PASO 1: Variantes de la línea 17 ===');
  const urlVariantes = `${geoBase}?service=wfs&version=2.0.0&request=GetFeature&typename=imm:v_uptu_lsv_destinos&CQL_FILTER=desc_linea=%2717%27&outputFormat=application/json`;
  const r1 = await fetch(urlVariantes);
  const varData = JSON.parse(r1);
  
  console.log(`Variantes encontradas: ${varData.features?.length || 0}`);
  
  if (!varData.features || varData.features.length === 0) {
    console.log('No se encontró línea 17. Buscando variaciones...');
    // Intentar '017'
    const urlAlt = `${geoBase}?service=wfs&version=2.0.0&request=GetFeature&typename=imm:v_uptu_lsv_destinos&CQL_FILTER=desc_linea=%27017%27&outputFormat=application/json`;
    const rAlt = await fetch(urlAlt);
    const altData = JSON.parse(rAlt);
    console.log(`Con '017': ${altData.features?.length || 0}`);
    
    // Buscar directamente entre todas, muestro líneas que empiezan con 1
    const urlAll = `${geoBase}?service=wfs&version=2.0.0&request=GetFeature&typename=imm:v_uptu_lsv_destinos&CQL_FILTER=desc_linea%20LIKE%20%271%25%27&outputFormat=application/json&count=100&propertyName=desc_linea,desc_sublinea,cod_variante,desc_origen,desc_destino`;
    const rAll = await fetch(urlAll);
    const allData = JSON.parse(rAll);
    
    // Mostrar todas las líneas únicas que empiezan con 1
    const lines = {};
    allData.features?.forEach(f => {
      const line = f.properties.desc_linea;
      if (!lines[line]) lines[line] = [];
      lines[line].push(`var=${f.properties.cod_variante} ${f.properties.desc_sublinea} → ${f.properties.desc_destino}`);
    });
    
    console.log('\nLíneas que empiezan con "1":');
    Object.entries(lines).sort((a,b) => a[0].localeCompare(b[0])).forEach(([line, vars]) => {
      console.log(`  Línea ${line}: ${vars.length} variantes`);
      vars.slice(0, 2).forEach(v => console.log(`    ${v}`));
    });
    return;
  }

  const variantes = varData.features.map(f => f.properties);
  variantes.forEach(v => {
    console.log(`  cod_variante=${v.cod_variante}, sublinea="${v.desc_sublinea}", origen="${v.desc_origen}", destino="${v.desc_destino}"`);
  });

  // PASO 2: Descargar geometría de cada variante
  console.log('\n=== PASO 2: Descargando geometría real ===');
  const result = {};
  
  for (const variant of variantes) {
    const codVar = variant.cod_variante;
    console.log(`\nDescargando geometría para cod_variante=${codVar} (${variant.desc_origen} → ${variant.desc_destino})...`);
    
    try {
      const urlGeo = `${geoBase}?service=wfs&version=2.0.0&request=GetFeature&typename=imm:v_uptu_sentido_variante&CQL_FILTER=cod_variante=${codVar}&outputFormat=application/json&srsname=EPSG:32721`;
      const rGeo = await fetch(urlGeo);
      const geoData = JSON.parse(rGeo);
      
      if (geoData.features && geoData.features.length > 0) {
        const feature = geoData.features[0];
        let utmCoords;
        
        if (feature.geometry.type === 'MultiLineString') {
          utmCoords = feature.geometry.coordinates.flat();
        } else if (feature.geometry.type === 'LineString') {
          utmCoords = feature.geometry.coordinates;
        } else {
          console.log(`  Tipo de geometría: ${feature.geometry.type}`);
          utmCoords = feature.geometry.coordinates;
        }
        
        const wgs84 = utmCoords.map(c => utmToLatLng(c[0], c[1]));
        
        console.log(`  ✓ ${wgs84.length} puntos GPS`);
        console.log(`  Inicio: ${JSON.stringify(wgs84[0])}`);
        console.log(`  Fin: ${JSON.stringify(wgs84[wgs84.length - 1])}`);
        
        result[codVar] = {
          cod_variante: codVar,
          desc_sublinea: variant.desc_sublinea,
          origen: variant.desc_origen,
          destino: variant.desc_destino,
          totalPuntos: wgs84.length,
          coordinates: wgs84
        };
      } else {
        console.log('  ✗ Sin geometría');
      }
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }

  // PASO 3: Guardar resultado
  console.log('\n=== PASO 3: Guardando resultado ===');
  fs.writeFileSync('linea_17_real_coordinates.json', JSON.stringify(result, null, 2));
  console.log(`✓ Guardado ${Object.keys(result).length} variantes en linea_17_real_coordinates.json`);
  
  // Resumen
  console.log('\n=== RESUMEN ===');
  Object.values(result).forEach(v => {
    console.log(`  Variante ${v.cod_variante}: ${v.origen} → ${v.destino} (${v.totalPuntos} puntos)`);
  });
}

main().catch(console.error);
