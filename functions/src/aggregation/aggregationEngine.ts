// aggregation-engine — Cloud Function nocturna cron 03:00 UY
// Lee vehicle_events_v2, calcula 12 métricas, escribe compliance_aggregates
// SPEC_CUMPLIMIENTO_V2_BACKEND_2026_05.md §3, §2
import * as admin from 'firebase-admin';
import { computeMetrics, RawEvent, ScheduledTrip } from './computeMetrics';
import { computeInputHash } from './computeInputHash';
import { MetricValue } from './aplicarPoliticaMinimos';

const db = admin.firestore();
const ALGO_VERSION = 'matching-v1.0.0';
const SOURCE_COL = 'vehicle_events_v2';
const TARGET_COL = 'compliance_aggregates';
const AGENCIES = ['70', '50', '20', '10'];
const BATCH_READ = 2000;

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface AggregateDoc {
  id: string;
  agencyId: string;
  regionId: string;
  linea: string;
  sentido: string;
  periodo: string;
  granularidad: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  version: number;
  algoVersion: string;
  computedAt: admin.firestore.Timestamp;
  inputHash: string;
  globalCoverageGps: number;
  totalEventsObserved: number;
  totalTripsScheduled: number;
  isHighFreq: boolean;
  metrics: Record<string, MetricValue | null | undefined>;
}

// ── Helpers de fecha (zona America/Montevideo) ────────────────────────────────

function isoDate(d: Date): string {
  // Fecha en hora UY (UTC-3)
  const uy = new Date(d.getTime() - 3 * 3600000);
  return uy.toISOString().slice(0, 10);
}

function isoWeek(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00Z');
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const year = tmp.getUTCFullYear();
  const week = Math.ceil((((tmp.getTime() - Date.UTC(year, 0, 1)) / 86400000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function isoMonth(ymd: string): string {
  return ymd.slice(0, 7);
}

// Ventana UTC que abarca un día calendario en hora UY (UTC-3)
// 2026-05-06 UY = 2026-05-06T03:00Z → 2026-05-07T03:00Z
function dayWindowUTC(ymd: string): { from: string; to: string } {
  return {
    from: `${ymd}T03:00:00.000Z`,
    to:   new Date(new Date(`${ymd}T03:00:00.000Z`).getTime() + 24 * 3600000).toISOString(),
  };
}

// Día de la semana en UY
function dowUY(ymd: string): number {
  return new Date(ymd + 'T12:00:00Z').getDay(); // 0=dom, 1=lun...
}

// ── Lectura de eventos ────────────────────────────────────────────────────────

async function fetchEvents(agencyId: string, from: string, to: string): Promise<RawEvent[]> {
  const events: RawEvent[] = [];
  let lastDoc: admin.firestore.DocumentSnapshot | null = null;

  for (;;) {
    let q: admin.firestore.Query = db.collection(SOURCE_COL)
      .where('agencyId', '==', agencyId)
      .where('timestampGPS', '>=', from)
      .where('timestampGPS', '<', to)
      .orderBy('timestampGPS')
      .limit(BATCH_READ);

    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;

    for (const d of snap.docs) {
      const f = d.data();
      events.push({
        idBus:              String(f.idBus ?? ''),
        linea:              String(f.linea ?? ''),
        timestampGPS:       String(f.timestampGPS ?? ''),
        estadoCumplimiento: f.estadoCumplimiento ?? null,
        desviacionMin:      typeof f.desviacionMin === 'number' ? f.desviacionMin : null,
        confianzaV2:        String(f.confianzaV2 ?? 'ZERO'),
        sentidoV2:          f.sentidoV2 ?? null,
        snapDistanceMV2:    typeof f.snapDistanceMV2 === 'number' ? f.snapDistanceMV2 : null,
        velocidad:          typeof f.velocidad === 'number' ? f.velocidad : 0,
      });
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < BATCH_READ) break;
  }

  return events;
}

// ── Lectura de viajes programados GTFS ───────────────────────────────────────

// gtfs_timetable docId: {agencyId}_{linea}_{directionId}_{serviceType}
// directionId: 0=IDA, 1=VUELTA (convención GTFS)
// serviceType: HABIL (lun-vie), SABADO, DOMINGO

function sentidoToDirectionId(sentido: string): number | null {
  if (sentido === 'IDA') return 0;
  if (sentido === 'VUELTA') return 1;
  return null; // TODOS u otros → sin horario programado específico
}

function dateToServiceType(ymd: string): string {
  const dow = dowUY(ymd);
  if (dow === 0) return 'DOMINGO';
  if (dow === 6) return 'SABADO';
  return 'HABIL';
}

async function fetchScheduledTrips(
  agencyId: string,
  linea: string,
  sentido: string,
  ymd: string,
): Promise<{ trips: ScheduledTrip[]; totalViajes: number }> {
  const dirId = sentidoToDirectionId(sentido);
  if (dirId === null) return { trips: [], totalViajes: 0 };

  const serviceType = dateToServiceType(ymd);
  const docId = `${agencyId}_${linea}_${dirId}_${serviceType}`;

  try {
    const snap = await db.collection('gtfs_timetable').doc(docId).get();
    if (!snap.exists) return { trips: [], totalViajes: 0 };

    const data = snap.data()!;
    const totalViajes: number = typeof data.totalViajes === 'number' ? data.totalViajes : 0;

    // viajes: array de {s: "HH:MM", t: [...]}; s es la salida del terminal
    const viajesArr: Array<{ s?: string }> = Array.isArray(data.viajes) ? data.viajes : [];
    const trips: ScheduledTrip[] = viajesArr
      .filter(v => typeof v.s === 'string')
      .map(v => ({ departure_time: v.s! }));

    return { trips, totalViajes: totalViajes || trips.length };
  } catch {
    return { trips: [], totalViajes: 0 };
  }
}

// ── Cómputo de cobertura GPS y flag isHighFreq ────────────────────────────────

function computeCoverageGps(events: RawEvent[]): number {
  if (events.length === 0) return 0;
  const valid = events.filter(
    e => e.confianzaV2 !== 'ZERO' && e.snapDistanceMV2 !== null && e.snapDistanceMV2 <= 80,
  );
  return (valid.length / events.length) * 100;
}

function detectIsHighFreq(events: RawEvent[]): boolean {
  const firstByBus = new Map<string, number>();
  for (const ev of events) {
    const ts = new Date(ev.timestampGPS).getTime();
    if (!isNaN(ts)) {
      const prev = firstByBus.get(ev.idBus);
      if (prev === undefined || ts < prev) firstByBus.set(ev.idBus, ts);
    }
  }
  const times = Array.from(firstByBus.values()).sort((a, b) => a - b);
  if (times.length < 2) return false;
  const headways: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const h = (times[i] - times[i - 1]) / 60000;
    if (h > 0 && h < 90) headways.push(h);
  }
  if (headways.length === 0) return false;
  const mean = headways.reduce((a, b) => a + b, 0) / headways.length;
  return mean <= 12;
}

// ── Escritura de un aggregate doc ────────────────────────────────────────────

async function writeAggregate(
  agencyId: string,
  linea: string,
  sentido: string,
  periodo: string,
  granularidad: 'DAILY' | 'WEEKLY' | 'MONTHLY',
  events: RawEvent[],
  scheduledTrips: ScheduledTrip[],
  totalTripsScheduled: number,
): Promise<void> {
  const coverageGps = computeCoverageGps(events);

  // isHighFreq: GTFS como fuente primaria (headway promedio ≤ 12 min), fallback a GPS
  const gtfsHighFreq = (() => {
    if (scheduledTrips.length < 2) return false;
    const times = scheduledTrips
      .map(t => { const p = t.departure_time.split(':'); return Number(p[0]) * 60 + Number(p[1]); })
      .filter(x => !isNaN(x)).sort((a, b) => a - b);
    const gaps = times.slice(1).map((t, i) => t - times[i]).filter(g => g > 0 && g < 90);
    return gaps.length > 0 && gaps.reduce((a, b) => a + b, 0) / gaps.length <= 12;
  })();
  const isHighFreq = gtfsHighFreq || detectIsHighFreq(events);

  const metrics = computeMetrics(events, scheduledTrips, coverageGps, totalTripsScheduled);

  const hash = computeInputHash({
    agencyId, linea, sentido, periodo, granularidad,
    totalEvents: events.length,
    algoVersion: ALGO_VERSION,
  });

  const docId = `${agencyId}_${linea}_${sentido}_${periodo}_${granularidad}`;
  const doc: AggregateDoc = {
    id: docId,
    agencyId,
    regionId: 'MVD',
    linea,
    sentido,
    periodo,
    granularidad,
    version: 1,
    algoVersion: ALGO_VERSION,
    computedAt: admin.firestore.Timestamp.now(),
    inputHash: hash,
    globalCoverageGps: coverageGps,
    totalEventsObserved: events.length,
    totalTripsScheduled,
    isHighFreq,
    metrics: metrics as unknown as Record<string, MetricValue | null | undefined>,
  };

  await db.collection(TARGET_COL).doc(docId).set(doc, { merge: false });
  console.log(`[AggregationEngine] ${docId} n=${events.length} cov=${coverageGps.toFixed(1)}% trips=${totalTripsScheduled}`);
}

// ── Orquestador principal ─────────────────────────────────────────────────────

export async function runAggregation(
  targetDate?: string,
): Promise<{ processed: number; errors: number; skipped: number }> {

  const fecha = targetDate ?? isoDate(new Date(Date.now() - 24 * 3600000));
  const { from, to } = dayWindowUTC(fecha);
  const isMonday     = dowUY(fecha) === 1;
  const isFirstMonth = fecha.endsWith('-01');

  console.log(`[AggregationEngine] Arrancando para fecha=${fecha} from=${from} to=${to}`);

  let processed = 0;
  let errors = 0;
  let skipped = 0;

  for (const agencyId of AGENCIES) {
    let allEvents: RawEvent[];
    try {
      allEvents = await fetchEvents(agencyId, from, to);
      console.log(`[AggregationEngine] agencyId=${agencyId} eventos crudos=${allEvents.length}`);
    } catch (err) {
      console.error(`[AggregationEngine] Error fetch agencyId=${agencyId}:`, err);
      errors++;
      continue;
    }

    if (allEvents.length === 0) {
      console.log(`[AggregationEngine] Sin eventos agencyId=${agencyId} en ${fecha}`);
      skipped++;
      continue;
    }

    // Agrupar por (linea, sentido)
    const groups = new Map<string, { linea: string; sentido: string; events: RawEvent[] }>();
    for (const ev of allEvents) {
      if (!ev.linea) continue;
      const sentido = ev.sentidoV2 ?? 'TODOS';
      const key = `${ev.linea}__${sentido}`;
      if (!groups.has(key)) groups.set(key, { linea: ev.linea, sentido, events: [] });
      groups.get(key)!.events.push(ev);
    }

    // Procesar cada grupo (linea, sentido)
    for (const { linea, sentido, events: grpEvents } of groups.values()) {
      try {
        const { trips, totalViajes } = await fetchScheduledTrips(agencyId, linea, sentido, fecha);

        // DAILY — siempre
        await writeAggregate(agencyId, linea, sentido, fecha, 'DAILY', grpEvents, trips, totalViajes);

        // WEEKLY — solo lunes (agrega 7 días; reutiliza los eventos del día — OK como aproximación)
        if (isMonday) {
          await writeAggregate(agencyId, linea, sentido, isoWeek(fecha), 'WEEKLY', grpEvents, trips, totalViajes);
        }

        // MONTHLY — solo 1º de mes
        if (isFirstMonth) {
          await writeAggregate(agencyId, linea, sentido, isoMonth(fecha), 'MONTHLY', grpEvents, trips, totalViajes);
        }

        processed++;
      } catch (err) {
        console.error(`[AggregationEngine] Error ${agencyId}/${linea}/${sentido}:`, err);
        errors++;
      }
    }
  }

  console.log(`[AggregationEngine] Fin: processed=${processed} errors=${errors} skipped=${skipped}`);
  return { processed, errors, skipped };
}
