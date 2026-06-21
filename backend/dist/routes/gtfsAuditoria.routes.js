"use strict";
/**
 * gtfsAuditoria.routes.ts — Shim de colecciones GTFS para Auditoría de Línea
 *
 * FASE 5.14 (2026-05-13): la página `AuditoriaLineaTimeline` (módulo
 * Cumplimiento → botón "Auditoría") arma todo el cruce GPS↔horario en el
 * cliente y para eso pide:
 *   GET /api/db/gtfs_timetable/{agencyId}_{linea}_{directionId}_{svcType}
 *   GET /api/db/gtfs_stops/{stopId}
 *
 * Esas colecciones nunca existieron en Postgres. Resultado: la página tira
 * "error consultando documento" sin más. Aquí servimos los mismos datos
 * desde los JSON oficiales que ya viven en backend/src/data/gtfs/:
 *   - schedule_index.json  → trips por agency+linea+día
 *   - stops_geo.json       → coordenadas y nombre por stop_id
 *
 * Estas rutas se registran ANTES del dbBridge genérico para tomar
 * precedencia sobre `/api/db/:collection/:id`.
 *
 * Nota sobre sentido (directionId): el schedule_index local NO trae
 * direction_id explícito por trip. Aquí devolvemos TODOS los trips
 * cuando directionId=0 y vacío cuando directionId=1, para no inventar
 * sentido. El frontend ya tolera el caso `viajes=[]`.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const logger_1 = __importDefault(require("../config/logger"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const router = (0, express_1.Router)();
router.use(auth_1.verifyAuth);
// ─── Carga lazy con cache ─────────────────────────────────────────────────
let scheduleIndex = null;
let stopsGeo = null;
// Indice consolidado stop_id -> {name, lat, lon} agregando los control_stops
// de schedule_index (que ya traen coordenadas y nombres) y stops_geo. Resuelve
// el mismatch de prefijo (schedule usa "4052", stops_geo usa "24052").
let stopsCombined = null;
let lastLoad = 0;
const RELOAD_MS = 60 * 60 * 1000; // 1h
function loadIfStale() {
    if (scheduleIndex && Date.now() - lastLoad < RELOAD_MS)
        return;
    const base = path_1.default.resolve(__dirname, '..', 'data', 'gtfs');
    try {
        scheduleIndex = JSON.parse(fs_1.default.readFileSync(path_1.default.join(base, 'schedule_index.json'), 'utf8'));
        stopsGeo = JSON.parse(fs_1.default.readFileSync(path_1.default.join(base, 'stops_geo.json'), 'utf8'));
        // Construir indice combinado. Primero llenamos con stops_geo (todos los
        // stops oficiales con sus prefijos), despues con los control_stops del
        // schedule_index (que usan stop_ids sin prefijo pero traen lat/lon y
        // nombre). Asi un lookup por "4052" cae al control_stop del schedule.
        const combined = {};
        for (const [id, s] of Object.entries(stopsGeo)) {
            combined[id] = { name: s.name ?? id, lat: s.lat, lon: s.lon };
        }
        for (const ag of Object.values(scheduleIndex)) {
            for (const route of Object.values(ag.routes)) {
                for (const day of [route.habiles, route.sabados, route.domingos]) {
                    if (!day)
                        continue;
                    for (const trip of day) {
                        for (const cs of trip.control_stops ?? []) {
                            if (cs.stop_id && cs.lat && cs.lon && !combined[cs.stop_id]) {
                                combined[cs.stop_id] = { name: cs.name ?? cs.stop_id, lat: cs.lat, lon: cs.lon };
                            }
                        }
                    }
                }
            }
        }
        stopsCombined = combined;
        lastLoad = Date.now();
        logger_1.default.info('[gtfsAuditoria] datasets cargados', {
            agencies: Object.keys(scheduleIndex).length,
            stopsGeo: Object.keys(stopsGeo).length,
            stopsCombined: Object.keys(combined).length,
        });
    }
    catch (e) {
        logger_1.default.error('[gtfsAuditoria] error cargando datasets', { err: String(e) });
    }
}
function hmsToMin(hms) {
    const parts = hms.split(':').map((n) => parseInt(n, 10));
    return parts[0] * 60 + (parts[1] ?? 0);
}
// ─── Endpoints ────────────────────────────────────────────────────────────
/**
 * GET /api/db/gtfs_timetable/:id
 * id = `${agencyId}_${linea}_${directionId}_${svcType}`
 * svcType ∈ {HABIL, SABADO, DOMINGO}
 */
router.get('/db/gtfs_timetable/:id', (req, res) => {
    loadIfStale();
    if (!scheduleIndex) {
        return res.json({ ok: true, data: null, warning: 'schedule_index no disponible' });
    }
    const m = /^(\d+)_(.+)_(\d+)_(HABIL|SABADO|DOMINGO)$/.exec(req.params.id);
    if (!m) {
        return res.json({ ok: true, data: null, warning: 'id no parseable' });
    }
    const [, agencyId, linea, directionStr, svcType] = m;
    const directionId = Number(directionStr);
    const ag = scheduleIndex[agencyId];
    if (!ag)
        return res.json({ ok: true, data: null });
    const route = ag.routes[linea];
    if (!route)
        return res.json({ ok: true, data: null });
    const day = svcType === 'HABIL' ? route.habiles : svcType === 'SABADO' ? route.sabados : route.domingos;
    if (!day || day.length === 0)
        return res.json({ ok: true, data: null });
    // schedule_index no tiene direction_id explícito: por ahora devolvemos
    // todos los trips solo cuando directionId=0. directionId=1 → vacío,
    // honestamente, hasta que se materialice la dirección en el dataset.
    const trips = directionId === 0 ? day : [];
    // Construir lista canónica de stop_ids (unión de todos los control_stops
    // del día, ordenados por seq promedio).
    const seqByStop = new Map();
    for (const t of trips) {
        for (const cs of t.control_stops) {
            const arr = seqByStop.get(cs.stop_id) ?? [];
            arr.push(cs.seq);
            seqByStop.set(cs.stop_id, arr);
        }
    }
    const stopIds = Array.from(seqByStop.entries())
        .map(([id, seqs]) => ({ id, avg: seqs.reduce((s, v) => s + v, 0) / seqs.length }))
        .sort((a, b) => a.avg - b.avg)
        .map((x) => x.id);
    const stopIdxMap = new Map(stopIds.map((id, i) => [id, i]));
    // Para cada trip armar `viajes[{ s: stop_id_inicio, t: [tiempos por parada en min] }]`.
    // t[i] = -1 si la parada no es control_stop de este trip; minuto del día en otro caso.
    const viajes = trips.map((t) => {
        const tArr = new Array(stopIds.length).fill(-1);
        for (const cs of t.control_stops) {
            const idx = stopIdxMap.get(cs.stop_id);
            if (idx == null)
                continue;
            tArr[idx] = hmsToMin(cs.arrival);
        }
        return { s: t.control_stops[0]?.stop_id ?? '', t: tArr };
    });
    res.json({
        ok: true,
        data: {
            linea,
            directionId,
            serviceType: svcType,
            stops: stopIds,
            viajes,
            primeraS: stopIds[0],
            ultimaS: stopIds[stopIds.length - 1],
        },
    });
});
/**
 * GET /api/db/gtfs_stops/:stopId
 * Devuelve nombre + lat/lon desde stops_geo.json
 */
router.get('/db/gtfs_stops/:stopId', (req, res) => {
    loadIfStale();
    if (!stopsCombined) {
        return res.json({ ok: true, data: null });
    }
    const id = req.params.stopId;
    const s = stopsCombined[id];
    if (!s)
        return res.json({ ok: true, data: null });
    res.json({
        ok: true,
        data: {
            codigo: id,
            stopId: id,
            nombre: s.name,
            stop_name: s.name,
            lat: s.lat,
            lng: s.lon,
            stop_lat: s.lat,
            stop_lon: s.lon,
        },
    });
});
exports.default = router;
