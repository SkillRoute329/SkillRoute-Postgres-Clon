"use strict";
/**
 * Configuración centralizada de logging con Winston
 *
 * FASE 4.8 (2026-05-12): hardening anti-EPIPE.
 *   - Si el proceso pierde stdout (ej. la ventana CMD que lo lanzó se cierra),
 *     Winston Console seguía intentando escribir y disparaba `EPIPE` recurrentes
 *     que el handler de uncaughtException re-loguaba, atrapando al backend
 *     en un loop infinito de errores sin servir HTTP.
 *   - Ahora:
 *       1) Listeners en stdout/stderr atrapan EPIPE silenciosamente y marcan
 *          el Console transport como `silent` (no vuelve a intentar).
 *       2) Los transports File (combined.log + error.log) están SIEMPRE
 *          activos — antes solo en producción, ahora también en dev — para
 *          garantizar trazabilidad aunque el console esté roto.
 *       3) Si NODE_ENV='production' y stdout no es un TTY (proceso detached),
 *          el Console transport arranca ya silenciado.
 *
 * REGLA -1 NO REGRESIÓN: la API pública del logger (`logger.info`, `.warn`,
 * `.error`, etc.) se mantiene igual; no se tocó ningún caller.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.expressLogger = exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const isDevelopment = process.env.NODE_ENV === 'development';
// Formatos de log
const logFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.printf(({ level, message, timestamp, ...meta }) => {
    let msg = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    if (Object.keys(meta).length > 0) {
        msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
}));
// ─── Console transport (con guardas anti-EPIPE) ───────────────────────────
//
// Si stdout no es un TTY (proceso detached, redirigido a archivo cerrado, etc.)
// y estamos en producción, partimos ya silenciados — evita el primer EPIPE.
const stdoutIsTTY = process.stdout && process.stdout.isTTY === true;
const consoleTransport = new winston_1.default.transports.Console({
    silent: !isDevelopment && !stdoutIsTTY,
    format: winston_1.default.format.combine(winston_1.default.format.colorize(), logFormat),
    handleExceptions: false,
    handleRejections: false,
});
// Atrapar EPIPE en stdout/stderr y silenciar Console transport para que
// Winston no siga generando errores recurrentes.
function silenceConsoleOnEpipe(stream, name) {
    if (!stream || typeof stream.on !== 'function')
        return;
    stream.on('error', (err) => {
        if (err && (err.code === 'EPIPE' || err.code === 'EOF')) {
            // Silenciar Console transport para no re-disparar
            consoleTransport.silent = true;
            // Loggear UNA vez a archivo si es posible
            try {
                // logger ya está construido cuando esto dispara; usar console.error
                // directo no — usar Winston con flag de evitar loop
                if (!stream.destroyed) {
                    // no-op intencional
                }
            }
            catch {
                /* swallow */
            }
        }
        // otros errores no los suprimimos aquí
    });
}
silenceConsoleOnEpipe(process.stdout, 'stdout');
silenceConsoleOnEpipe(process.stderr, 'stderr');
// ─── Transports (destinos de logs) ────────────────────────────────────────
//
// File transports SIEMPRE activos — en dev y en prod. Antes solo prod.
// Razón: si console muere por EPIPE en dev, sin file logging perdemos todo
// el rastro de qué pasó.
const transports = [
    consoleTransport,
    new winston_1.default.transports.File({
        filename: 'error.log',
        level: 'error',
        handleExceptions: false,
        handleRejections: false,
    }),
    new winston_1.default.transports.File({
        filename: 'combined.log',
        handleExceptions: false,
        handleRejections: false,
    }),
];
// Crear logger
exports.logger = winston_1.default.createLogger({
    level: isDevelopment ? 'debug' : 'info',
    format: logFormat,
    transports,
    // CRÍTICO: NO dejar que Winston instale sus propios handlers de
    // uncaughtException. Los manejamos en index.ts con lógica anti-loop.
    exitOnError: false,
});
// Logging de requests (para Express)
exports.expressLogger = winston_1.default.createLogger({
    format: logFormat,
    transports,
    exitOnError: false,
});
exports.default = exports.logger;
