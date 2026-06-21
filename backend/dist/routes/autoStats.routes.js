"use strict";
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
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
const autoStatsController_1 = require("../controllers/autoStatsController");
const router = (0, express_1.Router)();
// Todas las rutas requieren auth
router.use(auth_1.verifyAuth);
router.get('/health', autoStatsController_1.getEndpointHealthHandler);
router.get('/agencies', autoStatsController_1.listAgencies);
router.get('/compliance/:agencyId', autoStatsController_1.getComplianceRealtime);
router.get('/routes/:agencyId', autoStatsController_1.getAgencyRoutes);
router.get('/routes/:agencyId/:routeShort/active', autoStatsController_1.getActiveTrips);
router.get('/vehicle/:idBus', autoStatsController_1.getVehicleHistoryHandler);
router.get('/active/:agencyId', autoStatsController_1.getActiveSnapshot);
router.get('/history/:agencyId', autoStatsController_1.getHistorySummaryHandler);
// ─── FASE 5.2 (2026-05-13): vehicle-stats y conductor-ranking ──────────────
//
// Endpoints que el frontend espera (autoStatsService.ts) pero estaban sin
// implementar. Agregados los antes del demo IMM.
const AGENCY_NAMES = {
    '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT',
};
/**
 * GET /api/autostats/vehicle-stats/:agencyId?sortBy=otp|actividad
 * Perfil de cumplimiento por coche para una empresa (basado en vehicle_events
 * de los últimos 7 días).
 */
router.get('/vehicle-stats/:agencyId', async (req, res) => {
    try {
        const agencyId = req.params.agencyId;
        const sortBy = req.query.sortBy === 'actividad' ? 'actividad' : 'otp';
        // Agregación por id_bus: conteos, % de cada estado, líneas operadas, etc.
        // FASE 5.2 (2026-05-13): ventana 24h (antes 7 días causaba timeout). Una
        // ventana de 24h sobre ~1.4M filas con índice (agency_id, created_at)
        // responde en <3s. Para vista histórica completa usar /api/audit/coverage.
        const rows = await (0, database_1.default)('vehicle_events')
            .where('agency_id', agencyId)
            .where('created_at', '>', database_1.default.raw("NOW() - INTERVAL '24 hours'"))
            .select('id_bus', database_1.default.raw('COUNT(*) AS total_eventos'), database_1.default.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'EN_TIEMPO') AS en_tiempo"), database_1.default.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'ATRASADO') AS atrasado"), database_1.default.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'ADELANTADO') AS adelantado"), database_1.default.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'SIN_HORARIO') AS sin_horario"), database_1.default.raw('COUNT(DISTINCT DATE(created_at)) AS dias_activos'), database_1.default.raw('AVG(velocidad) AS vel_media'), database_1.default.raw('ARRAY_AGG(DISTINCT linea) AS lineas_operadas'), database_1.default.raw('MAX(created_at) AS ultima_actividad'))
            .groupBy('id_bus')
            .limit(500);
        const buses = rows.map((r) => {
            const total = Number(r.total_eventos) || 0;
            const enTiempo = Number(r.en_tiempo) || 0;
            const atrasado = Number(r.atrasado) || 0;
            const adelantado = Number(r.adelantado) || 0;
            const sinHorario = Number(r.sin_horario) || 0;
            const conSchedule = enTiempo + atrasado + adelantado;
            return {
                idBus: r.id_bus,
                empresa: AGENCY_NAMES[agencyId] ?? agencyId,
                diasActivos: Number(r.dias_activos) || 0,
                totalEventos: total,
                pctEnTiempo: conSchedule > 0 ? Number(((enTiempo / conSchedule) * 100).toFixed(2)) : 0,
                pctAtrasado: conSchedule > 0 ? Number(((atrasado / conSchedule) * 100).toFixed(2)) : 0,
                pctAdelantado: conSchedule > 0 ? Number(((adelantado / conSchedule) * 100).toFixed(2)) : 0,
                pctSinHorario: total > 0 ? Number(((sinHorario / total) * 100).toFixed(2)) : 0,
                // FASE 5.17 (auditoría): cobertura auditable explícita = eventos con
                // horario IMM (EN_TIEMPO+ATRASADO+ADELANTADO) / total. El OTP se
                // calcula SOLO sobre estos; declararlo evita inflar el OTP de forma
                // no transparente ante IMM.
                coberturaAuditablePct: total > 0 ? Number(((conSchedule / total) * 100).toFixed(2)) : 0,
                velocidadMedia: Number(Number(r.vel_media ?? 0).toFixed(1)),
                desviacionMediaMin: null,
                lineasOperadas: r.lineas_operadas ?? [],
                ultimaActividad: r.ultima_actividad?.toISOString?.() ?? null,
                ultimoInterno: null,
                ultimoNombre: null,
                conductoresConocidos: [],
                historial: [],
            };
        });
        if (sortBy === 'otp') {
            buses.sort((a, b) => b.pctEnTiempo - a.pctEnTiempo);
        }
        else {
            buses.sort((a, b) => b.totalEventos - a.totalEventos);
        }
        res.json({ ok: true, agencyId, totalBuses: buses.length, buses });
    }
    catch (err) {
        logger_1.default.error('[autostats/vehicle-stats]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error en vehicle-stats' });
    }
});
/**
 * FASE 5.14 (2026-05-13)
 * GET /api/autostats/fleet-ranking/:agencyId?days=7&offset=0
 *
 * Endpoint que esperaba el frontend (RankingCoches, FlotaInteligente) pero
 * que NUNCA estuvo implementado en el backend → 404 silencioso → "no
 * funciona". Devuelve el ranking de coches con OTP / actividad / lineas en
 * la ventana solicitada. Forma: { ok, agencyId, days, totalVehiculos,
 * vehicles: VehicleSummary[] }.
 */
router.get('/fleet-ranking/:agencyId', async (req, res) => {
    try {
        const agencyId = req.params.agencyId;
        const days = Math.min(30, Math.max(1, parseInt(req.query.days || '7', 10)));
        const offset = Math.max(0, parseInt(req.query.offset || '0', 10));
        const limit = Math.min(500, Math.max(10, parseInt(req.query.limit || '200', 10)));
        // FASE 5.14: cache 30s. Es la query más cara del módulo Cumplimiento
        // (GROUP BY id_bus sobre 12M filas).
        const cm = await Promise.resolve().then(() => __importStar(require('../utils/responseCache')));
        const cacheKey = `fleet-ranking:${agencyId}:${days}:${offset}:${limit}`;
        const hit = cm.cacheGet(cacheKey);
        if (hit) {
            res.json(hit);
            return;
        }
        // FASE 5.16 (2026-05-16): leer de la MV diaria mv_fleet_ranking_diario
        // (9.5k filas) en vez de escanear vehicle_events (12M filas). Se suman
        // los días dentro de la ventana. Antes: cold start >40s. Ahora: <500ms.
        // La MV se refresca cada 5 min vía refreshFleetRankingMv() en el backend.
        const rows = await (0, database_1.default)('mv_fleet_ranking_diario')
            .where('agency_id', agencyId)
            .where('fecha', '>', database_1.default.raw(`(NOW() - INTERVAL '${days} days')::date`))
            .select('id_bus', database_1.default.raw('SUM(total)::int AS total_eventos'), database_1.default.raw('SUM(en_tiempo)::int AS en_tiempo'), database_1.default.raw('SUM(atrasado)::int AS atrasado'), database_1.default.raw('SUM(adelantado)::int AS adelantado'), database_1.default.raw('SUM(sin_horario)::int AS sin_horario'), 
        // Promedio ponderado por total de cada día.
        database_1.default.raw('SUM(vel_media_sum * total) / NULLIF(SUM(total),0) AS vel_media'), database_1.default.raw('SUM(desv_media_sum * total) / NULLIF(SUM(total),0) AS desv_media'), 
        // Líneas: cada día trae un array; lo serializamos a CSV y juntamos
        // todo en un solo string (array_agg de arrays variádicos falla en
        // PG). Se deduplica en JS.
        database_1.default.raw("string_agg(array_to_string(lineas, ','), ',') AS lineas_csv"), database_1.default.raw('MIN(primera) AS primera_actividad'), database_1.default.raw('MAX(ultima) AS ultima_actividad'))
            .groupBy('id_bus')
            .orderByRaw("SUM(en_tiempo)::float / NULLIF(SUM(en_tiempo)+SUM(atrasado)+SUM(adelantado), 0) DESC NULLS LAST")
            .limit(limit)
            .offset(offset);
        const vehicles = rows.map((r) => {
            const total = Number(r.total_eventos) || 0;
            const enTiempo = Number(r.en_tiempo) || 0;
            const atrasado = Number(r.atrasado) || 0;
            const adelantado = Number(r.adelantado) || 0;
            const sinHorario = Number(r.sin_horario) || 0;
            const conSchedule = enTiempo + atrasado + adelantado;
            // r.lineas_csv = "306,300,306,..." de todos los días. Dedup en JS.
            const lineasSet = new Set();
            for (const l of String(r.lineas_csv ?? '').split(',')) {
                const t = l.trim();
                if (t)
                    lineasSet.add(t);
            }
            return {
                idBus: String(r.id_bus),
                empresa: AGENCY_NAMES[agencyId] ?? agencyId,
                lineasOperadas: Array.from(lineasSet).sort(),
                totalEventos: total,
                velocidadMedia: Number(Number(r.vel_media ?? 0).toFixed(1)),
                pctEnTiempo: conSchedule > 0 ? Number(((enTiempo / conSchedule) * 100).toFixed(2)) : 0,
                pctAtrasado: conSchedule > 0 ? Number(((atrasado / conSchedule) * 100).toFixed(2)) : 0,
                pctAdelantado: conSchedule > 0 ? Number(((adelantado / conSchedule) * 100).toFixed(2)) : 0,
                pctSinHorario: total > 0 ? Number(((sinHorario / total) * 100).toFixed(2)) : 0,
                coberturaAuditablePct: total > 0 ? Number(((conSchedule / total) * 100).toFixed(2)) : 0,
                ultimaActividad: r.ultima_actividad?.toISOString?.() ?? (r.ultima_actividad ?? null),
                primeraActividad: r.primera_actividad?.toISOString?.() ?? (r.primera_actividad ?? null),
                desviacionMediaMin: r.desv_media != null ? Number(Number(r.desv_media).toFixed(2)) : null,
            };
        });
        const fleetPayload = { ok: true, agencyId, days, totalVehiculos: vehicles.length, vehicles };
        cm.cacheSet(cacheKey, fleetPayload, 30000);
        res.json(fleetPayload);
    }
    catch (err) {
        logger_1.default.error('[autostats/fleet-ranking]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error en fleet-ranking', detalle: String(err) });
    }
});
/**
 * FASE 5.14 (2026-05-13)
 * GET /api/autostats/vehicle-trace/:agencyId/:idBus?days=1&limit=200
 *
 * Devuelve el AUDIT TRAIL de un coche: cada pasada individual con
 *   { timestamp, linea, proxima_parada, estado_cumplimiento, desviacion_min,
 *     velocidad, trip_id }
 *
 * Esto es lo que un auditor IMM necesita para verificar las estadisticas
 * de un coche: ver evento por evento como se construye el OTP. NO mostrar
 * solo agregados.
 */
router.get('/vehicle-trace/:agencyId/:idBus', async (req, res) => {
    try {
        const agencyId = req.params.agencyId;
        const idBus = req.params.idBus;
        const days = Math.min(7, Math.max(1, parseInt(req.query.days || '1', 10)));
        const limit = Math.min(2000, Math.max(10, parseInt(req.query.limit || '200', 10)));
        const rows = await (0, database_1.default)('vehicle_events')
            .where('agency_id', agencyId)
            .where('id_bus', idBus)
            .where('created_at', '>', database_1.default.raw(`NOW() - INTERVAL '${days} days'`))
            .select('id', 'linea', 'lat', 'lon', 'velocidad', 'estado_cumplimiento', 'desviacion_min', 'trip_id', 'proxima_parada', 'timestamp_gps', 'created_at')
            .orderBy('created_at', 'desc')
            .limit(limit);
        res.json({
            ok: true,
            agencyId,
            idBus,
            days,
            total: rows.length,
            pasadas: rows.map((r) => ({
                id: r.id,
                linea: r.linea,
                lat: r.lat,
                lon: r.lon,
                velocidad: r.velocidad,
                estadoCumplimiento: r.estado_cumplimiento,
                desviacionMin: r.desviacion_min,
                tripId: r.trip_id,
                proximaParada: r.proxima_parada,
                timestampGPS: typeof r.timestamp_gps === 'string' ? r.timestamp_gps : r.timestamp_gps.toISOString(),
                createdAt: typeof r.created_at === 'string' ? r.created_at : r.created_at.toISOString(),
            })),
        });
    }
    catch (err) {
        logger_1.default.error('[autostats/vehicle-trace]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error en vehicle-trace' });
    }
});
/**
 * GET /api/autostats/conductor-ranking/:agencyId
 * Ranking de conductores (donde hay distribuciones diarias). UCOT tiene
 * `coche_personal`/`turnos_dia`; otros operadores devuelven lista vacía.
 */
router.get('/conductor-ranking/:agencyId', async (req, res) => {
    try {
        const agencyId = req.params.agencyId;
        // Solo UCOT tiene mapeo coche↔conductor por ahora
        if (agencyId !== '70') {
            res.json({ ok: true, agencyId, totalConductores: 0, conductores: [],
                mensaje: 'Ranking por conductor requiere distribución diaria (solo UCOT por ahora)' });
            return;
        }
        // Para UCOT: por ahora retornamos coches con su cumplimiento. La asociación
        // coche→conductor está en `coche_personal` pero la integración fina queda
        // pendiente. Esto es un stub honesto que permite que la pantalla cargue.
        res.json({
            ok: true,
            agencyId,
            totalConductores: 0,
            conductores: [],
            mensaje: 'Vinculación coche↔conductor pendiente de distribución diaria integrada.',
        });
    }
    catch (err) {
        logger_1.default.error('[autostats/conductor-ranking]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error en conductor-ranking' });
    }
});
exports.default = router;
