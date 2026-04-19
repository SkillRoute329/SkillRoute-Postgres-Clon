/**
 * downloadRoutes.mjs — Descarga recorridos REALES del GeoServer de la IMM.
 * 
 * La Intendencia de Montevideo publica datos geoespaciales a través de un
 * servicio WFS (Web Feature Service) en geoweb.montevideo.gub.uy.
 * Desde Node.js no hay restricciones CORS.
 * 
 * Uso: node scripts/downloadRoutes.mjs
 * 
 * Produce: src/data/geo/routeCache.json
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'src', 'data', 'geo');
const OUT_FILE = join(OUT_DIR, 'routeCache.json');

// Líneas UCOT (empresa código 2)
const UCOT_LINES = [
  '300', '306', '316', '317', '328', '329', '330', '370', '371', '379', '396',
  '17', '71', '79',
];

// Posibles endpoints a probar (el GeoServer de la IMM)
const GEOSERVER_URLS = [
  'https://geoweb.montevideo.gub.uy/geoserver/sitm/wfs',
  'https://sit.montevideo.gub.uy/geoserver/sitm/wfs',
  'https://geoweb.montevideo.gub.uy/geoserver/ide_uy/wfs',
];

// Endpoints del API de transporte de Montevideo
const TRANSPORT_API_URLS = [
  'https://www.montevideo.gub.uy/transporteRest/infoTransporte',
  'https://montevideo.gub.uy/transporteRest/infoTransporte',
];

async function fetchJSON(url, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, */*',
      }
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.log(`  ⚠ HTTP ${res.status} for ${url.substring(0, 80)}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    console.log(`  ✗ ${e.message} for ${url.substring(0, 60)}`);
    return null;
  }
}

async function fetchText(url, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
      }
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

// Strategy 1: WFS GeoServer — download all bus routes as GeoJSON
async function tryWFS() {
  console.log('\n═══ Strategy 1: WFS GeoServer ═══');
  
  const typeNames = [
    'sitm:v_uptu_recorridos',
    'sitm:v_uptu_lineas',
    'sitm:recorridos',
    'ide_uy:v_uptu_recorridos',
  ];
  
  for (const baseUrl of GEOSERVER_URLS) {
    for (const typeName of typeNames) {
      const url = `${baseUrl}?service=WFS&version=1.1.0&request=GetFeature&typeName=${typeName}&outputFormat=application/json&maxFeatures=500`;
      console.log(`  Trying: ${typeName} at ${baseUrl.split('/')[2]}`);
      
      const data = await fetchJSON(url);
      if (data && data.features && data.features.length > 0) {
        console.log(`  ✓ Found ${data.features.length} features!`);
        return data;
      }
    }
    
    // Try GetCapabilities to discover available layers
    const capUrl = `${baseUrl}?service=WFS&version=1.1.0&request=GetCapabilities`;
    console.log(`  Trying GetCapabilities at ${baseUrl.split('/')[2]}`);
    const capText = await fetchText(capUrl);
    if (capText) {
      // Extract layer names containing "recorrido" or "linea" or "uptu"
      const matches = capText.match(/Name>([^<]*(?:recorrido|linea|uptu|bus|transporte)[^<]*)</gi);
      if (matches) {
        console.log(`  Available layers: ${matches.map(m => m.replace('Name>', '')).join(', ')}`);
      }
    }
  }
  
  return null;
}

// Strategy 2: Transport API (direct, no proxy)
async function tryTransportAPI() {
  console.log('\n═══ Strategy 2: Transport API Direct ═══');
  
  const routes = {};
  
  for (const baseUrl of TRANSPORT_API_URLS) {
    console.log(`  Base: ${baseUrl}`);
    
    for (const lineId of UCOT_LINES.slice(0, 3)) { // Test with first 3
      for (const variant of [0, 1]) {
        const url = `${baseUrl}/recorrido/${lineId}/${variant}`;
        const data = await fetchJSON(url);
        
        if (data) {
          let points = [];
          if (Array.isArray(data)) {
            points = data;
          } else if (data.coordinates) {
            points = data.coordinates;
          } else if (data.geometry?.coordinates) {
            points = data.geometry.coordinates;
          } else if (data.recorrido) {
            points = data.recorrido;
          }
          
          if (points.length > 0) {
            const code = `${lineId}${variant === 0 ? 'a' : 'b'}`;
            console.log(`  ✓ ${code}: ${points.length} points`);
            routes[code] = {
              points,
              fromApi: baseUrl,
            };
          }
        }
      }
    }
    
    if (Object.keys(routes).length > 0) break;
  }
  
  return Object.keys(routes).length > 0 ? routes : null;
}

// Strategy 3: Scrape the STM map page for route data URLs
async function trySTMMapScrape() {
  console.log('\n═══ Strategy 3: STM Map Page Scrape ═══');
  
  // The STM map page loads routes from these types of URLs
  const stmUrls = [
    'https://www.montevideo.gub.uy/buses/mapaBuses.html',
    'https://www.montevideo.gub.uy/app/stm',
    'https://m.montevideo.gub.uy/transporte/stm',
  ];
  
  for (const url of stmUrls) {
    const html = await fetchText(url);
    if (html) {
      console.log(`  ✓ Got HTML from ${url} (${html.length} chars)`);
      
      // Look for API URLs in the JavaScript code
      const apiMatches = html.match(/https?:\/\/[^"'\s]+(?:recorrido|route|linea|geographic|geoserver)[^"'\s]*/gi);
      if (apiMatches) {
        console.log(`  Found API URLs:`);
        const unique = [...new Set(apiMatches)];
        unique.forEach(u => console.log(`    ${u}`));
        
        // Try fetching each discovered URL
        for (const apiUrl of unique.slice(0, 5)) {
          const data = await fetchJSON(apiUrl);
          if (data) {
            console.log(`  ✓ Got data from ${apiUrl}`);
            return data;
          }
        }
      }
      
      // Look for inline route data
      const jsonMatches = html.match(/\[\[[-\d.]+,[-\d.]+\](?:,\[[-\d.]+,[-\d.]+\]){5,}/g);
      if (jsonMatches) {
        console.log(`  Found ${jsonMatches.length} inline coordinate arrays`);
      }
    }
  }
  
  return null;
}

// Strategy 4: OpenStreetMap Overpass API (free, no auth needed)
async function tryOverpass() {
  console.log('\n═══ Strategy 4: OpenStreetMap Overpass API ═══');
  
  const routes = {};
  
  for (const lineId of UCOT_LINES) {
    // Overpass query to find bus routes in Montevideo with specific ref number
    const query = `
      [out:json][timeout:30];
      area["name"="Montevideo"]["admin_level"="8"]->.a;
      (
        relation["type"="route"]["route"="bus"]["ref"="${lineId}"](area.a);
      );
      out geom;
    `;
    
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    console.log(`  Querying line ${lineId}...`);
    
    const data = await fetchJSON(url, 30000);
    if (data && data.elements && data.elements.length > 0) {
      for (const element of data.elements) {
        if (element.type === 'relation' && element.members) {
          const wayPoints = [];
          for (const member of element.members) {
            if (member.type === 'way' && member.geometry) {
              for (const pt of member.geometry) {
                wayPoints.push({ lat: pt.lat, lng: pt.lon });
              }
            }
          }
          
          if (wayPoints.length > 0) {
            const tags = element.tags || {};
            const direction = tags.direction || '';
            const suffix = direction.includes('backward') ? 'b' : 'a';
            const code = `${lineId}${suffix}`;
            
            if (!routes[code] || wayPoints.length > routes[code].recorrido.length) {
              routes[code] = {
                code,
                lineId,
                nombre: tags.name || `Línea ${lineId}`,
                recorrido: wayPoints,
                operator: tags.operator || 'UCOT',
                source: 'OpenStreetMap',
              };
              console.log(`  ✓ ${code}: ${wayPoints.length} points (${tags.name || 'unnamed'})`);
            }
          }
        }
      }
    }
    
    // Be respectful to the API
    await new Promise(r => setTimeout(r, 2000));
  }
  
  return Object.keys(routes).length > 0 ? routes : null;
}

// ─── MAIN ────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  UCOT Route Downloader — Multi-Strategy         ║');
  console.log('╚══════════════════════════════════════════════════╝');
  
  let routes = null;
  
  // Try Strategy 1: WFS GeoServer
  const wfsData = await tryWFS();
  if (wfsData) {
    routes = processWFS(wfsData);
  }
  
  // Try Strategy 2: Transport API
  if (!routes) {
    const apiData = await tryTransportAPI();
    if (apiData) routes = apiData;
  }
  
  // Try Strategy 3: STM Map scrape
  if (!routes) {
    const mapData = await trySTMMapScrape();
    if (mapData) routes = mapData;
  }
  
  // Try Strategy 4: OpenStreetMap (most reliable, free, no auth)
  if (!routes) {
    routes = await tryOverpass();
  }
  
  if (routes && Object.keys(routes).length > 0) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT_FILE, JSON.stringify(routes, null, 2), 'utf8');
    console.log(`\n✅ Saved ${Object.keys(routes).length} routes to ${OUT_FILE}`);
    
    // Print summary
    console.log('\n═══ SUMMARY ═══');
    for (const [code, data] of Object.entries(routes)) {
      const pts = data.recorrido?.length || data.points?.length || 0;
      console.log(`  ${code}: ${pts} points ${data.nombre || ''}`);
    }
  } else {
    console.log('\n❌ Could not download route data from any source.');
    console.log('   Manual options:');
    console.log('   1. Fix the montevideoProxy Cloud Function (currently returning 403)');
    console.log('   2. Download GTFS data manually from montevideo.gub.uy');
    console.log('   3. Use OpenStreetMap data (this script tried but API may be rate-limited)');
  }
}

function processWFS(geojson) {
  const routes = {};
  for (const feature of geojson.features) {
    const props = feature.properties || {};
    const lineId = String(props.DESC_LINEA || props.desc_linea || props.COD_LINEA || '').trim();
    if (!lineId) continue;
    
    const coords = feature.geometry?.coordinates;
    if (!coords || !Array.isArray(coords)) continue;
    
    // LineString or MultiLineString
    let points = [];
    if (feature.geometry.type === 'LineString') {
      points = coords.map(([lng, lat]) => ({ lat, lng }));
    } else if (feature.geometry.type === 'MultiLineString') {
      for (const line of coords) {
        for (const [lng, lat] of line) {
          points.push({ lat, lng });
        }
      }
    }
    
    if (points.length > 0) {
      const code = `${lineId}a`;
      routes[code] = {
        code,
        lineId,
        nombre: props.NOMBRE || props.nombre || `Línea ${lineId}`,
        recorrido: points,
        source: 'GeoServer_IMM',
      };
    }
  }
  return Object.keys(routes).length > 0 ? routes : null;
}

main().catch(console.error);
