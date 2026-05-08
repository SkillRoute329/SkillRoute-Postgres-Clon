/**
 * shapeReconstruction.ts — Reconstrucción de shapes cross-operador
 * =================================================================
 * DIRECTRIZ 2026-04-24 (CLAUDE.md): SkillRoute analiza el sistema
 * metropolitano completo de Uruguay. El GTFS static actual sólo cubre
 * UCOT, por lo que para tener shapes de CUTCSA/COME/COETC reconstruimos
 * las polilíneas a partir del histórico GPS en `vehicle_events`.
 *
 * Entrada:
 *   - vehicle_events (cron autoStatsCollector): docs con
 *     {idBus, agencyId, linea, sentido IDA|VUELTA, lat, lon, bearing, timestampGPS}
 *
 * Salida:
 *   - Colección `shapes_cross_operator/{agencyId}-{linea}-{sentido}`:
 *     polilínea ordenada, longitud, bus/trip origen, timestamp
 *
 * Algoritmo (sencillo y determinístico para MVP):
 *   1. Traer pings de las últimas 72h (agencia por agencia, índice ya existe).
 *   2. Agrupar por (agencia, línea, sentido, bus) → candidatos de viaje.
 *   3. Partir cada bus-línea-sentido donde haya un gap >15 min → "trips".
 *      (tolera paradas en terminal; la densidad real es ~3-4 pings/hora/bus.)
 *   4. Por cada (agencia, línea, sentido) quedarnos con el trip de más puntos.
 *   5. Simplificar con Douglas-Peucker (tol 15 m) para reducir ruido.
 *   6. Descartar resultados <6 puntos o <1.5 km (no son líneas reales).
 *   7. Escribir batch a Firestore.
 *
 * Cron: lunes 03:00 Montevideo. HTTP manual: reconstructShapesNow.
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ─── Constantes ────────────────────────────────────────────────────────────

const COLLECTION = 'shapes_cross_operator';
const SOURCE_COLLECTION = 'vehicle_events';
const LOOKBACK_HOURS = 168; // 7 días — restaurar cobertura de corridor_overlap tras incidente AUD-012
const MIN_POINTS_FOR_SHAPE = 6;
const MIN_LENGTH_METERS = 1500;
const DOUGLAS_PEUCKER_TOLERANCE_M = 15;
const MAX_GAP_BETWEEN_PINGS_MS = 15 * 60 * 1000;
const MAX_PINGS_PER_AGENCY = 150000; // aumentado de 25k para cubrir todas las líneas activas
const BATCH_SIZE = 400;

const AGENCY_NAMES: Record<string, string> = {
  '10': 'COETC',
  '20': 'COME',
  '50': 'CUTCSA',
  '70': 'UCOT',
};

// ─── Tipos ─────────────────────────────────────────────────────────────────

type Sentido = 'IDA' | 'VUELTA';

interface VEPing {
  idBus: string;
  agencyId: string;
  linea: string;
  sentido: Sentido;
  lat: number;
  lon: number;
  bearing: number | null;
  timestampGPS: string;
}

interface Point {
  lat: number;
  lon: number;
}

interface Trip {
  key: string; // agencyId-linea-sentido
  agencyId: string;
  linea: string;
  sentido: Sentido;
  bus: string;
  points: Point[];
  tsStart: string;
  tsEnd: string;
}

interface ShapeDoc {
  key: string;
  agencyId: string;
  empresa: string;
  linea: string;
  sentido: Sentido;
  points: Point[];
  lengthMeters: number;
  pointCount: number;
  sourceTripBus: string;
  sourceTripFrom: string;
  sourceTripTo: string;
  reconstructedAt: admin.firestore.Timestamp;
  lookbackHours: number;
}

// ─── Helpers geométricos ───────────────────────────────────────────────────

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Distancia perpendicular punto→segmento en metros (equirectangular local). */
function perpendicularDistanceMeters(p: Point, a: Point, b: Point): number {
  const latRef = ((a.lat + b.lat + p.lat) / 3) * (Math.PI / 180);
  const scaleX = 111320 * Math.cos(latRef);
  const scaleY = 111320;
  const ax = a.lon * scaleX, ay = a.lat * scaleY;
  const bx = b.lon * scaleX, by = b.lat * scaleY;
  const px = p.lon * scaleX, py = p.lat * scaleY;
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  const tc = Math.max(0, Math.min(1, t));
  const cx = ax + tc * dx;
  const cy = ay + tc * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Simplificación Douglas-Peucker iterativa (evita stack overflow en shapes largas). */
function douglasPeucker(points: Point[], toleranceM: number): Point[] {
  if (points.length < 3) return points.slice();
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [i0, i1] = stack.pop()!;
    if (i1 - i0 < 2) continue;
    let maxDist = 0;
    let maxIdx = -1;
    const a = points[i0]!;
    const b = points[i1]!;
    for (let k = i0 + 1; k < i1; k++) {
      const d = perpendicularDistanceMeters(points[k]!, a, b);
      if (d > maxDist) { maxDist = d; maxIdx = k; }
    }
    if (maxIdx !== -1 && maxDist > toleranceM) {
      keep[maxIdx] = true;
      stack.push([i0, maxIdx]);
      stack.push([maxIdx, i1]);
    }
  }
  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) result.push(points[i]!);
  return result;
}

function polylineLengthMeters(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1]!.lat, points[i - 1]!.lon, points[i]!.lat, points[i]!.lon);
  }
  return total;
}

// ─── Lectura de vehicle_events ─────────────────────────────────────────────

async function fetchPingsForAgency(agencyId: string, sinceISO: string): Promise<VEPing[]> {
  // Usa índice existente (agencyId ASC, timestampGPS DESC). Traemos desc y ordenamos asc después.
  const snap = await db
    .collection(SOURCE_COLLECTION)
    .where('agencyId', '==', agencyId)
    .where('timestampGPS', '>=', sinceISO)
    .orderBy('timestampGPS', 'desc')
    .limit(MAX_PINGS_PER_AGENCY)
    .get();

  const pings: VEPing[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const idBus = d.idBus ? String(d.idBus) : '';
    const linea = d.linea ? String(d.linea).trim() : '';
    const sentidoRaw = d.sentido;
    if (!idBus || !linea) continue;
    if (sentidoRaw !== 'IDA' && sentidoRaw !== 'VUELTA') continue;
    if (typeof d.lat !== 'number' || typeof d.lon !== 'number') continue;
    if (!d.timestampGPS) continue;
    pings.push({
      idBus,
      agencyId,
      linea,
      sentido: sentidoRaw as Sentido,
      lat: d.lat,
      lon: d.lon,
      bearing: typeof d.bearing === 'number' ? d.bearing : null,
      timestampGPS: String(d.timestampGPS),
    });
  }
  // Orden ascendente por tiempo (venimos desc por el índice)
  pings.sort((a, b) => a.timestampGPS.localeCompare(b.timestampGPS));
  return pings;
}

// ─── Extracción de trips ───────────────────────────────────────────────────

/** Partir cada (agencyId, linea, sentido, bus) en trips separados por gaps >5 min. */
function extractTrips(pings: VEPing[]): Trip[] {
  const byBus = new Map<string, VEPing[]>();
  for (const p of pings) {
    const k = `${p.agencyId}|${p.linea}|${p.sentido}|${p.idBus}`;
    const arr = byBus.get(k) ?? [];
    arr.push(p);
    byBus.set(k, arr);
  }

  const trips: Trip[] = [];
  for (const arr of byBus.values()) {
    // arr ya viene ordenado ascendente
    let current: VEPing[] = [];
    const flush = () => {
      if (current.length < MIN_POINTS_FOR_SHAPE) { current = []; return; }
      const first = current[0]!;
      const last = current[current.length - 1]!;
      trips.push({
        key: `${first.agencyId}-${first.linea}-${first.sentido}`,
        agencyId: first.agencyId,
        linea: first.linea,
        sentido: first.sentido,
        bus: first.idBus,
        points: current.map((p) => ({ lat: p.lat, lon: p.lon })),
        tsStart: first.timestampGPS,
        tsEnd: last.timestampGPS,
      });
      current = [];
    };
    for (const p of arr) {
      if (current.length === 0) { current.push(p); continue; }
      const prev = current[current.length - 1]!;
      const gap = new Date(p.timestampGPS).getTime() - new Date(prev.timestampGPS).getTime();
      if (gap > MAX_GAP_BETWEEN_PINGS_MS) flush();
      current.push(p);
    }
    flush();
  }
  return trips;
}

/** Para cada key, quedarnos con el trip de más puntos (= trayecto más completo observado). */
function selectBestTrips(trips: Trip[]): Map<string, Trip> {
  const best = new Map<string, Trip>();
  for (const t of trips) {
    const ex = best.get(t.key);
    if (!ex || t.points.length > ex.points.length) best.set(t.key, t);
  }
  return best;
}

// ─── Persistencia ──────────────────────────────────────────────────────────

async function persistShapes(best: Map<string, Trip>): Promise<{ written: number; skipped: number }> {
  let written = 0;
  let skipped = 0;
  let batch = db.batch();
  let ops = 0;

  for (const [key, trip] of best.entries()) {
    const simplified = douglasPeucker(trip.points, DOUGLAS_PEUCKER_TOLERANCE_M);
    const lengthM = Math.round(polylineLengthMeters(simplified));
    // Post-simplificación, exigimos que queden al menos MIN_POINTS_FOR_SHAPE puntos
    // (Douglas-Peucker ya redujo ruido; si baja de ese umbral, el trip era muy corto).
    if (simplified.length < MIN_POINTS_FOR_SHAPE || lengthM < MIN_LENGTH_METERS) {
      skipped++;
      continue;
    }
    const doc: ShapeDoc = {
      key,
      agencyId: trip.agencyId,
      empresa: AGENCY_NAMES[trip.agencyId] ?? trip.agencyId,
      linea: trip.linea,
      sentido: trip.sentido,
      points: simplified,
      lengthMeters: lengthM,
      pointCount: simplified.length,
      sourceTripBus: trip.bus,
      sourceTripFrom: trip.tsStart,
      sourceTripTo: trip.tsEnd,
      reconstructedAt: admin.firestore.Timestamp.now(),
      lookbackHours: LOOKBACK_HOURS,
    };
    batch.set(db.collection(COLLECTION).doc(key), doc);
    written++;
    ops++;
    if (ops >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  return { written, skipped };
}

// ─── Orquestación ──────────────────────────────────────────────────────────

export async function reconstructShapes(hoursBack = LOOKBACK_HOURS): Promise<{
  shapesWritten: number;
  shapesSkipped: number;
  pingsRead: number;
  tripsFound: number;
  durationMs: number;
  perAgency: Record<string, number>;
}> {
  const t0 = Date.now();
  const sinceISO = new Date(Date.now() - hoursBack * 3600 * 1000).toISOString();
  const allPings: VEPing[] = [];
  const perAgency: Record<string, number> = {};

  for (const agencyId of Object.keys(AGENCY_NAMES)) {
    try {
      const pings = await fetchPingsForAgency(agencyId, sinceISO);
      perAgency[agencyId] = pings.length;
      allPings.push(...pings);
      console.log(`[shapeReconstruction] ${AGENCY_NAMES[agencyId]}: ${pings.length} pings`);
    } catch (err: any) {
      perAgency[agencyId] = -1;
      console.error(`[shapeReconstruction] Error fetching ${agencyId}:`, err?.message || err);
    }
  }

  const trips = extractTrips(allPings);
  const best = selectBestTrips(trips);
  console.log(`[shapeReconstruction] trips=${trips.length} bestKeys=${best.size}`);

  const { written, skipped } = await persistShapes(best);
  const durationMs = Date.now() - t0;
  console.log(
    `[shapeReconstruction] OK written=${written} skipped=${skipped} pings=${allPings.length} durationMs=${durationMs}`
  );
  return {
    shapesWritten: written,
    shapesSkipped: skipped,
    pingsRead: allPings.length,
    tripsFound: trips.length,
    durationMs,
    perAgency,
  };
}

// ─── Cloud Functions ───────────────────────────────────────────────────────

/** Cron: lunes 03:00 Montevideo. Refresca shapes de los 4 operadores. */
export const reconstructShapesTick = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .pubsub.schedule('every monday 03:00')
  .timeZone('America/Montevideo')
  .onRun(async () => {
    try {
      await reconstructShapes();
    } catch (err: any) {
      console.error('[reconstructShapesTick] Error:', err?.message || err);
    }
    return null;
  });

/**
 * HTTP manual. Usar durante MVP para testear.
 *   GET /reconstructShapesNow?hours=24
 */
export const reconstructShapesNow = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onRequest(async (req, res) => {
    try {
      const hours = Math.max(1, Math.min(168, Number(req.query.hours ?? LOOKBACK_HOURS)));
      const result = await reconstructShapes(hours);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error('[reconstructShapesNow] Error:', err?.message || err);
      res.status(502).json({ ok: false, error: err?.message || String(err) });
    }
  });
