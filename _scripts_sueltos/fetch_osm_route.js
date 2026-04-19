/**
 * Script para descargar el recorrido real de la línea 17 UCOT desde OpenStreetMap.
 * Usa la Overpass API para obtener la geometría exacta de la ruta.
 */
const https = require('https');
const fs = require('fs');

// Paso 1: Buscar todas las relaciones de bus routes en Montevideo
// que tengan ref=17 o que mencionen "17" en su nombre
const queries = [
  // Búsqueda exacta por ref
  '[out:json][timeout:60];relation["route"="bus"]["ref"="17"](-35.05,-56.35,-34.82,-56.05);out tags;',
  // Búsqueda con ref como "017"
  '[out:json][timeout:60];relation["route"="bus"]["ref"="017"](-35.05,-56.35,-34.82,-56.05);out tags;',
  // Buscar todas las rutas de bus de UCOT en Montevideo
  '[out:json][timeout:60];relation["route"="bus"]["operator"~"UCOT",i](-35.05,-56.35,-34.82,-56.05);out tags;',
  // Buscar por RAINCOOP (anterior operador de la linea 17)
  '[out:json][timeout:60];relation["route"="bus"]["operator"~"RAINCOOP",i](-35.05,-56.35,-34.82,-56.05);out tags;',
];

const servers = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

function fetchQuery(query, serverIdx = 0) {
  const server = servers[serverIdx];
  const url = `${server}?data=${encodeURIComponent(query)}`;
  
  return new Promise((resolve, reject) => {
    https.get(url, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          // Try next server
          if (serverIdx < servers.length - 1) {
            resolve(fetchQuery(query, serverIdx + 1));
          } else {
            reject(new Error('Parse failed: ' + d.substring(0, 200)));
          }
        }
      });
    }).on('error', e => {
      if (serverIdx < servers.length - 1) {
        resolve(fetchQuery(query, serverIdx + 1));
      } else {
        reject(e);
      }
    });
  });
}

async function main() {
  console.log('=== Buscando línea 17 en OpenStreetMap ===\n');
  
  for (let i = 0; i < queries.length; i++) {
    console.log(`Query ${i + 1}: ${queries[i].substring(0, 80)}...`);
    try {
      const result = await fetchQuery(queries[i]);
      if (result.elements && result.elements.length > 0) {
        console.log(`  ✓ Encontrados ${result.elements.length} resultados:`);
        result.elements.forEach((el) => {
          console.log(`    - ID: ${el.id}, type: ${el.type}`);
          if (el.tags) {
            console.log(`      name: ${el.tags.name || 'N/A'}`);
            console.log(`      ref: ${el.tags.ref || 'N/A'}`);
            console.log(`      operator: ${el.tags.operator || 'N/A'}`);
            console.log(`      from: ${el.tags.from || 'N/A'}`);
            console.log(`      to: ${el.tags.to || 'N/A'}`);
          }
        });
        
        // Guardar IDs para paso 2
        const ids = result.elements.map(e => e.id);
        fs.writeFileSync('osm_found_ids.json', JSON.stringify({ query: i, ids, elements: result.elements }, null, 2));
      } else {
        console.log('  (sin resultados)');
      }
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }
  
  // Si encontramos IDs, descargar la geometría completa
  if (fs.existsSync('osm_found_ids.json')) {
    const found = JSON.parse(fs.readFileSync('osm_found_ids.json', 'utf8'));
    console.log('\n=== Descargando geometría completa ===\n');
    
    for (const id of found.ids) {
      console.log(`Descargando relación ${id} con geometría...`);
      const geoQuery = `[out:json][timeout:90];relation(${id});(._;>;);out geom;`;
      try {
        const geoResult = await fetchQuery(geoQuery);
        const filename = `osm_route_${id}_geom.json`;
        fs.writeFileSync(filename, JSON.stringify(geoResult, null, 2));
        console.log(`  ✓ Guardado en ${filename} (${geoResult.elements?.length || 0} elementos)`);
      } catch (e) {
        console.log(`  Error: ${e.message}`);
      }
    }
  }
}

main().catch(console.error);
