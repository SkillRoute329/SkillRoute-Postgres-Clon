"use strict";
/**
 * Configuración centralizada de logging con Winston
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
// Transports (destinos de logs)
const transports = [
    // Console (siempre)
    new winston_1.default.transports.Console({
        format: winston_1.default.format.combine(winston_1.default.format.colorize(), logFormat),
    }),
];
// En producción, también guardar en archivo
if (!isDevelopment) {
    transports.push(new winston_1.default.transports.File({ filename: 'error.log', level: 'error' }), new winston_1.default.transports.File({ filename: 'combined.log' }));
}
// Crear logger
exports.logger = winston_1.default.createLogger({
    level: isDevelopment ? 'debug' : 'info',
    format: logFormat,
    transports,
});
// Logging de requests (para Express)
exports.expressLogger = winston_1.default.createLogger({
    format: logFormat,
    transports,
});
exports.default = exports.logger;
