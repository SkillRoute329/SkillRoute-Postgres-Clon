/**
 * Script para descubrir la API interna del mapa STM de Montevideo.
 * URL base: https://www.montevideo.gub.uy/app/stm/horarios/pages/mapa.xhtml
 * 
 * La idea: el mapa del STM usa APIs internas para renderizar las rutas.
 * Vamos a probar endpoints conocidos y variaciones.
 */
const https = require('https');
const fs = require('fs');

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { 
      headers: { 
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      rejectUnauthorized: false
    }, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => resolve({ status: r.statusCode, data: d }));
    });
    req.on('error', e => resolve({ status: 0, data: e.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ status: 0, data: 'timeout' }); });
  });
}

async function main() {
  const base = 'https://www.montevideo.gub.uy';
  
  // Lista de endpoints a probar (variaciones de la API del STM)
  const endpoints = [
    '/transporteRest/variantes/17',
    '/transporteRest/variantes?linea=17',
    '/transporteRest/recorridos/17',
    '/transporteRest/recorridos?linea=17',
    '/transporteRest/lineas/17',
    '/transporteRest/lineas',
    '/transporteRest/empresas',
    '/transporteRest/variantes',
    '/app/stm/servicios/rest/lineas',
    '/app/stm/servicios/rest/lineas/17',
    '/app/stm/servicios/rest/variantes/17',
    '/app/stm/servicios/rest/recorridos/17',
    '/stm/rest/lineas',
    '/stm/rest/lineas/17',
    '/stm-api/lineas',
    '/stm-api/lineas/17',
    '/transporteRest/infoTransporte/variantes/17',
    '/transporteRest/infoTransporte/recorridos/17',
    '/geoserver/sit_montevideo/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=sit_montevideo:v_uptu_lsv&outputFormat=application/json&CQL_FILTER=desc_linea=%2717%27',
    '/geoserver/sit_montevideo/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=sit_montevideo:v_uptu_recorridos&outputFormat=application/json&CQL_FILTER=desc_linea=%2717%27',
  ];

  console.log('=== Probando endpoints del STM Montevideo ===\n');
  
  for (const ep of endpoints) {
    const url = base + ep;
    process.stdout.write(`  ${ep.substring(0, 70).padEnd(70)} `);
    const result = await fetch(url);
    const preview = result.data.substring(0, 150).replace(/\n/g, ' ');
    if (result.status === 200 && !result.data.includes('<!DOCTYPE') && !result.data.includes('<html')) {
      console.log(`✓ ${result.status} [${result.data.length}b] ${preview}`);
      // Guardar respuestas exitosas
      const safeName = ep.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
      fs.writeFileSync(`stm_response_${safeName}.json`, result.data);
    } else {
      console.log(`✗ ${result.status} [${result.data.length}b] ${preview.substring(0, 60)}`);
    }
  }
}

main().catch(console.error);
