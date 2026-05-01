/**
 * hrrEngine — Motor HRR (Headway-to-Rival Ratio).
 *
 * HRR = headway_propio / tiempo_al_rival
 *   VENTAJA:   HRR > 1.2  (pasamos antes que el rival)
 *   NEUTRO:    0.8 ≤ HRR ≤ 1.2
 *   RIESGO:    HRR < 0.8  (el rival llega antes — robo de parada)
 *   SIN_DATOS: GPS insuficiente para calcular
 *
 * Cron:  cada 10 minutos (hrrTick).
 * HTTP:  GET /hrrQueryNow — disparo manual / verificación.
 *        GET /hrrData?agencyId=70 — datos actuales sin recalcular.
 *
 * Colecciones leídas:  corridor_overlap, gtfs_timetable, gtfs_stops
 * Colecciones escritas: hrr_live/{agencyId}_{linea}_{rivalAgencyId}_{rivalLinea}
 */

import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getBusesEnriquecidosInternal } from './immBusesService';

const db = admin.firestore();

// ─── Tipos ─────────────────────────────────────────────────────────────────────

interface CorridorPair {
  shapeAKey: string;
  shapeBKey: string;
  agencyA: string;
  empresaA: string;
  lineaA: string;
  agencyB: string;
  empresaB: string;
  lineaB: string;
  pctAInB: number;
  sharedKm: number;
}

interface TimetableDoc {
  agencyId: string;
  linea: string;
  directionId: number;
  serviceType: string;
  stops: string[];
  viajes: Array<{ s: string; t: number[] }>;
}

interface StopPos { lat: number; lng: number }

interface BusGps {
  idBus: string;
  agencyId: string;
  linea: string;
  lat: number;
  lng: number;
  velocidadKmh: number;
}

type HrrEstado = 'VENTAJA' | 'NEUTRO' | 'RIESGO' | 'SIN_DATOS';

interface HistEntry { ts: number; hrrValue: number | null; estado: HrrEstado }

// ─── Constantes ───────────────────────────────────────────────────────────────

const VEL_FALLBACK_KMH = 18;   // velocidad urbana conservadora Montevideo (km/h)
const SNAP_MAX_A = 500;        // máx distancia snap bus propio a parada (m)
const SNAP_MAX_B = 700;        // máx distancia snap bus rival a parada (m)
const HRR_VENTAJA_UMBRAL = 1.2;
const HRR_RIESGO_UMBRAL = 0.8;
const HRR_CAP = 4.0;           // cap: ventaja máxima reportable
const HISTORIAL_MAX = 6;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function distM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCurrentServiceType(): string {
  const day = new Date().getDay();
  if (day === 0) return 'DOMINGO';
  if (day === 6) return 'SABADO';
  return 'HABIL';
}

function clasificarHrr(hrr: number | null): HrrEstado {
  if (hrr === null) return 'SIN_DATOS';
  if (hrr > HRR_VENTAJA_UMBRAL) return 'VENTAJA';
  if (hrr >= HRR_RIESGO_UMBRAL) return 'NEUTRO';
  return 'RIESGO';
}

function actualizarHistorial(prev: HistEntry[], hrrValue: number | null, estado: HrrEstado): HistEntry[] {
  return [...prev, { ts: Date.now(), hrrValue, estado }].slice(-HISTORIAL_MAX);
}

// ─── Carga de datos ───────────────────────────────────────────────────────────

async function loadCorridorPairs(minPctOverlap = 30): Promise<CorridorPair[]> {
  // Solo filtramos por pctAInB (índice auto) y descartamos sameEmpresa=true en memoria,
  // para no depender de índice compuesto mientras se construye.
  const snap = await db.collection('corridor_overlap')
    .where('pctAInB', '>=', minPctOverlap)
    .get();
  return snap.docs.filter(d => d.data().sameEmpresa !== true).map(d => {
    const data = d.data();
    return {
      shapeAKey: data.shapeAKey ?? '',
      shapeBKey: data.shapeBKey ?? '',
      agencyA:   String(data.agencyA ?? ''),
      empresaA:  data.empresaA ?? '',
      lineaA:    data.lineaA ?? '',
      agencyB:   String(data.agencyB ?? ''),
      empresaB:  data.empresaB ?? '',
      lineaB:    data.lineaB ?? '',
      pctAInB:   Number(data.pctAInB ?? 0),
      sharedKm:  Number(data.sharedKm ?? 0),
    } as CorridorPair;
  });
}

async function loadTimetable(
  agencyId: string, linea: string, dir: number, svcType: string,
): Promise<TimetableDoc | null> {
  const snap = await db.collection('gtfs_timetable')
    .doc(`${agencyId}_${linea}_${dir}_${svcType}`)
    .get();
  return snap.exists ? (snap.data() as TimetableDoc) : null;
}

async function loadStopPositions(stopIds: string[]): Promise<Map<string, StopPos>> {
  const map = new Map<string, StopPos>();
  const CHUNK = 10;
  for (let i = 0; i < stopIds.length; i += CHUNK) {
    const snaps = await Promise.all(
      stopIds.slice(i, i + CHUNK).map(id => db.collection('gtfs_stops').doc(id).get())
    );
    for (const s of snaps) {
      if (!s.exists) continue;
      const d = s.data()!;
      map.set(s.id, { lat: Number(d.lat), lng: Number(d.lng) });
    }
  }
  return map;
}

// ─── Snap bus → parada más cercana en un timetable ───────────────────────────

interface SnapResult { stopId: string; stopIdx: number; distM: number; pos: StopPos }

function snapBus(
  lat: number, lng: number,
  tt: TimetableDoc,
  stopPositions: Map<string, StopPos>,
  maxDist: number,
): SnapResult | null {
  let best: SnapResult | null = null;
  for (let i = 0; i < tt.stops.length; i++) {
    const pos = stopPositions.get(tt.stops[i]);
    if (!pos) continue;
    const d = distM(lat, lng, pos.lat, pos.lng);
    if (d > maxDist) continue;
    if (!best || d < best.distM) best = { stopId: tt.stops[i], stopIdx: i, distM: d, pos };
  }
  return best;
}

// ─── Headway programado desde timetable (fallback para línea con 1 bus) ──────

function headwayProgramadoMin(tt: TimetableDoc): number {
  if (tt.viajes.length < 2) return 12; // fallback genérico
  const firstValidT = (v: { t: number[] }) => v.t.find(t => t >= 0) ?? -1;
  const t0 = firstValidT(tt.viajes[0]);
  const t1 = firstValidT(tt.viajes[1]);
  if (t0 >= 0 && t1 >= 0 && Math.abs(t1 - t0) > 0) return Math.abs(t1 - t0);
  return 12;
}

// ─── Cálculo HRR para un par de líneas ────────────────────────────────────────

interface HrrCalc {
  hrrValue: number | null;
  estado: HrrEstado;
  headwayPropioMin: number | null;
  tiempoARivalMin: number | null;
  busIdPropio: string | null;
  busIdRival: string | null;
  tramoLat: number | null;
  tramoLng: number | null;
}

const NO_DATA: HrrCalc = {
  hrrValue: null, estado: 'SIN_DATOS',
  headwayPropioMin: null, tiempoARivalMin: null,
  busIdPropio: null, busIdRival: null,
  tramoLat: null, tramoLng: null,
};

function calcHrrPair(
  busesA: BusGps[],
  busesB: BusGps[],
  tt: TimetableDoc,
  stopPositions: Map<string, StopPos>,
): HrrCalc {
  if (busesA.length === 0 || busesB.length === 0) return NO_DATA;

  // Snap buses propios al timetable de la línea A
  type SB = { bus: BusGps; snap: SnapResult };
  const snA: SB[] = busesA
    .map(b => ({ bus: b, snap: snapBus(b.lat, b.lng, tt, stopPositions, SNAP_MAX_A) }))
    .filter((x): x is SB => x.snap !== null);

  // Snap buses rivales al mismo timetable (tolerancia mayor — ruta similar)
  const snB: SB[] = busesB
    .map(b => ({ bus: b, snap: snapBus(b.lat, b.lng, tt, stopPositions, SNAP_MAX_B) }))
    .filter((x): x is SB => x.snap !== null);

  if (snA.length === 0 || snB.length === 0) return NO_DATA;

  // Bus propio representativo: mediana por posición en ruta
  snA.sort((a, b) => a.snap.stopIdx - b.snap.stopIdx);
  const ref = snA[Math.floor(snA.length / 2)];
  const propioIdx = ref.snap.stopIdx;

  // ── Headway propio ──────────────────────────────────────────────────────────
  let headwayPropioMin: number;
  if (snA.length >= 2) {
    const avgVelKmMin = snA.reduce((s, b) => s + b.bus.velocidadKmh, 0) / snA.length / 60;
    const velKmMin = Math.max(avgVelKmMin, VEL_FALLBACK_KMH / 60);
    // distancia total cubierta por la flota activa / (n_buses * velocidad) = headway
    const first = snA[0].snap.pos;
    const last  = snA[snA.length - 1].snap.pos;
    const fleetSpanKm = distM(first.lat, first.lng, last.lat, last.lng) / 1000;
    headwayPropioMin = fleetSpanKm > 0
      ? fleetSpanKm / (snA.length * velKmMin)
      : headwayProgramadoMin(tt);
  } else {
    headwayPropioMin = headwayProgramadoMin(tt);
  }

  // ── Tiempo al rival ─────────────────────────────────────────────────────────
  const adelante = snB.filter(b => b.snap.stopIdx >= propioIdx).sort((a, b) => a.snap.stopIdx - b.snap.stopIdx);
  const detras   = snB.filter(b => b.snap.stopIdx < propioIdx).sort((a, b) => b.snap.stopIdx - a.snap.stopIdx);

  let tiempoARivalMin: number;
  let busIdRival: string;
  let tramoLat: number;
  let tramoLng: number;
  let rivalIsAhead: boolean;

  if (adelante.length > 0) {
    // Rival delante → riesgo potencial
    const rival = adelante[0];
    const velKmMin = Math.max(rival.bus.velocidadKmh, VEL_FALLBACK_KMH) / 60;
    const distKm   = distM(ref.snap.pos.lat, ref.snap.pos.lng, rival.snap.pos.lat, rival.snap.pos.lng) / 1000;
    tiempoARivalMin = distKm / velKmMin;
    busIdRival  = rival.bus.idBus;
    tramoLat    = (ref.snap.pos.lat + rival.snap.pos.lat) / 2;
    tramoLng    = (ref.snap.pos.lng + rival.snap.pos.lng) / 2;
    rivalIsAhead = true;
  } else {
    // Rival detrás → vamos adelante → VENTAJA
    const rival = detras[0];
    tiempoARivalMin = headwayPropioMin * 1.5; // rival llega después de ~1.5 headways
    busIdRival  = rival.bus.idBus;
    tramoLat    = (ref.snap.pos.lat + rival.snap.pos.lat) / 2;
    tramoLng    = (ref.snap.pos.lng + rival.snap.pos.lng) / 2;
    rivalIsAhead = false;
  }

  if (tiempoARivalMin <= 0) return NO_DATA;

  const hrrRaw = headwayPropioMin / tiempoARivalMin;
  const hrrValue = rivalIsAhead
    ? Math.min(hrrRaw, HRR_CAP)
    : HRR_CAP; // rival detrás → ventaja máxima

  return {
    hrrValue: Math.round(hrrValue * 100) / 100,
    estado:   clasificarHrr(hrrValue),
    headwayPropioMin: Math.round(headwayPropioMin * 10) / 10,
    tiempoARivalMin:  Math.round(tiempoARivalMin  * 10) / 10,
    busIdPropio: ref.bus.idBus,
    busIdRival,
    tramoLat,
    tramoLng,
  };
}

// ─── Tick principal ────────────────────────────────────────────────────────────

interface HrrTickResult {
  paresEvaluados: number;
  paresSinDatos:  number;
  paresRiesgo:    number;
  paresNeutro:    number;
  paresVentaja:   number;
  durationMs:     number;
}

async function runHrrTick(): Promise<HrrTickResult> {
  const t0 = Date.now();
  const svcType = getCurrentServiceType();
  logger.info('[HRR] Tick iniciado | svcType:', svcType);

  // 1. Pares T1+T2 del corridor_overlap
  const pairs = await loadCorridorPairs();
  logger.info('[HRR] Pares cargados:', pairs.length);
  if (pairs.length === 0) {
    return { paresEvaluados: 0, paresSinDatos: 0, paresRiesgo: 0, paresNeutro: 0, paresVentaja: 0, durationMs: Date.now() - t0 };
  }

  // 2. GPS en vivo — único fetch para todo el tick
  const rawBuses = await getBusesEnriquecidosInternal('all');
  logger.info('[HRR] Buses GPS:', rawBuses.length);

  const busMap = new Map<string, Map<string, BusGps[]>>();
  for (const b of rawBuses) {
    if (!b.linea || !b.empresaId) continue;
    const aid = String(b.empresaId);
    if (!busMap.has(aid)) busMap.set(aid, new Map());
    const lm = busMap.get(aid)!;
    if (!lm.has(b.linea)) lm.set(b.linea, []);
    lm.get(b.linea)!.push({
      idBus: b.idBus,
      agencyId: aid,
      linea: b.linea,
      lat: b.lat,
      lng: b.lng,
      velocidadKmh: Number(b.velocidadKmh ?? VEL_FALLBACK_KMH),
    });
  }

  // 3. Timetables — solo líneas propias (agencyA) de los pares
  const lineasNeeded = new Set(pairs.map(p => `${p.agencyA}|${p.lineaA}`));
  const ttCache = new Map<string, TimetableDoc | null>();
  const stopIdsNeeded = new Set<string>();
  await Promise.all(
    [...lineasNeeded].flatMap(key => {
      const [agencyId, linea] = key.split('|');
      return [0, 1].map(async dir => {
        const cacheKey = `${agencyId}_${linea}_${dir}`;
        const tt = await loadTimetable(agencyId, linea, dir, svcType);
        ttCache.set(cacheKey, tt);
        if (tt) for (const s of tt.stops) stopIdsNeeded.add(s);
      });
    })
  );
  logger.info('[HRR] Timetables:', ttCache.size, '| Paradas:', stopIdsNeeded.size);

  // 4. Posiciones de paradas
  const stopPositions = await loadStopPositions([...stopIdsNeeded]);

  // 5. Historial previo (para no perder sparkline)
  const docIds = pairs.map(p => `${p.agencyA}_${p.lineaA}_${p.agencyB}_${p.lineaB}`);
  const prevHistorial = new Map<string, HistEntry[]>();
  const CHUNK = 10;
  for (let i = 0; i < docIds.length; i += CHUNK) {
    const snaps = await Promise.all(
      docIds.slice(i, i + CHUNK).map(id => db.collection('hrr_live').doc(id).get())
    );
    for (const s of snaps) {
      if (s.exists) prevHistorial.set(s.id, (s.data()!.historial as HistEntry[]) ?? []);
    }
  }

  // 6. Calcular HRR por par
  type ResultEntry = { docId: string; data: Record<string, unknown> };
  const results: ResultEntry[] = [];

  for (const p of pairs) {
    const busesA = busMap.get(p.agencyA)?.get(p.lineaA) ?? [];
    const busesB = busMap.get(p.agencyB)?.get(p.lineaB) ?? [];

    // Elegir dirección del timetable con más buses propios
    let bestTt: TimetableDoc | null = null;
    let bestCount = -1;
    for (const dir of [0, 1]) {
      const tt = ttCache.get(`${p.agencyA}_${p.lineaA}_${dir}`);
      if (!tt) continue;
      const count = busesA.filter(b => snapBus(b.lat, b.lng, tt, stopPositions, SNAP_MAX_A)).length;
      if (count > bestCount) { bestCount = count; bestTt = tt; }
    }

    const calc = (bestTt && bestCount > 0)
      ? calcHrrPair(busesA, busesB, bestTt, stopPositions)
      : { ...NO_DATA };

    const docId  = `${p.agencyA}_${p.lineaA}_${p.agencyB}_${p.lineaB}`;
    const historial = actualizarHistorial(prevHistorial.get(docId) ?? [], calc.hrrValue, calc.estado);

    results.push({
      docId,
      data: {
        agencyId:       p.agencyA,
        linea:          p.lineaA,
        rivalAgencyId:  p.agencyB,
        rivalLinea:     p.lineaB,
        empresaPropia:  p.empresaA,
        empresaRival:   p.empresaB,
        hrrValue:       calc.hrrValue,
        estado:         calc.estado,
        headwayPropioMin: calc.headwayPropioMin,
        tiempoARivalMin:  calc.tiempoARivalMin,
        busIdPropio:    calc.busIdPropio,
        busIdRival:     calc.busIdRival,
        tramoLat:       calc.tramoLat,
        tramoLng:       calc.tramoLng,
        pctOverlap:     p.pctAInB,
        sharedKm:       p.sharedKm,
        historial,
        updatedAt:      admin.firestore.FieldValue.serverTimestamp(),
      },
    });
  }

  // 7. Batch write
  const BATCH_SIZE = 490;
  const tickMs = Date.now() - t0;
  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const { docId, data } of results.slice(i, i + BATCH_SIZE)) {
      batch.set(db.collection('hrr_live').doc(docId), { ...data, tickMs });
    }
    await batch.commit();
  }

  const r: HrrTickResult = {
    paresEvaluados: results.length,
    paresSinDatos:  results.filter(r => r.data.estado === 'SIN_DATOS').length,
    paresRiesgo:    results.filter(r => r.data.estado === 'RIESGO').length,
    paresNeutro:    results.filter(r => r.data.estado === 'NEUTRO').length,
    paresVentaja:   results.filter(r => r.data.estado === 'VENTAJA').length,
    durationMs:     tickMs,
  };
  logger.info('[HRR] Resultado:', r);
  return r;
}

// ─── Exports ───────────────────────────────────────────────────────────────────

export const hrrTick = onSchedule(
  { schedule: 'every 10 minutes', region: 'us-central1', timeoutSeconds: 300, memory: '1GiB' },
  async () => {
    try { await runHrrTick(); }
    catch (err) { logger.error('[HRR] Tick falló:', err instanceof Error ? err.message : String(err)); }
  },
);

export const hrrQueryNow = onRequest(
  { region: 'us-central1', cors: true, timeoutSeconds: 300, memory: '1GiB' },
  async (_req, res) => {
    try {
      const result = await runHrrTick();
      res.json({ ok: true, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[HRR] HTTP falló:', msg);
      res.status(500).json({ ok: false, error: msg });
    }
  },
);

export const hrrData = onRequest(
  { region: 'us-central1', cors: true, timeoutSeconds: 30, memory: '256MiB' },
  async (req, res) => {
    try {
      const agencyId = (req.query.agencyId as string) ?? '70';
      const snap = await db.collection('hrr_live')
        .where('agencyId', '==', agencyId)
        .get();
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json({ ok: true, agencyId, total: docs.length, docs });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  },
);
