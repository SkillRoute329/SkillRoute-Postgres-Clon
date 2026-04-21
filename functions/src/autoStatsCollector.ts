/**
 * autoStatsCollector.ts
 * =====================
 * Cron cada 5 minutos: obtiene GPS de los 4 operadores STM, cruza con malla
 * GTFS oficial y guarda snapshots de cumplimiento en Firestore.
 *
 * Sin inspectores. Sin acceso interno. Solo datos públicos.
 *
 * Colección: vehicle_events (TTL 7 días)
 * Archive:   semanalmente se exporta a Storage y se purga Firestore
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

const db = admin.firestore();

// ── Tipos ──────────────────────────────────────────────────────────────────

interface ControlStop {
  stop_id: string; name: string; desc: string;
  lat: number | null; lon: number | null; arrival: string;
}
interface ScheduledTrip {
  trip_id: string; departure: string | null; arrival: string | null;
  control_stops: ControlStop[];
}
interface RouteSchedule {
  route_long_name: string;
  habiles: ScheduledTrip[];
  sabados: ScheduledTrip[];
  domingos: ScheduledTrip[];
}
interface AgencySchedule { agency_name: string; routes: Record<string, RouteSchedule> }
type ScheduleIndex = Record<string, AgencySchedule>;
type StopsGeo = Record<string, { name: string; desc: string; lat: number; lon: number }>;

interface BusFeature {
  type: 'Feature';
  properties: { codigoEmpresa: number; codigoBus: number; linea: string; velocidad?: number; destinoDesc?: string };
  geometry: { type: 'Point'; coordinates: [number, number] };
}

type ComplianceState = 'EN_TIEMPO' | 'ADELANTADO' | 'ATRASADO' | 'SIN_HORARIO' | 'FUERA_DE_SERVICIO';

interface VehicleEvent {
  idBus: string; agencyId: string; empresa: string; linea: string;
  lat: number; lon: number; velocidad: number;
  estadoCumplimiento: ComplianceState; desviacionMin: number | null;
  proximaParada: string | null; timestampGPS: string;
  createdAt: admin.firestore.FieldValue; expiresAt: Date;
}

// ── Constantes ─────────────────────────────────────────────────────────────

const STM_URL = 'https://www.montevideo.gub.uy/buses/rest/stm-online';
const STM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Content-Type': 'application/json',
  'Referer': 'https://www.montevideo.gub.uy/buses/',
  'Origin': 'https://www.montevideo.gub.uy',
};

// stmCode → agencyId en schedule_index
const AGENCY_MAP: Record<string, string> = { '10': '10', '20': '20', '50': '50', '70': '70' };
const AGENCY_NAMES: Record<string, string> = { '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT' };

const COLLECTION = 'vehicle_events';
const TTL_DAYS = 7;

// ── GTFS en memoria (cargado una vez por instancia) ─────────────────────────

const DATA_DIR = path.join(__dirname, 'data/gtfs');
let _schedule: ScheduleIndex | null = null;
let _stops: StopsGeo | null = null;

function getSchedule(): ScheduleIndex {
  if (!_schedule) {
    _schedule = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'schedule_index.json'), 'utf8'));
    console.log('[AutoStats] schedule_index.json cargado');
  }
  return _schedule!;
}
function getStops(): StopsGeo {
  if (!_stops) _stops = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'stops_geo.json'), 'utf8'));
  return _stops!;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function dayType(d: Date): 'habiles' | 'sabados' | 'domingos' {
  const dow = d.getDay();
  if (dow === 0) return 'domingos';
  if (dow === 6) return 'sabados';
  return 'habiles';
}

function getActiveTrips(agencyId: string, routeShort: string, now: Date): ScheduledTrip[] {
  const schedule = getSchedule();
  const agency = schedule[agencyId];
  if (!agency) return [];
  const route = agency.routes[routeShort];
  if (!route) return [];
  const dt = dayType(now);
  const trips = route[dt];
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return trips.filter(t => {
    if (!t.departure || !t.arrival) return false;
    const dep = toMinutes(t.departure);
    const arr = toMinutes(t.arrival);
    return dep <= nowMin + 60 && arr >= nowMin - 30;
  });
}

function analyzeCompliance(
  lat: number, lon: number, velocidad: number,
  agencyId: string, routeShort: string, now: Date,
): { state: ComplianceState; desviacionMin: number | null; proximaParada: string | null } {
  const stops = getStops();
  const activeTrips = getActiveTrips(agencyId, routeShort, now);

  if (activeTrips.length === 0) {
    return { state: 'SIN_HORARIO', desviacionMin: null, proximaParada: null };
  }

  const nowMin = now.getHours() * 60 + now.getMinutes();
  let bestDist = Infinity;
  let bestStop: ControlStop | null = null;
  let bestDesviacion: number | null = null;

  for (const trip of activeTrips) {
    for (const cs of trip.control_stops) {
      if (!cs.lat || !cs.lon) {
        const geo = stops[cs.stop_id];
        if (geo) { cs.lat = geo.lat; cs.lon = geo.lon; }
      }
      if (!cs.lat || !cs.lon) continue;
      const d = distKm(lat, lon, cs.lat, cs.lon);
      if (d < bestDist) {
        bestDist = d;
        bestStop = cs;
        const scheduledMin = toMinutes(cs.arrival);
        const etaMin = velocidad > 5 ? (d / velocidad) * 60 : 0;
        bestDesviacion = (nowMin + etaMin) - scheduledMin;
      }
    }
  }

  if (!bestStop || bestDist > 2) {
    return { state: 'SIN_HORARIO', desviacionMin: null, proximaParada: null };
  }

  let state: ComplianceState;
  if (bestDesviacion === null) state = 'SIN_HORARIO';
  else if (bestDesviacion < -3) state = 'ADELANTADO';
  else if (bestDesviacion > 5) state = 'ATRASADO';
  else state = 'EN_TIEMPO';

  return {
    state,
    desviacionMin: bestDesviacion !== null ? Math.round(bestDesviacion * 10) / 10 : null,
    proximaParada: bestStop.name || bestStop.desc || bestStop.stop_id,
  };
}

// ── Fetch GPS de un operador ────────────────────────────────────────────────

async function fetchGPS(stmCode: string): Promise<BusFeature[]> {
  const res = await axios.post<{ features?: BusFeature[] }>(
    STM_URL, { empresa: stmCode }, { timeout: 15000, headers: STM_HEADERS },
  );
  return res.data?.features ?? [];
}

// ── Snapshot de cumplimiento para un operador ───────────────────────────────

async function snapshotAgency(stmCode: string): Promise<number> {
  const agencyId = AGENCY_MAP[stmCode];
  const empresa = AGENCY_NAMES[stmCode] ?? `Empresa ${stmCode}`;
  const features = await fetchGPS(stmCode);
  if (features.length === 0) return 0;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_DAYS * 24 * 60 * 60 * 1000);
  const tsISO = now.toISOString();

  const events: VehicleEvent[] = [];

  for (const feat of features) {
    const p = feat.properties;
    if (!p?.codigoBus || !p?.linea) continue;
    const [lon, lat] = feat.geometry.coordinates;
    const velocidad = p.velocidad ?? 0;
    const idBus = String(p.codigoBus);

    const { state, desviacionMin, proximaParada } = analyzeCompliance(
      lat, lon, velocidad, agencyId, p.linea, now,
    );

    events.push({
      idBus, agencyId, empresa, linea: p.linea,
      lat, lon, velocidad,
      estadoCumplimiento: state,
      desviacionMin, proximaParada,
      timestampGPS: tsISO,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
    });
  }

  // Batch write en grupos de 400
  const coll = db.collection(COLLECTION);
  for (let i = 0; i < events.length; i += 400) {
    const batch = db.batch();
    for (const ev of events.slice(i, i + 400)) {
      batch.set(coll.doc(), ev);
    }
    await batch.commit();
  }

  return events.length;
}

// ── Función principal ────────────────────────────────────────────────────────

async function runCollection(): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  for (const code of Object.keys(AGENCY_MAP)) {
    try {
      results[AGENCY_NAMES[code]] = await snapshotAgency(code);
    } catch (err: any) {
      console.error(`[AutoStats] Error ${AGENCY_NAMES[code]}:`, err?.message);
      results[AGENCY_NAMES[code]] = -1;
    }
  }
  return results;
}

// ── Exports ──────────────────────────────────────────────────────────────────

/** Cron cada 5 minutos: acumula historial de cumplimiento GPS+GTFS */
export const autoStatsCollectorTick = functions.pubsub
  .schedule('every 5 minutes')
  .timeZone('America/Montevideo')
  .onRun(async () => {
    try {
      const results = await runCollection();
      console.log('[AutoStats] Snapshot OK:', JSON.stringify(results));
    } catch (err: any) {
      console.error('[AutoStats] Error general:', err?.message);
    }
    return null;
  });

/** HTTP manual: útil para probar o forzar un snapshot */
export const autoStatsCollectorNow = functions
  .runWith({ timeoutSeconds: 120, memory: '512MB' })
  .https.onRequest(async (_req, res) => {
    try {
      const started = Date.now();
      const results = await runCollection();
      res.json({ ok: true, durationMs: Date.now() - started, results });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  });
