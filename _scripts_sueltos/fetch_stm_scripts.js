/**
 * Descargar los scripts JS del mapa STM para entender de dónde cargan los recorridos.
 * Los scripts clave son: map.js, estilosWMS.js, env.js, conversor.js
 */
const https = require('https');
const fs = require('fs');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      rejectUnauthorized: false
    }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        return fetch(r.headers.location).then(resolve).catch(reject);
      }
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => resolve({ status: r.statusCode, body: d }));
    }).on('error', reject);
  });
}

const BASE = 'https://www.montevideo.gub.uy';
const JSESSIONID = '7cS9YU3zaHg8rIUoVoTfz8sD-GvQaXoKnawISmBb.mistm101prodv';

const scripts = [
  `/app/stm/horarios/javax.faces.resource/map.js.xhtml;jsessionid=${JSESSIONID}?ln=js`,
  `/app/stm/horarios/javax.faces.resource/estilosWMS.js.xhtml;jsessionid=${JSESSIONID}?ln=js`,
  `/app/stm/horarios/javax.faces.resource/env.js.xhtml;jsessionid=${JSESSIONID}?ln=js`,
  `/app/stm/horarios/javax.faces.resource/conversor.js.xhtml;jsessionid=${JSESSIONID}?ln=js`,
];

async function main() {
  for (const script of scripts) {
    const name = script.match(/resource\/([^.]+)/)?.[1] || 'unknown';
    console.log(`\n=== ${name}.js ===`);
    try {
      const result = await fetch(BASE + script);
      console.log(`Status: ${result.status}, Size: ${result.body.length} bytes`);
      fs.writeFileSync(`stm_${name}.js`, result.body);
      console.log(`Saved to stm_${name}.js`);
      
      // Buscar URLs de API, endpoints, WMS/WFS
      const urls = result.body.match(/https?:\/\/[^\s"'<>]+/g) || [];
      if (urls.length > 0) {
        console.log('URLs encontradas:');
        [...new Set(urls)].forEach(u => console.log(`  ${u}`));
      }
      
      // Buscar funciones de carga de recorridos
      const funcNames = result.body.match(/function\s+\w+/g) || [];
      console.log(`Funciones: ${funcNames.join(', ')}`);
      
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }
}

main().catch(console.error);
