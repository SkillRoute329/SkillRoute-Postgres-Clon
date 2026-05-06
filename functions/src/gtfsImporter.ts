/**
 * gtfsImporter — Importa shapes, horarios, calendario y tarifas desde GTFS de la API IMM.
 *
 * Fuente:  GET /buses/gtfs/static/latest/google_transit.zip (autenticado OAuth)
 * Destino: shapes_cross_operator, gtfs_horarios, gtfs_calendar, gtfs_fares
 *
 * Cron: semanal (lunes 03:00 UTC). HTTP: POST /gtfsImportRun. GET: /gtfsDebug.
 */

import * as https from 'https';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { getImmToken, IMM_API_BASE } from './immTokenService';

const db = admin.firestore();
const SHAPES_COL = 'shapes_cross_operator';
const HORARIOS_COL = 'gtfs_horarios';
const CALENDAR_COL = 'gtfs_calendar';
const FARES_COL = 'gtfs_fares';
const STOPS_COL = 'gtfs_stops';
const TIMETABLE_COL = 'gtfs_timetable';
const HEALTH_DOC = 'ingesta_health/gtfs_importer';
const GTFS_PATH = '/buses/gtfs/static/latest/google_transit.zip';

const AGENCY_NAMES: Record<number, string> = {
  70: 'UCOT', 50: 'CUTCSA', 20: 'COME', 10: 'COETC',
};

// Mapa de conversión agency_id del GTFS → código numérico interno.
// El GTFS de la IMM puede usar el código numérico directamente ('70', '50', etc.)
// o un alias textual. Este mapa cubre ambos casos.
const AGENCY_CODE_MAP: Record<string, number> = {
  '70': 70, 'UCOT': 70, 'ucot': 70,
  '50': 50, 'CUTCSA': 50, 'cutcsa': 50, 'DES': 50,
  '20': 20, 'COME': 20, 'come': 20, 'COM': 20,
  '10': 10, 'COETC': 10, 'coetc': 10, 'COE': 10,
};

// ─── GTFS row types ───────────────────────────────────────────────────────────

interface GtfsRoute {
  route_id: string;
  agency_id: string;
  route_short_name: string;
  route_long_name: string;
}

interface GtfsTrip {
  route_id: string;
  trip_id: string;
  shape_id: string;
  direction_id: string;
  service_id: string;
}

interface GtfsShapePoint {
  shape_id: string;
  shape_pt_lat: string;
  shape_pt_lon: string;
  shape_pt_sequence: string;
}

interface GtfsStopTime {
  trip_id: string;
  arrival_time: string;
  departure_time: string;
  stop_id: string;
  stop_sequence: string;
}

interface GtfsCalendarRow {
  service_id: string;
  monday: string; tuesday: string; wednesday: string; thursday: string;
  friday: string; saturday: string; sunday: string;
  start_date: string; end_date: string;
}

interface GtfsCalendarDate {
  service_id: string;
  date: string;
  exception_type: string;
}

interface GtfsFareAttribute {
  fare_id: string;
  price: string;
  currency_type: string;
  payment_method: string;
  transfers: string;
}

interface GtfsFareRule {
  fare_id: string;
  route_id: string;
  origin_id?: string;
  destination_id?: string;
}

interface GtfsStop {
  stop_id: string;
  stop_code: string;
  stop_name: string;
  stop_lat: string;
  stop_lon: string;
  location_type?: string;
  parent_station?: string;
  wheelchair_boarding?: string;
}

// ─── Download ─────────────────────────────────────────────────────────────────

function fetchGtfsZip(token: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const url = new URL(IMM_API_BASE + GTFS_PATH);
    const req = https.request(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} al descargar GTFS ZIP`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.end();
  });
}

function parseCsv<T>(text: string): T[] {
  const result = Papa.parse<T>(text, { header: true, skipEmptyLines: true });
  return result.data;
}

// Lee un archivo del ZIP forzando decodificación UTF-8 explícita.
// JSZip.async('text') a veces decodifica como Latin-1 cuando el ZIP
// no tiene el flag UTF-8 en su metadata — produce "Ã±" en vez de "ñ".
async function readZipText(zip: JSZip, filename: string): Promise<string | undefined> {
  const file = zip.file(filename);
  if (!file) return undefined;
  const buf = await file.async('uint8array');
  return new TextDecoder('utf-8').decode(buf);
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

async function buildLineaAgencyMap(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const snap = await db.collection(SHAPES_COL).get();
  for (const d of snap.docs) {
    const data = d.data() as { linea?: string; agencyId?: string };
    if (!data.linea || !data.agencyId) continue;
    const agencyNum = parseInt(data.agencyId, 10);
    if (!agencyNum) continue;
    map.set(data.linea.trim().toLowerCase(), agencyNum);
  }
  logger.info('[GTFS] Líneas conocidas en GPS shapes:', map.size);
  return map;
}

// ─── Core import ──────────────────────────────────────────────────────────────

interface ImportResult {
  shapesEscritos: number;
  shapesIgnorados: number;
  routesCargadas: number;
  empresaResumen: Record<string, number>;
  horariosEscritos: number;
  calendarEscritos: number;
  faresEscritos: number;
  stopsEscritos: number;
  timetableEscritos: number;
  elapsedMs: number;
}

async function runImport(): Promise<ImportResult> {
  const start = Date.now();
  const token = await getImmToken();
  if (!token) throw new Error('Sin token IMM — configurar IMM_CLIENT_ID e IMM_CLIENT_SECRET');

  const lineaAgencyMap = await buildLineaAgencyMap();

  logger.info('[GTFS] Descargando ZIP...');
  const zipBuffer = await fetchGtfsZip(token);
  logger.info('[GTFS] ZIP descargado:', zipBuffer.length, 'bytes');
  const zip = await JSZip.loadAsync(zipBuffer);

  // routes.txt → routeId : { shortName, longName }
  const routesTxt = await readZipText(zip, 'routes.txt');
  if (!routesTxt) throw new Error('routes.txt no encontrado en ZIP');
  // Guardamos también agency_id para usarlo como fuente primaria al asignar empresa.
  // Esto resuelve el bug del "huevo y la gallina": si una empresa no tenía shapes
  // previas en Firestore, el mapa de Firestore devolvía 0 y sus shapes se guardaban
  // con agencyId "0" y empresa "STM". Ahora usamos el campo oficial del GTFS.
  const routeMap = new Map<string, { shortName: string; longName: string; agencyId: string }>();
  for (const r of parseCsv<GtfsRoute>(routesTxt)) {
    if (!r.route_id || !r.route_short_name) continue;
    routeMap.set(r.route_id, {
      shortName: r.route_short_name.trim(),
      longName: (r.route_long_name ?? '').trim(),
      agencyId: (r.agency_id ?? '').trim(),
    });
  }
  logger.info('[GTFS] Rutas totales en GTFS:', routeMap.size);

  // trips.txt → shapeToRoute + tripToRoute + routeToServiceIds
  const tripsTxt = await readZipText(zip, 'trips.txt');
  if (!tripsTxt) throw new Error('trips.txt no encontrado en ZIP');
  const shapeToRoute = new Map<string, { routeId: string; directionId: number }>();
  const tripToRoute = new Map<string, { routeId: string; directionId: number }>();
  const routeToServiceIds = new Map<string, Set<string>>();
  const shapeToFirstTrip = new Map<string, string>(); // shapeId → primer trip_id
  const tripToServiceId = new Map<string, string>();   // tripId → service_id
  for (const t of parseCsv<GtfsTrip>(tripsTxt)) {
    if (t.shape_id && !shapeToRoute.has(t.shape_id)) {
      shapeToRoute.set(t.shape_id, { routeId: t.route_id, directionId: parseInt(t.direction_id ?? '0', 10) });
    }
    if (t.shape_id && t.trip_id && !shapeToFirstTrip.has(t.shape_id)) {
      shapeToFirstTrip.set(t.shape_id, t.trip_id);
    }
    if (t.trip_id) {
      tripToRoute.set(t.trip_id, { routeId: t.route_id, directionId: parseInt(t.direction_id ?? '0', 10) });
    }
    if (t.service_id && t.route_id) {
      if (!routeToServiceIds.has(t.route_id)) routeToServiceIds.set(t.route_id, new Set());
      routeToServiceIds.get(t.route_id)!.add(t.service_id);
    }
    if (t.trip_id && t.service_id) tripToServiceId.set(t.trip_id, t.service_id);
  }
  const targetTripIds = new Set(shapeToFirstTrip.values());
  logger.info('[GTFS] shape_ids:', shapeToRoute.size, '| trips:', tripToRoute.size, '| target trips:', targetTripIds.size);

  // shapes.txt → shapeId : points[]
  const shapesTxt = await readZipText(zip, 'shapes.txt');
  if (!shapesTxt) throw new Error('shapes.txt no encontrado en ZIP');
  const shapeGroups = new Map<string, Array<{ lat: number; lng: number; seq: number }>>();
  for (const s of parseCsv<GtfsShapePoint>(shapesTxt)) {
    if (!s.shape_id) continue;
    if (!shapeGroups.has(s.shape_id)) shapeGroups.set(s.shape_id, []);
    shapeGroups.get(s.shape_id)!.push({
      lat: parseFloat(s.shape_pt_lat),
      lng: parseFloat(s.shape_pt_lon),
      seq: parseInt(s.shape_pt_sequence, 10),
    });
  }
  logger.info('[GTFS] shape_ids únicos:', shapeGroups.size);

  // ─── Shapes ───────────────────────────────────────────────────────────────
  interface ShapeDoc { id: string; data: Record<string, unknown> }
  // Usamos Map para deduplicar: cuando hay varias shapes para la misma
  // (agencyId, linea, directionId), conservamos la de mayor longitud real,
  // no la última que aparece en shapes.txt (que podría ser una variante corta).
  const docsMap = new Map<string, ShapeDoc>();
  let shapesIgnorados = 0;
  const empresaResumen: Record<string, number> = {};
  const generadoEn = admin.firestore.FieldValue.serverTimestamp();

  for (const [shapeId, rawPoints] of shapeGroups.entries()) {
    const tripInfo = shapeToRoute.get(shapeId);
    if (!tripInfo) { shapesIgnorados++; continue; }
    const routeInfo = routeMap.get(tripInfo.routeId);
    if (!routeInfo) { shapesIgnorados++; continue; }
    const { shortName: routeShortName, longName: routeLongName } = routeInfo;
    const { directionId } = tripInfo;
    rawPoints.sort((a, b) => a.seq - b.seq);
    // Filtrar puntos fuera del bounding box de Uruguay — coordenadas (0,0) u otras
    // latitudes/longitudes erróneas inflan enormemente el cálculo de longitud.
    const points = rawPoints
      .map(({ lat, lng }) => ({ lat, lng }))
      .filter(p => p.lat >= -35.5 && p.lat <= -29.5 && p.lng >= -58.5 && p.lng <= -53.0);
    if (points.length < 3) { shapesIgnorados++; continue; }

    // Calcular longitud real del recorrido (haversine acumulado, en metros)
    let lengthMeters = 0;
    for (let i = 1; i < points.length; i++) {
      const R = 6371000;
      const dLat = ((points[i].lat - points[i - 1].lat) * Math.PI) / 180;
      const dLng = ((points[i].lng - points[i - 1].lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((points[i - 1].lat * Math.PI) / 180) *
          Math.cos((points[i].lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      lengthMeters += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    lengthMeters = Math.round(lengthMeters);

    // Fuente primaria: agency_id del GTFS oficial (resuelve el bug de UCOT con 0 shapes).
    // Fallback: mapa construido desde Firestore (para líneas con agencyId ya conocido).
    const gtfsAgencyStr = routeInfo?.agencyId ?? '';
    const agencyNumId =
      AGENCY_CODE_MAP[gtfsAgencyStr] ??
      lineaAgencyMap.get(routeShortName.toLowerCase()) ??
      0;
    const empresa = agencyNumId ? (AGENCY_NAMES[agencyNumId] ?? `EMP_${agencyNumId}`) : 'STM';
    if (!agencyNumId) {
      logger.warn(`[GTFS] Línea sin empresa reconocida: ${routeShortName} (agency_id GTFS: "${gtfsAgencyStr}")`);
    }
    const sentidoStr = directionId === 0 ? 'IDA' : 'VUELTA';
    const docId = `${agencyNumId}_${routeShortName}_${sentidoStr}`;
    const docData: Record<string, unknown> = {
      agencyId: String(agencyNumId), empresa, linea: routeShortName,
      variante: directionId, sentido: directionId === 0 ? 'IDA' : 'VUELTA',
      points, puntosOriginales: points.length, puntosSimplificados: points.length,
      lengthMeters,
      shapeId, generadoEn, fuente: 'GTFS_OFICIAL',
    };
    if (routeLongName) docData['routeLongName'] = routeLongName;

    // Deduplicar: conservar la shape con mayor longitud real (recorrido completo vs. variante corta)
    const existing = docsMap.get(docId);
    if (!existing || (existing.data['lengthMeters'] as number) < lengthMeters) {
      docsMap.set(docId, { id: docId, data: docData });
      if (!existing) empresaResumen[empresa] = (empresaResumen[empresa] ?? 0) + 1;
    }
  }

  const docs = Array.from(docsMap.values());
  const BATCH_SIZE = 490;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const doc of docs.slice(i, i + BATCH_SIZE)) {
      batch.set(db.collection(SHAPES_COL).doc(doc.id), doc.data);
    }
    await batch.commit();
    logger.info(`[GTFS] Shapes batch ${Math.floor(i / BATCH_SIZE) + 1} → ${Math.min(i + BATCH_SIZE, docs.length)}`);
  }
  const shapesEscritos = docs.length;
  logger.info('[GTFS] Shapes:', shapesEscritos, 'escritas,', shapesIgnorados, 'ignoradas');

  // ─── Horarios (stop_times.txt) ─────────────────────────────────────────────
  let horariosEscritos = 0;
  let timetableEscritos = 0;
  const shapeToStopIds = new Map<string, string[]>();
  try {
    const stopTimesTxt = await readZipText(zip, 'stop_times.txt');
    if (stopTimesTxt) {
      logger.info('[GTFS] Procesando stop_times.txt...');
      const depToMin = (t: string) => { const p = t.split(':'); if (p.length < 2) return -1; const h = parseInt(p[0], 10), m = parseInt(p[1], 10); return isNaN(h) || isNaN(m) ? -1 : h * 60 + m; };
      const tripFirstDep = new Map<string, { time: string; seq: number }>();
      const tripOrderedStops = new Map<string, Array<{ stopId: string; seq: number }>>();
      const tripFullTimes = new Map<string, Array<{ stopId: string; depMin: number; seq: number }>>();
      for (const st of parseCsv<GtfsStopTime>(stopTimesTxt)) {
        if (!st.trip_id || !st.departure_time) continue;
        const seq = parseInt(st.stop_sequence, 10);
        const prev = tripFirstDep.get(st.trip_id);
        if (!prev || seq < prev.seq) tripFirstDep.set(st.trip_id, { time: st.departure_time, seq });
        // Captura paradas ordenadas para los trips representativos de cada shape
        if (st.stop_id && targetTripIds.has(st.trip_id)) {
          if (!tripOrderedStops.has(st.trip_id)) tripOrderedStops.set(st.trip_id, []);
          tripOrderedStops.get(st.trip_id)!.push({ stopId: st.stop_id, seq });
        }
        // Captura tiempos completos para todos los trips de rutas conocidas (para timetable)
        if (st.stop_id && tripToRoute.has(st.trip_id)) {
          const depMin = depToMin(st.departure_time);
          if (depMin >= 0) {
            if (!tripFullTimes.has(st.trip_id)) tripFullTimes.set(st.trip_id, []);
            tripFullTimes.get(st.trip_id)!.push({ stopId: st.stop_id, depMin, seq });
          }
        }
      }
      // shapeToStopIds: shapeId → [stop_id, ...] en orden de secuencia
      for (const [shapeId, tripId] of shapeToFirstTrip) {
        const stops = tripOrderedStops.get(tripId);
        if (stops && stops.length > 0) {
          stops.sort((a, b) => a.seq - b.seq);
          shapeToStopIds.set(shapeId, stops.map(s => s.stopId));
        }
      }
      logger.info('[GTFS] Viajes con primera salida:', tripFirstDep.size, '| Shapes con stopIds:', shapeToStopIds.size);
      const horarioGrupos = new Map<string, string[]>();
      for (const [tripId, dep] of tripFirstDep.entries()) {
        const ti = tripToRoute.get(tripId);
        if (!ti) continue;
        const ri = routeMap.get(ti.routeId);
        if (!ri) continue;
        const key = `${ri.shortName}|${ti.directionId}`;
        if (!horarioGrupos.has(key)) horarioGrupos.set(key, []);
        horarioGrupos.get(key)!.push(dep.time);
      }
      interface HorarioDoc { id: string; data: Record<string, unknown> }
      const horarioDocs: HorarioDoc[] = [];
      for (const [key, salidas] of horarioGrupos.entries()) {
        const [shortName, dirStr] = key.split('|');
        const directionId = parseInt(dirStr, 10);
        const agencyNumId = lineaAgencyMap.get(shortName.toLowerCase()) ?? 0;
        const empresa = agencyNumId ? (AGENCY_NAMES[agencyNumId] ?? `EMP_${agencyNumId}`) : 'STM';
        const normalizados = salidas.map(t => t.trim()).filter(Boolean).sort();
        const deduplicated = [...new Set(normalizados)];
        let frecuenciaPromMin = 0;
        if (deduplicated.length >= 2) {
          const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
          const diffs: number[] = [];
          const mins = deduplicated.map(toMin);
          for (let i = 1; i < mins.length; i++) {
            const d = mins[i] - mins[i - 1];
            if (d > 0 && d < 180) diffs.push(d);
          }
          frecuenciaPromMin = diffs.length > 0 ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length) : 0;
        }
        horarioDocs.push({
          id: `${agencyNumId}_${shortName}_${directionId}`,
          data: {
            agencyId: String(agencyNumId), empresa, linea: shortName, directionId,
            sentido: directionId === 0 ? 'IDA' : 'VUELTA',
            salidas: deduplicated, frecuenciaPromMin,
            primerSalida: deduplicated[0] ?? '', ultimaSalida: deduplicated[deduplicated.length - 1] ?? '',
            totalViajes: deduplicated.length, generadoEn, fuente: 'GTFS_OFICIAL',
          },
        });
      }
      for (let i = 0; i < horarioDocs.length; i += BATCH_SIZE) {
        const batch = db.batch();
        for (const doc of horarioDocs.slice(i, i + BATCH_SIZE)) {
          batch.set(db.collection(HORARIOS_COL).doc(doc.id), doc.data);
        }
        await batch.commit();
      }
      horariosEscritos = horarioDocs.length;
      logger.info('[GTFS] Horarios escritos:', horariosEscritos);

      // Actualizar shapes con stopIds (merge — añade el campo sin sobrescribir el resto)
      if (shapeToStopIds.size > 0) {
        const stopIdsUpdates = docs
          .filter(d => shapeToStopIds.has(d.data['shapeId'] as string))
          .map(d => ({ id: d.id, stopIds: shapeToStopIds.get(d.data['shapeId'] as string)! }));
        for (let i = 0; i < stopIdsUpdates.length; i += BATCH_SIZE) {
          const batch = db.batch();
          for (const { id, stopIds } of stopIdsUpdates.slice(i, i + BATCH_SIZE)) {
            batch.update(db.collection(SHAPES_COL).doc(id), { stopIds });
          }
          await batch.commit();
        }
        logger.info('[GTFS] Shapes actualizados con stopIds:', stopIdsUpdates.length);
      }

      // ─── gtfs_timetable ─────────────────────────────────────────────────────
      if (shapeToStopIds.size > 0 && tripFullTimes.size > 0) {
        // Tipo de servicio por service_id desde calendar.txt (es pequeño, se relee)
        const svcTypes = new Map<string, Set<string>>();
        const calRaw = await readZipText(zip, 'calendar.txt');
        if (calRaw) {
          for (const row of parseCsv<GtfsCalendarRow>(calRaw)) {
            if (!row.service_id) continue;
            const s = new Set<string>();
            if (row.monday === '1' || row.tuesday === '1' || row.wednesday === '1' ||
                row.thursday === '1' || row.friday === '1') s.add('HABIL');
            if (row.saturday === '1') s.add('SABADO');
            if (row.sunday === '1') s.add('DOMINGO');
            if (s.size > 0) svcTypes.set(row.service_id, s);
          }
        }
        logger.info('[GTFS] Tipos de servicio:', svcTypes.size, '| Trips con tiempos:', tripFullTimes.size);

        // Orden canónico de paradas por ruta/dirección — elige la variante con MÁS paradas
        // (evita que una variante secundaria corta, ej. 300a con 20 paradas, desplace la principal con 70+)
        const routeKeyToCanonical = new Map<string, string[]>();
        for (const [shapeId, stopIds] of shapeToStopIds) {
          const info = shapeToRoute.get(shapeId);
          if (!info) continue;
          const key = `${info.routeId}|${info.directionId}`;
          const existing = routeKeyToCanonical.get(key);
          if (!existing || stopIds.length > existing.length) {
            routeKeyToCanonical.set(key, stopIds);
          }
        }

        interface TGroup {
          agencyNumId: number; linea: string; directionId: number;
          serviceType: string; stops: string[];
          viajes: Array<{ s: string; t: number[] }>;
        }
        const groups = new Map<string, TGroup>();

        for (const [tripId, times] of tripFullTimes) {
          const ti = tripToRoute.get(tripId);
          if (!ti) continue;
          const ri = routeMap.get(ti.routeId);
          if (!ri) continue;
          const rKey = `${ti.routeId}|${ti.directionId}`;
          const canonical = routeKeyToCanonical.get(rKey);
          if (!canonical || canonical.length < 2) continue;
          const svcId = tripToServiceId.get(tripId);
          const typeSet = svcId ? (svcTypes.get(svcId) ?? new Set<string>(['HABIL'])) : new Set<string>(['HABIL']);
          const agencyNumId = lineaAgencyMap.get(ri.shortName.toLowerCase()) ?? 0;

          // Alinear tiempos al orden canónico
          times.sort((a, b) => a.seq - b.seq);
          const posMap = new Map<string, number>();
          canonical.forEach((stopId, i) => posMap.set(stopId, i));
          const tArr = new Array<number>(canonical.length).fill(-1);
          for (const { stopId, depMin } of times) {
            const pos = posMap.get(stopId);
            if (pos !== undefined && tArr[pos] === -1) tArr[pos] = depMin;
          }
          const firstMin = tArr.find(m => m >= 0);
          if (firstMin === undefined) continue;
          const s = `${String(Math.floor(firstMin / 60)).padStart(2, '0')}:${String(firstMin % 60).padStart(2, '0')}`;

          for (const svcType of typeSet) {
            const gKey = `${agencyNumId}|${ti.routeId}|${ti.directionId}|${svcType}`;
            if (!groups.has(gKey)) {
              groups.set(gKey, { agencyNumId, linea: ri.shortName, directionId: ti.directionId, serviceType: svcType, stops: canonical, viajes: [] });
            }
            groups.get(gKey)!.viajes.push({ s, t: tArr });
          }
        }

        interface TDoc { id: string; data: Record<string, unknown> }
        const tDocs: TDoc[] = [];
        for (const [, g] of groups) {
          g.viajes.sort((a, b) => (a.t.find(m => m >= 0) ?? 9999) - (b.t.find(m => m >= 0) ?? 9999));
          const empresa = g.agencyNumId ? (AGENCY_NAMES[g.agencyNumId] ?? `EMP_${g.agencyNumId}`) : 'STM';
          tDocs.push({
            id: `${g.agencyNumId}_${g.linea}_${g.directionId}_${g.serviceType}`,
            data: {
              agencyId: String(g.agencyNumId), empresa, linea: g.linea,
              directionId: g.directionId, serviceType: g.serviceType,
              stops: g.stops, viajes: g.viajes,
              totalViajes: g.viajes.length,
              primeraS: g.viajes[0]?.s ?? '',
              ultimaS: g.viajes[g.viajes.length - 1]?.s ?? '',
              generadoEn, fuente: 'GTFS_OFICIAL',
            },
          });
        }
        // Validación de simetría: dirección con muy pocas paradas respecto a la otra → truncada
        // Estrategia: escribir la dirección buena, BORRAR la mala del Firestore previo
        const stopsByLineDir = new Map<string, { dir0?: number; dir1?: number }>();
        for (const d of tDocs) {
          const { agencyId, linea, directionId, stops } = d.data as { agencyId: string; linea: string; directionId: number; stops: string[] };
          const lk = `${agencyId}|${linea}`;
          const cur = stopsByLineDir.get(lk) ?? {};
          if (directionId === 0) cur.dir0 = (stops as string[]).length;
          else cur.dir1 = (stops as string[]).length;
          stopsByLineDir.set(lk, cur);
        }
        // dirDocsMalos: docs individuales con variante truncada — skip escritura + borrar old doc
        const dirDocsMalos = new Set<string>();
        for (const [lk, cnts] of stopsByLineDir) {
          if (cnts.dir0 !== undefined && cnts.dir1 !== undefined) {
            const ratio = Math.min(cnts.dir0, cnts.dir1) / Math.max(cnts.dir0, cnts.dir1);
            if (ratio < 0.5) {
              const [aid, lin] = lk.split('|');
              // Marcar solo la dirección corta como mala (la larga se escribe normalmente)
              if (cnts.dir0 < cnts.dir1) {
                logger.warn(`[GTFS] Dir truncada ${lk} dir=0: ${cnts.dir0} paradas vs ${cnts.dir1} (ratio ${ratio.toFixed(2)}) — se elimina doc`);
                for (const svc of ['HABIL', 'SABADO', 'DOMINGO']) dirDocsMalos.add(`${aid}_${lin}_0_${svc}`);
              } else {
                logger.warn(`[GTFS] Dir truncada ${lk} dir=1: ${cnts.dir1} paradas vs ${cnts.dir0} (ratio ${ratio.toFixed(2)}) — se elimina doc`);
                for (const svc of ['HABIL', 'SABADO', 'DOMINGO']) dirDocsMalos.add(`${aid}_${lin}_1_${svc}`);
              }
            }
          }
        }
        // Eliminar docs malos pre-existentes en Firestore (en batches)
        if (dirDocsMalos.size > 0) {
          const deleteIds = [...dirDocsMalos];
          for (let i = 0; i < deleteIds.length; i += BATCH_SIZE) {
            const batch = db.batch();
            for (const docId of deleteIds.slice(i, i + BATCH_SIZE)) {
              batch.delete(db.collection(TIMETABLE_COL).doc(docId));
            }
            await batch.commit();
          }
          logger.warn(`[GTFS] Eliminados ${dirDocsMalos.size} docs de direcciones truncadas: ${deleteIds.join(', ')}`);
        }
        const tDocsValidados = tDocs.filter(d => !dirDocsMalos.has(d.id));

        for (let i = 0; i < tDocsValidados.length; i += BATCH_SIZE) {
          const batch = db.batch();
          for (const d of tDocsValidados.slice(i, i + BATCH_SIZE)) {
            batch.set(db.collection(TIMETABLE_COL).doc(d.id), d.data);
          }
          await batch.commit();
          logger.info(`[GTFS] Timetable batch ${Math.floor(i / BATCH_SIZE) + 1} → ${Math.min(i + BATCH_SIZE, tDocsValidados.length)}`);
        }
        timetableEscritos = tDocsValidados.length;
        logger.info('[GTFS] Timetable escritos:', timetableEscritos);
      }
    }
  } catch (err) {
    logger.warn('[GTFS] Error en horarios:', err instanceof Error ? err.message : String(err));
  }

  // ─── Calendar (calendar.txt + calendar_dates.txt) ─────────────────────────
  let calendarEscritos = 0;
  try {
    const calendarTxt = await readZipText(zip, 'calendar.txt');
    const calendarDatesTxt = await readZipText(zip, 'calendar_dates.txt');
    if (calendarTxt) {
      logger.info('[GTFS] Procesando calendar.txt...');
      const servicePatterns = new Map<string, { habil: boolean; sabado: boolean; domingo: boolean; start: string; end: string }>();
      for (const row of parseCsv<GtfsCalendarRow>(calendarTxt)) {
        if (!row.service_id) continue;
        servicePatterns.set(row.service_id, {
          habil: row.monday === '1' || row.tuesday === '1' || row.wednesday === '1' ||
                 row.thursday === '1' || row.friday === '1',
          sabado: row.saturday === '1',
          domingo: row.sunday === '1',
          start: row.start_date ?? '',
          end: row.end_date ?? '',
        });
      }
      // calendar_dates: exceptions (informativo — guardadas en el doc)
      const exceptionDates = new Map<string, number>(); // date → count servicios afectados
      if (calendarDatesTxt) {
        for (const row of parseCsv<GtfsCalendarDate>(calendarDatesTxt)) {
          if (row.date) exceptionDates.set(row.date, (exceptionDates.get(row.date) ?? 0) + 1);
        }
      }
      interface CalendarDoc { id: string; data: Record<string, unknown> }
      const calDocs = new Map<string, CalendarDoc>();
      for (const [routeId, serviceIds] of routeToServiceIds.entries()) {
        const ri = routeMap.get(routeId);
        if (!ri) continue;
        const agencyNumId = lineaAgencyMap.get(ri.shortName.toLowerCase()) ?? 0;
        const empresa = agencyNumId ? (AGENCY_NAMES[agencyNumId] ?? `EMP_${agencyNumId}`) : 'STM';
        const docId = `${agencyNumId}_${ri.shortName}`;
        let tieneHabil = false, tieneSabado = false, tieneDomingo = false;
        let vigenciaDesde = '', vigenciaHasta = '';
        for (const sid of serviceIds) {
          const pat = servicePatterns.get(sid);
          if (!pat) continue;
          if (pat.habil) tieneHabil = true;
          if (pat.sabado) tieneSabado = true;
          if (pat.domingo) tieneDomingo = true;
          if (!vigenciaDesde || pat.start < vigenciaDesde) vigenciaDesde = pat.start;
          if (!vigenciaHasta || pat.end > vigenciaHasta) vigenciaHasta = pat.end;
        }
        const servicios: string[] = [];
        if (tieneHabil) servicios.push('HABIL');
        if (tieneSabado) servicios.push('SABADO');
        if (tieneDomingo) servicios.push('DOMINGO');
        calDocs.set(docId, {
          id: docId,
          data: { agencyId: String(agencyNumId), empresa, linea: ri.shortName,
            tieneHabil, tieneSabado, tieneDomingo, servicios, vigenciaDesde, vigenciaHasta,
            generadoEn, fuente: 'GTFS_OFICIAL' },
        });
      }
      const calDocArr = [...calDocs.values()];
      for (let i = 0; i < calDocArr.length; i += BATCH_SIZE) {
        const batch = db.batch();
        for (const doc of calDocArr.slice(i, i + BATCH_SIZE)) {
          batch.set(db.collection(CALENDAR_COL).doc(doc.id), doc.data);
        }
        await batch.commit();
      }
      calendarEscritos = calDocArr.length;
      logger.info('[GTFS] Calendar escritos:', calendarEscritos);
    }
  } catch (err) {
    logger.warn('[GTFS] Error en calendar:', err instanceof Error ? err.message : String(err));
  }

  // ─── Fares (fare_attributes.txt + fare_rules.txt) ─────────────────────────
  let faresEscritos = 0;
  try {
    const fareAttrTxt = await readZipText(zip, 'fare_attributes.txt');
    const fareRulesTxt = await readZipText(zip, 'fare_rules.txt');
    if (fareAttrTxt) {
      logger.info('[GTFS] Procesando fares...');
      const fareAttrs = new Map<string, { price: number; currency: string; payMethod: number; transfers: number }>();
      for (const row of parseCsv<GtfsFareAttribute>(fareAttrTxt)) {
        if (!row.fare_id) continue;
        fareAttrs.set(row.fare_id, {
          price: parseFloat(row.price) || 0,
          currency: row.currency_type ?? 'UYU',
          payMethod: parseInt(row.payment_method ?? '0', 10),
          transfers: parseInt(row.transfers ?? '-1', 10),
        });
      }
      const fareRoutes = new Map<string, Set<string>>();
      if (fareRulesTxt) {
        for (const row of parseCsv<GtfsFareRule>(fareRulesTxt)) {
          if (!row.fare_id || !row.route_id) continue;
          if (!fareRoutes.has(row.fare_id)) fareRoutes.set(row.fare_id, new Set());
          fareRoutes.get(row.fare_id)!.add(row.route_id);
        }
      }
      interface FareDoc { id: string; data: Record<string, unknown> }
      const fareDocs: FareDoc[] = [];
      for (const [fareId, attr] of fareAttrs.entries()) {
        const routeIds = fareRoutes.get(fareId) ?? new Set<string>();
        const lineas: string[] = [];
        const agencyIdsSet = new Set<string>();
        const empresasSet = new Set<string>();
        for (const routeId of routeIds) {
          const ri = routeMap.get(routeId);
          if (!ri) continue;
          lineas.push(ri.shortName);
          const aid = lineaAgencyMap.get(ri.shortName.toLowerCase()) ?? 0;
          if (aid) { agencyIdsSet.add(String(aid)); empresasSet.add(AGENCY_NAMES[aid] ?? `EMP_${aid}`); }
        }
        fareDocs.push({
          id: fareId,
          data: {
            fareId, precio: attr.price, moneda: attr.currency,
            metodoPago: attr.payMethod === 0 ? 'A_BORDO' : 'PREVIO',
            transferencias: attr.transfers,
            lineas: lineas.sort(), agencyIds: [...agencyIdsSet].sort(),
            empresas: [...empresasSet].sort(), generadoEn, fuente: 'GTFS_OFICIAL',
          },
        });
      }
      for (let i = 0; i < fareDocs.length; i += BATCH_SIZE) {
        const batch = db.batch();
        for (const doc of fareDocs.slice(i, i + BATCH_SIZE)) {
          batch.set(db.collection(FARES_COL).doc(doc.id), doc.data);
        }
        await batch.commit();
      }
      faresEscritos = fareDocs.length;
      logger.info('[GTFS] Fares escritos:', faresEscritos);
    }
  } catch (err) {
    logger.warn('[GTFS] Error en fares:', err instanceof Error ? err.message : String(err));
  }

  // ─── Paradas (stops.txt) ──────────────────────────────────────────────────
  let stopsEscritos = 0;
  try {
    const stopsTxt = await readZipText(zip, 'stops.txt');
    if (stopsTxt) {
      logger.info('[GTFS] Procesando stops.txt...');
      interface StopDoc { id: string; data: Record<string, unknown> }
      const stopDocs: StopDoc[] = [];
      for (const row of parseCsv<GtfsStop>(stopsTxt)) {
        if (!row.stop_id || !row.stop_lat || !row.stop_lon) continue;
        const lat = parseFloat(row.stop_lat);
        const lng = parseFloat(row.stop_lon);
        if (isNaN(lat) || isNaN(lng)) continue;
        stopDocs.push({
          id: row.stop_id,
          data: {
            stopId: row.stop_id,
            codigo: (row.stop_code ?? '').trim(),
            nombre: (row.stop_name ?? '').trim(),
            lat, lng,
            accesible: row.wheelchair_boarding === '1',
            generadoEn, fuente: 'GTFS_OFICIAL',
          },
        });
      }
      for (let i = 0; i < stopDocs.length; i += BATCH_SIZE) {
        const batch = db.batch();
        for (const doc of stopDocs.slice(i, i + BATCH_SIZE)) {
          batch.set(db.collection(STOPS_COL).doc(doc.id), doc.data);
        }
        await batch.commit();
        logger.info(`[GTFS] Stops batch ${Math.floor(i / BATCH_SIZE) + 1} → ${Math.min(i + BATCH_SIZE, stopDocs.length)}`);
      }
      stopsEscritos = stopDocs.length;
      logger.info('[GTFS] Paradas escritas:', stopsEscritos);
    }
  } catch (err) {
    logger.warn('[GTFS] Error en stops:', err instanceof Error ? err.message : String(err));
  }

  const elapsedMs = Date.now() - start;
  logger.info('[GTFS] Completo:', shapesEscritos, 'shapes', horariosEscritos, 'horarios', calendarEscritos, 'calendar', faresEscritos, 'fares', stopsEscritos, 'stops', timetableEscritos, 'timetable', elapsedMs, 'ms');

  await db.doc(HEALTH_DOC).set({
    status: shapesEscritos > 0 ? 'OK' : 'EMPTY',
    shapes_escritas: shapesEscritos, shapes_ignoradas: shapesIgnorados,
    horarios_escritos: horariosEscritos, calendar_escritos: calendarEscritos, fares_escritos: faresEscritos,
    stops_escritas: stopsEscritos, timetable_escritos: timetableEscritos,
    routes_cargadas: routeMap.size, empresa_resumen: empresaResumen,
    elapsed_ms: elapsedMs, last_run_at: admin.firestore.FieldValue.serverTimestamp(), zip_bytes: zipBuffer.length,
  }, { merge: true });

  return { shapesEscritos, shapesIgnorados, routesCargadas: routeMap.size, empresaResumen, horariosEscritos, calendarEscritos, faresEscritos, stopsEscritos, timetableEscritos, elapsedMs };
}

// ─── Cloud Function exports ───────────────────────────────────────────────────

export const gtfsImportTick = onSchedule(
  { schedule: 'every monday 03:00', region: 'us-central1', timeoutSeconds: 540, memory: '2GiB' },
  async () => {
    try {
      const result = await runImport();
      logger.info('[GTFS] Tick OK:', result.shapesEscritos, 'shapes,', result.calendarEscritos, 'calendar,', result.faresEscritos, 'fares');
    } catch (err) {
      logger.error('[GTFS] Tick falló:', err instanceof Error ? err.message : String(err));
    }
  },
);

export const gtfsImportRun = onRequest(
  { region: 'us-central1', cors: true, timeoutSeconds: 540, memory: '2GiB' },
  async (_req, res) => {
    try {
      const result = await runImport();
      res.json({ ok: true, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[GTFS] Run HTTP falló:', msg);
      res.status(500).json({ ok: false, error: msg });
    }
  },
);

export const gtfsDebug = onRequest(
  { region: 'us-central1', cors: true, timeoutSeconds: 120, memory: '512MiB' },
  async (_req, res) => {
    try {
      const token = await getImmToken();
      if (!token) { res.status(500).json({ ok: false, error: 'Sin token IMM' }); return; }
      const zipBuffer = await fetchGtfsZip(token);
      const zip = await JSZip.loadAsync(zipBuffer);
      const files = Object.keys(zip.files);
      const routesTxt = await readZipText(zip, 'routes.txt') ?? '';
      const agencyTxt = await readZipText(zip, 'agency.txt') ?? '';
      const calendarTxt = await readZipText(zip, 'calendar.txt') ?? '';
      const fareAttrTxt = await readZipText(zip, 'fare_attributes.txt') ?? '';
      const stopsTxt = await readZipText(zip, 'stops.txt') ?? '';
      res.json({
        ok: true, zip_bytes: zipBuffer.length, files,
        agency_preview: parseCsv<Record<string, string>>(agencyTxt).slice(0, 5),
        routes_preview: parseCsv<Record<string, string>>(routesTxt).slice(0, 10),
        stops_preview: parseCsv<Record<string, string>>(stopsTxt).slice(0, 5),
        calendar_preview: parseCsv<Record<string, string>>(calendarTxt).slice(0, 5),
        fares_preview: parseCsv<Record<string, string>>(fareAttrTxt).slice(0, 5),
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  },
);
