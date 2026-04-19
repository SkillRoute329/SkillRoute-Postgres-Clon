/**
 * buildRealRoutes.mjs — Descarga recorridos REALES de las líneas UCOT
 * desde OpenStreetMap Overpass API.
 * 
 * UCOT opera en Montevideo, Uruguay.
 * Las líneas UCOT son: 300, 306, 316, 317, 328, 329, 330, 370, 371, 379, 396, 17, 71, 79
 * 
 * Uso: node scripts/buildRealRoutes.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'src', 'data', 'geo');
const OUT_FILE = join(OUT_DIR, 'routeCache.json');

// Todas las líneas UCOT con sus números oficiales STM
const UCOT_LINES = [
  { id: '300', name: 'Cementerio Central - Instrucciones' },
  { id: '306', name: 'Casabó - Géant' },
  { id: '316', name: 'Cno. Maldonado - Pocitos' },
  { id: '317', name: 'Pajas Blancas - Pza. Independencia' },
  { id: '328', name: 'Punta Carretas - Mendoza' },
  { id: '329', name: 'Colón - Saint Bois' },
  { id: '330', name: 'Instrucciones - Ciudadela' },
  { id: '370', name: 'Portones - Cerro' },
  { id: '371', name: 'Portones - La Teja' },
  { id: '379', name: 'Punta Carretas - Instrucciones' },
  { id: '396', name: 'Punta Carretas - Colón' },
  { id: '17', name: 'Ciudad Vieja - Pocitos' },
  { id: '71', name: 'Ciudad Vieja - Malvín' },
  { id: '79', name: 'Paso Molino - Parque Batlle' },
];

async function fetchOverpass(query, timeout = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'UCOTTransitNavigator/1.0',
      },
      body: `data=${encodeURIComponent(query)}`,
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.log(`  ⚠ HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    console.log(`  ✗ ${e.message}`);
    return null;
  }
}

function extractWayPoints(element) {
  const points = [];
  if (!element.members) return points;
  
  for (const member of element.members) {
    if (member.type === 'way' && member.geometry) {
      for (const pt of member.geometry) {
        if (pt && typeof pt.lat === 'number' && typeof pt.lon === 'number') {
          points.push({ lat: pt.lat, lng: pt.lon });
        }
      }
    }
  }
  return points;
}

async function queryLine(lineId) {
  console.log(`\n  📍 Consultando línea ${lineId} en OpenStreetMap...`);
  
  // Query para encontrar rutas de ómnibus con ese número en Montevideo
  const query = `
[out:json][timeout:60];
(
  relation["type"="route"]["route"="bus"]["ref"="${lineId}"]["network"~"montevideo|STM|UCOT|Uruguay",i];
  relation["type"="route"]["route"="bus"]["ref"="${lineId}"]["operator"~"UCOT|STM",i];
  relation["type"="route"]["route"="bus"]["ref"="${lineId}"](area["name"="Montevideo"]["admin_level"="4"]);
  relation["type"="route"]["route"="bus"]["ref"="${lineId}"](-35.1,-56.5,-34.7,-55.9);
);
out geom;
`;
  
  const data = await fetchOverpass(query);
  
  if (!data || !data.elements || data.elements.length === 0) {
    console.log(`  ⚠ No encontrado en OSM para línea ${lineId}`);
    return null;
  }
  
  const routes = {};
  let idxA = 0, idxB = 0;
  
  for (const element of data.elements) {
    if (element.type !== 'relation') continue;
    
    const tags = element.tags || {};
    const wayPoints = extractWayPoints(element);
    
    if (wayPoints.length < 5) continue;
    
    const name = tags.name || tags['name:es'] || '';
    const from = tags.from || '';
    const to = tags.to || '';
    
    // Determine direction
    const isVuelta = 
      name.toLowerCase().includes('vuelta') || 
      name.toLowerCase().includes('regreso') ||
      name.toLowerCase().includes('retorno') ||
      (tags.direction === 'backward') ||
      idxA > 0; // Second relation = vuelta typically
    
    const suffix = isVuelta ? 'b' : 'a';
    const code = `${lineId}${suffix}`;
    
    if (!routes[code] || wayPoints.length > routes[code].recorrido.length) {
      routes[code] = {
        code,
        lineId,
        variantIdx: isVuelta ? 1 : 0,
        nombre: name || `${lineId} - ${isVuelta ? 'VUELTA' : 'IDA'}`,
        origen: isVuelta ? to : from,
        destino: isVuelta ? from : to,
        sentido: isVuelta ? 'VUELTA' : 'IDA',
        recorrido: wayPoints,
        source: 'OpenStreetMap_REAL',
        osmRelationId: element.id,
        downloadedAt: new Date().toISOString(),
      };
      
      console.log(`  ✓ ${code}: ${wayPoints.length} puntos GPS reales (OSM rel:${element.id})`);
      console.log(`    Nombre: ${name}`);
    }
    
    if (isVuelta) idxB++; else idxA++;
  }
  
  return Object.keys(routes).length > 0 ? routes : null;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  UCOT Real Route Builder — OpenStreetMap Data            ║');
  console.log('║  Descarga recorridos GPS REALES de las líneas UCOT       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  
  const allRoutes = {};
  const found = [];
  const notFound = [];
  
  for (const line of UCOT_LINES) {
    try {
      const routes = await queryLine(line.id);
      
      if (routes && Object.keys(routes).length > 0) {
        Object.assign(allRoutes, routes);
        found.push(line.id);
      } else {
        notFound.push(line.id);
      }
      
      // Respectful delay to not overload OSM
      await new Promise(r => setTimeout(r, 3000));
    } catch (err) {
      console.error(`  Error en línea ${line.id}:`, err.message);
      notFound.push(line.id);
    }
  }
  
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  RESUMEN                                                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  ✅ Encontradas: ${found.join(', ')}`);
  console.log(`  ❌ No encontradas: ${notFound.join(', ')}`);
  console.log(`  📊 Total rutas: ${Object.keys(allRoutes).length}`);
  
  if (Object.keys(allRoutes).length > 0) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT_FILE, JSON.stringify(allRoutes, null, 2), 'utf8');
    console.log(`\n✅ Guardado en: ${OUT_FILE}`);
    
    for (const [code, data] of Object.entries(allRoutes)) {
      console.log(`  ${code}: ${data.recorrido.length} puntos — ${data.nombre}`);
    }
  } else {
    console.log('\n⚠ No se pudo descargar ninguna ruta real de OpenStreetMap.');
    console.log('  Las rutas en routeCache.json serán las estáticas existentes.');
  }
}

main().catch(console.error);
