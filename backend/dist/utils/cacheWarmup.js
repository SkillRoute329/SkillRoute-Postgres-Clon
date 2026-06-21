"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startCacheWarmup = startCacheWarmup;
exports.stopCacheWarmup = stopCacheWarmup;
/**
 * cacheWarmup — pre-calienta las queries más usadas al arranque del backend
 * y luego periódicamente para mantenerlas en cache.
 *
 * FASE 5.14 (2026-05-13): sin pre-warm el primer usuario de cada endpoint
 * paga 7-23 segundos de cold cache (fleet-ranking sobre 12M filas, etc).
 * Disparando esas queries al startup y cada N segundos, todo navegante
 * cae siempre en warm cache (<600ms).
 *
 * Cómo decide qué calentar:
 *   - Queries por operador (70, 50, 20, 10) que el frontend usa de entrada
 *   - Etapa lineas y fleet-ranking de UCOT (operador propio)
 *   - No calentamos pasadas-por-etapa porque la combinatoria es grande
 *
 * Política de errores: best-effort. Si una query falla, log warning y sigue.
 * No bloquea el arranque del servidor.
 */
const logger_1 = __importDefault(require("../config/logger"));
const database_1 = __importDefault(require("../config/database"));
const responseCache_1 = require("./responseCache");
const AGENCIES = ['70', '50', '20', '10'];
async function warmFleetRanking(agencyId) {
    const days = 1;
    const limit = 200;
    const offset = 0;
    try {
        const rows = await (0, database_1.default)('vehicle_events')
            .where('agency_id', agencyId)
            .where('created_at', '>', database_1.default.raw(`NOW() - INTERVAL '${days} days'`))
            .select('id_bus', database_1.default.raw('COUNT(*) AS total_eventos'), database_1.default.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'EN_TIEMPO') AS en_tiempo"), database_1.default.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'ATRASADO') AS atrasado"), database_1.default.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'ADELANTADO') AS adelantado"), database_1.default.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'SIN_HORARIO') AS sin_horario"), database_1.default.raw('AVG(velocidad) AS vel_media'), database_1.default.raw('AVG(desviacion_min) AS desv_media'), database_1.default.raw('ARRAY_AGG(DISTINCT linea ORDER BY linea) AS lineas_operadas'), database_1.default.raw('MIN(created_at) AS primera_actividad'), database_1.default.raw('MAX(created_at) AS ultima_actividad'))
            .groupBy('id_bus')
            .orderByRaw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'EN_TIEMPO')::float / NULLIF(COUNT(*) FILTER (WHERE estado_cumplimiento IN ('EN_TIEMPO','ATRASADO','ADELANTADO')), 0) DESC NULLS LAST")
            .limit(limit)
            .offset(offset);
        const AGENCY_NAMES = { '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT' };
        const vehicles = rows.map((r) => {
            const total = Number(r.total_eventos) || 0;
            const enTiempo = Number(r.en_tiempo) || 0;
            const atrasado = Number(r.atrasado) || 0;
            const adelantado = Number(r.adelantado) || 0;
            const sinHorario = Number(r.sin_horario) || 0;
            const conSchedule = enTiempo + atrasado + adelantado;
            return {
                idBus: String(r.id_bus),
                empresa: AGENCY_NAMES[agencyId] ?? agencyId,
                lineasOperadas: (r.lineas_operadas ?? []).filter((l) => !!l),
                totalEventos: total,
                velocidadMedia: Number(Number(r.vel_media ?? 0).toFixed(1)),
                pctEnTiempo: conSchedule > 0 ? Number(((enTiempo / conSchedule) * 100).toFixed(2)) : 0,
                pctAtrasado: conSchedule > 0 ? Number(((atrasado / conSchedule) * 100).toFixed(2)) : 0,
                pctAdelantado: conSchedule > 0 ? Number(((adelantado / conSchedule) * 100).toFixed(2)) : 0,
                pctSinHorario: total > 0 ? Number(((sinHorario / total) * 100).toFixed(2)) : 0,
                ultimaActividad: r.ultima_actividad instanceof Date ? r.ultima_actividad.toISOString() : (r.ultima_actividad ?? null),
                primeraActividad: r.primera_actividad instanceof Date ? r.primera_actividad.toISOString() : (r.primera_actividad ?? null),
                desviacionMediaMin: r.desv_media != null ? Number(Number(r.desv_media).toFixed(2)) : null,
            };
        });
        const payload = { ok: true, agencyId, days, totalVehiculos: vehicles.length, vehicles };
        (0, responseCache_1.cacheSet)(`fleet-ranking:${agencyId}:${days}:${offset}:${limit}`, payload, 30000);
    }
    catch (e) {
        logger_1.default.warn('[cacheWarmup] fleet-ranking ' + agencyId, { err: String(e) });
    }
}
async function warmEtapaLineas(agencyId) {
    try {
        const rows = await (0, database_1.default)('vehicle_events')
            .where('agency_id', agencyId)
            .where('created_at', '>', database_1.default.raw(`NOW() - INTERVAL '3 days'`))
            .whereNotNull('linea')
            .select('linea', database_1.default.raw('COUNT(*) AS total'))
            .groupBy('linea')
            .having(database_1.default.raw('COUNT(*) >= ?', [50]))
            .orderBy('linea');
        const lineas = rows
            .map((r) => String(r.linea ?? '').trim())
            .filter((l) => l && l !== '-' && l !== '—');
        (0, responseCache_1.cacheSet)(`etapa:lineas:${agencyId}:3:50`, { ok: true, agencyId, days: 3, lineas }, 60000);
    }
    catch (e) {
        logger_1.default.warn('[cacheWarmup] etapa-lineas ' + agencyId, { err: String(e) });
    }
}
let warmupTimer = null;
function startCacheWarmup() {
    const run = async () => {
        const t0 = Date.now();
        // SERIAL — el pool de Knex (default 10 conexiones) se saturaba al
        // dispararse 8 queries pesadas en paralelo y todas timeouteaban. Una
        // a una completa en ~30s totales y deja todo en cache.
        for (const ag of AGENCIES) {
            await warmEtapaLineas(ag);
            await warmFleetRanking(ag);
        }
        logger_1.default.info('[cacheWarmup] ciclo completo en ' + (Date.now() - t0) + 'ms');
    };
    // Primer ciclo 3s después del arranque
    setTimeout(() => { void run(); }, 3000);
    // Después cada 25s (antes de que expire el TTL de 30s)
    warmupTimer = setInterval(() => { void run(); }, 25000);
}
function stopCacheWarmup() {
    if (warmupTimer)
        clearInterval(warmupTimer);
    warmupTimer = null;
}
