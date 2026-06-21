"use strict";
/**
 * etapaStats.routes.ts — Análisis por etapa (parada a parada)
 *
 * FASE 5.14 (2026-05-13): el frontend (AnalisisEtapas.tsx) consume estos
 * endpoints a través de `etapaStatsService.ts`. El servicio existía pero
 * sus dos funciones devolvían stubs vacíos ([] / null), por eso el
 * usuario veía "Sin datos aún — acumula c/30 min" permanente.
 *
 * Los stats se computan on-the-fly desde `vehicle_events` agrupando por
 * `proxima_parada`. No usa cache porque la query con índice
 * (agency_id, linea, created_at) y limit 50k resuelve en <2s.
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSchedule = getSchedule;
exports.norm = norm;
exports.buildStopSeqMap = buildStopSeqMap;
exports.getEtapasPrincipales = getEtapasPrincipales;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const responseCache_1 = require("../utils/responseCache");
const router = (0, express_1.Router)();
router.use(auth_1.verifyAuth);
let scheduleIndex = null;
let scheduleLoadedAt = 0;
function getSchedule() {
    if (scheduleIndex && Date.now() - scheduleLoadedAt < 60 * 60 * 1000)
        return scheduleIndex;
    try {
        const p = path_1.default.resolve(__dirname, '..', 'data', 'gtfs', 'schedule_index.json');
        scheduleIndex = JSON.parse(fs_1.default.readFileSync(p, 'utf8'));
        scheduleLoadedAt = Date.now();
        return scheduleIndex;
    }
    catch (e) {
        logger_1.default.warn('[etapa-stats] no se pudo cargar schedule_index', { err: String(e) });
        return null;
    }
}
function norm(s) {
    return String(s ?? '').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
/**
 * Construye un map normName(parada) → seq promedio, para ordenar.
 * Si no hay match, retorna 999 para que la parada caiga al final.
 */
function buildStopSeqMap(agencyId, linea) {
    const out = new Map();
    const sched = getSchedule();
    if (!sched)
        return out;
    const ag = sched[agencyId];
    if (!ag)
        return out;
    const route = ag.routes[linea];
    if (!route)
        return out;
    const seqsByName = new Map();
    for (const day of [route.habiles, route.sabados, route.domingos]) {
        if (!day)
            continue;
        for (const trip of day) {
            const cs = trip.control_stops ?? [];
            const seqMin = cs.length > 0 ? Math.min(...cs.map((s) => s.seq)) : 0;
            const seqMax = cs.length > 0 ? Math.max(...cs.map((s) => s.seq)) : 1;
            const range = seqMax - seqMin || 1;
            for (const stop of cs) {
                const key = norm(stop.name);
                if (!key)
                    continue;
                const normalized = (stop.seq - seqMin) / range;
                const arr = seqsByName.get(key) ?? [];
                arr.push(normalized);
                seqsByName.set(key, arr);
            }
        }
    }
    for (const [name, seqs] of seqsByName) {
        out.set(name, seqs.reduce((s, v) => s + v, 0) / seqs.length);
    }
    return out;
}
/**
 * FASE 5.14 (2026-05-13): etapas PRINCIPALES de una línea — las que actúan
 * como puntos de control en el cartón del conductor.
 *
 * Cada trip de la línea tiene exactamente N control_stops (= 5 en UCOT
 * típicamente). Pero la línea puede tener decenas de variantes (Casabó-
 * Geant, Casabó-Buceo, etc.) → uniendo todos los control_stops salen
 * 70+ puntos, lo que enreda la pantalla.
 *
 * Solución: identificar los stops que aparecen en al menos `minPct` de los
 * trips del sentido. Esos son los puntos OPERATIVOS que el conductor
 * realmente usa como guía (los que están en TODOS o casi todos los
 * cartones). Devuelve un set de nombres normalizados.
 */
function getEtapasPrincipales(agencyId, linea, minPct = 0.3) {
    const result = new Map();
    const sched = getSchedule();
    if (!sched)
        return { etapas: result, totalTrips: 0 };
    const route = sched[agencyId]?.routes[linea];
    if (!route)
        return { etapas: result, totalTrips: 0 };
    const trips = route.habiles ?? [];
    if (trips.length === 0)
        return { etapas: result, totalTrips: 0 };
    // Para cada stop: cuántos trips lo incluyen, posición media normalizada,
    // primer trip que la usa (para coordenadas y arrival).
    const counts = new Map();
    for (const trip of trips) {
        const cs = trip.control_stops ?? [];
        if (cs.length === 0)
            continue;
        const seqMin = Math.min(...cs.map((s) => s.seq));
        const seqMax = Math.max(...cs.map((s) => s.seq));
        const range = seqMax - seqMin || 1;
        for (const stop of cs) {
            const key = norm(stop.name);
            if (!key)
                continue;
            const pos = (stop.seq - seqMin) / range;
            const ex = counts.get(key);
            if (ex) {
                ex.count++;
                ex.positions.push(pos);
            }
            else {
                counts.set(key, {
                    count: 1,
                    positions: [pos],
                    nombre: stop.name,
                    lat: stop.lat ?? 0,
                    lon: stop.lon ?? 0,
                    arrival: stop.arrival ?? '',
                });
            }
        }
    }
    const threshold = Math.max(1, Math.floor(trips.length * minPct));
    for (const [key, v] of counts) {
        if (v.count < threshold)
            continue;
        const sortKey = v.positions.reduce((s, x) => s + x, 0) / v.positions.length;
        result.set(key, { sortKey, nombre: v.nombre, lat: v.lat, lon: v.lon, arrival: v.arrival });
    }
    return { etapas: result, totalTrips: trips.length };
}
/**
 * GET /api/etapa-stats/lineas/:agencyId?days=3
 * Devuelve las líneas con al menos N eventos en los últimos N días.
 */
router.get('/lineas/:agencyId', async (req, res) => {
    try {
        const agencyId = req.params.agencyId;
        const days = Math.min(7, Math.max(1, parseInt(req.query.days || '3', 10)));
        const minEventos = parseInt(req.query.minEventos || '50', 10);
        // FASE 5.14: cache 60s — el set de líneas con actividad cambia lento.
        const cacheKey = `etapa:lineas:${agencyId}:${days}:${minEventos}`;
        const payload = await (0, responseCache_1.cached)(cacheKey, 60000, async () => {
            const rows = await (0, database_1.default)('vehicle_events')
                .where('agency_id', agencyId)
                .where('created_at', '>', database_1.default.raw(`NOW() - INTERVAL '${days} days'`))
                .whereNotNull('linea')
                .select('linea', database_1.default.raw('COUNT(*) AS total'))
                .groupBy('linea')
                .having(database_1.default.raw('COUNT(*) >= ?', [minEventos]))
                .orderBy('linea');
            const lineas = rows
                .map((r) => String(r.linea ?? '').trim())
                .filter((l) => l && l !== '-' && l !== '—');
            return { ok: true, agencyId, days, lineas };
        });
        res.json(payload);
    }
    catch (err) {
        logger_1.default.error('[etapa-stats/lineas]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error obteniendo lineas' });
    }
});
/**
 * GET /api/etapa-stats/:agencyId/:linea?sentido=0&days=3
 *
 * Agrega vehicle_events por proxima_parada para una linea+operador,
 * devolviendo estadisticas por parada: total, atrasados, % atrasado,
 * desviacion media, y breakdown por hora del dia.
 *
 * Nota: vehicle_events no tiene campo "sentido" explicito hoy. El query
 * ignora el parametro sentido por ahora (se devuelven todas las paradas
 * IDA+VUELTA mezcladas). Cuando se agregue sentido a vehicle_events o se
 * derive del trip_id, este endpoint filtrara correctamente.
 */
router.get('/:agencyId/:linea', async (req, res) => {
    try {
        const agencyId = req.params.agencyId;
        const linea = req.params.linea;
        const days = Math.min(7, Math.max(1, parseInt(req.query.days || '1', 10)));
        // FASE 5.14: filtro por sentido (IDA / VUELTA / TODOS).
        // El sentido lo deriva el poller a partir del destino + cluster
        // geográfico. Sin separar IDA/VUELTA, dos buses que pasan por la misma
        // intersección pero en sentidos opuestos mezclan estadísticas → cifras
        // sin sentido operativo.
        const sentidoRaw = String(req.query.sentido || '').toUpperCase();
        const sentido = sentidoRaw === 'IDA' ? 'IDA' : sentidoRaw === 'VUELTA' ? 'VUELTA' : null;
        // FASE 5.14: cache 45s del agregado por etapa. El dataset crece de a 4
        // operadores × 10 ciclos/min, así que 45s es ventana razonable entre
        // refresh sin que el usuario perciba datos "viejos".
        const cacheKey = `etapa:agg:${agencyId}:${linea}:${sentido ?? 'TODOS'}:${days}`;
        const cachedPayload = (await Promise.resolve().then(() => __importStar(require('../utils/responseCache')))).cacheGet(cacheKey);
        if (cachedPayload) {
            res.json(cachedPayload);
            return;
        }
        let baseQ = (0, database_1.default)('vehicle_events')
            .where('agency_id', agencyId)
            .where('linea', linea)
            .where('created_at', '>', database_1.default.raw(`NOW() - INTERVAL '${days} days'`))
            .whereNotNull('proxima_parada');
        if (sentido)
            baseQ = baseQ.where('sentido', sentido);
        // FASE 5.14: SIN filtro HAVING. Antes pedíamos COUNT >= 5 lo que en
        // líneas suburbanas de baja frecuencia (ej. línea 17) descartaba la
        // mayoría de paradas. Ahora devolvemos TODAS las paradas que tuvieron
        // al menos 1 GPS asociado en la ventana.
        const rows = await baseQ.clone()
            .select('proxima_parada AS nombre', database_1.default.raw('COUNT(*) AS total'), database_1.default.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'ATRASADO') AS atrasados"), database_1.default.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'EN_TIEMPO') AS en_tiempo"), database_1.default.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'ADELANTADO') AS adelantados"), database_1.default.raw('AVG(desviacion_min) FILTER (WHERE desviacion_min IS NOT NULL) AS desv_media'))
            .groupBy('proxima_parada');
        // Breakdown por hora del día (perfil temporal por parada).
        const byHourRows = await baseQ.clone()
            .select('proxima_parada AS nombre', database_1.default.raw('EXTRACT(HOUR FROM created_at)::int AS hora'), database_1.default.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'ATRASADO')::float / NULLIF(COUNT(*), 0) * 100 AS pct_atrasado"), database_1.default.raw('AVG(desviacion_min) FILTER (WHERE desviacion_min IS NOT NULL) AS desv_media'))
            .groupBy('proxima_parada', database_1.default.raw('EXTRACT(HOUR FROM created_at)'));
        const byHourMap = new Map();
        for (const r of byHourRows) {
            const m = byHourMap.get(r.nombre) ?? {};
            m[String(r.hora)] = {
                pctAtrasado: Math.round(Number(r.pct_atrasado ?? 0)),
                desviacionMedia: Number(Number(r.desv_media ?? 0).toFixed(1)),
            };
            byHourMap.set(r.nombre, m);
        }
        // FASE 5.14: etapas PRINCIPALES del cartón (no todas las paradas
        // físicas). Limitamos al subconjunto que aparece en ≥30% de los trips →
        // son los puntos de control que el conductor usa de guía.
        const { etapas: etapasPrincipales, totalTrips } = getEtapasPrincipales(agencyId, linea, 0.3);
        // Mapa de orden cronológico: nombre normalizado → seq promedio.
        const stopSeqMap = buildStopSeqMap(agencyId, linea);
        // Helper: matching tolerante. Si no hay match exacto, busca por palabras
        // de calle y cruce (ej. "Av 8 De Octubre Y Jb Ordoñez" matchea
        // "8 Oct / JB Ordoñez"). Sin esto, líneas con nombres GPS distintos al
        // schedule quedaban con sortKey=999 → orden pésimo.
        function lookupSortKey(nombre) {
            const k = norm(nombre);
            if (!k)
                return 999;
            const direct = stopSeqMap.get(k);
            if (direct != null)
                return direct;
            const tokens = k.split(' ').filter((t) => t.length >= 4);
            let best = 999;
            for (const [name, seq] of stopSeqMap) {
                const nameTokens = name.split(' ').filter((t) => t.length >= 4);
                let shared = 0;
                for (const t of tokens)
                    if (nameTokens.includes(t))
                        shared++;
                if (shared >= 2 && seq < best)
                    best = seq;
            }
            return best;
        }
        // Helper: dado un nombre cualquiera (GPS o schedule), ¿es una etapa
        // principal? Match directo o por tokens compartidos.
        function esEtapaPrincipal(nombre) {
            if (etapasPrincipales.size === 0)
                return true; // sin filtro si no hay schedule
            const k = norm(nombre);
            if (!k)
                return false;
            if (etapasPrincipales.has(k))
                return true;
            const tokens = k.split(' ').filter((t) => t.length >= 4);
            for (const principalKey of etapasPrincipales.keys()) {
                const pTokens = principalKey.split(' ').filter((t) => t.length >= 4);
                let shared = 0;
                for (const t of tokens)
                    if (pTokens.includes(t))
                        shared++;
                if (shared >= 2)
                    return true;
            }
            return false;
        }
        // FASE 5.14: armar la lista desde las ETAPAS PRINCIPALES y agregarles
        // los stats de los GPS asociados. Las etapas vacías (sin GPS aún) se
        // muestran como "0 pasadas". Las paradas GPS que NO sean etapa principal
        // se agrupan en "Otros puntos" al final.
        const statsByName = new Map();
        for (const r of rows) {
            statsByName.set(norm(r.nombre), {
                total: Number(r.total) || 0,
                atrasados: Number(r.atrasados) || 0,
                enTiempo: Number(r.en_tiempo) || 0,
                adelantados: Number(r.adelantados) || 0,
                desv_media: r.desv_media,
            });
        }
        const paradasRaw = [];
        // 1) Etapas principales: incluir TODAS aunque no tengan GPS. Sumar stats
        //    de paradas GPS cuyo nombre matchee (por tokens) con la etapa.
        if (etapasPrincipales.size > 0) {
            for (const [key, etapa] of etapasPrincipales) {
                // Stats directos por nombre
                let stats = statsByName.get(key);
                // Si no hay match directo, sumar stats de paradas GPS que matcheen por tokens
                if (!stats) {
                    let total = 0, atrasados = 0, enTiempo = 0, adelantados = 0;
                    let sumDesv = 0, nDesv = 0;
                    const pTokens = key.split(' ').filter((t) => t.length >= 4);
                    for (const [gpsKey, gpsStats] of statsByName) {
                        const gTokens = gpsKey.split(' ').filter((t) => t.length >= 4);
                        let shared = 0;
                        for (const t of pTokens)
                            if (gTokens.includes(t))
                                shared++;
                        if (shared >= 2) {
                            total += gpsStats.total;
                            atrasados += gpsStats.atrasados;
                            enTiempo += gpsStats.enTiempo;
                            adelantados += gpsStats.adelantados;
                            if (gpsStats.desv_media != null) {
                                sumDesv += Number(gpsStats.desv_media) * gpsStats.total;
                                nDesv += gpsStats.total;
                            }
                        }
                    }
                    stats = { total, atrasados, enTiempo, adelantados, desv_media: nDesv > 0 ? String(sumDesv / nDesv) : null };
                }
                paradasRaw.push({
                    nombre: etapa.nombre,
                    total: stats.total,
                    atrasados: stats.atrasados,
                    enTiempo: stats.enTiempo,
                    adelantados: stats.adelantados,
                    sortKey: etapa.sortKey,
                    desviacionMediaMin: Number(Number(stats.desv_media ?? 0).toFixed(1)),
                    horaProgramada: etapa.arrival || undefined,
                });
            }
        }
        else {
            // Fallback: si no hay schedule para esta línea, mostrar todas las
            // paradas GPS sin filtrar.
            for (const [key, stats] of statsByName) {
                paradasRaw.push({
                    nombre: key,
                    total: stats.total,
                    atrasados: stats.atrasados,
                    enTiempo: stats.enTiempo,
                    adelantados: stats.adelantados,
                    sortKey: lookupSortKey(key),
                    desviacionMediaMin: Number(Number(stats.desv_media ?? 0).toFixed(1)),
                });
            }
        }
        paradasRaw.sort((a, b) => a.sortKey - b.sortKey || a.nombre.localeCompare(b.nombre));
        const paradas = paradasRaw.map((p, idx) => ({
            paradaIdx: idx,
            stopId: p.nombre,
            nombre: p.nombre,
            total: p.total,
            atrasados: p.atrasados,
            adelantados: p.adelantados,
            pctEnTiempo: p.total > 0 ? Math.round((p.enTiempo / p.total) * 100) : 0,
            pctAtrasado: p.total > 0 ? Math.round((p.atrasados / p.total) * 100) : 0,
            pctAdelantado: p.total > 0 ? Math.round((p.adelantados / p.total) * 100) : 0,
            desviacionMediaMin: p.desviacionMediaMin,
            enSchedule: p.sortKey < 999,
            // Hora programada de paso (HH:MM:SS desde el schedule). Útil para
            // mostrar "esta etapa debería ser a las 06:14" en el dashboard.
            horaProgramada: p.horaProgramada ?? null,
            byHour: byHourMap.get(p.nombre) ?? {},
        }));
        // Silenciar warning sobre helper no usado en algunos branches.
        void esEtapaPrincipal;
        const totalEventos = paradas.reduce((s, p) => s + p.total, 0);
        const payload = {
            ok: true,
            agencyId,
            linea,
            sentido: sentido ?? 'TODOS',
            days,
            updatedAt: new Date().toISOString(),
            paradas,
            totalEventos,
            ordenadoPor: 'secuencia GTFS schedule_index',
        };
        (await Promise.resolve().then(() => __importStar(require('../utils/responseCache')))).cacheSet(cacheKey, payload, 45000);
        res.json(payload);
    }
    catch (err) {
        logger_1.default.error('[etapa-stats/:agencyId/:linea]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error agregando etapa-stats' });
    }
});
/**
 * FASE 5.14 (2026-05-13) — vista AVL real
 * GET /api/etapa-stats/:agencyId/:linea/pasadas?stopName=...&days=1&limit=50
 *
 * Devuelve las ULTIMAS pasadas individuales registradas por una parada
 * especifica (matching por nombre de `proxima_parada`). Cada pasada trae:
 *   { timestamp, idBus, desviacionMin, estado, velocidad }
 *
 * Esto convierte el panel de Etapa en un AVL real: el auditor puede ver
 * que bus paso por esa parada, a que hora, y como se comparo contra el
 * horario oficial. Sin esto solo se ven agregados (no auditables).
 */
router.get('/:agencyId/:linea/pasadas', async (req, res) => {
    try {
        const agencyId = req.params.agencyId;
        const linea = req.params.linea;
        const stopName = req.query.stopName || '';
        if (!stopName) {
            res.status(400).json({ ok: false, error: 'stopName es requerido' });
            return;
        }
        const sentidoRaw = String(req.query.sentido || '').toUpperCase();
        const sentido = sentidoRaw === 'IDA' ? 'IDA' : sentidoRaw === 'VUELTA' ? 'VUELTA' : null;
        const days = Math.min(7, Math.max(1, parseInt(req.query.days || '1', 10)));
        const limit = Math.min(500, Math.max(10, parseInt(req.query.limit || '60', 10)));
        const radioMetros = Math.min(800, Math.max(100, parseInt(req.query.radio || '400', 10)));
        // FASE 5.14: cache 30s — esta es la query MÁS lenta (geometric distinct).
        const cacheKey = `etapa:pasadas:${agencyId}:${linea}:${stopName}:${sentido ?? 'TODOS'}:${days}:${limit}:${radioMetros}`;
        const cm = await Promise.resolve().then(() => __importStar(require('../utils/responseCache')));
        const hit = cm.cacheGet(cacheKey);
        if (hit) {
            res.json(hit);
            return;
        }
        // FASE 5.14 (2026-05-13): pasadas RECONSTRUIDAS por geometría.
        //
        // Antes: select * from vehicle_events where proxima_parada = X.
        // Problema: proxima_parada se calcula 1 vez cada 10s (ping del poller).
        // Si un bus va rápido entre etapas A y B, su ping cae cerca de B y A
        // queda sin registro de ESE bus — aunque físicamente sí pasó por A.
        // Resultado: cada etapa muestra coches distintos, sin consistencia.
        //
        // Ahora: encontrar lat/lon de la etapa desde schedule_index y para cada
        // bus que operó la línea+sentido en la ventana, traer su ping más
        // cercano dentro de un radio (default 400 m). Así un bus que recorrió
        // toda la línea aparece en TODAS sus etapas (con la hora real en que
        // estuvo más cerca de cada una), no sólo en aquellas donde el poller
        // alcanzó a samplearlo.
        // FASE 5.14 (2026-05-13): comparación 100% basada en datos IMM/GTFS
        // públicos — sin cartón interno UCOT. Para cada pasada del bus por la
        // etapa, comparamos su hora real contra la hora oficial GTFS del trip
        // cuyo DESTINO coincide con el destino que la IMM reporta para el bus.
        //
        // Pipeline:
        //   1) Localizar lat/lon de la etapa desde control_stops GTFS
        //   2) Para esa etapa, recolectar todas las "arrival" agrupadas por
        //      destino del trip (último control_stop). Mapa:
        //         destino → [hora_etapa_trip1, hora_etapa_trip2, ...]
        //   3) Cuando llega una pasada GPS con `destino` del feed IMM, buscar
        //      el destino GTFS que matchee (substring o tokens) y usar SOLO
        //      esas horas. La hora más cercana = horario programado de esa
        //      pasada. Diferencia = atraso/adelanto.
        //   4) Si el destino del bus no matchea ningún destino GTFS, fallback
        //      a todas las horas de la etapa (sin filtro por destino).
        const sched = getSchedule();
        const route = sched?.[agencyId]?.routes[linea];
        let stopLat = null;
        let stopLon = null;
        const destinoToHorasMin = new Map(); // destino normalizado → horas (min día)
        const todasHorasMin = []; // fallback sin destino
        if (route) {
            const target = norm(stopName);
            const allDays = [route.habiles, route.sabados, route.domingos];
            for (const day of allDays) {
                if (!day)
                    continue;
                for (const trip of day) {
                    const cs = trip.control_stops ?? [];
                    if (cs.length === 0)
                        continue;
                    // Destino del trip = nombre del último control_stop
                    const destinoTrip = norm(cs[cs.length - 1]?.name ?? '');
                    for (const stop of cs) {
                        const k = norm(stop.name);
                        const matchByName = k === target || (k && target && (k.includes(target) || target.includes(k)));
                        if (!matchByName)
                            continue;
                        if (typeof stop.lat === 'number' && typeof stop.lon === 'number' && stop.lat !== 0 && stopLat == null) {
                            stopLat = stop.lat;
                            stopLon = stop.lon;
                        }
                        if (stop.arrival) {
                            const parts = stop.arrival.split(':').map((n) => parseInt(n, 10));
                            const mins = parts[0] * 60 + (parts[1] ?? 0);
                            todasHorasMin.push(mins);
                            if (destinoTrip) {
                                const arr = destinoToHorasMin.get(destinoTrip) ?? [];
                                arr.push(mins);
                                destinoToHorasMin.set(destinoTrip, arr);
                            }
                        }
                    }
                }
            }
            todasHorasMin.sort((a, b) => a - b);
            for (const v of destinoToHorasMin.values())
                v.sort((a, b) => a - b);
        }
        /**
         * Dado el destino que IMM reporta para el bus (puede ser "CASABO",
         * "GEANT", etc.), buscar las horas GTFS que correspondan a trips con
         * ese mismo destino. Match por tokens ≥3 chars.
         */
        function findHorasParaDestino(destinoBus) {
            if (!destinoBus)
                return todasHorasMin;
            const target = norm(destinoBus);
            // Match directo
            const direct = destinoToHorasMin.get(target);
            if (direct)
                return direct;
            // Match fuzzy por tokens
            const targetTokens = target.split(' ').filter((t) => t.length >= 3);
            let bestKey = null;
            let bestShared = 0;
            for (const key of destinoToHorasMin.keys()) {
                const keyTokens = key.split(' ').filter((t) => t.length >= 3);
                let shared = 0;
                for (const t of targetTokens)
                    if (keyTokens.includes(t))
                        shared++;
                if (shared > bestShared) {
                    bestShared = shared;
                    bestKey = key;
                }
            }
            if (bestKey && bestShared >= 1)
                return destinoToHorasMin.get(bestKey);
            return todasHorasMin;
        }
        function findClosestStopMin(realMin, destinoBus) {
            const candidatas = findHorasParaDestino(destinoBus);
            if (candidatas.length === 0)
                return null;
            let best = candidatas[0];
            let bestDiff = Math.abs(realMin - best);
            for (const m of candidatas) {
                const diff = Math.abs(realMin - m);
                if (diff < bestDiff) {
                    bestDiff = diff;
                    best = m;
                }
            }
            // Si la hora más cercana del cartón está a más de 30 min, asumimos
            // que ese bus no estaba haciendo un trip programado de esa etapa.
            return bestDiff > 30 ? null : best;
        }
        const stopArrivalHHMM = todasHorasMin.length === 1
            ? `${String(Math.floor(todasHorasMin[0] / 60)).padStart(2, '0')}:${String(todasHorasMin[0] % 60).padStart(2, '0')}`
            : null;
        if (stopLat == null || stopLon == null) {
            // Sin coordenadas no podemos reconstruir geométricamente. Fallback al
            // matching por nombre (legacy).
            let q = (0, database_1.default)('vehicle_events')
                .where('agency_id', agencyId)
                .where('linea', linea)
                .where('proxima_parada', stopName)
                .where('created_at', '>', database_1.default.raw(`NOW() - INTERVAL '${days} days'`));
            if (sentido)
                q = q.where('sentido', sentido);
            const rows = await q
                .select('id_bus', 'estado_cumplimiento', 'desviacion_min', 'velocidad', 'trip_id', 'timestamp_gps', 'created_at')
                .orderBy('created_at', 'desc')
                .limit(limit);
            res.json({
                ok: true,
                agencyId,
                linea,
                stopName,
                sentido: sentido ?? 'TODOS',
                modo: 'nombre',
                total: rows.length,
                horaProgramada: null,
                pasadas: rows.map((r) => ({
                    idBus: r.id_bus,
                    estadoCumplimiento: r.estado_cumplimiento,
                    desviacionMin: r.desviacion_min,
                    velocidad: r.velocidad,
                    tripId: r.trip_id,
                    distanciaMetros: null,
                    timestampGPS: typeof r.timestamp_gps === 'string' ? r.timestamp_gps : r.timestamp_gps.toISOString(),
                })),
            });
            return;
        }
        // Query geográfica con bounding box prefiltro (rápido con índice GIST
        // sobre geom 4326 sin cast a geography). En Montevideo (-34.9°), 1°
        // lat ≈ 111 km. Pre-filtramos con un cuadrado generoso y refinamos con
        // ST_DistanceSphere.
        const latDelta = radioMetros / 111000;
        const lonDelta = radioMetros / (111000 * Math.cos((stopLat * Math.PI) / 180));
        let baseSql = `
      SELECT DISTINCT ON (id_bus)
        id_bus,
        estado_cumplimiento,
        desviacion_min,
        velocidad,
        trip_id,
        timestamp_gps,
        sentido,
        destino,
        ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint(?, ?), 4326)) AS dist_m
      FROM vehicle_events
      WHERE agency_id = ?
        AND linea = ?
        AND created_at > NOW() - INTERVAL '${days} days'
        AND lat BETWEEN ? AND ?
        AND lon BETWEEN ? AND ?
        AND ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint(?, ?), 4326)) <= ?`;
        const params = [
            stopLon, stopLat,
            agencyId, linea,
            stopLat - latDelta, stopLat + latDelta,
            stopLon - lonDelta, stopLon + lonDelta,
            stopLon, stopLat, radioMetros,
        ];
        if (sentido) {
            baseSql += ` AND sentido = ?`;
            params.push(sentido);
        }
        baseSql += `
      ORDER BY id_bus, ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint(?, ?), 4326)) ASC
      LIMIT ?`;
        params.push(stopLon, stopLat, limit);
        const result = await database_1.default.raw(baseSql, params);
        const rows = result.rows;
        // FASE 5.14: para cada pasada GPS, encontrar el trip del cartón cuyo
        // arrival está más cerca de su hora real → comparar contra ESE arrival.
        // Sin esto, todas las pasadas se comparaban contra una hora fija del
        // cartón y el atraso podía salir +12 horas (totalmente irreal).
        const pasadas = rows
            .sort((a, b) => {
            const ta = new Date(a.timestamp_gps).getTime();
            const tb = new Date(b.timestamp_gps).getTime();
            return tb - ta;
        })
            .map((r) => {
            const ts = new Date(r.timestamp_gps);
            const tMinUYT = ((ts.getUTCHours() + 21) % 24) * 60 + ts.getUTCMinutes();
            // FASE 5.14: usar destino del bus (feed IMM) para encontrar la hora
            // GTFS correspondiente — los trips del sentido opuesto se descartan.
            const stopMinMatched = findClosestStopMin(tMinUYT, r.destino);
            const desvVsEtapa = stopMinMatched != null ? tMinUYT - stopMinMatched : null;
            const horaProgPasada = stopMinMatched != null
                ? `${String(Math.floor(stopMinMatched / 60)).padStart(2, '0')}:${String(stopMinMatched % 60).padStart(2, '0')}`
                : null;
            return {
                idBus: r.id_bus,
                estadoCumplimiento: r.estado_cumplimiento,
                desviacionMin: r.desviacion_min,
                desviacionEtapaMin: desvVsEtapa,
                horaProgramadaPasada: horaProgPasada,
                velocidad: r.velocidad,
                tripId: r.trip_id,
                sentido: r.sentido,
                destino: r.destino,
                distanciaMetros: Math.round(Number(r.dist_m)),
                timestampGPS: typeof r.timestamp_gps === 'string' ? r.timestamp_gps : r.timestamp_gps.toISOString(),
            };
        });
        const payloadFinal = {
            ok: true,
            agencyId,
            linea,
            stopName,
            sentido: sentido ?? 'TODOS',
            modo: 'geometrico',
            radioMetros,
            horaProgramada: stopArrivalHHMM,
            total: pasadas.length,
            pasadas,
        };
        cm.cacheSet(cacheKey, payloadFinal, 30000);
        res.json(payloadFinal);
    }
    catch (err) {
        logger_1.default.error('[etapa-stats/pasadas]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error obteniendo pasadas', detalle: String(err) });
    }
});
exports.default = router;
