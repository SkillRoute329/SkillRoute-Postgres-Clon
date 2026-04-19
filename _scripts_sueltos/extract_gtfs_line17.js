/**
 * Extraer las coordenadas REALES de la línea 17 desde los datos GTFS oficiales.
 * Fuente: catalogodatos.gub.uy - GTFS metropolitano actualizado 2026-03-26
 */
const fs = require('fs');
const path = require('path');

const GTFS_DIR = path.join(__dirname, 'gtfs_data');

function parseCsv(filename) {
  const content = fs.readFileSync(path.join(GTFS_DIR, filename), 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  const headers = lines[0].replace(/"/g, '').split(',');
  return lines.slice(1).map(line => {
    // Handle quoted fields properly
    const values = [];
    let current = '';
    let inQuote = false;
    for (const char of line) {
      if (char === '"') { inQuote = !inQuote; continue; }
      if (char === ',' && !inQuote) { values.push(current.trim()); current = ''; continue; }
      current += char;
    }
    values.push(current.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i] || '');
    return obj;
  });
}

async function main() {
  console.log('=== Extrayendo datos reales de la línea 17 desde GTFS oficial ===\n');
  
  // 1. Buscar la ruta 17 en routes.txt
  const routes = parseCsv('routes.txt');
  console.log(`Total rutas en GTFS: ${routes.length}`);
  
  // Buscar línea 17 por route_short_name
  const route17 = routes.filter(r => 
    r.route_short_name === '17' || 
    r.route_short_name === '017'
  );
  
  console.log(`\nRutas que coinciden con "17":`);
  if (route17.length === 0) {
    // Mostrar todas las rutas que contienen 17
    console.log('No se encontró match exacto. Buscando parcial...');
    const partial = routes.filter(r => r.route_short_name && r.route_short_name.includes('17'));
    partial.forEach(r => console.log(`  route_id=${r.route_id}, short=${r.route_short_name}, long=${r.route_long_name}`));
    
    // Mostrar algunas rutas para entender el formato
    console.log('\nPrimeras 10 rutas como referencia:');
    routes.slice(0, 10).forEach(r => console.log(`  route_id=${r.route_id}, short=${r.route_short_name}, long=${r.route_long_name}`));
  } else {
    route17.forEach(r => console.log(`  route_id=${r.route_id}, short=${r.route_short_name}, long=${r.route_long_name}`));
  }
  
  // 2. Buscar todas las rutas UCOT
  console.log('\n\nBuscando rutas de UCOT...');
  const ucotRoutes = routes.filter(r => {
    const name = (r.route_long_name || '').toLowerCase();
    const shortName = r.route_short_name || '';
    return name.includes('ucot') || 
           ['17', '300', '306', '316', '328', '329', '330', '370', '396', '71', '79', '11A', '221', '8SR'].includes(shortName);
  });
  
  if (ucotRoutes.length > 0) {
    console.log(`Encontradas ${ucotRoutes.length} rutas UCOT:`);
    ucotRoutes.forEach(r => console.log(`  route_id=${r.route_id}, short="${r.route_short_name}", long="${r.route_long_name}"`));
  }
  
  // 3. Buscar trips de la línea 17
  const routeIds17 = route17.map(r => r.route_id);
  if (routeIds17.length === 0 && ucotRoutes.length > 0) {
    // Usar los route_ids de ucotRoutes que contengan 17
    const ucot17 = ucotRoutes.filter(r => r.route_short_name === '17' || r.route_short_name === '017');
    routeIds17.push(...ucot17.map(r => r.route_id));
  }
  
  if (routeIds17.length > 0) {
    console.log(`\n\nBuscando trips para route_ids: ${routeIds17.join(', ')}...`);
    const trips = parseCsv('trips.txt');
    const trips17 = trips.filter(t => routeIds17.includes(t.route_id));
    console.log(`Trips encontrados: ${trips17.length}`);
    
    // Mostrar variantes (direction_id)
    const directions = {};
    trips17.forEach(t => {
      const key = `dir=${t.direction_id}, headsign="${t.trip_headsign}"`;
      directions[key] = (directions[key] || 0) + 1;
    });
    console.log('Variantes:');
    Object.entries(directions).forEach(([k, v]) => console.log(`  ${k} (${v} trips)`));
    
    // 4. Obtener paradas para un trip de cada dirección
    const stop_times = parseCsv('stop_times.txt');
    const stops = parseCsv('stops.txt');
    const stopsMap = {};
    stops.forEach(s => stopsMap[s.stop_id] = s);
    
    const processedDirs = new Set();
    const routeData = {};
    
    for (const trip of trips17) {
      const dirKey = trip.direction_id;
      if (processedDirs.has(dirKey)) continue;
      processedDirs.add(dirKey);
      
      const tripStops = stop_times
        .filter(st => st.trip_id === trip.trip_id)
        .sort((a, b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence));
      
      console.log(`\nDirección ${dirKey} (headsign: "${trip.trip_headsign}"), trip_id: ${trip.trip_id}`);
      console.log(`  Paradas: ${tripStops.length}`);
      
      const coords = [];
      tripStops.forEach(st => {
        const stop = stopsMap[st.stop_id];
        if (stop) {
          coords.push({
            lat: parseFloat(stop.stop_lat),
            lng: parseFloat(stop.stop_lon),
            nombre: stop.stop_name,
            id: stop.stop_id,
            orden: parseInt(st.stop_sequence)
          });
        }
      });
      
      routeData[dirKey] = {
        headsign: trip.trip_headsign,
        tripId: trip.trip_id,
        coordinates: coords
      };
      
      // Mostrar primeras y últimas paradas
      if (coords.length > 0) {
        console.log(`  Primera parada: ${coords[0].nombre} (${coords[0].lat}, ${coords[0].lng})`);
        console.log(`  Última parada: ${coords[coords.length-1].nombre} (${coords[coords.length-1].lat}, ${coords[coords.length-1].lng})`);
        console.log(`  Total coordenadas: ${coords.length}`);
      }
    }
    
    // 5. Guardar los datos en formato listo para inyectar
    const outputFile = 'linea_17_gtfs_real.json';
    fs.writeFileSync(outputFile, JSON.stringify(routeData, null, 2));
    console.log(`\n✓ Datos guardados en ${outputFile}`);
  }

  // También intentar descargar los recorridos SHP vía GeoServer
  console.log('\n\n=== Intentando descargar recorridos vía GeoServer (WFS) ===');
  const http = require('http');
  const wfsUrl = 'http://intgis.montevideo.gub.uy/sit/php/common/datos/generar_zip2.php?nom_tab=v_uptu_lsv&tipo=gis';
  console.log(`URL: ${wfsUrl}`);
  console.log('(Este recurso contiene los recorridos GIS oficiales de TODAS las líneas)');
}

main().catch(console.error);
