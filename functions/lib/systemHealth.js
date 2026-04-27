"use strict";
/**
 * systemHealth.ts — Endpoint consolidado de salud del sistema
 * ============================================================
 * Trim+ #72 (2026-04-23)
 *
 * Agrega el estado de todas las piezas del sistema en un solo JSON:
 *   - IMM GPS API (fuente de datos)
 *   - Firestore (persistencia)
 *   - GTFS-Realtime publisher
 *   - GTFS-Static publisher
 *   - SIRI-Lite publisher
 *   - Schedulers (competidores, horarios, ingesta IMM)
 *
 * Útil para monitoreo operacional: uno solo endpoint para saber si
 * todo el pipeline está corriendo. Puede ir a dashboards tipo
 * Grafana / Datadog / status page pública.
 *
 * GET /systemHealth            → JSON con estado completo (cache 30s)
 * GET /systemHealth?fresh=1    → fuerza re-check sin cache
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
exports.systemHealth = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const app = express();
app.use(cors({ origin: true }));
const getDb = () => admin.firestore();
// ─── CACHE IN-MEMORY ─────────────────────────────────────────────────────────
const CACHE_TTL_MS = 30000;
let cached = null;
let cachedAt = 0;
// ─── CHECKS INDIVIDUALES ─────────────────────────────────────────────────────
async function checkImmGps() {
    var _a, _b, _c;
    const start = Date.now();
    try {
        const res = await axios.default.post('https://www.montevideo.gub.uy/buses/rest/stm-online', { empresa: '70' }, {
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Referer: 'https://www.montevideo.gub.uy/buses/',
                Origin: 'https://www.montevideo.gub.uy',
            },
        });
        const latencyMs = Date.now() - start;
        const buses = (_c = (_b = (_a = res.data) === null || _a === void 0 ? void 0 : _a.features) === null || _b === void 0 ? void 0 : _b.length) !== null && _c !== void 0 ? _c : 0;
        // Si devuelve < 5 buses UCOT, probablemente está en horario nocturno (OK) o cayó (DEGRADED).
        // Usamos umbral de horario: entre 03:00 y 05:00 AR los buses son escasos, eso es OK.
        const hour = new Date().getUTCHours() - 3; // aprox Montevideo
        const isNight = hour < 5 || hour > 23;
        const status = buses > 0 ? 'OK' : isNight ? 'OK' : 'DEGRADED';
        return {
            name: 'IMM GPS API',
            status,
            latencyMs,
            detail: `${buses} buses reportando`,
            lastCheckedAt: new Date().toISOString(),
            metadata: { buses },
        };
    }
    catch (err) {
        return {
            name: 'IMM GPS API',
            status: 'DOWN',
            latencyMs: Date.now() - start,
            detail: (err === null || err === void 0 ? void 0 : err.message) || 'No respondió',
            lastCheckedAt: new Date().toISOString(),
        };
    }
}
async function checkFirestore() {
    const start = Date.now();
    try {
        // Read liviano: colección de parámetros (pocos docs)
        const snap = await getDb().collection('parametros_operativos').limit(1).get();
        return {
            name: 'Firestore',
            status: 'OK',
            latencyMs: Date.now() - start,
            detail: `${snap.size} parámetro(s) confirmado(s)`,
            lastCheckedAt: new Date().toISOString(),
        };
    }
    catch (err) {
        return {
            name: 'Firestore',
            status: 'DOWN',
            latencyMs: Date.now() - start,
            detail: (err === null || err === void 0 ? void 0 : err.message) || 'Error al leer',
            lastCheckedAt: new Date().toISOString(),
        };
    }
}
async function checkIngestaRecency() {
    const start = Date.now();
    try {
        // vehicle_events más reciente — si no hay nada en 10 min, la ingesta IMM está caída
        const snap = await getDb()
            .collection('vehicle_events')
            .where('agencyId', '==', '70')
            .orderBy('timestampGPS', 'desc')
            .limit(1)
            .get();
        if (snap.empty) {
            return {
                name: 'Ingesta IMM (vehicle_events)',
                status: 'DEGRADED',
                latencyMs: Date.now() - start,
                detail: 'Sin documentos en vehicle_events',
                lastCheckedAt: new Date().toISOString(),
            };
        }
        const doc = snap.docs[0].data();
        const tsStr = doc === null || doc === void 0 ? void 0 : doc.timestampGPS;
        const ageMs = tsStr ? Date.now() - new Date(tsStr).getTime() : Infinity;
        const ageMin = Math.round(ageMs / 60000);
        const status = ageMin <= 3 ? 'OK' : ageMin <= 10 ? 'DEGRADED' : 'DOWN';
        return {
            name: 'Ingesta IMM (vehicle_events)',
            status,
            latencyMs: Date.now() - start,
            detail: `Último GPS hace ${ageMin} min`,
            lastCheckedAt: new Date().toISOString(),
            metadata: { ageMin },
        };
    }
    catch (err) {
        return {
            name: 'Ingesta IMM (vehicle_events)',
            status: 'UNKNOWN',
            latencyMs: Date.now() - start,
            detail: (err === null || err === void 0 ? void 0 : err.message) || 'Índice o permisos',
            lastCheckedAt: new Date().toISOString(),
        };
    }
}
async function checkCompetidores() {
    var _a, _b, _c;
    const start = Date.now();
    try {
        const snap = await getDb()
            .collection('competidores')
            .orderBy('ultimaActualizacion', 'desc')
            .limit(1)
            .get();
        if (snap.empty) {
            return {
                name: 'Scheduler competidores',
                status: 'DEGRADED',
                latencyMs: Date.now() - start,
                detail: 'Sin datos de competidores',
                lastCheckedAt: new Date().toISOString(),
            };
        }
        const data = snap.docs[0].data();
        const last = (_c = (_b = (_a = data === null || data === void 0 ? void 0 : data.ultimaActualizacion) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : null;
        const ageMin = last ? Math.round((Date.now() - last.getTime()) / 60000) : 9999;
        const status = ageMin <= 15 ? 'OK' : ageMin <= 60 ? 'DEGRADED' : 'DOWN';
        return {
            name: 'Scheduler competidores',
            status,
            latencyMs: Date.now() - start,
            detail: `Último refresh hace ${ageMin} min`,
            lastCheckedAt: new Date().toISOString(),
            metadata: { ageMin },
        };
    }
    catch (err) {
        return {
            name: 'Scheduler competidores',
            status: 'UNKNOWN',
            latencyMs: Date.now() - start,
            detail: (err === null || err === void 0 ? void 0 : err.message) || 'Error',
            lastCheckedAt: new Date().toISOString(),
        };
    }
}
async function checkGtfsRtPublisher() {
    var _a, _b, _c;
    const start = Date.now();
    try {
        const res = await axios.default.get('https://us-central1-ucot-gestor-cloud.cloudfunctions.net/gtfsRealtime/feed-info', { timeout: 5000 });
        return {
            name: 'GTFS-Realtime publisher',
            status: 'OK',
            latencyMs: Date.now() - start,
            detail: (_b = (_a = res.data) === null || _a === void 0 ? void 0 : _a.publisher) !== null && _b !== void 0 ? _b : 'responde',
            lastCheckedAt: new Date().toISOString(),
        };
    }
    catch (err) {
        const status = (_c = err === null || err === void 0 ? void 0 : err.response) === null || _c === void 0 ? void 0 : _c.status;
        return {
            name: 'GTFS-Realtime publisher',
            status: status === 404 ? 'DOWN' : 'DEGRADED',
            latencyMs: Date.now() - start,
            detail: (err === null || err === void 0 ? void 0 : err.message) || 'No respondió',
            lastCheckedAt: new Date().toISOString(),
        };
    }
}
async function checkGtfsStaticPublisher() {
    var _a, _b, _c, _d, _e, _f, _g;
    const start = Date.now();
    try {
        const res = await axios.default.get('https://us-central1-ucot-gestor-cloud.cloudfunctions.net/gtfsStatic/feed-info', { timeout: 5000 });
        return {
            name: 'GTFS-Static publisher',
            status: 'OK',
            latencyMs: Date.now() - start,
            detail: `routes: ${(_c = (_b = (_a = res.data) === null || _a === void 0 ? void 0 : _a.meta) === null || _b === void 0 ? void 0 : _b.routes) !== null && _c !== void 0 ? _c : '?'}, stops: ${(_f = (_e = (_d = res.data) === null || _d === void 0 ? void 0 : _d.meta) === null || _e === void 0 ? void 0 : _e.stops) !== null && _f !== void 0 ? _f : '?'}`,
            lastCheckedAt: new Date().toISOString(),
        };
    }
    catch (err) {
        const status = (_g = err === null || err === void 0 ? void 0 : err.response) === null || _g === void 0 ? void 0 : _g.status;
        return {
            name: 'GTFS-Static publisher',
            status: status === 404 ? 'DOWN' : 'DEGRADED',
            latencyMs: Date.now() - start,
            detail: (err === null || err === void 0 ? void 0 : err.message) || 'No respondió',
            lastCheckedAt: new Date().toISOString(),
        };
    }
}
async function checkSiriPublisher() {
    var _a, _b, _c, _d, _e;
    const start = Date.now();
    try {
        const res = await axios.default.get('https://us-central1-ucot-gestor-cloud.cloudfunctions.net/siriRealtime/discovery.json', { timeout: 5000 });
        const cap = (_c = (_b = (_a = res.data) === null || _a === void 0 ? void 0 : _a.ServiceDelivery) === null || _b === void 0 ? void 0 : _b.CapabilitiesResponse) === null || _c === void 0 ? void 0 : _c.Capability;
        return {
            name: 'SIRI-Lite publisher',
            status: ((_d = cap === null || cap === void 0 ? void 0 : cap.VehicleMonitoringCapability) === null || _d === void 0 ? void 0 : _d.supports) ? 'OK' : 'DEGRADED',
            latencyMs: Date.now() - start,
            detail: 'VM disponible',
            lastCheckedAt: new Date().toISOString(),
        };
    }
    catch (err) {
        const status = (_e = err === null || err === void 0 ? void 0 : err.response) === null || _e === void 0 ? void 0 : _e.status;
        return {
            name: 'SIRI-Lite publisher',
            status: status === 404 ? 'DOWN' : 'DEGRADED',
            latencyMs: Date.now() - start,
            detail: (err === null || err === void 0 ? void 0 : err.message) || 'No respondió',
            lastCheckedAt: new Date().toISOString(),
        };
    }
}
// ─── AGREGACIÓN ──────────────────────────────────────────────────────────────
function aggregateOverall(components) {
    if (components.some((c) => c.status === 'DOWN'))
        return 'DOWN';
    if (components.some((c) => c.status === 'DEGRADED'))
        return 'DEGRADED';
    if (components.every((c) => c.status === 'OK'))
        return 'OK';
    return 'UNKNOWN';
}
async function runAllChecks() {
    const components = await Promise.all([
        checkImmGps(),
        checkFirestore(),
        checkIngestaRecency(),
        checkCompetidores(),
        checkGtfsRtPublisher(),
        checkGtfsStaticPublisher(),
        checkSiriPublisher(),
    ]);
    const overall = aggregateOverall(components);
    return {
        overall,
        checkedAt: new Date().toISOString(),
        components,
        summary: {
            ok: components.filter((c) => c.status === 'OK').length,
            degraded: components.filter((c) => c.status === 'DEGRADED').length,
            down: components.filter((c) => c.status === 'DOWN').length,
            unknown: components.filter((c) => c.status === 'UNKNOWN').length,
        },
    };
}
// ─── ENDPOINTS ───────────────────────────────────────────────────────────────
app.get('/', async (req, res) => {
    try {
        const fresh = req.query.fresh === '1' || req.query.fresh === 'true';
        const now = Date.now();
        if (!fresh && cached && now - cachedAt < CACHE_TTL_MS) {
            res.setHeader('X-Cache', 'HIT');
            res.setHeader('Cache-Control', 'public, max-age=30');
            res.json(cached);
            return;
        }
        const health = await runAllChecks();
        cached = health;
        cachedAt = now;
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('Cache-Control', 'public, max-age=30');
        // HTTP status code refleja el estado general
        const httpCode = health.overall === 'OK' ? 200 : health.overall === 'DEGRADED' ? 200 : 503;
        res.status(httpCode).json(health);
    }
    catch (err) {
        console.error('[systemHealth] Error:', (err === null || err === void 0 ? void 0 : err.message) || err);
        res.status(500).json({ overall: 'UNKNOWN', error: (err === null || err === void 0 ? void 0 : err.message) || String(err) });
    }
});
exports.systemHealth = functions
    .runWith({ timeoutSeconds: 60, memory: '256MB' })
    .https.onRequest(app);
