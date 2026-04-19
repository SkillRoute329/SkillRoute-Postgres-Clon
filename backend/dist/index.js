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
    skip: (req) => req.path === '/api/health' || req.path === '/api/doctor',
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
// ═══════════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════════
const server = httpServer.listen(Number(PORT), '0.0.0.0', () => {
    logger_1.default.info(`🛡️ TransformaFacil API + Socket.io operativo`, {
        port: PORT,
        environment: constants_1.Config.NODE_ENV,
        timestamp: new Date().toISOString(),
    });
    logger_1.default.info(`📡 HTTP API: http://localhost:${PORT}/`);
    logger_1.default.info(`🔌 WebSocket: ws://localhost:${PORT}`);
    logger_1.default.info(`📚 Health: http://localhost:${PORT}/api/health`);
    logger_1.default.info(`🔍 Doctor: http://localhost:${PORT}/api/doctor`);
});
exports.server = server;
// Graceful shutdown
process.on('SIGTERM', () => {
    logger_1.default.warn('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        logger_1.default.info('HTTP server closed');
        process.exit(0);
    });
});
process.on('SIGINT', () => {
    logger_1.default.warn('SIGINT signal received: closing HTTP server');
    server.close(() => {
        logger_1.default.info('HTTP server closed');
        process.exit(0);
    });
});
