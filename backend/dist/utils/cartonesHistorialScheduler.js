"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startCartonesHistorialScheduler = startCartonesHistorialScheduler;
exports.stopCartonesHistorialScheduler = stopCartonesHistorialScheduler;
/**
 * cartonesHistorialScheduler — snapshot periódico del historial coche→servicio.
 *
 * FASE 5.17 (2026-05-16): copia el estado del día de cartones_completados a
 * cartones_historial (append idempotente) para análisis de distribución y
 * sustituciones. Es DB→DB interno (sin llamadas externas) → seguro;
 * env-gated por HISTORIAL_CARTONES_ENABLED (default ON).
 */
const cartonesHistorialService_1 = require("../services/cartonesHistorialService");
const logger_1 = __importDefault(require("../config/logger"));
let timer = null;
async function tick() {
    try {
        await (0, cartonesHistorialService_1.snapshotHistorial)('70');
    }
    catch (e) {
        logger_1.default.error('[cartonesHistorial] snapshot falló', { err: String(e) });
    }
}
function startCartonesHistorialScheduler() {
    if (process.env.HISTORIAL_CARTONES_ENABLED === 'false') {
        logger_1.default.info('[cartonesHistorial] scheduler DESHABILITADO (HISTORIAL_CARTONES_ENABLED=false)');
        return;
    }
    const horas = Number(process.env.HISTORIAL_CARTONES_HORAS) || 3;
    setTimeout(() => void tick(), 2 * 60000); // 2 min post-arranque
    timer = setInterval(() => void tick(), horas * 60 * 60000);
    logger_1.default.info(`[cartonesHistorial] scheduler ACTIVO: cada ${horas} h`);
}
function stopCartonesHistorialScheduler() {
    if (timer)
        clearInterval(timer);
    timer = null;
}
