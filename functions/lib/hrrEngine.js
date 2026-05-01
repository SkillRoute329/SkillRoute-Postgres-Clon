"use strict";
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
exports.hrrData = exports.hrrQueryNow = exports.hrrTick = void 0;
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const immBusesService_1 = require("./immBusesService");
const db = admin.firestore();
// ─── Constantes ───────────────────────────────────────────────────────────────
const VEL_FALLBACK_KMH = 18; // velocidad urbana conservadora Montevideo (km/h)
const SNAP_MAX_A = 500; // máx distancia snap bus propio a parada (m)
const SNAP_MAX_B = 700; // máx distancia snap bus rival a parada (m)
const HRR_VENTAJA_UMBRAL = 1.2;
const HRR_RIESGO_UMBRAL = 0.8;
const HRR_CAP = 4.0; // cap: ventaja máxima reportable
const HISTORIAL_MAX = 6;
// ─── Helpers ──────────────────────────────────────────────────────────────────
function distM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function getCurrentServiceType() {
    const day = new Date().getDay();
    if (day === 0)
        return 'DOMINGO';
    if (day === 6)
        return 'SABADO';
    return 'HABIL';
}
function clasificarHrr(hrr) {
    if (hrr === null)
        return 'SIN_DATOS';
    if (hrr > HRR_VENTAJA_UMBRAL)
        return 'VENTAJA';
    if (hrr >= HRR_RIESGO_UMBRAL)
        return 'NEUTRO';
    return 'RIESGO';
}
function actualizarHistorial(prev, hrrValue, estado) {
    return [...prev, { ts: Date.now(), hrrValue, estado }].slice(-HISTORIAL_MAX);
}
// ─── Carga de datos ───────────────────────────────────────────────────────────
async function loadCorridorPairs(minPctOverlap = 30) {
    // Solo filtramos por pctAInB (índice auto) y descartamos sameEmpresa=true en memoria,
    // para no depender de índice compuesto mientras se construye.
    const snap = await db.collection('corridor_overlap')
        .where('pctAInB', '>=', minPctOverlap)
        .get();
    return snap.docs.filter(d => d.data().sameEmpresa !== true).map(d => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        const data = d.data();
        return {
            shapeAKey: (_a = data.shapeAKey) !== null && _a !== void 0 ? _a : '',
            shapeBKey: (_b = data.shapeBKey) !== null && _b !== void 0 ? _b : '',
            agencyA: String((_c = data.agencyA) !== null && _c !== void 0 ? _c : ''),
            empresaA: (_d = data.empresaA) !== null && _d !== void 0 ? _d : '',
            lineaA: (_e = data.lineaA) !== null && _e !== void 0 ? _e : '',
            agencyB: String((_f = data.agencyB) !== null && _f !== void 0 ? _f : ''),
            empresaB: (_g = data.empresaB) !== null && _g !== void 0 ? _g : '',
            lineaB: (_h = data.lineaB) !== null && _h !== void 0 ? _h : '',
            pctAInB: Number((_j = data.pctAInB) !== null && _j !== void 0 ? _j : 0),
            sharedKm: Number((_k = data.sharedKm) !== null && _k !== void 0 ? _k : 0),
        };
    });
}
async function loadTimetable(agencyId, linea, dir, svcType) {
    const snap = await db.collection('gtfs_timetable')
        .doc(`${agencyId}_${linea}_${dir}_${svcType}`)
        .get();
    return snap.exists ? snap.data() : null;
}
async function loadStopPositions(stopIds) {
    const map = new Map();
    const CHUNK = 10;
    for (let i = 0; i < stopIds.length; i += CHUNK) {
        const snaps = await Promise.all(stopIds.slice(i, i + CHUNK).map(id => db.collection('gtfs_stops').doc(id).get()));
        for (const s of snaps) {
            if (!s.exists)
                continue;
            const d = s.data();
            map.set(s.id, { lat: Number(d.lat), lng: Number(d.lng) });
        }
    }
    return map;
}
function snapBus(lat, lng, tt, stopPositions, maxDist) {
    let best = null;
    for (let i = 0; i < tt.stops.length; i++) {
        const pos = stopPositions.get(tt.stops[i]);
        if (!pos)
            continue;
        const d = distM(lat, lng, pos.lat, pos.lng);
        if (d > maxDist)
            continue;
        if (!best || d < best.distM)
            best = { stopId: tt.stops[i], stopIdx: i, distM: d, pos };
    }
    return best;
}
// ─── Headway programado desde timetable (fallback para línea con 1 bus) ──────
function headwayProgramadoMin(tt) {
    if (tt.viajes.length < 2)
        return 12; // fallback genérico
    const firstValidT = (v) => { var _a; return (_a = v.t.find(t => t >= 0)) !== null && _a !== void 0 ? _a : -1; };
    const t0 = firstValidT(tt.viajes[0]);
    const t1 = firstValidT(tt.viajes[1]);
    if (t0 >= 0 && t1 >= 0 && Math.abs(t1 - t0) > 0)
        return Math.abs(t1 - t0);
    return 12;
}
const NO_DATA = {
    hrrValue: null, estado: 'SIN_DATOS',
    headwayPropioMin: null, tiempoARivalMin: null,
    busIdPropio: null, busIdRival: null,
    tramoLat: null, tramoLng: null,
};
function calcHrrPair(busesA, busesB, tt, stopPositions) {
    if (busesA.length === 0 || busesB.length === 0)
        return NO_DATA;
    const snA = busesA
        .map(b => ({ bus: b, snap: snapBus(b.lat, b.lng, tt, stopPositions, SNAP_MAX_A) }))
        .filter((x) => x.snap !== null);
    // Snap buses rivales al mismo timetable (tolerancia mayor — ruta similar)
    const snB = busesB
        .map(b => ({ bus: b, snap: snapBus(b.lat, b.lng, tt, stopPositions, SNAP_MAX_B) }))
        .filter((x) => x.snap !== null);
    if (snA.length === 0 || snB.length === 0)
        return NO_DATA;
    // Bus propio representativo: mediana por posición en ruta
    snA.sort((a, b) => a.snap.stopIdx - b.snap.stopIdx);
    const ref = snA[Math.floor(snA.length / 2)];
    const propioIdx = ref.snap.stopIdx;
    // ── Headway propio ──────────────────────────────────────────────────────────
    let headwayPropioMin;
    if (snA.length >= 2) {
        const avgVelKmMin = snA.reduce((s, b) => s + b.bus.velocidadKmh, 0) / snA.length / 60;
        const velKmMin = Math.max(avgVelKmMin, VEL_FALLBACK_KMH / 60);
        // distancia total cubierta por la flota activa / (n_buses * velocidad) = headway
        const first = snA[0].snap.pos;
        const last = snA[snA.length - 1].snap.pos;
        const fleetSpanKm = distM(first.lat, first.lng, last.lat, last.lng) / 1000;
        headwayPropioMin = fleetSpanKm > 0
            ? fleetSpanKm / (snA.length * velKmMin)
            : headwayProgramadoMin(tt);
    }
    else {
        headwayPropioMin = headwayProgramadoMin(tt);
    }
    // ── Tiempo al rival ─────────────────────────────────────────────────────────
    const adelante = snB.filter(b => b.snap.stopIdx >= propioIdx).sort((a, b) => a.snap.stopIdx - b.snap.stopIdx);
    const detras = snB.filter(b => b.snap.stopIdx < propioIdx).sort((a, b) => b.snap.stopIdx - a.snap.stopIdx);
    let tiempoARivalMin;
    let busIdRival;
    let tramoLat;
    let tramoLng;
    let rivalIsAhead;
    if (adelante.length > 0) {
        // Rival delante → riesgo potencial
        const rival = adelante[0];
        const velKmMin = Math.max(rival.bus.velocidadKmh, VEL_FALLBACK_KMH) / 60;
        const distKm = distM(ref.snap.pos.lat, ref.snap.pos.lng, rival.snap.pos.lat, rival.snap.pos.lng) / 1000;
        tiempoARivalMin = distKm / velKmMin;
        busIdRival = rival.bus.idBus;
        tramoLat = (ref.snap.pos.lat + rival.snap.pos.lat) / 2;
        tramoLng = (ref.snap.pos.lng + rival.snap.pos.lng) / 2;
        rivalIsAhead = true;
    }
    else {
        // Rival detrás → vamos adelante → VENTAJA
        const rival = detras[0];
        tiempoARivalMin = headwayPropioMin * 1.5; // rival llega después de ~1.5 headways
        busIdRival = rival.bus.idBus;
        tramoLat = (ref.snap.pos.lat + rival.snap.pos.lat) / 2;
        tramoLng = (ref.snap.pos.lng + rival.snap.pos.lng) / 2;
        rivalIsAhead = false;
    }
    if (tiempoARivalMin <= 0)
        return NO_DATA;
    const hrrRaw = headwayPropioMin / tiempoARivalMin;
    const hrrValue = rivalIsAhead
        ? Math.min(hrrRaw, HRR_CAP)
        : HRR_CAP; // rival detrás → ventaja máxima
    return {
        hrrValue: Math.round(hrrValue * 100) / 100,
        estado: clasificarHrr(hrrValue),
        headwayPropioMin: Math.round(headwayPropioMin * 10) / 10,
        tiempoARivalMin: Math.round(tiempoARivalMin * 10) / 10,
        busIdPropio: ref.bus.idBus,
        busIdRival,
        tramoLat,
        tramoLng,
    };
}
async function runHrrTick() {
    var _a, _b, _c, _d, _e, _f, _g;
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
    const rawBuses = await (0, immBusesService_1.getBusesEnriquecidosInternal)('all');
    logger.info('[HRR] Buses GPS:', rawBuses.length);
    const busMap = new Map();
    for (const b of rawBuses) {
        if (!b.linea || !b.empresaId)
            continue;
        const aid = String(b.empresaId);
        if (!busMap.has(aid))
            busMap.set(aid, new Map());
        const lm = busMap.get(aid);
        if (!lm.has(b.linea))
            lm.set(b.linea, []);
        lm.get(b.linea).push({
            idBus: b.idBus,
            agencyId: aid,
            linea: b.linea,
            lat: b.lat,
            lng: b.lng,
            velocidadKmh: Number((_a = b.velocidadKmh) !== null && _a !== void 0 ? _a : VEL_FALLBACK_KMH),
        });
    }
    // 3. Timetables — solo líneas propias (agencyA) de los pares
    const lineasNeeded = new Set(pairs.map(p => `${p.agencyA}|${p.lineaA}`));
    const ttCache = new Map();
    const stopIdsNeeded = new Set();
    await Promise.all([...lineasNeeded].flatMap(key => {
        const [agencyId, linea] = key.split('|');
        return [0, 1].map(async (dir) => {
            const cacheKey = `${agencyId}_${linea}_${dir}`;
            const tt = await loadTimetable(agencyId, linea, dir, svcType);
            ttCache.set(cacheKey, tt);
            if (tt)
                for (const s of tt.stops)
                    stopIdsNeeded.add(s);
        });
    }));
    logger.info('[HRR] Timetables:', ttCache.size, '| Paradas:', stopIdsNeeded.size);
    // 4. Posiciones de paradas
    const stopPositions = await loadStopPositions([...stopIdsNeeded]);
    // 5. Historial previo (para no perder sparkline)
    const docIds = pairs.map(p => `${p.agencyA}_${p.lineaA}_${p.agencyB}_${p.lineaB}`);
    const prevHistorial = new Map();
    const CHUNK = 10;
    for (let i = 0; i < docIds.length; i += CHUNK) {
        const snaps = await Promise.all(docIds.slice(i, i + CHUNK).map(id => db.collection('hrr_live').doc(id).get()));
        for (const s of snaps) {
            if (s.exists)
                prevHistorial.set(s.id, (_b = s.data().historial) !== null && _b !== void 0 ? _b : []);
        }
    }
    const results = [];
    for (const p of pairs) {
        const busesA = (_d = (_c = busMap.get(p.agencyA)) === null || _c === void 0 ? void 0 : _c.get(p.lineaA)) !== null && _d !== void 0 ? _d : [];
        const busesB = (_f = (_e = busMap.get(p.agencyB)) === null || _e === void 0 ? void 0 : _e.get(p.lineaB)) !== null && _f !== void 0 ? _f : [];
        // Elegir dirección del timetable con más buses propios
        let bestTt = null;
        let bestCount = -1;
        for (const dir of [0, 1]) {
            const tt = ttCache.get(`${p.agencyA}_${p.lineaA}_${dir}`);
            if (!tt)
                continue;
            const count = busesA.filter(b => snapBus(b.lat, b.lng, tt, stopPositions, SNAP_MAX_A)).length;
            if (count > bestCount) {
                bestCount = count;
                bestTt = tt;
            }
        }
        const calc = (bestTt && bestCount > 0)
            ? calcHrrPair(busesA, busesB, bestTt, stopPositions)
            : Object.assign({}, NO_DATA);
        const docId = `${p.agencyA}_${p.lineaA}_${p.agencyB}_${p.lineaB}`;
        const historial = actualizarHistorial((_g = prevHistorial.get(docId)) !== null && _g !== void 0 ? _g : [], calc.hrrValue, calc.estado);
        results.push({
            docId,
            data: {
                agencyId: p.agencyA,
                linea: p.lineaA,
                rivalAgencyId: p.agencyB,
                rivalLinea: p.lineaB,
                empresaPropia: p.empresaA,
                empresaRival: p.empresaB,
                hrrValue: calc.hrrValue,
                estado: calc.estado,
                headwayPropioMin: calc.headwayPropioMin,
                tiempoARivalMin: calc.tiempoARivalMin,
                busIdPropio: calc.busIdPropio,
                busIdRival: calc.busIdRival,
                tramoLat: calc.tramoLat,
                tramoLng: calc.tramoLng,
                pctOverlap: p.pctAInB,
                sharedKm: p.sharedKm,
                historial,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
        });
    }
    // 7. Batch write
    const BATCH_SIZE = 490;
    const tickMs = Date.now() - t0;
    for (let i = 0; i < results.length; i += BATCH_SIZE) {
        const batch = db.batch();
        for (const { docId, data } of results.slice(i, i + BATCH_SIZE)) {
            batch.set(db.collection('hrr_live').doc(docId), Object.assign(Object.assign({}, data), { tickMs }));
        }
        await batch.commit();
    }
    const r = {
        paresEvaluados: results.length,
        paresSinDatos: results.filter(r => r.data.estado === 'SIN_DATOS').length,
        paresRiesgo: results.filter(r => r.data.estado === 'RIESGO').length,
        paresNeutro: results.filter(r => r.data.estado === 'NEUTRO').length,
        paresVentaja: results.filter(r => r.data.estado === 'VENTAJA').length,
        durationMs: tickMs,
    };
    logger.info('[HRR] Resultado:', r);
    return r;
}
// ─── Exports ───────────────────────────────────────────────────────────────────
exports.hrrTick = (0, scheduler_1.onSchedule)({ schedule: 'every 10 minutes', region: 'us-central1', timeoutSeconds: 300, memory: '1GiB' }, async () => {
    try {
        await runHrrTick();
    }
    catch (err) {
        logger.error('[HRR] Tick falló:', err instanceof Error ? err.message : String(err));
    }
});
exports.hrrQueryNow = (0, https_1.onRequest)({ region: 'us-central1', cors: true, timeoutSeconds: 300, memory: '1GiB' }, async (_req, res) => {
    try {
        const result = await runHrrTick();
        res.json(Object.assign({ ok: true }, result));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('[HRR] HTTP falló:', msg);
        res.status(500).json({ ok: false, error: msg });
    }
});
exports.hrrData = (0, https_1.onRequest)({ region: 'us-central1', cors: true, timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
    var _a;
    try {
        const agencyId = (_a = req.query.agencyId) !== null && _a !== void 0 ? _a : '70';
        const snap = await db.collection('hrr_live')
            .where('agencyId', '==', agencyId)
            .get();
        const docs = snap.docs.map(d => (Object.assign({ id: d.id }, d.data())));
        res.json({ ok: true, agencyId, total: docs.length, docs });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ ok: false, error: msg });
    }
});
