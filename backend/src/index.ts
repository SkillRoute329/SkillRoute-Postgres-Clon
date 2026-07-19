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
import { setBusServer } from './services/socketBus';
import { startPoller, stopPoller } from './services/pollerService';
import { startCacheWarmup } from './utils/cacheWarmup';
import { startFleetRankingMvRefresh } from './utils/fleetRankingMvRefresh';
import { startUcotCartonesScheduler } from './utils/ucotCartonesScheduler';
import { startGtfsRefreshScheduler } from './utils/gtfsRefreshScheduler';
import { startHorariosControlScheduler } from './utils/horariosControlScheduler';
import { startConteoVehicularScheduler } from './utils/conteoVehicularScheduler';
import { startCartonesHistorialScheduler } from './utils/cartonesHistorialScheduler';
import { startCascadeAutoTrigger } from './utils/cascadeAutoTriggerScheduler';
import { startAlertasCaducidad } from './utils/alertasCaducidadScheduler';
import { startMlRetrainScheduler } from './utils/mlRetrainScheduler';
import { seedDatabase } from './utils/seedDatabase';
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';
import { IMMDataPipeline } from './modules/gtfs-core/jobs/immDataPipeline';

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

// Módulo Anti-Caché Global Severo
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

logger.info(`🔒 CORS configurado`, {
  modo: isDev ? 'DESARROLLO (todos los orígenes)' : 'PRODUCCIÓN (restringido)',
  origenesPermitidos: isDev ? '*' : corsOrigins,
});

// ─── RATE LIMITING ───────────────────────────────────────────────────────────
//
// FASE 4 (2026-05-11): skip ampliado para incluir tráfico de loopback
// (127.0.0.1, ::1). El frontend local, los scripts de QA y Cowork pegan al
// backend desde la misma máquina; sin este skip el QA dispara HTTP 429 a los
// pocos segundos. Tráfico real externo (Ngrok, IMM auditando, otros operadores)
// sigue rate-limited normalmente — OWASP A05 cumplido.
function isLocalhost(ip: string | undefined | null): boolean {
  if (!ip) return false;
  // Maneja ::ffff:127.0.0.1 (IPv4-mapped) y otras formas
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.endsWith(':127.0.0.1')
  );
}

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
  skip: (req) => {
    // Endpoints públicos siempre exentos
    if (req.path === '/api/health' || req.path === '/api/doctor') return true;
    // Tráfico de localhost (frontend, QA, agentes locales) exento
    if (isLocalhost(req.ip)) return true;
    // ip puede venir como header X-Forwarded-For; verificar también
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && isLocalhost(xff.split(',')[0]?.trim())) return true;
    return false;
  },
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

// Documentación de API (OpenAPI 3.0 / Swagger UI)
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SkillRoute API Documentation',
      version: '2.0.0',
      description: 'API del Sistema Inteligente de Gestión de Tránsito y Cobertura Metropolitana (Montevideo - UCOT)',
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Servidor Local (PM2)',
      },
    ],
  },
  apis: [
    './src/routes/*.ts',
    './dist/routes/*.js',
    './src/routes/index.ts',
    './dist/routes/index.js'
  ],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api/docs-json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

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
// FASE 5.30 (2026-05-21): bus general de propagación accesible desde cualquier
// controller via services/socketBus.ts → permite emitir bus:db:*, bus:cascade:*,
// bus:operation:* sin pasar la instancia io entre capas.
setBusServer(io);

// ═══════════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════════

// FASE 4.8 (2026-05-12): trim del PORT — un trailing space en la env hace
// que el log diga "3000 " confusamente. Y, más grave, en Windows el listen
// con SO_EXCLUSIVEADDRUSE=false (default) permite que dos procesos hagan
// listen sobre el mismo puerto: el primero recibe todo el tráfico y el
// segundo "operativo" silenciosamente sin nunca atender una conexión.
// Listener de 'error' obligatorio antes del listen para detectar EADDRINUSE
// y morir con mensaje claro en vez de quedar fantasma.
const PORT_NUM = Number(String(PORT).trim());

httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`[FATAL] Puerto ${PORT_NUM} en uso por otro proceso. Liberar y reintentar.`, {
      port: PORT_NUM,
      hint: 'En Windows: netstat -ano | findstr :' + PORT_NUM + ' → taskkill /F /PID <PID>',
    });
    // eslint-disable-next-line no-console
    console.error(`[FATAL] Puerto ${PORT_NUM} en uso. Backend NO esta sirviendo HTTP. Saliendo.`);
    process.exit(2);
  }
  if (err.code === 'EACCES') {
    logger.error(`[FATAL] Sin permiso para bind al puerto ${PORT_NUM}. Use un puerto > 1024.`);
    process.exit(2);
  }
  logger.error('[FATAL] Error en httpServer.listen', { code: err.code, message: err.message });
  process.exit(2);
});

const server = httpServer.listen({ port: PORT_NUM, host: '0.0.0.0', exclusive: true }, () => {
  const addr = server.address();
  const realPort = typeof addr === 'object' && addr ? addr.port : PORT_NUM;
  logger.info(`🛡️ TransformaFacil API + Socket.io operativo`, {
    port: realPort,
    bindHost: typeof addr === 'object' && addr ? addr.address : '0.0.0.0',
    environment: Config.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
  logger.info(`📡 HTTP API: http://localhost:${realPort}/`);
  logger.info(`🔌 WebSocket: ws://localhost:${realPort}`);
  logger.info(`📚 Health: http://localhost:${realPort}/api/health`);
  logger.info(`🔍 Doctor: http://localhost:${realPort}/api/doctor`);
  AIService.prewarm('HEAVY');
  AIService.prewarm('FAST');
  AIService.prewarm('CODER');
  
  // FASE: Auto-seed on startup (silent unless it does work)
  seedDatabase(false).catch(err => logger.error('[SEED] Failed auto-seed on startup', err));

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 3.5 — Arrancar poller autónomo IMM → Postgres.
  // Controlado por env POLLER_ENABLED. Si falla, no afecta el resto del
  // backend: el setInterval interno se reintenta solo.
  // ═══════════════════════════════════════════════════════════════════════
  // START BACKGROUND WORKERS
  // ═══════════════════════════════════════════════════════════════════════
  try {
    if (process.env.POLLER_ENABLED === 'true') {
      startPoller();
    }
  } catch (err) {
    logger.error('[Poller] error arrancando, el backend sigue arriba igual', { err: String(err) });
  }

  // FASE 5.14 — CacheWarmup DESHABILITADO: el ciclo serial de 8 queries
  // pesadas (fleet-ranking sobre 12M filas × 4 agencias) saturaba el pool
  // de Knex (10 conexiones) e impedía que el poller persistiera nuevos
  // datos ("KnexTimeoutError: Timeout acquiring a connection"). El cache
  // pasivo en los endpoints sigue activo y da 20-40× speedup en warm.
  // startCacheWarmup();

  // FASE 5.16 — Refresco de la MV de fleet-ranking. REFRESH CONCURRENTLY
  // (no bloquea), 1 conexión, cada 5 min, guard reentrante. Reemplaza el
  // cacheWarmup roto sin saturar el pool.
  try {
    startFleetRankingMvRefresh();
    logger.info('[fleetRankingMv] refresco periódico iniciado (cada 5 min)');
  } catch (err) {
    logger.error('[fleetRankingMv] error iniciando refresco', { err: String(err) });
  }

  // FASE 5.17 — Scheduler del scraper de cartones UCOT (env-gated). Evita
  // que la descarga vuelva a quedar detenida como el 2026-05-14.
  try {
    startUcotCartonesScheduler();
  } catch (err) {
    logger.error('[ucotCartones] error iniciando scheduler', { err: String(err) });
  }

  // FASE 5.17 — Refresco automático del GTFS oficial IMM (env-gated).
  try {
    startGtfsRefreshScheduler();
  } catch (err) {
    logger.error('[gtfsRefresh] error iniciando scheduler', { err: String(err) });
  }

  // FASE 5.17 — Refresco diario de horarios STM por punto de control.
  try {
    startHorariosControlScheduler();
  } catch (err) {
    logger.error('[horariosCtrl] error iniciando scheduler', { err: String(err) });
  }

  // FASE 5.17 — Refresco del conteo vehicular IMM (mes en curso).
  try {
    startConteoVehicularScheduler();
  } catch (err) {
    logger.error('[conteoVeh] error iniciando scheduler', { err: String(err) });
  }

  // FASE 5.17 — Snapshot del historial coche→servicio (DB→DB, distribución/sustituciones).
  try {
    startCartonesHistorialScheduler();
  } catch (err) {
    logger.error('[cartonesHistorial] error iniciando scheduler', { err: String(err) });
  }

  // FASE 5.31 (2026-05-21) — Disparador automático del motor de consecuencias
  // desde GPS en vivo (bus_last_pos). Detecta retrasos por línea y vehículos
  // fuera de servicio sin intervención humana. Emite al bus de propagación.
  try {
    startCascadeAutoTrigger();
  } catch (err) {
    logger.error('[cascadeAutoTrigger] error iniciando scheduler', { err: String(err) });
  }

  // FASE 5.38 (2026-05-22) — Auto-caducidad de alertas viejas sin atender.
  // Evita que `alertas_regulacion` se llene de alertas de hace +200h.
  try {
    startAlertasCaducidad();
  } catch (err) {
    logger.error('[alertasCaducidad] error iniciando scheduler', { err: String(err) });
  }

  // FASE 3 Bloque 4 — Scheduler de re-entrenamiento automático de ML.
  try {
    startMlRetrainScheduler();
  } catch (err) {
    logger.error('[mlRetrain] error iniciando scheduler', { err: String(err) });
  }

  // FASE 7 — Inteligencia Competitiva: Pipeline de Censo Mensual de IMM.
  try {
    IMMDataPipeline.init();
  } catch (err) {
    logger.error('[IMMDataPipeline] error iniciando scheduler', { err: String(err) });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// FASE 1 (2026-05-10): Resiliencia global de errores no atrapados.
// Sin estos handlers, una unhandledRejection en cualquier controller mata
// el proceso entero. Los logueamos y seguimos vivos. Esto es CRITICAL para
// no regresión post-FASE-1, donde tokens válidos ahora pasan al middleware
// de auth y entran a controllers Firestore que pueden colgarse.
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// Anti-loop guard: si una excepción se dispara MIENTRAS el handler está
// procesando otra excepción (clásico caso EPIPE en Console.log → log() →
// otro EPIPE → ...), cortamos para no quedar en bucle infinito que mata
// CPU sin atender HTTP.
// ═══════════════════════════════════════════════════════════════════════════
let exceptionHandlerBusy = false;
let consecutiveEpipeCount = 0;
const EPIPE_THRESHOLD = 5;

function isBrokenPipeError(err: unknown): boolean {
  if (!err) return false;
  const e = err as NodeJS.ErrnoException;
  if (e.code === 'EPIPE' || e.code === 'EOF') return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /\bEPIPE\b|broken pipe/i.test(msg);
}

process.on('unhandledRejection', (reason: unknown, promise) => {
  if (exceptionHandlerBusy) return;
  if (isBrokenPipeError(reason)) return; // ignoramos EPIPE silenciosamente
  exceptionHandlerBusy = true;
  try {
    logger.error('[UNHANDLED REJECTION] El backend NO se cae, pero hay un bug que arreglar', {
      reason: reason instanceof Error ? { message: reason.message, stack: reason.stack } : String(reason),
      promise: String(promise),
    });
  } catch { /* swallow logger errors */ }
  exceptionHandlerBusy = false;
});

process.on('uncaughtException', (err: Error) => {
  // 1) EPIPE / broken pipe: stdout/stderr roto. Silenciar y seguir.
  //    Si el contador acumula muchos seguidos en milisegundos, asumimos que
  //    el console está irrecuperable y nos rendimos (exit limpio).
  if (isBrokenPipeError(err)) {
    consecutiveEpipeCount++;
    if (consecutiveEpipeCount > EPIPE_THRESHOLD) {
      // No más intentos de log al console. El proceso sigue sirviendo HTTP.
      // Reset el contador cada N segundos para no quedar mudos para siempre
      // si fue un EPIPE transitorio.
      setTimeout(() => { consecutiveEpipeCount = 0; }, 60000);
    }
    return; // CRÍTICO: NO loggear con winston, eso re-dispararía EPIPE
  }

  // 2) Otro tipo de error — loggeamos una vez, con guarda anti-recursión.
  if (exceptionHandlerBusy) return;
  exceptionHandlerBusy = true;
  try {
    logger.error('[UNCAUGHT EXCEPTION] El backend NO se cae, pero hay un bug crítico', {
      message: err.message,
      stack: err.stack,
    });
  } catch { /* swallow */ }
  exceptionHandlerBusy = false;

  // 3) Errores fatales de bind sí ameritan exit.
  if (err.message && err.message.match(/^(EADDRINUSE|EACCES)/)) {
    try { logger.error('[UNCAUGHT EXCEPTION FATAL] error de bind, cerrando'); } catch {}
    process.exit(1);
  }
});

// Si stdout/stderr emiten error, los toleramos silenciosamente — el listener
// en logger.ts ya silenció el Console transport.
if (process.stdout && typeof (process.stdout as any).on === 'function') {
  (process.stdout as NodeJS.WriteStream).on('error', () => { /* swallow */ });
}
if (process.stderr && typeof (process.stderr as any).on === 'function') {
  (process.stderr as NodeJS.WriteStream).on('error', () => { /* swallow */ });
}

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
