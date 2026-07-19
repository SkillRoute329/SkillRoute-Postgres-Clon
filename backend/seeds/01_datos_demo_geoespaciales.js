'use strict';
require('dotenv').config();

const https = require('https');
const http = require('http');
const { URL } = require('url');

const IMM_CLIENT_ID     = process.env.IMM_CLIENT_ID     || '';
const IMM_CLIENT_SECRET = process.env.IMM_CLIENT_SECRET || '';
const IMM_TOKEN_URL     = process.env.IMM_TOKEN_URL     || 'https://mvdtransporte.montevideo.gub.uy/oauth/token';

const GTFS_STATIC_URL = process.env.IMM_GTFS_URL || 'https://mvdtransporte.montevideo.gub.uy/serve-stm-api/static/gtfs.zip';
const GTFS_RT_VEHICLES_URL = process.env.IMM_GTFS_RT_URL || 'https://mvdtransporte.montevideo.gub.uy/serve-gtfs-rt-api/v1/vehicle-positions?format=json';

function fetchText(rawUrl, headers = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Demasiadas redirecciones: ' + rawUrl));
    const parsedUrl = new URL(rawUrl);
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsedUrl.hostname, path: parsedUrl.pathname + parsedUrl.search, port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      method: 'GET', timeout: 30000,
      headers: { 'Accept': 'application/json, text/plain, */*', 'User-Agent': 'SkillRoute-Seed/1.0 (contact@skillroute.uy)', ...headers },
    };
    const req = lib.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return resolve(fetchText(res.headers.location, headers, redirects + 1));
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} al descargar ${rawUrl}`));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout al descargar: ' + rawUrl)); });
    req.end();
  });
}

function fetchBuffer(rawUrl, headers = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Demasiadas redirecciones: ' + rawUrl));
    const parsedUrl = new URL(rawUrl);
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsedUrl.hostname, path: parsedUrl.pathname + parsedUrl.search, port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      method: 'GET', timeout: 60000,
      headers: { 'Accept': 'application/zip, application/octet-stream, */*', 'User-Agent': 'SkillRoute-Seed/1.0 (contact@skillroute.uy)', ...headers },
    };
    const req = lib.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return resolve(fetchBuffer(res.headers.location, headers, redirects + 1));
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} al descargar buffer de ${rawUrl}`));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout buffer: ' + rawUrl)); });
    req.end();
  });
}

function postForm(rawUrl, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(rawUrl);
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const bodyBuffer = Buffer.from(body, 'utf8');
    const options = {
      hostname: parsedUrl.hostname, path: parsedUrl.pathname + parsedUrl.search, port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      method: 'POST', timeout: 15000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': bodyBuffer.length, 'Accept': 'application/json', 'User-Agent': 'SkillRoute-Seed/1.0 (contact@skillroute.uy)' },
    };
    const req = lib.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`OAuth POST ${res.statusCode}: ${text.slice(0, 200)}`));
        resolve(text);
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout en POST OAuth: ' + rawUrl)); });
    req.write(bodyBuffer);
    req.end();
  });
}

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, i) => (obj[h] = values[i] ?? ''));
    return obj;
  });
}

async function obtenerBearerTokenIMM() {
  if (!IMM_CLIENT_ID || !IMM_CLIENT_SECRET) {
    console.warn('[SEED] ⚠️  IMM_CLIENT_ID / IMM_CLIENT_SECRET no configurados en .env.');
    return null;
  }
  console.log('[SEED] 🔐 Obteniendo Bearer Token OAuth de la IMM...');
  try {
    const body = ['grant_type=client_credentials', `client_id=${encodeURIComponent(IMM_CLIENT_ID)}`, `client_secret=${encodeURIComponent(IMM_CLIENT_SECRET)}`, 'scope=gtfs:read'].join('&');
    const responseText = await postForm(IMM_TOKEN_URL, body);
    const tokenData = JSON.parse(responseText);
    if (!tokenData.access_token) throw new Error('Sin access_token: ' + responseText.slice(0, 100));
    console.log(`[SEED] ✅ Bearer Token obtenido correctamente.`);
    return tokenData.access_token;
  } catch (err) {
    console.warn(`[SEED] ⚠️  Error obteniendo token OAuth: ${err.message}`);
    return null;
  }
}

const VEHICULOS_CORREDOR_300 = [
  { id: 'STM-300-001', internal_number: '4821', plate: 'BCK 1234', agency_id: '50', linea_habitual: '300', tipo_vehiculo: 'OMNIBUS', capacidad_pasajeros: 85, tiene_rampa: true, tiene_wifi: false, modelo: 'Marcopolo Torino G7', anio_fabricacion: 2019 },
  { id: 'STM-300-002', internal_number: '4822', plate: 'BCK 1235', agency_id: '50', linea_habitual: '300', tipo_vehiculo: 'OMNIBUS', capacidad_pasajeros: 85, tiene_rampa: true, tiene_wifi: false, modelo: 'Marcopolo Torino G7', anio_fabricacion: 2019 },
  { id: 'STM-300-003', internal_number: '5103', plate: 'BDB 9871', agency_id: '50', linea_habitual: '300', tipo_vehiculo: 'ARTICULADO', capacidad_pasajeros: 160, tiene_rampa: true, tiene_wifi: true, modelo: 'Caio Apache Articulado', anio_fabricacion: 2021 },
  { id: 'STM-300-004', internal_number: '5104', plate: 'BDB 9872', agency_id: '50', linea_habitual: '300', tipo_vehiculo: 'ARTICULADO', capacidad_pasajeros: 160, tiene_rampa: true, tiene_wifi: true, modelo: 'Caio Apache Articulado', anio_fabricacion: 2021 },
  { id: 'STM-305-001', internal_number: '2301', plate: 'ASF 4410', agency_id: '10', linea_habitual: '305', tipo_vehiculo: 'OMNIBUS', capacidad_pasajeros: 78, tiene_rampa: false, tiene_wifi: false, modelo: 'Busscar El Buss 340', anio_fabricacion: 2016 },
  { id: 'STM-305-002', internal_number: '2302', plate: 'ASF 4411', agency_id: '10', linea_habitual: '305', tipo_vehiculo: 'OMNIBUS', capacidad_pasajeros: 78, tiene_rampa: false, tiene_wifi: false, modelo: 'Busscar El Buss 340', anio_fabricacion: 2016 },
  { id: 'STM-310-001', internal_number: '3450', plate: 'AZP 5521', agency_id: '20', linea_habitual: '310', tipo_vehiculo: 'OMNIBUS', capacidad_pasajeros: 82, tiene_rampa: true, tiene_wifi: false, modelo: 'Busscar Urbanuss Pluss', anio_fabricacion: 2018 },
  { id: 'STM-310-002', internal_number: '3451', plate: 'AZP 5522', agency_id: '20', linea_habitual: '310', tipo_vehiculo: 'OMNIBUS', capacidad_pasajeros: 82, tiene_rampa: true, tiene_wifi: false, modelo: 'Busscar Urbanuss Pluss', anio_fabricacion: 2018 },
];

const PARADAS_REFERENCIA_300 = [
  { stop_id: 'MDV-300-001', stop_name: 'Terminal Colón', stop_lat: -34.8558, stop_lon: -56.2318, barrio: 'Colón', rutas_que_pasan: ['300', '305', '310'] },
  { stop_id: 'MDV-300-002', stop_name: 'Av. Millán esq. Colón', stop_lat: -34.8620, stop_lon: -56.2190, barrio: 'Colón', rutas_que_pasan: ['300', '305'] },
  { stop_id: 'MDV-300-003', stop_name: 'Av. 8 de Octubre esq. Propios', stop_lat: -34.8681, stop_lon: -56.2043, barrio: 'Larrañaga', rutas_que_pasan: ['300', '305', '310'] },
  { stop_id: 'MDV-300-004', stop_name: 'Av. 8 de Octubre esq. 19 de Abril', stop_lat: -34.8735, stop_lon: -56.1930, barrio: 'Larrañaga', rutas_que_pasan: ['300'] },
  { stop_id: 'MDV-300-005', stop_name: 'Av. 8 de Octubre esq. Rivera', stop_lat: -34.8799, stop_lon: -56.1800, barrio: 'Centro', rutas_que_pasan: ['300', '310'] },
  { stop_id: 'MDV-300-006', stop_name: 'Av. 18 de Julio esq. Ejido (IAVA)', stop_lat: -34.9016, stop_lon: -56.1850, barrio: 'Centro', rutas_que_pasan: ['300', '305', '310'] },
  { stop_id: 'MDV-300-007', stop_name: 'Av. 18 de Julio esq. Río Branco', stop_lat: -34.9025, stop_lon: -56.1745, barrio: 'Centro', rutas_que_pasan: ['300', '310'] },
  { stop_id: 'MDV-300-008', stop_name: 'Av. 18 de Julio esq. Convención', stop_lat: -34.9037, stop_lon: -56.1680, barrio: 'Centro', rutas_que_pasan: ['300'] },
  { stop_id: 'MDV-300-009', stop_name: 'Plaza Independencia — Artigas', stop_lat: -34.9061, stop_lon: -56.1613, barrio: 'Ciudad Vieja', rutas_que_pasan: ['300', '305', '310'] },
  { stop_id: 'MDV-300-010', stop_name: 'Ciudad Vieja — Puerto', stop_lat: -34.9095, stop_lon: -56.1520, barrio: 'Ciudad Vieja', rutas_que_pasan: ['300', '310'] },
  { stop_id: 'MDV-300-011', stop_name: 'Terminal Ciudad Vieja — Aduana', stop_lat: -34.9121, stop_lon: -56.1430, barrio: 'Ciudad Vieja', rutas_que_pasan: ['300', '305', '310'] },
  { stop_id: 'MDV-305-001', stop_name: 'Av. Italia esq. Belloni', stop_lat: -34.8865, stop_lon: -56.1520, barrio: 'Flor de Maroñas', rutas_que_pasan: ['305'] },
  { stop_id: 'MDV-305-002', stop_name: 'Av. Italia esq. Camino Maldonado', stop_lat: -34.8890, stop_lon: -56.1370, barrio: 'Maroñas', rutas_que_pasan: ['305'] },
  { stop_id: 'MDV-310-001', stop_name: 'Av. Gral. Flores esq. Instrucciones', stop_lat: -34.8712, stop_lon: -56.1930, barrio: 'Capurro', rutas_que_pasan: ['310'] },
  { stop_id: 'MDV-310-002', stop_name: 'Av. Del Libertador esq. Suárez', stop_lat: -34.8780, stop_lon: -56.1850, barrio: 'Pocitos', rutas_que_pasan: ['310'] },
];

async function obtenerParadasDesdeGTFS(bearerToken = null) {
  console.log('\\n[SEED] 🌐 Intentando descargar feed GTFS real de STM Montevideo...');
  const authHeaders = bearerToken ? { 'Authorization': `Bearer ${bearerToken}` } : {};

  try {
    const zipBuffer = await fetchBuffer(GTFS_STATIC_URL, authHeaders);
    const AdmZip = (() => { try { return require('adm-zip'); } catch (_) { return null; } })();
    if (!AdmZip) return { paradas: PARADAS_REFERENCIA_300, fuente: 'referencia' };

    const zip = new AdmZip(zipBuffer);
    const stopsEntry = zip.getEntry('stops.txt');
    if (!stopsEntry) return { paradas: PARADAS_REFERENCIA_300, fuente: 'referencia' };

    const stopsText = stopsEntry.getData().toString('utf8');
    const allStops = parseCSV(stopsText);

    const tripsEntry = zip.getEntry('trips.txt');
    const stopTimesEntry = zip.getEntry('stop_times.txt');
    let paradasCorredor300 = allStops;

    if (tripsEntry && stopTimesEntry) {
      const trips = parseCSV(tripsEntry.getData().toString('utf8'));
      const stopTimes = parseCSV(stopTimesEntry.getData().toString('utf8'));
      const tripsCorredor = new Set(trips.filter((t) => t.route_id && t.route_id.startsWith('300')).map((t) => t.trip_id));
      const stopIdsCorredor = new Set(stopTimes.filter((st) => tripsCorredor.has(st.trip_id)).map((st) => st.stop_id));
      paradasCorredor300 = allStops.filter((s) => stopIdsCorredor.has(s.stop_id));
    }

    if (paradasCorredor300.length === 0) return { paradas: PARADAS_REFERENCIA_300, fuente: 'referencia' };

    const paradasMapeadas = paradasCorredor300.map((s) => ({
      stop_id: s.stop_id,
      stop_name: s.stop_name || 'Sin nombre',
      stop_lat: parseFloat(s.stop_lat) || 0,
      stop_lon: parseFloat(s.stop_lon) || 0,
      barrio: s.stop_desc || null,
      rutas_que_pasan: ['300'],
    }));

    return { paradas: paradasMapeadas, fuente: 'gtfs_real' };
  } catch (err) {
    console.warn(`[SEED] ⚠️  Error descargando GTFS: ${err.message}`);
    return { paradas: PARADAS_REFERENCIA_300, fuente: 'referencia' };
  }
}

async function obtenerPosicionesGTFSRT(bearerToken = null) {
  console.log('\\n[SEED] 🚌 Intentando obtener posiciones GTFS-RT en tiempo real...');
  const authHeaders = bearerToken ? { 'Authorization': `Bearer ${bearerToken}` } : {};

  try {
    const rawJson = await fetchText(GTFS_RT_VEHICLES_URL, authHeaders);
    const data = JSON.parse(rawJson);
    if (!data || !data.entity || !Array.isArray(data.entity)) throw new Error('Formato GTFS-RT inesperado');

    const vehiculosCorredor = data.entity.filter((e) => {
      const routeId = e.vehicle?.trip?.route_id || '';
      return routeId.startsWith('300') || routeId.startsWith('305') || routeId.startsWith('310');
    });

    if (vehiculosCorredor.length === 0) throw new Error('Sin vehículos del corredor 300 en GTFS-RT');

    const vehiculosEnriquecidos = VEHICULOS_CORREDOR_300.map((v) => {
      const rtVehicle = vehiculosCorredor.find(
        (e) => e.vehicle?.vehicle?.id === v.id || e.vehicle?.trip?.route_id === v.linea_habitual
      );
      if (rtVehicle && rtVehicle.vehicle?.position) {
        return {
          ...v,
          ultima_lat: rtVehicle.vehicle.position.latitude,
          ultima_lon: rtVehicle.vehicle.position.longitude,
          velocidad_kmh: rtVehicle.vehicle.position.speed ? (rtVehicle.vehicle.position.speed * 3.6).toFixed(2) : null,
          ultima_pos_at: new Date().toISOString(),
          ultima_linea_activa: rtVehicle.vehicle?.trip?.route_id || v.linea_habitual,
        };
      }
      return v;
    });

    return { vehiculos: vehiculosEnriquecidos, fuente: 'gtfs_rt' };
  } catch (err) {
    console.warn(`[SEED] ⚠️  GTFS-RT no disponible: ${err.message}`);
    return { vehiculos: VEHICULOS_CORREDOR_300, fuente: 'referencia' };
  }
}

exports.seed = async function (knex) {
  console.log('\\n═══════════════════════════════════════════════════════════════');
  console.log(' SEED: Datos geoespaciales IMM/STM Montevideo — Corredor 300');
  console.log('═══════════════════════════════════════════════════════════════\\n');

  const sharedBearerToken = await obtenerBearerTokenIMM();

  const [tieneParadas, tieneVehiculos] = await Promise.all([
    knex.schema.hasTable('gtfs_stops'),
    knex.schema.hasTable('vehiculos'),
  ]);

  console.log('[SEED] 🔍 Verificación de tablas:');
  console.log(`[SEED]    gtfs_stops : ${tieneParadas ? '✅ existe' : '⚠️  NO existe'}`);
  console.log(`[SEED]    vehiculos  : ${tieneVehiculos ? '✅ existe' : '⚠️  NO existe'}`);

  if (!tieneParadas && !tieneVehiculos) {
    console.error('\\n[SEED] ❌ NINGUNA tabla requerida existe.');
    return;
  }

  let totalParadasResult = { total: 0 };
  let totalVehiculosResult = { total: 0 };
  let fuenteParadas = 'omitido';
  let fuenteVehiculos = 'omitido';

  // 1. Paradas GTFS
  if (tieneParadas) {
    const { paradas, fuente } = await obtenerParadasDesdeGTFS(sharedBearerToken);
    fuenteParadas = fuente;

    console.log(`\\n[SEED] 🚏 Insertando ${paradas.length} paradas (fuente: ${fuenteParadas})...`);
    let paradasInsertadas = 0, paradasActualizadas = 0;

    for (const p of paradas) {
      try {
        const registro = {
          stop_id: p.stop_id,
          stop_name: p.stop_name,
          stop_lat: p.stop_lat,
          stop_lon: p.stop_lon,
        };
        const existe = await knex('gtfs_stops').where({ stop_id: p.stop_id }).first();
        if (!existe) {
          await knex('gtfs_stops').insert(registro);
          paradasInsertadas++;
        } else {
          await knex('gtfs_stops').where({ stop_id: p.stop_id }).update(registro);
          paradasActualizadas++;
        }
      } catch (err) {
        console.warn(`[SEED] ⚠️  Error en parada ${p.stop_id}: ${err.message}`);
      }
    }

    try {
      await knex.raw(`
        UPDATE gtfs_stops
        SET geom = ST_SetSRID(ST_MakePoint(stop_lon, stop_lat), 4326)
        WHERE geom IS NULL AND stop_lat IS NOT NULL AND stop_lon IS NOT NULL
      `);
      console.log('[SEED] ✅ Geometría PostGIS de paradas sincronizada.');
    } catch (_) { }

    console.log(`[SEED] ✅ Paradas: ${paradasInsertadas} nuevas, ${paradasActualizadas} actualizadas.`);
    const r = await knex('gtfs_stops').count('stop_id as total').first();
    totalParadasResult = r || { total: 0 };
  }

  // 2. Vehículos
  if (tieneVehiculos) {
    const { vehiculos, fuente } = await obtenerPosicionesGTFSRT(sharedBearerToken);
    fuenteVehiculos = fuente;

    console.log(`\\n[SEED] 🚌 Insertando ${vehiculos.length} vehículos (fuente: ${fuenteVehiculos})...`);
    let vehiculosInsertados = 0, vehiculosActualizados = 0;

    for (const v of vehiculos) {
      try {
        const { id, agency_id, internal_number, plate, ...metaData } = v;
        const registro = {
          id: id,
          agency_id: agency_id,
          internal_number: internal_number,
          plate: plate,
          data_jsonb: JSON.stringify({
            ...metaData,
            fuente: fuenteVehiculos,
            seed_at: new Date().toISOString()
          })
        };
        const existe = await knex('vehiculos').where({ id }).first();
        if (!existe) {
          await knex('vehiculos').insert(registro);
          vehiculosInsertados++;
        } else {
          await knex('vehiculos').where({ id }).update(registro);
          vehiculosActualizados++;
        }
      } catch (err) {
        console.warn(`[SEED] ⚠️  Error en vehículo ${v.id}: ${err.message}`);
      }
    }
    console.log(`[SEED] ✅ Vehículos: ${vehiculosInsertados} nuevos, ${vehiculosActualizados} actualizados.`);
    const r = await knex('vehiculos').count('id as total').first();
    totalVehiculosResult = r || { total: 0 };
  }

  console.log('\\n═══════════════════════════════════════════════════════════════');
  console.log(' SEED COMPLETADO — Resumen');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(` ${tieneParadas ? '✅' : '⏭️ '} gtfs_stops : ${tieneParadas ? totalParadasResult?.total : 'tabla no existe'} registros`);
  console.log(` ${tieneVehiculos ? '✅' : '⏭️ '} vehiculos  : ${tieneVehiculos ? totalVehiculosResult?.total : 'tabla no existe'} registros`);
  console.log('═══════════════════════════════════════════════════════════════\\n');
};
