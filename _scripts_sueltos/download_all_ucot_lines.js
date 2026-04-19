/**
 * Descarga TODAS las líneas UCOT del GeoServer oficial (v2 — método directo).
 * Usa la capa v_uptu_sentido_variante directamente con filtro por desc_linea.
 */
const https = require('https');
const fs = require('fs');

const WFS_BASE = 'https://geoserver.montevideo.gub.uy/geoserver/imm/ows';

// Líneas UCOT a descargar
const UCOT_LINE_NAMES = ['17', '71', '79', '300', '306', '316', '328', '329', '330', '370', '396', '11A', '221'];

function fetchWithRetry(url, retries = 3) {
  return new Promise((resolve, reject) => {
    function attempt(n) {
      const req = https.get(url, { timeout: 60000 }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            if (n > 0) {
              console.log(`    ↻ Reintentando (${retries - n + 1}/${retries})...`);
              setTimeout(() => attempt(n - 1), 2000);
            } else {
              reject(new Error(`JSON parse error: ${body.substring(0, 200)}`));
            }
          }
        });
      });
      req.on('error', (err) => {
        if (n > 0) {
          console.log(`    ↻ Reintentando (${retries - n + 1}/${retries}) — ${err.message}`);
          setTimeout(() => attempt(n - 1), 3000);
        } else { reject(err); }
      });
      req.on('timeout', () => {
        req.destroy();
        if (n > 0) {
          console.log(`    ↻ Timeout — reintentando (${retries - n + 1}/${retries})...`);
          setTimeout(() => attempt(n - 1), 3000);
        } else { reject(new Error('Timeout agotado')); }
      });
    }
    attempt(retries);
  });
}

/** Convierte UTM Zone 21S → WGS84 */
function utmToLatLng(easting, northing) {
  const k0 = 0.9996, a = 6378137, e = 0.0818192;
  const e2 = e * e, e_p2 = e2 / (1 - e2);
  const x = easting - 500000, y = northing - 10000000;
  const M = y / k0;
  const mu = M / (a * (1 - e2/4 - 3*e2*e2/64 - 5*e2*e2*e2/256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu + (3*e1/2 - 27*e1*e1*e1/32)*Math.sin(2*mu) + (21*e1*e1/16 - 55*e1*e1*e1*e1/32)*Math.sin(4*mu) + (151*e1*e1*e1/96)*Math.sin(6*mu);
  const sinP = Math.sin(phi1), cosP = Math.cos(phi1), tanP = Math.tan(phi1);
  const N1 = a / Math.sqrt(1 - e2*sinP*sinP), T1 = tanP*tanP, C1 = e_p2*cosP*cosP;
  const R1 = a*(1-e2)/Math.pow(1-e2*sinP*sinP, 1.5), D = x/(N1*k0);
  const lat = phi1 - (N1*tanP/R1)*(D*D/2-(5+3*T1+10*C1-4*C1*C1-9*e_p2)*D**4/24+(61+90*T1+298*C1+45*T1*T1-252*e_p2-3*C1*C1)*D**6/720);
  const lng_rad = (D-(1+2*T1+C1)*D**3/6+(5-2*C1+28*T1-3*C1*C1+8*e_p2+24*T1*T1)*D**5/120)/cosP;
  const lng0 = -57*Math.PI/180;
  return { lat: parseFloat((lat*180/Math.PI).toFixed(6)), lng: parseFloat(((lng_rad+lng0)*180/Math.PI).toFixed(6)) };
}

function extractCoords(geometry) {
  if (!geometry?.coordinates) return [];
  const coords = [];
  function walk(arr) {
    if (typeof arr[0] === 'number') {
      const c = utmToLatLng(arr[0], arr[1]);
      if (c.lat < -30 && c.lat > -36 && c.lng < -53 && c.lng > -59) coords.push(c);
    } else if (Array.isArray(arr[0])) { arr.forEach(walk); }
  }
  walk(geometry.coordinates);
  return coords;
}

async function downloadOneLine(descLinea) {
  console.log(`\n📦 Línea ${descLinea}...`);
  
  // Buscar todas las variantes de esta línea
  const cql = `desc_linea='${descLinea}'`;
  const url = `${WFS_BASE}?service=WFS&version=1.0.0&request=GetFeature&typeName=imm:v_uptu_sentido_variante&outputFormat=application/json&CQL_FILTER=${encodeURIComponent(cql)}`;
  
  const data = await fetchWithRetry(url);
  
  if (!data.features || data.features.length === 0) {
    console.log(`  ⚠️  Sin resultados para desc_linea='${descLinea}'`);
    return null;
  }
  
  const result = {};
  for (const feature of data.features) {
    const props = feature.properties;
    const codVar = String(props.cod_variante);
    const coords = extractCoords(feature.geometry);
    
    if (coords.length < 5) continue;
    
    result[codVar] = {
      cod_variante: codVar,
      desc_sublinea: props.desc_sublinea || '',
      origen: props.desc_origen || '',
      destino: props.desc_destino || '',
      coordinates: coords,
    };
    console.log(`  📍 ${codVar}: ${result[codVar].origen} → ${result[codVar].destino} (${coords.length} pts)`);
  }
  
  console.log(`  ✅ ${Object.keys(result).length} variantes con geometría`);
  return Object.keys(result).length > 0 ? result : null;
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  DESCARGA MASIVA — LÍNEAS UCOT');
  console.log('  GeoServer Intendencia de Montevideo');
  console.log('═══════════════════════════════════════════');
  
  const allData = {};
  
  for (const line of UCOT_LINE_NAMES) {
    try {
      const data = await downloadOneLine(line);
      if (data) allData[line] = data;
    } catch (err) {
      console.log(`  ❌ Error línea ${line}: ${err.message}`);
    }
    // Pausa de 2s entre líneas para no saturar
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // Intentar también "8" y "8SR" para la línea especial
  try {
    console.log('\n📦 Línea 8SR (buscando como "8")...');
    const d8 = await downloadOneLine('8');
    if (d8) allData['8SR'] = d8;
    else {
      const d8sr = await downloadOneLine('8SR');
      if (d8sr) allData['8SR'] = d8sr;
    }
  } catch (err) {
    console.log(`  ❌ Error línea 8SR: ${err.message}`);
  }
  
  // Guardar
  fs.writeFileSync('all_ucot_routes.json', JSON.stringify(allData, null, 2));
  
  let totalVar = 0, totalPts = 0;
  for (const [code, variants] of Object.entries(allData)) {
    const nv = Object.keys(variants).length;
    const np = Object.values(variants).reduce((s, v) => s + v.coordinates.length, 0);
    totalVar += nv; totalPts += np;
    console.log(`  L${code}: ${nv} variantes, ${np} puntos`);
  }
  
  console.log('\n═══════════════════════════════════════════');
  console.log(`  ✅ ${Object.keys(allData).length}/${UCOT_LINE_NAMES.length + 1} líneas`);
  console.log(`  📊 ${totalVar} variantes — ${totalPts} puntos GPS`);
  console.log('═══════════════════════════════════════════');
}

main().catch(console.error);
