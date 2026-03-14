/**
 * Configuración centralizada de logging con Winston
 */

import winston from 'winston';

const isDevelopment = process.env.NODE_ENV === 'development';

// Formatos de log
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    let msg = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  }),
);

// Transports (destinos de logs)
const transports: winston.transport[] = [
  // Console (siempre)
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      logFormat,
    ),
  }),
];

// En producción, también guardar en archivo
if (!isDevelopment) {
  transports.push(
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  );
}

// Crear logger
export const logger = winston.createLogger({
  level: isDevelopment ? 'debug' : 'info',
  format: logFormat,
  transports,
});

// Logging de requests (para Express)
export const expressLogger = winston.createLogger({
  format: logFormat,
  transports,
});

export default logger;
