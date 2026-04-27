"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.historicBunching = exports.historicOtp = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();
const AGENCIA_VALIDA = new Set(['10', '20', '50', '70']);
function setCors(res) {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
/** YYYY-MM-DD en zona horaria de Montevideo (UTC-3). */
function dayKeyMvd(d) {
    const utcMs = d.getTime();
    const mvdMs = utcMs - 3 * 60 * 60 * 1000;
    return new Date(mvdMs).toISOString().slice(0, 10);
}
/** Genera array de últimos N days con date YYYY-MM-DD. */
function lastNDays(n) {
    const out = [];
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
async function fetchOtpHistoric(days, agencyId) {
    var _a, _b;
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
    const byDay = new Map();
    for (const doc of snap.docs) {
        const d = doc.data();
        const ts = d.timestampGPS;
        if (!ts)
            continue;
        const key = dayKeyMvd(new Date(ts));
        const estado = String((_a = d.estadoCumplimiento) !== null && _a !== void 0 ? _a : '');
        if (!estado || estado === 'SIN_HORARIO' || estado === 'FUERA_DE_SERVICIO')
            continue;
        const entry = (_b = byDay.get(key)) !== null && _b !== void 0 ? _b : { enTiempo: 0, total: 0 };
        entry.total += 1;
        if (estado === 'EN_TIEMPO')
            entry.enTiempo += 1;
        byDay.set(key, entry);
    }
    // Construir serie con todos los días aún si no hay datos. Para días sin
    // muestras, value: null (no 0) — así el chart frontend con connectNulls=false
    // muestra un hueco honesto en lugar de un drop a cero falso. Esto es
    // crítico para no engañar al directivo: 'sin datos' ≠ '0% puntualidad'.
    return lastNDays(days).map((date) => {
        const e = byDay.get(date);
        if (!e || e.total === 0) {
            return { date, value: null, meta: { total: 0, enTiempo: 0 } };
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
async function fetchBunchingHistoric(days, agencyId) {
    var _a, _b, _c, _d;
    const sinceTs = admin.firestore.Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000);
    const empresaIdNum = Number(agencyId);
    const snap = await db
        .collection('alertas_regulacion')
        .where('empresa_id', '==', empresaIdNum)
        .where('timestamp', '>=', sinceTs)
        .orderBy('timestamp', 'asc')
        .limit(50000)
        .get();
    const byDay = new Map();
    for (const doc of snap.docs) {
        const d = doc.data();
        const ts = (_b = (_a = d.timestamp) === null || _a === void 0 ? void 0 : _a.toMillis) === null || _b === void 0 ? void 0 : _b.call(_a);
        if (!ts)
            continue;
        const key = dayKeyMvd(new Date(ts));
        const tipo = String((_c = d.tipo) !== null && _c !== void 0 ? _c : '');
        const entry = (_d = byDay.get(key)) !== null && _d !== void 0 ? _d : { total: 0, criticos: 0 };
        entry.total += 1;
        if (tipo === 'RIVAL_PISANDO_TURNO')
            entry.criticos += 1;
        byDay.set(key, entry);
    }
    return lastNDays(days).map((date) => {
        var _a;
        const e = (_a = byDay.get(date)) !== null && _a !== void 0 ? _a : { total: 0, criticos: 0 };
        return {
            date,
            value: e.total,
            meta: { criticos: e.criticos },
        };
    });
}
// ─── HTTP Wrappers ─────────────────────────────────────────────────────────
function parseQuery(req) {
    var _a;
    const daysRaw = Number(req.query.days);
    const agencyId = String((_a = req.query.agencyId) !== null && _a !== void 0 ? _a : '70');
    if (!Number.isFinite(daysRaw) || daysRaw < 1 || daysRaw > 90)
        return null;
    if (!AGENCIA_VALIDA.has(agencyId))
        return null;
    return { days: Math.floor(daysRaw), agencyId };
}
function getCached(key) {
    const e = cache.get(key);
    if (!e)
        return null;
    if (Date.now() - e.ts > CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    return e.data;
}
function setCached(key, data) {
    cache.set(key, { ts: Date.now(), data });
}
exports.historicOtp = functions
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
        res.json(Object.assign({ ok: true, cached: true }, cached));
        return;
    }
    try {
        const series = await fetchOtpHistoric(params.days, params.agencyId);
        const payload = { series, agencyId: params.agencyId, days: params.days };
        setCached(cacheKey, payload);
        res.json(Object.assign({ ok: true, cached: false }, payload));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[historicOtp] Error:', msg);
        res.status(500).json({ ok: false, error: msg });
    }
});
exports.historicBunching = functions
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
        res.json(Object.assign({ ok: true, cached: true }, cached));
        return;
    }
    try {
        const series = await fetchBunchingHistoric(params.days, params.agencyId);
        const payload = { series, agencyId: params.agencyId, days: params.days };
        setCached(cacheKey, payload);
        res.json(Object.assign({ ok: true, cached: false }, payload));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[historicBunching] Error:', msg);
        res.status(500).json({ ok: false, error: msg });
    }
});
