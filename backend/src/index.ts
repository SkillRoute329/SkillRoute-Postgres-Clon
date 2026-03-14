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
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import logger from './config/logger';
import { Config } from './config/constants';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import routes from './routes/index';
import { initializeSocket } from './services/realtimeService';

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

// CORS
app.use(cors({
  origin: true, // En desarrollo permitir todos los orígenes
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

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
  res.header('Access-Control-Allow-Origin', '*');
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
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.warn('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.warn('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Exportar tanto app como io para testing y uso en otros módulos
export { app, io, server };
