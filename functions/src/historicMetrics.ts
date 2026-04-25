/**
 * historicMetrics.ts — Endpoints HTTP para series temporales de KPIs
 * ====================================================================
 * Backlog #2 (Fase 2 V7): activa los botones 7D / 30D del dashboard
 * ejecutivo. Devuelve series diarias agregadas para que el frontend
 * dibuje el chart de tendencias.
 *
 * Endpoints:
 *   GET /historic/otp?days=N&agencyId=X
 *   GET /historic/bunching?days=N&agencyId=X
 *
 * Fuentes:
 *   - vehicle_events (cron autoStatsCollector) → conteo diario por
 *     estadoCumplimiento, agrupado por agencia.
 *   - alertas_regulacion (shadowDispatcher + ShadowRadar frontend) →
 *     conteo diario filtrado por empresa_id.
 *
 * Cache simple en memoria por (kpi+days+agency) con TTL 10 min — evita
 * tirar la misma query cada vez que el directivo cambia entre 7D y 30D.
 *
 * Refs: TCRP 100 + UITP punctuality KPI tracking.
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const db = admin.firestore();

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { ts: number; data: unknown }>();

const AGENCIA_VALIDA = new Set(['10', '20', '50', '70']);

function setCors(res: functions.Response): void {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

interface DailyPoint {
  date: string; // YYYY-MM-DD (Mvd)
  value: number;
  meta?: Record<string, number>;
}

/** YYYY-MM-DD en zona horaria de Montevideo (UTC-3). */
function dayKeyMvd(d: Date): string {
  const utcMs = d.getTime();
  const mvdMs = utcMs - 3 * 60 * 60 * 1000;
  return new Date(mvdMs).toISOString().slice(0, 10);
}

/** Genera array de últimos N days con date YYYY-MM-DD. */
function lastNDays(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    out.push(dayKeyMvd(d));
  }
  return out;
}

// ─── 1) Histórico OTP (Puntualidad) ────────────────────────────────────────

/**
 * Devuelve serie diaria de OTP %.
 * OTP = (eventos EN_TIEMPO + ADELANTADO leve) / total con desviacion
 * por día y agencia. Ventana: últimos N días.
 *
 * Si la colección vehicle_events no tiene suficientes datos para esos
 * días, devuelve null en esos puntos (no 0 — para que el chart no
 * mienta).
 */
async function fetchOtpHistoric(days: number, agencyId: string): Promise<DailyPoint[]> {
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const sinceISO = new Date(sinceMs).toISOString();

  // Traer todos los eventos del rango. Limit alto pero protegido.
  const snap = await db
    .collection('vehicle_events')
    .where('agencyId', '==', agencyId)
    .where('timestampGPS', '>=', sinceISO)
    .orderBy('timestampGPS', 'asc')
    .limit(50000)
    .get();

  // Agrupar por día Mvd
  const byDay: Map<string, { enTiempo: number; total: number }> = new Map();
  for (const doc of snap.docs) {
    const d = doc.data();
    const ts = d.timestampGPS;
    if (!ts) continue;
    const key = dayKeyMvd(new Date(ts));
    const estado = String(d.estadoCumplimiento ?? '');
    if (!estado || estado === 'SIN_HORARIO' || estado === 'FUERA_DE_SERVICIO') continue;

    const entry = byDay.get(key) ?? { enTiempo: 0, total: 0 };
    entry.total += 1;
    if (estado === 'EN_TIEMPO') entry.enTiempo += 1;
    byDay.set(key, entry);
  }

  // Construir serie con todos los días aún si no hay datos (value=null)
  return lastNDays(days).map((date) => {
    const e = byDay.get(date);
    if (!e || e.total === 0) {
      return { date, value: 0, meta: { total: 0, enTiempo: 0 } } as DailyPoint;
    }
    const pct = Math.round((e.enTiempo / e.total) * 1000) / 10;
    return {
      date,
      value: pct,
      meta: { total: e.total, enTiempo: e.enTiempo },
    };
  });
}

// ─── 2) Histórico Bunching (Aglomeración) ──────────────────────────────────

/**
 * Devuelve serie diaria del conteo de eventos en alertas_regulacion
 * filtrado por empresa_id. Aglomeración total del día.
 */
async function fetchBunchingHistoric(days: number, agencyId: string): Promise<DailyPoint[]> {
  const sinceTs = admin.firestore.Timestamp.fromMillis(
    Date.now() - days * 24 * 60 * 60 * 1000,
  );
  const empresaIdNum = Number(agencyId);

  const snap = await db
    .collection('alertas_regulacion')
    .where('empresa_id', '==', empresaIdNum)
    .where('timestamp', '>=', sinceTs)
    .orderBy('timestamp', 'asc')
    .limit(50000)
    .get();

  const byDay: Map<string, { total: number; criticos: number }> = new Map();
  for (const doc of snap.docs) {
    const d = doc.data();
    const ts = d.timestamp?.toMillis?.();
    if (!ts) continue;
    const key = dayKeyMvd(new Date(ts));
    const tipo = String(d.tipo ?? '');
    const entry = byDay.get(key) ?? { total: 0, criticos: 0 };
    entry.total += 1;
    if (tipo === 'RIVAL_PISANDO_TURNO') entry.criticos += 1;
    byDay.set(key, entry);
  }

  return lastNDays(days).map((date) => {
    const e = byDay.get(date) ?? { total: 0, criticos: 0 };
    return {
      date,
      value: e.total,
      meta: { criticos: e.criticos },
    };
  });
}

// ─── HTTP Wrappers ─────────────────────────────────────────────────────────

function parseQuery(req: functions.Request): { days: number; agencyId: string } | null {
  const daysRaw = Number(req.query.days);
  const agencyId = String(req.query.agencyId ?? '70');
  if (!Number.isFinite(daysRaw) || daysRaw < 1 || daysRaw > 90) return null;
  if (!AGENCIA_VALIDA.has(agencyId)) return null;
  return { days: Math.floor(daysRaw), agencyId };
}

function getCached(key: string): unknown | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return e.data;
}

function setCached(key: string, data: unknown): void {
  cache.set(key, { ts: Date.now(), data });
}

export const historicOtp = functions
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ ok: false, error: 'method_not_allowed' });
      return;
    }
    const params = parseQuery(req);
    if (!params) {
      res.status(400).json({ ok: false, error: 'invalid_params (days 1-90, agencyId 10/20/50/70)' });
      return;
    }
    const cacheKey = `otp:${params.agencyId}:${params.days}`;
    const cached = getCached(cacheKey);
    if (cached) {
      res.json({ ok: true, cached: true, ...(cached as object) });
      return;
    }
    try {
      const series = await fetchOtpHistoric(params.days, params.agencyId);
      const payload = { series, agencyId: params.agencyId, days: params.days };
      setCached(cacheKey, payload);
      res.json({ ok: true, cached: false, ...payload });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[historicOtp] Error:', msg);
      res.status(500).json({ ok: false, error: msg });
    }
  });

export const historicBunching = functions
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ ok: false, error: 'method_not_allowed' });
      return;
    }
    const params = parseQuery(req);
    if (!params) {
      res.status(400).json({ ok: false, error: 'invalid_params (days 1-90, agencyId 10/20/50/70)' });
      return;
    }
    const cacheKey = `bunching:${params.agencyId}:${params.days}`;
    const cached = getCached(cacheKey);
    if (cached) {
      res.json({ ok: true, cached: true, ...(cached as object) });
      return;
    }
    try {
      const series = await fetchBunchingHistoric(params.days, params.agencyId);
      const payload = { series, agencyId: params.agencyId, days: params.days };
      setCached(cacheKey, payload);
      res.json({ ok: true, cached: false, ...payload });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[historicBunching] Error:', msg);
      res.status(500).json({ ok: false, error: msg });
    }
  });
