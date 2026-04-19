/**
 * Descargar y analizar la página del mapa STM para encontrar
 * los endpoints de la API interna que usa para cargar recorridos.
 */
const https = require('https');
const fs = require('fs');

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      rejectUnauthorized: false
    }, (r) => {
      // Follow redirects
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        return fetchPage(r.headers.location).then(resolve).catch(reject);
      }
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, body: d }));
    }).on('error', reject);
  });
}

async function main() {
  console.log('1. Descargando página del mapa STM...\n');
  const page = await fetchPage('https://www.montevideo.gub.uy/app/stm/horarios/pages/mapa.xhtml');
  
  console.log('Status:', page.status);
  console.log('X-Frame-Options:', page.headers['x-frame-options'] || '(NO ESTABLECIDO - iframe posible!)');
  console.log('Content-Security-Policy:', page.headers['content-security-policy'] || '(NO ESTABLECIDO)');
  console.log('Content-Length:', page.body.length, 'bytes\n');
  
  // Guardar la página completa
  fs.writeFileSync('stm_mapa_page.html', page.body);
  console.log('Página guardada en stm_mapa_page.html\n');
  
  // Buscar URLs de API, endpoints, scripts
  console.log('2. Buscando scripts y endpoints en el HTML...\n');
  
  // Buscar scripts src
  const scriptSrcs = page.body.match(/src="[^"]*\.js[^"]*"/g) || [];
  console.log('Scripts encontrados:');
  scriptSrcs.forEach(s => console.log('  ', s));
  
  // Buscar URLs de API/REST
  const apiUrls = page.body.match(/(?:url|href|src|action)\s*[=:]\s*["'][^"']*(?:rest|api|servlet|service|recorrido|variante|linea|mapa|geo)[^"']*/gi) || [];
  console.log('\nURLs de API/Data:');
  apiUrls.forEach(u => console.log('  ', u));
  
  // Buscar AJAX calls
  const ajaxCalls = page.body.match(/(?:fetch|XMLHttpRequest|ajax|\.get|\.post)\s*\([^)]{5,80}/gi) || [];
  console.log('\nLlamadas AJAX:');
  ajaxCalls.forEach(a => console.log('  ', a));
  
  // Buscar referencias a mapas (Leaflet, Google Maps, OpenLayers)
  const mapRefs = page.body.match(/(?:leaflet|L\.map|google\.maps|ol\.Map|openlayers|mapbox|tilelayer|tileLayer)/gi) || [];
  console.log('\nReferencias a mapas:', mapRefs);
  
  // Buscar JSON inline con coordenadas
  const coordPatterns = page.body.match(/-34\.\d{3,}[,\s]+-56\.\d{3,}/g) || [];
  console.log('\nCoordenadas encontradas en HTML:', coordPatterns.length);
  if (coordPatterns.length > 0) {
    coordPatterns.slice(0, 5).forEach(c => console.log('  ', c));
  }
  
  // Buscar variableJS inline con datos
  const jsonVars = page.body.match(/var\s+\w+\s*=\s*\[[\s\S]{10,200}?\]/g) || [];
  console.log('\nVariables JS con arrays:');
  jsonVars.forEach(v => console.log('  ', v.substring(0, 120)));
  
  // Buscar formularios y acciones JSF
  const formActions = page.body.match(/action="[^"]*"/g) || [];
  console.log('\nAcciones de formularios:');
  formActions.forEach(f => console.log('  ', f));

  // 3. Buscar GTFS en el catálogo de datos abiertos
  console.log('\n3. Buscando datos GTFS en catálogo abierto...\n');
  try {
    const gtfs = await fetchPage('https://catalogodatos.gub.uy/api/3/action/package_search?q=transporte+montevideo+gtfs&rows=5');
    if (gtfs.status === 200) {
      const data = JSON.parse(gtfs.body);
      if (data.result && data.result.results) {
        data.result.results.forEach(r => {
          console.log(`Dataset: ${r.title}`);
          if (r.resources) {
            r.resources.forEach(res => {
              console.log(`  - ${res.name || res.format}: ${res.url}`);
            });
          }
          console.log('');
        });
      }
    }
  } catch (e) {
    console.log('Error buscando GTFS:', e.message);
  }
  
  // 4. Buscar directamente SHP/GeoJSON de recorridos
  try {
    const shp = await fetchPage('https://catalogodatos.gub.uy/api/3/action/package_search?q=recorridos+omnibus+montevideo&rows=10');
    if (shp.status === 200) {
      const data = JSON.parse(shp.body);
      if (data.result && data.result.results) {
        data.result.results.forEach(r => {
          console.log(`Dataset: ${r.title}`);
          if (r.resources) {
            r.resources.forEach(res => {
              if (res.url && (res.url.includes('.zip') || res.url.includes('.json') || res.url.includes('.geojson') || res.url.includes('shp'))) {
                console.log(`  ★ ${res.name || res.format}: ${res.url}`);
              }
            });
          }
          console.log('');
        });
      }
    }
  } catch (e) {
    console.log('Error buscando SHP:', e.message);
  }
}

main().catch(console.error);
