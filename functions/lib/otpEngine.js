"use strict";
/**
 * otpEngine — Motor OTP (On-Time Performance).
 * Compara posiciones GPS en vivo vs horarios GTFS para detectar retrasos por bus y por línea.
 *
 * Cron:  cada 10 minutos (otpTick).
 * HTTP:  GET /computeOtpNow — disparo manual y verificación.
 *
 * Colecciones escritas:
 *   bus_delays/{agencyId}_{busId}   — retraso actual por bus
 *   otp_summary/{agencyId}_{linea}  — resumen de puntualidad por línea
 *
 * Algoritmo:
 *   1. Obtener GPS en vivo de todos los buses (IMM API — ya tiene cache 30s)
 *   2. Cargar timetables de cada línea activa (ambas direcciones)
 *   3. Cargar lat/lng de las paradas referenciadas
 *   4. Por cada bus: snap a parada más cercana (<400m) → viaje programado
 *      más próximo en tiempo → delay = now - scheduled
 *   5. Escribir bus_delays + otp_summary en batch
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
exports.computeOtpNow = exports.otpTick = void 0;
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const immBusesService_1 = require("./immBusesService");
const db = admin.firestore();
// ─── Helpers ──────────────────────────────────────────────────────────────────
function nowMinutes() {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
}
function getCurrentServiceType() {
    const day = new Date().getDay();
    if (day === 0)
        return 'DOMINGO';
    if (day === 6)
        return 'SABADO';
    return 'HABIL';
}
function distM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
// ─── Carga de datos ───────────────────────────────────────────────────────────
async function loadTimetable(agencyId, linea, directionId, svcType) {
    const snap = await db.collection('gtfs_timetable')
        .doc(`${agencyId}_${linea}_${directionId}_${svcType}`)
        .get();
    return snap.exists ? snap.data() : null;
}
async function loadStopPositions(stopIds) {
    const map = new Map();
    const CHUNK = 10;
    for (let i = 0; i < stopIds.length; i += CHUNK) {
        const chunk = stopIds.slice(i, i + CHUNK);
        const snaps = await Promise.all(chunk.map(id => db.collection('gtfs_stops').doc(id).get()));
        for (const snap of snaps) {
            if (!snap.exists)
                continue;
            const d = snap.data();
            map.set(snap.id, { lat: Number(d.lat), lng: Number(d.lng) });
        }
    }
    return map;
}
// ─── Cómputo de delay por bus ─────────────────────────────────────────────────
function computeBusDelay(busId, agencyId, linea, lat, lng, timetable, stopPositions, currentMin) {
    const base = {
        busId, agencyId, linea,
        nearestStopId: '', nearestStopDistM: 9999,
        scheduledMin: -1, currentMin, delayMin: 0, estado: 'SIN_DATOS',
    };
    // Parada más cercana al bus en esta ruta
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < timetable.stops.length; i++) {
        const pos = stopPositions.get(timetable.stops[i]);
        if (!pos)
            continue;
        const d = distM(lat, lng, pos.lat, pos.lng);
        if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
        }
    }
    if (bestIdx === -1 || bestDist > 400)
        return base; // bus demasiado lejos de la ruta
    base.nearestStopId = timetable.stops[bestIdx];
    base.nearestStopDistM = Math.round(bestDist);
    // Viaje programado con tiempo más cercano al actual en esa parada
    let bestViaje = null;
    let bestDiff = Infinity;
    for (const v of timetable.viajes) {
        const t = v.t[bestIdx];
        if (t < 0)
            continue;
        const diff = Math.abs(t - currentMin);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestViaje = v;
        }
    }
    if (!bestViaje || bestDiff > 45)
        return base; // ningún viaje dentro de ±45 min
    const scheduledMin = bestViaje.t[bestIdx];
    const delay = currentMin - scheduledMin;
    base.scheduledMin = scheduledMin;
    base.delayMin = delay;
    // Política unificada: tolerancia ±4 min IMM (TCRP 165 / IMM Uruguay).
    // Alineada con autoStatsCollector y etapaStatsTick.
    base.estado = Math.abs(delay) <= 4 ? 'A_TIEMPO' : delay > 4 ? 'RETRASADO' : 'ADELANTADO';
    return base;
}
async function runOtpTick() {
    const t0 = Date.now();
    const svcType = getCurrentServiceType();
    const currentMin = nowMinutes();
    logger.info('[OTP] Tick — hora:', `${String(Math.floor(currentMin / 60)).padStart(2, '0')}:${String(currentMin % 60).padStart(2, '0')}`, '| svcType:', svcType);
    // 1. GPS en vivo (usa la misma función que immBusesLive — cache 30s en memoria)
    const buses = await (0, immBusesService_1.getBusesEnriquecidosInternal)('all');
    logger.info('[OTP] Buses en vivo:', buses.length);
    if (buses.length === 0) {
        return { busesVivos: 0, busesEvaluados: 0, busesATiempo: 0, busesTardando: 0, busesAdelantados: 0, busesSinDatos: 0, lineasActivas: 0, durationMs: Date.now() - t0 };
    }
    // 2. Líneas únicas activas
    const lineasSet = new Map();
    for (const b of buses) {
        if (!b.linea || !b.empresaId)
            continue;
        lineasSet.set(`${b.empresaId}_${b.linea}`, { agencyId: String(b.empresaId), linea: b.linea });
    }
    // 3. Cargar timetables (ambas direcciones) con caché local para este tick
    const ttCache = new Map();
    const stopIdsNeeded = new Set();
    await Promise.all([...lineasSet.values()].flatMap(({ agencyId, linea }) => [0, 1].map(async (dir) => {
        const key = `${agencyId}_${linea}_${dir}`;
        const tt = await loadTimetable(agencyId, linea, dir, svcType);
        ttCache.set(key, tt);
        if (tt)
            for (const s of tt.stops)
                stopIdsNeeded.add(s);
    })));
    logger.info('[OTP] Timetables cargados:', ttCache.size, '| Paradas a resolver:', stopIdsNeeded.size);
    // 4. Cargar posiciones de paradas
    const stopPositions = await loadStopPositions([...stopIdsNeeded]);
    logger.info('[OTP] Posiciones de paradas:', stopPositions.size);
    // 5. Evaluar cada bus
    const delays = [];
    for (const b of buses) {
        if (!b.linea || !b.empresaId)
            continue;
        const agencyId = String(b.empresaId);
        let result = null;
        for (const dir of [0, 1]) {
            const tt = ttCache.get(`${agencyId}_${b.linea}_${dir}`);
            if (!tt)
                continue;
            const candidate = computeBusDelay(b.idBus, agencyId, b.linea, b.lat, b.lng, tt, stopPositions, currentMin);
            if (candidate.estado !== 'SIN_DATOS') {
                result = candidate;
                break;
            }
        }
        if (!result)
            result = {
                busId: b.idBus, agencyId, linea: b.linea,
                nearestStopId: '', nearestStopDistM: 9999, scheduledMin: -1,
                currentMin, delayMin: 0, estado: 'SIN_DATOS',
            };
        delays.push(result);
    }
    // 6. Escribir bus_delays en batch
    const now = admin.firestore.FieldValue.serverTimestamp();
    const BATCH_SIZE = 490;
    for (let i = 0; i < delays.length; i += BATCH_SIZE) {
        const batch = db.batch();
        for (const d of delays.slice(i, i + BATCH_SIZE)) {
            batch.set(db.collection('bus_delays').doc(`${d.agencyId}_${d.busId}`), Object.assign(Object.assign({}, d), { svcType, updatedAt: now }));
        }
        await batch.commit();
    }
    const summaryMap = new Map();
    for (const d of delays) {
        const key = `${d.agencyId}_${d.linea}`;
        if (!summaryMap.has(key))
            summaryMap.set(key, { agencyId: d.agencyId, linea: d.linea, total: 0, aTiempo: 0, retrasado: 0, adelantado: 0, sinDatos: 0, delays: [] });
        const s = summaryMap.get(key);
        s.total++;
        if (d.estado === 'A_TIEMPO')
            s.aTiempo++;
        else if (d.estado === 'RETRASADO') {
            s.retrasado++;
            s.delays.push(d.delayMin);
        }
        else if (d.estado === 'ADELANTADO')
            s.adelantado++;
        else
            s.sinDatos++;
    }
    const summaryBatch = db.batch();
    for (const [key, s] of summaryMap) {
        const avgDelay = s.delays.length > 0 ? Math.round(s.delays.reduce((a, b) => a + b) / s.delays.length) : 0;
        summaryBatch.set(db.collection('otp_summary').doc(key), {
            agencyId: s.agencyId, linea: s.linea, svcType,
            busesActivos: s.total, aTiempo: s.aTiempo, retrasado: s.retrasado,
            adelantado: s.adelantado, sinDatos: s.sinDatos,
            pctOnTime: s.total > 0 ? Math.round((s.aTiempo / s.total) * 100) : 0,
            retrasoPromedioMin: avgDelay,
            updatedAt: now,
        });
    }
    await summaryBatch.commit();
    const result = {
        busesVivos: buses.length,
        busesEvaluados: delays.length,
        busesATiempo: delays.filter(d => d.estado === 'A_TIEMPO').length,
        busesTardando: delays.filter(d => d.estado === 'RETRASADO').length,
        busesAdelantados: delays.filter(d => d.estado === 'ADELANTADO').length,
        busesSinDatos: delays.filter(d => d.estado === 'SIN_DATOS').length,
        lineasActivas: summaryMap.size,
        durationMs: Date.now() - t0,
    };
    logger.info('[OTP] Resultado:', result);
    return result;
}
// ─── Exports ──────────────────────────────────────────────────────────────────
exports.otpTick = (0, scheduler_1.onSchedule)({ schedule: 'every 10 minutes', region: 'us-central1', timeoutSeconds: 300, memory: '1GiB' }, async () => {
    try {
        await runOtpTick();
    }
    catch (err) {
        logger.error('[OTP] Tick falló:', err instanceof Error ? err.message : String(err));
    }
});
exports.computeOtpNow = (0, https_1.onRequest)({ region: 'us-central1', cors: true, timeoutSeconds: 300, memory: '1GiB' }, async (_req, res) => {
    try {
        const result = await runOtpTick();
        res.json(Object.assign({ ok: true }, result));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('[OTP] HTTP falló:', msg);
        res.status(500).json({ ok: false, error: msg });
    }
});
