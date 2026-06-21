"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startFleetRankingMvRefresh = startFleetRankingMvRefresh;
exports.stopFleetRankingMvRefresh = stopFleetRankingMvRefresh;
/**
 * fleetRankingMvRefresh — refresca mv_fleet_ranking_diario periódicamente.
 *
 * FASE 5.16 (2026-05-16): el endpoint /api/autostats/fleet-ranking lee de
 * esta MV (9.5k filas) en vez de vehicle_events (12M filas). La MV debe
 * mantenerse fresca para reflejar la operativa del día en curso.
 *
 * Diseño anti-saturación (aprendido del incidente cacheWarmup que llenó
 * el pool de Knex y tumbó el poller):
 *   - REFRESH CONCURRENTLY (no bloquea lecturas; requiere índice único, ya
 *     creado: idx_mv_fr_pk).
 *   - Una sola conexión, un solo refresh a la vez (guard reentrante).
 *   - Intervalo amplio (5 min). El usuario tolera datos de hasta 5 min de
 *     antigüedad en un ranking diario.
 *   - Si un refresh tarda > intervalo, se saltea el siguiente (no encola).
 */
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
let running = false;
let timer = null;
let ticks = 0;
const TICKS_POR_DIA = Math.round((24 * 60) / 10); // intervalo de 10 min
async function refreshOnce() {
    if (running) {
        logger_1.default.warn('[fleetRankingMv] refresh anterior aún en curso (este proceso), salteando');
        return;
    }
    // FASE 5.17: el guard en-proceso NO basta — cada `pm2 restart` reinicia el
    // timer mientras un REFRESH lanzado por el proceso anterior SIGUE vivo en
    // Postgres (la query sobrevive a la muerte del cliente). Hoy se apilaron 3
    // REFRESH CONCURRENTLY (129s c/u) y saturaron el pool → frontend congelado.
    // Antes de lanzar otro, verificar en pg_stat_activity que no haya uno ya
    // corriendo a nivel DB (cross-proceso).
    try {
        // FASE 5.24: el guard cubría SOLO mv_fleet_ranking_diario. El ciclo
        // también refresca mv_cumplimiento_linea_diario y mv_oferta_linea_hora;
        // si alguno seguía corriendo al disparar el próximo tick, NO se detectaba
        // y se apilaban ciclos enteros (se vieron 3 REFRESH CONCURRENTLY juntos,
        // 7+ min c/u sobre 32M filas → drenaje de I/O que degradaba todo). Ahora
        // se saltea si CUALQUIER REFRESH de mantenimiento está activo (cross-proc).
        const r = await database_1.default.raw(`SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND state = 'active'
          AND query ~* 'REFRESH MATERIALIZED VIEW.*(mv_fleet_ranking_diario|mv_cumplimiento_linea_diario|mv_oferta_linea_hora)'
          AND query NOT ILIKE '%pg_stat_activity%'`);
        const n = Number((r.rows ?? r)[0]?.n ?? 0);
        if (n > 0) {
            logger_1.default.warn(`[fleetRankingMv] ${n} REFRESH de mantenimiento aún activo en Postgres, salteando ciclo (anti-apilado)`);
            return;
        }
    }
    catch (e) {
        logger_1.default.warn('[fleetRankingMv] no se pudo chequear pg_stat_activity, continúo', { err: String(e) });
    }
    running = true;
    const t0 = Date.now();
    try {
        // FASE 5.19 FIX: el statement_timeout=30s del pool (anti-freeze del
        // frontend) estaba MATANDO este REFRESH (>30s sobre 28M filas) → la MV
        // quedaba congelada y los paneles mostraban datos viejos ("datos no
        // actualizados"). Las MVs de mantenimiento corren SIN ese timeout
        // (SET local en la misma conexión, antes del REFRESH, una sola query).
        await database_1.default.raw('SET statement_timeout = 0; REFRESH MATERIALIZED VIEW CONCURRENTLY mv_fleet_ranking_diario');
        logger_1.default.info(`[fleetRankingMv] refrescada en ${Date.now() - t0}ms`);
    }
    catch (e) {
        logger_1.default.error('[fleetRankingMv] error en refresh', { err: String(e) });
    }
    finally {
        running = false;
    }
    // FASE 5.21: mv_cumplimiento_linea_diario alimenta /api/compliance/operador
    // (antes scaneaba 32M filas → timeout 30s, "falla por completo" IMM).
    // CONCURRENTLY (tiene índice único idx_mv_cld_pk), sin statement_timeout.
    try {
        const t2 = Date.now();
        await database_1.default.raw('SET statement_timeout = 0; REFRESH MATERIALIZED VIEW CONCURRENTLY mv_cumplimiento_linea_diario');
        logger_1.default.info(`[cumplLineaMv] refrescada en ${Date.now() - t2}ms`);
    }
    catch (e) {
        logger_1.default.error('[cumplLineaMv] error en refresh', { err: String(e) });
    }
    // FASE 5.19: mv_oferta_linea_hora (insumo del simulador) se reconstruye
    // 1×/día — escanea 28M filas (no CONCURRENTLY: no tiene índice único y
    // un patrón de oferta diario tolera 24h). Cadencia por contador de ticks.
    ticks++;
    if (ticks % TICKS_POR_DIA === 1) {
        try {
            const t1 = Date.now();
            await database_1.default.raw('SET statement_timeout = 0; REFRESH MATERIALIZED VIEW mv_oferta_linea_hora');
            logger_1.default.info(`[mvOferta] mv_oferta_linea_hora refrescada en ${Date.now() - t1}ms`);
        }
        catch (e) {
            logger_1.default.error('[mvOferta] error en refresh', { err: String(e) });
        }
    }
}
function startFleetRankingMvRefresh() {
    // FASE 5.17: el REFRESH CONCURRENTLY sobre vehicle_events (28.8M filas)
    // tarda ~3-4 min. A 5 min de intervalo casi se solapaba y contendía el
    // pool. 10 min da aire (un ranking DIARIO tolera 10 min de antigüedad) y
    // el guard anti-apilado salta el tick si aún corre uno. Primer refresh a
    // los 3 min del arranque (no competir con el boot del poller).
    setTimeout(() => { void refreshOnce(); }, 3 * 60000);
    timer = setInterval(() => { void refreshOnce(); }, 10 * 60000);
}
function stopFleetRankingMvRefresh() {
    if (timer)
        clearInterval(timer);
    timer = null;
}
