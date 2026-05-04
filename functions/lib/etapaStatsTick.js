"use strict";
/**
 * etapaStatsTick — OTP por etapa (parada a parada)
 *
 * Cada 30 min lee vehicle_events de los últimos 30 min, hace snap de cada
 * posición GPS a la parada más cercana del recorrido GTFS (colección
 * `gtfs_timetable` + `gtfs_stops`) y agrega la desviación acumulada por parada
 * en `etapa_stats/{agencyId}_{linea}_{directionId}`.
 *
 * Schema del documento destino:
 *   agencyId, empresa, linea, directionId, updatedAt, totalEventos
 *   p{N}.stopId, p{N}.lat, p{N}.lon, p{N}.nombre, p{N}.paradaIdx
 *   p{N}.total, p{N}.enTiempo, p{N}.atrasados, p{N}.adelantados, p{N}.sumDesvAtrasado
 *   p{N}.h{H}.total, p{N}.h{H}.sumDesv, p{N}.h{H}.atrasados  (H = 0-23)
 *
 * Se usa FieldValue.increment() para que escrituras concurrentes sean atómicas.
 * Caching en memoria de timetables y coordenadas de paradas por run.
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
exports.etapaStatsTick = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const AGENCY_NAMES = {
    '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT',
};
// Política unificada (docs/POLITICA_OTP_UNIFICADA.md)
// Tolerancia ±4 min IMM/TCRP 165, alineada con autoStatsCollector.SNAP_TOL_MIN.
const EN_TIEMPO_TOL = 4;
const MAX_DIST_KM = 0.4; // descartar si el bus está a >400m de la parada más cercana
const MAX_TRIP_DIFF = 60; // descarttar si ningún viaje cae dentro de ±60 min
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(a));
}
/** Convierte un ISO timestamp a minuto del día en hora de Uruguay (UTC-3) */
function minuteOfDayUYT(isoStr) {
    const d = new Date(isoStr);
    const uyt = new Date(d.getTime() - 3 * 3600000);
    return { min: uyt.getHours() * 60 + uyt.getMinutes(), hour: uyt.getHours() };
}
/** Retorna el tipo de servicio GTFS para un timestamp ISO en hora UYT */
function svcType(isoStr) {
    const d = new Date(new Date(isoStr).getTime() - 3 * 3600000);
    const dow = d.getDay();
    return dow === 0 ? 'DOMINGO' : dow === 6 ? 'SABADO' : 'HABIL';
}
exports.etapaStatsTick = functions.pubsub
    .schedule('every 30 minutes')
    .timeZone('America/Montevideo')
    .onRun(async () => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const db = admin.firestore();
    const Inc = admin.firestore.FieldValue.increment;
    const now = admin.firestore.Timestamp.now();
    const since = admin.firestore.Timestamp.fromMillis(now.toMillis() - 30 * 60000);
    // 1. Leer vehicle_events de los últimos 30 min
    const evSnap = await db.collection('vehicle_events')
        .where('createdAt', '>=', since)
        .get();
    if (evSnap.empty) {
        functions.logger.info('etapaStatsTick: sin eventos nuevos.');
        return;
    }
    // 2. Pre-cargar timetables necesarios
    const timetableCache = new Map();
    const stopCache = new Map();
    const neededTT = new Set();
    for (const d of evSnap.docs) {
        const ev = d.data();
        if (!ev.lat || !ev.lon || !ev.linea || !ev.agencyId)
            continue;
        if (ev.estadoCumplimiento === 'FUERA_DE_SERVICIO')
            continue;
        const ts = (_a = ev.timestampGPS) !== null && _a !== void 0 ? _a : now.toDate().toISOString();
        const svc = svcType(ts);
        const dirs = ev.sentido === 'IDA' ? [0] : ev.sentido === 'VUELTA' ? [1] : [0, 1];
        for (const dir of dirs)
            neededTT.add(`${ev.agencyId}_${ev.linea}_${dir}_${svc}`);
    }
    await Promise.all([...neededTT].map(async (ttId) => {
        try {
            const snap = await db.collection('gtfs_timetable').doc(ttId).get();
            timetableCache.set(ttId, snap.exists ? snap.data() : null);
        }
        catch (_a) {
            timetableCache.set(ttId, null);
        }
    }));
    // Recolectar todos los stopIds necesarios
    const neededStops = new Set();
    for (const tt of timetableCache.values()) {
        if (tt === null || tt === void 0 ? void 0 : tt.stops)
            tt.stops.forEach(s => neededStops.add(s));
    }
    // Cargar coordenadas de paradas en batches de 30 (límite Firestore `in`)
    const stopIdsArr = [...neededStops];
    for (let i = 0; i < stopIdsArr.length; i += 30) {
        const chunk = stopIdsArr.slice(i, i + 30);
        const snaps = await Promise.all(chunk.map(id => db.collection('gtfs_stops').doc(id).get()));
        for (const snap of snaps) {
            if (!snap.exists)
                continue;
            const s = snap.data();
            stopCache.set(snap.id, {
                lat: parseFloat((_c = (_b = s.stop_lat) !== null && _b !== void 0 ? _b : s.lat) !== null && _c !== void 0 ? _c : '0'),
                lon: parseFloat((_e = (_d = s.stop_lon) !== null && _d !== void 0 ? _d : s.lon) !== null && _e !== void 0 ? _e : '0'),
                nombre: String((_g = (_f = s.stop_name) !== null && _f !== void 0 ? _f : s.nombre) !== null && _g !== void 0 ? _g : snap.id),
            });
        }
    }
    const aggMap = new Map();
    const metaMap = new Map();
    for (const doc of evSnap.docs) {
        const ev = doc.data();
        if (!ev.lat || !ev.lon || !ev.linea || !ev.agencyId)
            continue;
        if (ev.estadoCumplimiento === 'FUERA_DE_SERVICIO')
            continue;
        const lat = ev.lat;
        const lon = ev.lon;
        const ts = (_h = ev.timestampGPS) !== null && _h !== void 0 ? _h : now.toDate().toISOString();
        const { min: evMin, hour: evHour } = minuteOfDayUYT(ts);
        const svc = svcType(ts);
        const dirs = ev.sentido === 'IDA' ? [0] : ev.sentido === 'VUELTA' ? [1] : [0, 1];
        let bestDir = -1, bestStopIdx = -1, bestDeviation = 0, bestDist = Infinity;
        for (const dir of dirs) {
            const ttKey = `${ev.agencyId}_${ev.linea}_${dir}_${svc}`;
            const tt = timetableCache.get(ttKey);
            if (!((_j = tt === null || tt === void 0 ? void 0 : tt.stops) === null || _j === void 0 ? void 0 : _j.length))
                continue;
            // Parada más cercana del recorrido
            let nearestIdx = -1, nearestDist = Infinity;
            for (let si = 0; si < tt.stops.length; si++) {
                const sc = stopCache.get(tt.stops[si]);
                if (!sc)
                    continue;
                const dist = haversineKm(lat, lon, sc.lat, sc.lon);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestIdx = si;
                }
            }
            if (nearestIdx === -1 || nearestDist > MAX_DIST_KM)
                continue;
            // Viaje más cercano en tiempo a esa parada
            let bestTripDiff = Infinity, bestTripDev = 0;
            for (const viaje of tt.viajes) {
                const scheduled = viaje.t[nearestIdx];
                if (scheduled === -1 || scheduled === undefined)
                    continue;
                const diff = Math.abs(evMin - scheduled);
                if (diff < bestTripDiff) {
                    bestTripDiff = diff;
                    bestTripDev = evMin - scheduled;
                }
            }
            if (bestTripDiff > MAX_TRIP_DIFF)
                continue;
            if (nearestDist < bestDist) {
                bestDist = nearestDist;
                bestDir = dir;
                bestStopIdx = nearestIdx;
                bestDeviation = bestTripDev;
            }
        }
        if (bestStopIdx === -1)
            continue;
        const groupKey = `${ev.agencyId}_${ev.linea}_${bestDir}`;
        if (!metaMap.has(groupKey)) {
            metaMap.set(groupKey, {
                agencyId: String(ev.agencyId),
                empresa: (_k = AGENCY_NAMES[ev.agencyId]) !== null && _k !== void 0 ? _k : String(ev.agencyId),
                linea: String(ev.linea),
                directionId: bestDir,
            });
        }
        if (!aggMap.has(groupKey))
            aggMap.set(groupKey, new Map());
        const ttKey = `${ev.agencyId}_${ev.linea}_${bestDir}_${svc}`;
        const tt = timetableCache.get(ttKey);
        const stopId = tt.stops[bestStopIdx];
        const sc = stopCache.get(stopId);
        const stopMap = aggMap.get(groupKey);
        if (!stopMap.has(bestStopIdx)) {
            stopMap.set(bestStopIdx, {
                stopId, paradaIdx: bestStopIdx, lat: sc.lat, lon: sc.lon, nombre: sc.nombre,
                total: 0, enTiempo: 0, atrasados: 0, adelantados: 0, sumDesvAtrasado: 0, byHour: {},
            });
        }
        const agg = stopMap.get(bestStopIdx);
        agg.total++;
        if (Math.abs(bestDeviation) <= EN_TIEMPO_TOL)
            agg.enTiempo++;
        else if (bestDeviation > 0) {
            agg.atrasados++;
            agg.sumDesvAtrasado += bestDeviation;
        }
        else
            agg.adelantados++;
        if (!agg.byHour[evHour])
            agg.byHour[evHour] = { total: 0, sumDesv: 0, atrasados: 0 };
        agg.byHour[evHour].total++;
        agg.byHour[evHour].sumDesv += bestDeviation;
        if (bestDeviation > EN_TIEMPO_TOL)
            agg.byHour[evHour].atrasados++;
    }
    // 4. Escribir a Firestore con FieldValue.increment (atómico, merge)
    const ETAPA_COLL = 'etapa_stats';
    const batch = db.batch();
    for (const [groupKey, stopMap] of aggMap) {
        const meta = metaMap.get(groupKey);
        const ref = db.collection(ETAPA_COLL).doc(groupKey);
        let docTotal = 0;
        const update = {
            agencyId: meta.agencyId,
            empresa: meta.empresa,
            linea: meta.linea,
            directionId: meta.directionId,
            updatedAt: now,
        };
        for (const [si, agg] of stopMap) {
            const p = `p${si}`;
            update[`${p}.stopId`] = agg.stopId;
            update[`${p}.lat`] = agg.lat;
            update[`${p}.lon`] = agg.lon;
            update[`${p}.nombre`] = agg.nombre;
            update[`${p}.paradaIdx`] = si;
            update[`${p}.total`] = Inc(agg.total);
            update[`${p}.enTiempo`] = Inc(agg.enTiempo);
            update[`${p}.atrasados`] = Inc(agg.atrasados);
            update[`${p}.adelantados`] = Inc(agg.adelantados);
            update[`${p}.sumDesvAtrasado`] = Inc(agg.sumDesvAtrasado);
            for (const [h, hd] of Object.entries(agg.byHour)) {
                update[`${p}.h${h}.total`] = Inc(hd.total);
                update[`${p}.h${h}.sumDesv`] = Inc(hd.sumDesv);
                update[`${p}.h${h}.atrasados`] = Inc(hd.atrasados);
            }
            docTotal += agg.total;
        }
        update['totalEventos'] = Inc(docTotal);
        batch.set(ref, update, { merge: true });
    }
    await batch.commit();
    functions.logger.info(`etapaStatsTick: ${evSnap.size} eventos procesados, ${aggMap.size} líneas actualizadas`);
});
