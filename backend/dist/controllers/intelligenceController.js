"use strict";
/**
 * intelligenceController — endpoints de inteligencia operativa (FASE 5.28, 2026-05-19)
 *
 * Antes 404. Agrupa los endpoints de inteligencia que no caen en un módulo
 * propio: rotación del día y briefing de inteligencia por línea.
 *
 *   GET /api/rotacion/:fecha       → coches del día (DistribucionDiaria)
 *   GET /api/inteligencia/:linea   → briefing por línea (DigitalAgentsModule)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMonthlyTrends = exports.getCompetitors = void 0;
exports.getRotacionDiaria = getRotacionDiaria;
exports.getInteligenciaPorLinea = getInteligenciaPorLinea;
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
// ─── /api/rotacion/:fecha ─────────────────────────────────────────────────
//
// Lee `cartones_historial` (lo que capturó el watcher diario UCOT). Devuelve
// shape esperado por DistribucionDiaria.tsx:
//   { ok, fecha, meta: { totalCoches, archivo }, coches: [{coche, servicio, horaSalida, linea}] }
async function getRotacionDiaria(req, res) {
    try {
        const fecha = String(req.params.fecha ?? '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
            res.status(400).json({ ok: false, error: 'Formato esperado: YYYY-MM-DD' });
            return;
        }
        const rows = await (0, database_1.default)('cartones_historial')
            .select('vehiculo_id', 'service_number', 'line', 'service_manana')
            .where('fecha', fecha)
            .orderBy(['line', 'vehiculo_id']);
        const coches = rows.map((r) => ({
            coche: r.vehiculo_id,
            servicio: r.service_number ?? '',
            servicioManana: r.service_manana ?? undefined,
            horaSalida: '', // cartones_historial no guarda horario; se obtiene del cartón oficial vía /api/cartones/oficiales/:id
            linea: r.line ?? '',
        }));
        res.json({
            ok: true,
            fecha,
            meta: {
                totalCoches: coches.length,
                archivo: 'cartones_historial (watcher UCOT diario)',
            },
            coches,
        });
    }
    catch (err) {
        logger_1.default.error('[rotacion/diaria]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error leyendo rotación', coches: [] });
    }
}
// ─── /api/inteligencia/:linea ─────────────────────────────────────────────
//
// Briefing por línea: cuántos buses propios circulan ahora, cuántos
// competidores hay en la misma línea/corredor, qué servicios oficiales
// existen, y métricas básicas. DigitalAgentsModule consume esto.
async function getInteligenciaPorLinea(req, res) {
    try {
        const linea = String(req.params.linea ?? '').trim();
        if (!linea) {
            res.status(400).json({ ok: false, error: 'Falta línea' });
            return;
        }
        const buses = await (0, database_1.default)('bus_last_pos')
            .select('id_bus', 'agency_id', 'lat', 'lon', 'timestamp_gps', 'velocidad', 'estado_cumplimiento')
            .where('linea', linea)
            .andWhere('timestamp_gps', '>=', database_1.default.raw("NOW() - INTERVAL '60 minutes'"));
        const porOperador = {};
        let propios = 0;
        let competidores = 0;
        for (const b of buses) {
            const op = b.agency_id ?? 'NA';
            porOperador[op] = (porOperador[op] ?? 0) + 1;
            // Convención UCOT (70). El resto = competidores en el corredor.
            if (op === '70')
                propios++;
            else
                competidores++;
        }
        // Buses con estado_cumplimiento problemático en la última hora
        const enRiesgo = buses.filter((b) => ['ATRASADO', 'ADELANTADO', 'BUNCHING'].includes(String(b.estado_cumplimiento ?? '').toUpperCase())).length;
        // Promedio de velocidad observada (km/h)
        const velocidades = buses.map((b) => Number(b.velocidad ?? 0)).filter((v) => Number.isFinite(v));
        const velocidadMedia = velocidades.length ? velocidades.reduce((s, v) => s + v, 0) / velocidades.length : null;
        res.json({
            ok: true,
            linea,
            ventana: 'últimos 60 min (bus_last_pos)',
            buses: {
                total: buses.length,
                propios,
                competidores,
                porOperador,
            },
            desempeno: {
                velocidadMedia,
                enRiesgo, // buses con estado ATRASADO/ADELANTADO/BUNCHING
                porcentajeEnRiesgo: buses.length ? (enRiesgo / buses.length) * 100 : 0,
            },
            timestamp: new Date().toISOString(),
            fuente: 'bus_last_pos (poller IMM en vivo)',
        });
    }
    catch (err) {
        logger_1.default.error('[inteligencia/linea]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error armando briefing' });
    }
}
// ─── /api/intelligence/competitors ────────────────────────────────────────
//
// Devuelve las líneas competidoras para una línea y sentido base.
const getCompetitors = async (req, res) => {
    try {
        const { route_id, direction_id } = req.query;
        if (!route_id || direction_id === undefined) {
            return res.status(400).json({ error: 'Faltan parámetros route_id o direction_id' });
        }
        // 1. Encontrar los route_ids (variantes) reales en GTFS que corresponden a este nombre corto (ej. "316")
        const targetRoutes = await (0, database_1.default)('gtfs.routes')
            .where('route_short_name', route_id)
            .orWhere('route_id', route_id)
            .select('route_id');
        if (targetRoutes.length === 0) {
            return res.json([]);
        }
        const targetRouteIds = targetRoutes.map(r => r.route_id);
        // 2. Buscar competidores y hacer JOIN para obtener el route_short_name del competidor
        const allCompetitors = await (0, database_1.default)('gtfs.competitor_overlap as co')
            .join('gtfs.routes as r', 'co.competitor_route_id', 'r.route_id')
            .whereIn('co.base_route_id', targetRouteIds)
            .andWhere('co.base_direction_id', parseInt(direction_id, 10))
            .select('co.*', 'r.route_short_name as competitor_short_name')
            .orderBy('co.shared_stops_count', 'desc');
        // 3. Deduplicar por short_name (para no mostrar variantes de la misma línea rival múltiples veces)
        //    y filtrar variantes propias de la misma línea base.
        const uniqueCompetitors = [];
        const seen = new Set();
        for (const comp of allCompetitors) {
            // Evitar considerar a sí misma (o sus variantes) como competidor
            if (targetRouteIds.includes(comp.competitor_route_id))
                continue;
            // Evitar competidores con el mismo short_name que la base
            if (comp.competitor_short_name === route_id)
                continue;
            const key = `${comp.competitor_short_name}_${comp.competitor_direction_id}`;
            if (!seen.has(key)) {
                seen.add(key);
                // Sobreescribimos competitor_route_id con el short_name para que el frontend 
                // pueda buscar la geometría y cargar la empresa correcta en base al catálogo de UI.
                uniqueCompetitors.push({
                    ...comp,
                    competitor_route_id: comp.competitor_short_name
                });
            }
            if (uniqueCompetitors.length >= 20)
                break;
        }
        return res.json(uniqueCompetitors);
    }
    catch (error) {
        console.error('[IntelligenceController] Error en getCompetitors DETAILED:', error);
        logger_1.default.error('[IntelligenceController] Error en getCompetitors', error.message);
        return res.status(500).json({ error: 'Error interno del servidor', details: error.message });
    }
};
exports.getCompetitors = getCompetitors;
// ─── /api/intelligence/trends ─────────────────────────────────────────────
//
// Devuelve las tendencias de carga mensual.
const getMonthlyTrends = async (req, res) => {
    try {
        const { route_id, direction_id, competitor_route_id, competitor_direction_id } = req.query;
        if (!route_id || direction_id === undefined) {
            return res.status(400).json({ error: 'Faltan parámetros de la línea base' });
        }
        const fetchTrend = async (shortName, dir) => {
            const rows = await database_1.default.raw(`
        SELECT month, passenger_count as boarding
        FROM gtfs.stm_passenger_trends
        WHERE route_id = ? AND direction_id = ?
        ORDER BY month ASC
      `, [shortName, dir]);
            return rows.rows.map((r) => ({
                month: r.month,
                boarding: Number(r.boarding)
            }));
        };
        const baseTrend = await fetchTrend(route_id, parseInt(direction_id, 10));
        let compTrend = null;
        if (competitor_route_id && competitor_direction_id !== undefined) {
            const compData = await fetchTrend(competitor_route_id, parseInt(competitor_direction_id, 10));
            compTrend = {
                route_id: competitor_route_id,
                direction_id: parseInt(competitor_direction_id, 10),
                trend: compData
            };
        }
        const responseData = {
            base_line: {
                route_id,
                direction_id: parseInt(direction_id, 10),
                trend: baseTrend
            },
            competitor_line: compTrend,
            message: baseTrend.length === 0
                ? 'Aún no hay datos cargados de la IMM para estas líneas.'
                : 'Datos auditables procesados directamente del Catálogo Abierto IMM.'
        };
        return res.json(responseData);
    }
    catch (error) {
        logger_1.default.error('[IntelligenceController] Error en getMonthlyTrends', error.message);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
};
exports.getMonthlyTrends = getMonthlyTrends;
