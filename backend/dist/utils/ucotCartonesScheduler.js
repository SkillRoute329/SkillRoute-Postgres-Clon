"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startUcotCartonesScheduler = startUcotCartonesScheduler;
exports.stopUcotCartonesScheduler = stopUcotCartonesScheduler;
/**
 * ucotCartonesScheduler — dispara el scraper de cartones UCOT en forma
 * sostenida para que la descarga NO se detenga.
 *
 * FASE 5.17 (2026-05-16): el scraper `ucot_fleet_downloader.js` era un
 * one-shot SIN scheduler — se corrió a mano una vez el 2026-05-13 y la
 * tabla `cartones_completados` quedó congelada (el watcher PM2 seguía vivo
 * reprocesando los mismos 83 archivos). Esto provee el disparador periódico
 * que faltaba. El watcher PM2 (vivo) ingesta los JSON nuevos en ≤30s.
 *
 * Diseño:
 *   - Env-gated por UCOT_DOWNLOADER_ENABLED (default OFF: usa credenciales
 *     corporativas reales de UCOT contra su web — se habilita a conciencia).
 *   - Sólo en horario de servicio (UCOT_DOWNLOADER_HORAS, default 5–23 MVD)
 *     para no golpear la web de UCOT de madrugada.
 *   - Intervalo amplio (default 30 min) configurable por
 *     UCOT_DOWNLOADER_INTERVAL_MIN. La rotación del día no cambia seguido.
 *   - Guard reentrante propio de ucotIntranetService.triggerDownloader()
 *     (isRunningSync): si una corrida tarda, no se encola otra.
 */
const ucotIntranetService_1 = require("../services/ucotIntranetService");
const logger_1 = __importDefault(require("../config/logger"));
let timer = null;
function horaMvd() {
    const h = new Date().toLocaleString('en-US', {
        timeZone: 'America/Montevideo',
        hour: '2-digit',
        hour12: false,
    });
    return Number(h.replace(/\D/g, '')) || 0;
}
function tick() {
    const [hIni, hFin] = (process.env.UCOT_DOWNLOADER_HORAS || '5-23')
        .split('-')
        .map((x) => Number(x));
    const h = horaMvd();
    if (h < (hIni ?? 5) || h >= (hFin ?? 23)) {
        return; // fuera de horario de servicio
    }
    const r = ucotIntranetService_1.ucotIntranetService.triggerDownloader();
    if (r.success)
        logger_1.default.info(`[ucotCartones] disparo programado: ${r.message}`);
    else
        logger_1.default.warn(`[ucotCartones] disparo omitido: ${r.message}`);
}
function startUcotCartonesScheduler() {
    if (process.env.UCOT_DOWNLOADER_ENABLED !== 'true') {
        logger_1.default.info('[ucotCartones] scheduler DESHABILITADO (UCOT_DOWNLOADER_ENABLED!=true). ' +
            'La descarga de cartones no correrá automáticamente hasta habilitarlo.');
        return;
    }
    const intervalMin = Number(process.env.UCOT_DOWNLOADER_INTERVAL_MIN) || 30;
    // Primer disparo a los 90s del arranque (dar tiempo al poller a poblar
    // bus_last_pos, de donde el scraper saca la flota activa).
    setTimeout(tick, 90000);
    timer = setInterval(tick, intervalMin * 60000);
    logger_1.default.info(`[ucotCartones] scheduler ACTIVO: cada ${intervalMin} min, ` +
        `horario ${process.env.UCOT_DOWNLOADER_HORAS || '5-23'} MVD`);
}
function stopUcotCartonesScheduler() {
    if (timer)
        clearInterval(timer);
    timer = null;
}
