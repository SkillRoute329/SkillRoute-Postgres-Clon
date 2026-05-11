/**
 * Backend API TransformaFacil 2.0 (ARQUITECTURA MODULAR)
 * ========================================================
 *
 * Stack:
 * - Express.js (framework)
 * - Firebase (autenticación y BD)
 * - TypeScript (type safety)
 * - Winston (logging)
 * - Arquitectura: Controllers > Services > Database
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import logger from './config/logger';
import { Config } from './config/constants';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import routes from './routes/index';
import { initializeSocket } from './services/realtimeService';
import { AIService } from './services/aiService';
import { setSocketServer } from './services/cascadeEngineService';
import { startPoller, stopPoller } from './services/pollerService';

// ═══════════════════════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ═══════════════════════════════════════════════════════════════════════════

const app = express();
const PORT = Config.PORT;

logger.info('🚀 TransformaFacil Backend iniciando...', {
  environment: Config.NODE_ENV,
  port: PORT,
});

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE GLOBAL
// ═══════════════════════════════════════════════════════════════════════════

// CORS — orígenes leídos desde CORS_ORIGINS en .env
const corsOrigins = Config.CORS_ORIGINS;
const isDev = Config.NODE_ENV === 'development';

app.use(cors({
  origin: isDev ? true : corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

logger.info(`🔒 CORS configurado`, {
  modo: isDev ? 'DESARROLLO (todos los orígenes)' : 'PRODUCCIÓN (restringido)',
  origenesPermitidos: isDev ? '*' : corsOrigins,
});

// ─── RATE LIMITING ───────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: Config.RATE_LIMIT_WINDOW_MS,           // default: 15 minutos
  max: Config.RATE_LIMIT_MAX_REQUESTS,              // default: 100 requests
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: 'Demasiadas solicitudes. Por favor intente más tarde.',
    retryAfter: Math.ceil(Config.RATE_LIMIT_WINDOW_MS / 60000),
  },
  skip: (req) => req.path === '/api/health' || req.path === '/api/doctor',
});

app.use('/api', apiLimiter);

logger.info(`🛡️  Rate Limiting activo`, {
  ventana: `${Config.RATE_LIMIT_WINDOW_MS / 60000} minutos`,
  maxRequests: Config.RATE_LIMIT_MAX_REQUESTS,
});

// Body parser
app.use(express.json({ limit: Config.JSON_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: Config.REQUEST_LIMIT }));

// Logging de requests
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  // Log al terminar la response
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.path}`, {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: (req as any).user?.id,
    });
  });

  next();
});

// Headers de seguridad
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.header('Permissions-Policy', 'geolocation=(), microphone=()');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization',
  );
  next();
});

// ═══════════════════════════════════════════════════════════════════════════
// RUTAS
// ═══════════════════════════════════════════════════════════════════════════

// Prefijo /api
app.use('/api', routes);

// Root
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'TransformaFacil 2.0 Backend',
    version: '2.0.1-MODULAR',
    environment: Config.NODE_ENV,
    docs: {
      health: 'GET /api/health',
      doctor: 'GET /api/doctor',
      login: 'POST /api/auth/login',
      cartones: 'GET /api/cartones',
      vehicles: 'GET /api/fleet/vehicles',
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════

// 404
app.use(notFoundHandler);

// Error handler centralizado (DEBE SER ÚLTIMO)
app.use(errorHandler);

// ═══════════════════════════════════════════════════════════════════════════
// SOCKET.IO
// ═══════════════════════════════════════════════════════════════════════════

const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Inicializar Socket.io con autenticación y eventos
initializeSocket(io);

// Conectar el motor de cascada al Socket.io para emitir alertas en tiempo real
setSocketServer(io);

// ═══════════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════════

const server = httpServer.listen(Number(PORT), '0.0.0.0', () => {
  logger.info(`🛡️ TransformaFacil API + Socket.io operativo`, {
    port: PORT,
    environment: Config.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
  logger.info(`📡 HTTP API: http://localhost:${PORT}/`);
  logger.info(`🔌 WebSocket: ws://localhost:${PORT}`);
  logger.info(`📚 Health: http://localhost:${PORT}/api/health`);
  logger.info(`🔍 Doctor: http://localhost:${PORT}/api/doctor`);
  AIService.prewarm('HEAVY');
  AIService.prewarm('FAST');
  AIService.prewarm('CODER');

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 3.5 — Arrancar poller autónomo IMM → Postgres.
  // Controlado por env POLLER_ENABLED. Si falla, no afecta el resto del
  // backend: el setInterval interno se reintenta solo.
  // ═══════════════════════════════════════════════════════════════════════
  try {
    startPoller();
  } catch (err) {
    logger.error('[Poller] error arrancando, el backend sigue arriba igual', { err: String(err) });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// FASE 1 (2026-05-10): Resiliencia global de errores no atrapados.
// Sin estos handlers, una unhandledRejection en cualquier controller mata
// el proceso entero. Los logueamos y seguimos vivos. Esto es CRITICAL para
// no regresión post-FASE-1, donde tokens válidos ahora pasan al middleware
// de auth y entran a controllers Firestore que pueden colgarse.
// ═══════════════════════════════════════════════════════════════════════════
process.on('unhandledRejection', (reason: unknown, promise) => {
  logger.error('[UNHANDLED REJECTION] El backend NO se cae, pero hay un bug que arreglar', {
    reason: reason instanceof Error ? { message: reason.message, stack: reason.stack } : String(reason),
    promise: String(promise),
  });
});

process.on('uncaughtException', (err: Error) => {
  logger.error('[UNCAUGHT EXCEPTION] El backend NO se cae, pero hay un bug crítico', {
    message: err.message,
    stack: err.stack,
  });
  // Excepción: errores fatales del runtime sí ameritan exit (después de log).
  // Pero los errores de async/await en controllers se quedan como rejection,
  // y esos sí los toleramos arriba.
  if (err.message && err.message.match(/^(EADDRINUSE|EACCES)/)) {
    logger.error('[UNCAUGHT EXCEPTION FATAL] error de bind, cerrando');
    process.exit(1);
  }
});

// Graceful shutdown — el poller se detiene antes del HTTP server
// para asegurar que no quede un ciclo a medio escribir en Postgres.
process.on('SIGTERM', () => {
  logger.warn('SIGTERM signal received: stopping poller + closing HTTP server');
  try { stopPoller(); } catch (e) { logger.error('[Poller] stop error', { err: String(e) }); }
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.warn('SIGINT signal received: stopping poller + closing HTTP server');
  try { stopPoller(); } catch (e) { logger.error('[Poller] stop error', { err: String(e) }); }
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Exportar tanto app como io para testing y uso en otros módulos
export { app, io, server };
