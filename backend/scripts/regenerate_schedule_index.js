/**
 * regenerate_schedule_index.js (FASE 5.2 — 2026-05-13)
 *
 * Regenera backend/src/data/gtfs/schedule_index.json desde Postgres `gtfs.*`
 * para que `scheduleComplianceEngine.ts` pueda clasificar correctamente cada
 * evento GPS como EN_TIEMPO / ADELANTADO / ATRASADO / SIN_HORARIO.
 *
 * Problema que arregla: el JSON anterior tenía 44 rutas totales (3 UCOT, 9 COETC,
 * 21 COME, 11 CUTCSA). La realidad tiene 319 rutas y los GPS reportan ~80 líneas
 * distintas en uso. Sin match → todo SIN_HORARIO.
 *
 * Estructura del JSON (preservada):
 *   agencyId → {agency_name, routes: {route_short_name → {route_long_name, habiles, sabados, domingos}}}
 *   trip → {trip_id, departure, arrival, control_stops}
 *
 * Replica las routes para los 4 operadores (10/20/50/70) porque gtfs.routes
 * tiene agency_id='STM-MVD' genérico y no diferencia operador. Se asume que el
 * horario de una línea aplica al bus que la opere, independiente del operador.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const PG = {
  host: process.env.DB_HOST || '192.168.1.11',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'skillroute_master',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS,
};

const AGENCIES = {
  '10': 'COETC',
  '20': 'COME',
  '50': 'CUTCSA',
  '70': 'UCOT',
};

// Líneas que realmente operan según bus_last_pos (top por operador)
// Las regeneramos para todos los operadores; el engine matchea por
// route_short_name, no por operador.

async function run() {
  const c = new Client(PG);
  await c.connect();
  console.log('Connected to Postgres');

  // 1. Trips activos hoy con su service_id. Para simplificar usamos service_id
  //    = '1' o el primero válido. Esto puede no ser 100% correcto en términos
  //    de calendar exacto, pero los trips de cada route_short_name se asocian
  //    consistentemente. Si el GTFS tiene varios calendars, tomamos todos.
  console.log('Loading routes...');
  const routesRes = await c.query(`
    SELECT route_id, route_short_name, route_long_name
    FROM gtfs.routes
    WHERE route_short_name IS NOT NULL AND route_short_name != ''
    ORDER BY route_short_name
  `);
  console.log(`  ${routesRes.rows.length} routes`);

  // 2. Calendar — necesitamos saber qué service_id se ejecuta cada día
  const calendarRes = await c.query(`SELECT * FROM gtfs.calendar`);
  console.log(`  ${calendarRes.rows.length} calendar entries`);

  // Map service_id → day type set
  const serviceToDays = {};
  for (const cal of calendarRes.rows) {
    const days = new Set();
    if (cal.monday || cal.tuesday || cal.wednesday || cal.thursday || cal.friday) days.add('habiles');
    if (cal.saturday) days.add('sabados');
    if (cal.sunday) days.add('domingos');
    serviceToDays[cal.service_id] = days;
  }

  // 3. Cargar trips agrupados por route_id
  console.log('Loading trips...');
  const tripsRes = await c.query(`
    SELECT t.trip_id, t.route_id, t.service_id, t.direction_id, t.shape_id
    FROM gtfs.trips t
    ORDER BY t.route_id, t.trip_id
  `);
  console.log(`  ${tripsRes.rows.length} trips`);
  const tripsByRoute = {};
  for (const t of tripsRes.rows) {
    if (!tripsByRoute[t.route_id]) tripsByRoute[t.route_id] = [];
    tripsByRoute[t.route_id].push(t);
  }

  // 4. Cargar primer + último stop_time por trip (para departure/arrival)
  //    + control stops (sample de stops a lo largo del trip)
  //    Para mantener el JSON manejable: tomar primer, midpoint, último stop_time.
  console.log('Loading stop_times (this may take a moment)...');
  const stRes = await c.query(`
    SELECT
      st.trip_id,
      st.stop_id,
      st.stop_sequence,
      st.arrival_time,
      st.departure_time,
      s.stop_name,
      s.stop_code AS stop_desc,
      s.stop_lat,
      s.stop_lon,
      ROW_NUMBER() OVER (PARTITION BY st.trip_id ORDER BY st.stop_sequence) AS rn,
      COUNT(*) OVER (PARTITION BY st.trip_id) AS total_stops
    FROM gtfs.stop_times st
    JOIN gtfs.stops s ON st.stop_id = s.stop_id
  `);
  console.log(`  ${stRes.rows.length} stop_times loaded`);

  const stopsByTrip = {};
  for (const r of stRes.rows) {
    if (!stopsByTrip[r.trip_id]) stopsByTrip[r.trip_id] = { all: [], first: null, last: null, mid: null };
    stopsByTrip[r.trip_id].all.push(r);
  }
  // Compute first/mid/last per trip
  for (const tid of Object.keys(stopsByTrip)) {
    const arr = stopsByTrip[tid].all.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    stopsByTrip[tid].first = arr[0];
    stopsByTrip[tid].last = arr[arr.length - 1];
    stopsByTrip[tid].mid = arr[Math.floor(arr.length / 2)];
    // Add ~5 evenly spaced control stops
    const samples = [];
    const n = Math.min(5, arr.length);
    for (let i = 0; i < n; i++) {
      const idx = Math.floor((i * (arr.length - 1)) / (n - 1 || 1));
      samples.push(arr[idx]);
    }
    stopsByTrip[tid].samples = samples;
  }

  // 5. Construir el JSON por agencia
  console.log('Building JSON structure...');
  const output = {};
  for (const [agencyId, agencyName] of Object.entries(AGENCIES)) {
    const routes = {};
    for (const r of routesRes.rows) {
      const shortName = r.route_short_name;
      if (!routes[shortName]) {
        routes[shortName] = {
          route_long_name: r.route_long_name || `Línea ${shortName}`,
          habiles: [],
          sabados: [],
          domingos: [],
        };
      }
      const trips = tripsByRoute[r.route_id] || [];
      for (const t of trips) {
        const tStops = stopsByTrip[t.trip_id];
        if (!tStops) continue;
        const days = serviceToDays[t.service_id] || new Set(['habiles']);
        const controlStops = (tStops.samples || []).map((s, idx) => ({
          seq: Number(s.stop_sequence),
          stop_id: s.stop_id,
          name: s.stop_name || '',
          desc: s.stop_desc || '',
          lat: s.stop_lat ? Number(s.stop_lat) : null,
          lon: s.stop_lon ? Number(s.stop_lon) : null,
          arrival: s.arrival_time || '',
        }));
        const tripObj = {
          trip_id: t.trip_id,
          departure: tStops.first?.departure_time || tStops.first?.arrival_time || null,
          arrival: tStops.last?.arrival_time || tStops.last?.departure_time || null,
          control_stops: controlStops,
        };
        for (const day of days) {
          if (routes[shortName][day].length < 200) {
            routes[shortName][day].push(tripObj);
          }
        }
      }
    }
    // Dedup routes (mismo route_short_name aparece varias veces — combinamos)
    output[agencyId] = { agency_name: agencyName, routes };
  }

  // 6. Escribir JSON (atómico: tmp + rename)
  const outPath = path.join(__dirname, '..', 'src', 'data', 'gtfs', 'schedule_index.json');
  const tmpPath = outPath + '.tmp';
  console.log(`Writing to ${outPath}...`);
  fs.writeFileSync(tmpPath, JSON.stringify(output));
  fs.renameSync(tmpPath, outPath);
  const stat = fs.statSync(outPath);
  console.log(`  Done. ${Math.round(stat.size / 1024)} KB`);

  // 7. Resumen
  for (const [agId, ag] of Object.entries(output)) {
    const routeCount = Object.keys(ag.routes).length;
    let tripCount = 0;
    for (const rt of Object.values(ag.routes)) {
      tripCount += (rt.habiles?.length || 0) + (rt.sabados?.length || 0) + (rt.domingos?.length || 0);
    }
    console.log(`  ${agId} (${ag.agency_name}): ${routeCount} routes, ${tripCount} trip entries`);
  }

  await c.end();
  console.log('OK');
}

run().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
