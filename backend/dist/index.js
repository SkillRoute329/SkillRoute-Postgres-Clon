"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = exports.io = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const socket_io_1 = require("socket.io");
const http_1 = __importDefault(require("http"));
const logger_1 = __importDefault(require("./config/logger"));
const constants_1 = require("./config/constants");
const errorHandler_1 = require("./middleware/errorHandler");
const index_1 = __importDefault(require("./routes/index"));
const realtimeService_1 = require("./services/realtimeService");
const aiService_1 = require("./services/aiService");
const cascadeEngineService_1 = require("./services/cascadeEngineService");
const pollerService_1 = require("./services/pollerService");
// ═══════════════════════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ═══════════════════════════════════════════════════════════════════════════
const app = (0, express_1.default)();
exports.app = app;
const PORT = constants_1.Config.PORT;
logger_1.default.info('🚀 TransformaFacil Backend iniciando...', {
    environment: constants_1.Config.NODE_ENV,
    port: PORT,
});
// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE GLOBAL
// ═══════════════════════════════════════════════════════════════════════════
// CORS — orígenes leídos desde CORS_ORIGINS en .env
const corsOrigins = constants_1.Config.CORS_ORIGINS;
const isDev = constants_1.Config.NODE_ENV === 'development';
app.use((0, cors_1.default)({
    origin: isDev ? true : corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
}));
logger_1.default.info(`🔒 CORS configurado`, {
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
function isLocalhost(ip) {
    if (!ip)
        return false;
    // Maneja ::ffff:127.0.0.1 (IPv4-mapped) y otras formas
    return (ip === '127.0.0.1' ||
        ip === '::1' ||
        ip === '::ffff:127.0.0.1' ||
        ip.endsWith(':127.0.0.1'));
}
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: constants_1.Config.RATE_LIMIT_WINDOW_MS, // default: 15 minutos
    max: constants_1.Config.RATE_LIMIT_MAX_REQUESTS, // default: 100 requests
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: 429,
        error: 'Demasiadas solicitudes. Por favor intente más tarde.',
        retryAfter: Math.ceil(constants_1.Config.RATE_LIMIT_WINDOW_MS / 60000),
    },
    skip: (req) => {
        // Endpoints públicos siempre exentos
        if (req.path === '/api/health' || req.path === '/api/doctor')
            return true;
        // Tráfico de localhost (frontend, QA, agentes locales) exento
        if (isLocalhost(req.ip))
            return true;
        // ip puede venir como header X-Forwarded-For; verificar también
        const xff = req.headers['x-forwarded-for'];
        if (typeof xff === 'string' && isLocalhost(xff.split(',')[0]?.trim()))
            return true;
        return false;
    },
});
app.use('/api', apiLimiter);
logger_1.default.info(`🛡️  Rate Limiting activo`, {
    ventana: `${constants_1.Config.RATE_LIMIT_WINDOW_MS / 60000} minutos`,
    maxRequests: constants_1.Config.RATE_LIMIT_MAX_REQUESTS,
});
// Body parser
app.use(express_1.default.json({ limit: constants_1.Config.JSON_LIMIT }));
app.use(express_1.default.urlencoded({ extended: true, limit: constants_1.Config.REQUEST_LIMIT }));
// Logging de requests
app.use((req, res, next) => {
    const start = Date.now();
    // Log al terminar la response
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger_1.default.info(`${req.method} ${req.path}`, {
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            userId: req.user?.id,
        });
    });
    next();
});
// Headers de seguridad
app.use((_req, res, next) => {
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');
    res.header('X-XSS-Protection', '1; mode=block');
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.header('Permissions-Policy', 'geolocation=(), microphone=()');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    next();
});
// ═══════════════════════════════════════════════════════════════════════════
// RUTAS
// ═══════════════════════════════════════════════════════════════════════════
// Prefijo /api
app.use('/api', index_1.default);
// Root
app.get('/', (_req, res) => {
    res.json({
        name: 'TransformaFacil 2.0 Backend',
        version: '2.0.1-MODULAR',
        environment: constants_1.Config.NODE_ENV,
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
app.use(errorHandler_1.notFoundHandler);
// Error handler centralizado (DEBE SER ÚLTIMO)
app.use(errorHandler_1.errorHandler);
// ═══════════════════════════════════════════════════════════════════════════
// SOCKET.IO
// ═══════════════════════════════════════════════════════════════════════════
const httpServer = http_1.default.createServer(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true,
    },
});
exports.io = io;
// Inicializar Socket.io con autenticación y eventos
(0, realtimeService_1.initializeSocket)(io);
// Conectar el motor de cascada al Socket.io para emitir alertas en tiempo real
(0, cascadeEngineService_1.setSocketServer)(io);
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
httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        logger_1.default.error(`[FATAL] Puerto ${PORT_NUM} en uso por otro proceso. Liberar y reintentar.`, {
            port: PORT_NUM,
            hint: 'En Windows: netstat -ano | findstr :' + PORT_NUM + ' → taskkill /F /PID <PID>',
        });
        // eslint-disable-next-line no-console
        console.error(`[FATAL] Puerto ${PORT_NUM} en uso. Backend NO esta sirviendo HTTP. Saliendo.`);
        process.exit(2);
    }
    if (err.code === 'EACCES') {
        logger_1.default.error(`[FATAL] Sin permiso para bind al puerto ${PORT_NUM}. Use un puerto > 1024.`);
        process.exit(2);
    }
    logger_1.default.error('[FATAL] Error en httpServer.listen', { code: err.code, message: err.message });
    process.exit(2);
});
const server = httpServer.listen({ port: PORT_NUM, host: '0.0.0.0', exclusive: true }, () => {
    const addr = server.address();
    const realPort = typeof addr === 'object' && addr ? addr.port : PORT_NUM;
    logger_1.default.info(`🛡️ TransformaFacil API + Socket.io operativo`, {
        port: realPort,
        bindHost: typeof addr === 'object' && addr ? addr.address : '0.0.0.0',
        environment: constants_1.Config.NODE_ENV,
        timestamp: new Date().toISOString(),
    });
    logger_1.default.info(`📡 HTTP API: http://localhost:${realPort}/`);
    logger_1.default.info(`🔌 WebSocket: ws://localhost:${realPort}`);
    logger_1.default.info(`📚 Health: http://localhost:${realPort}/api/health`);
    logger_1.default.info(`🔍 Doctor: http://localhost:${realPort}/api/doctor`);
    aiService_1.AIService.prewarm('HEAVY');
    aiService_1.AIService.prewarm('FAST');
    aiService_1.AIService.prewarm('CODER');
    // ═══════════════════════════════════════════════════════════════════════
    // FASE 3.5 — Arrancar poller autónomo IMM → Postgres.
    // Controlado por env POLLER_ENABLED. Si falla, no afecta el resto del
    // backend: el setInterval interno se reintenta solo.
    // ═══════════════════════════════════════════════════════════════════════
    try {
        (0, pollerService_1.startPoller)();
    }
    catch (err) {
        logger_1.default.error('[Poller] error arrancando, el backend sigue arriba igual', { err: String(err) });
    }
    // FASE 5.14 — CacheWarmup DESHABILITADO: el ciclo serial de 8 queries
    // pesadas (fleet-ranking sobre 12M filas × 4 agencias) saturaba el pool
    // de Knex (10 conexiones) e impedía que el poller persistiera nuevos
    // datos ("KnexTimeoutError: Timeout acquiring a connection"). El cache
    // pasivo en los endpoints sigue activo y da 20-40× speedup en warm.
    // startCacheWarmup();
});
exports.server = server;
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
function isBrokenPipeError(err) {
    if (!err)
        return false;
    const e = err;
    if (e.code === 'EPIPE' || e.code === 'EOF')
        return true;
    const msg = e instanceof Error ? e.message : String(e);
    return /\bEPIPE\b|broken pipe/i.test(msg);
}
process.on('unhandledRejection', (reason, promise) => {
    if (exceptionHandlerBusy)
        return;
    if (isBrokenPipeError(reason))
        return; // ignoramos EPIPE silenciosamente
    exceptionHandlerBusy = true;
    try {
        logger_1.default.error('[UNHANDLED REJECTION] El backend NO se cae, pero hay un bug que arreglar', {
            reason: reason instanceof Error ? { message: reason.message, stack: reason.stack } : String(reason),
            promise: String(promise),
        });
    }
    catch { /* swallow logger errors */ }
    exceptionHandlerBusy = false;
});
process.on('uncaughtException', (err) => {
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
    if (exceptionHandlerBusy)
        return;
    exceptionHandlerBusy = true;
    try {
        logger_1.default.error('[UNCAUGHT EXCEPTION] El backend NO se cae, pero hay un bug crítico', {
            message: err.message,
            stack: err.stack,
        });
    }
    catch { /* swallow */ }
    exceptionHandlerBusy = false;
    // 3) Errores fatales de bind sí ameritan exit.
    if (err.message && err.message.match(/^(EADDRINUSE|EACCES)/)) {
        try {
            logger_1.default.error('[UNCAUGHT EXCEPTION FATAL] error de bind, cerrando');
        }
        catch { }
        process.exit(1);
    }
});
// Si stdout/stderr emiten error, los toleramos silenciosamente — el listener
// en logger.ts ya silenció el Console transport.
if (process.stdout && typeof process.stdout.on === 'function') {
    process.stdout.on('error', () => { });
}
if (process.stderr && typeof process.stderr.on === 'function') {
    process.stderr.on('error', () => { });
}
// Graceful shutdown — el poller se detiene antes del HTTP server
// para asegurar que no quede un ciclo a medio escribir en Postgres.
process.on('SIGTERM', () => {
    logger_1.default.warn('SIGTERM signal received: stopping poller + closing HTTP server');
    try {
        (0, pollerService_1.stopPoller)();
    }
    catch (e) {
        logger_1.default.error('[Poller] stop error', { err: String(e) });
    }
    server.close(() => {
        logger_1.default.info('HTTP server closed');
        process.exit(0);
    });
});
process.on('SIGINT', () => {
    logger_1.default.warn('SIGINT signal received: stopping poller + closing HTTP server');
    try {
        (0, pollerService_1.stopPoller)();
    }
    catch (e) {
        logger_1.default.error('[Poller] stop error', { err: String(e) });
    }
    server.close(() => {
        logger_1.default.info('HTTP server closed');
        process.exit(0);
    });
});
