"use strict";
/**
 * Helpers de tiempo / timezone Montevideo (-03:00).
 *
 * Se comparten entre Cloud Functions de distintos dominios.
 * Centralizar evita duplicación y asegura que el tratamiento de fecha/hora
 * sea consistente en toda la aplicación.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fechaHoyMVD = fechaHoyMVD;
exports.hhmmAhoraMontevideo = hhmmAhoraMontevideo;
exports.tipoDiaHoyMontevideo = tipoDiaHoyMontevideo;
exports.hhmmToMin = hhmmToMin;
/** Fecha YYYY-MM-DD de hoy en horario Montevideo (UTC-3). */
function fechaHoyMVD() {
    const ahora = new Date();
    const mvd = new Date(ahora.getTime() - 3 * 60 * 60 * 1000);
    return mvd.toISOString().split('T')[0];
}
/** Hora HH:MM actual en horario Montevideo. */
function hhmmAhoraMontevideo() {
    const now = new Date();
    const mvd = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    return `${String(mvd.getUTCHours()).padStart(2, '0')}:${String(mvd.getUTCMinutes()).padStart(2, '0')}`;
}
/** Tipo de día operativo en Montevideo (para tabla de frecuencias). */
function tipoDiaHoyMontevideo() {
    const now = new Date();
    const mvd = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const dow = mvd.getUTCDay();
    if (dow === 0)
        return 'Domingos';
    if (dow === 6)
        return 'Sábados';
    return 'Hábiles';
}
/** "HH:MM" → minutos desde medianoche. null si inválido. */
function hhmmToMin(s) {
    var _a;
    const m = (_a = s === null || s === void 0 ? void 0 : s.match) === null || _a === void 0 ? void 0 : _a.call(s, /^(\d{1,2}):(\d{2})$/);
    if (!m)
        return null;
    const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59)
        return null;
    return h * 60 + min;
}
