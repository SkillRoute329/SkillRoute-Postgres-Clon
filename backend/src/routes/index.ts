/**
 * Enrutador principal - Agrupa todas las rutas
 * TransformaFacil 2.0: Centro de Comando Unificado
 */

import { Router } from 'express';

// Middleware
import { verifyAuth, requireAdmin } from '../middleware/auth';
import { validateBody } from '../middleware/validation';

// Controllers
import * as authController from '../controllers/authController';
import * as cartonController from '../controllers/cartonController';
import * as fleetController from '../controllers/fleetController';
import * as systemController from '../controllers/systemController';

// Sub-routers (Semanas 4-11)
import competitionRoutes from './competition.routes';
import analyticsRoutes from './analytics.routes';
import forecastRoutes from './forecast.routes';
import dashboardRoutes from './dashboard.routes';
import stmRoutes from './stm.routes';
import aiRoutes from './ai.routes';
import listeroRoutes from './listero.routes';
import autoStatsRoutes from './autoStats.routes';
import gtfsRoutes from './gtfs.routes';
import auditRoutes from './audit.routes';
import dbBridgeRoutes from './dbBridge.routes';

const router = Router();

// ─── PÚBLICAS (sin autenticación) ─────────────────────────────────────────

/**
 * POST /api/auth/login
 * Realizar login con internalNumber y contraseña
 */
router.post('/auth/login', validateBody(['internalNumber', 'password']), authController.login);

/**
 * GET /api/doctor
 * Diagnóstico del sistema
 */
router.get('/doctor', systemController.systemDoctor);

/**
 * GET /api/health
 * Simple health check
 */
router.get('/health', systemController.healthCheck);

/**
 * GET /api/version
 * Obtener versión
 */
router.get('/version', systemController.getVersion);

// ─── PROTEGIDAS (requieren autenticación) ─────────────────────────────────

/**
 * GTFS Soberano (Nuevo!)
 * GET /api/gtfs/stops
 * GET /api/gtfs/stops/:stopId/departures
 * Este módulo tiene prioridad absoluta para evitar colisiones.
 */
router.use('/gtfs', gtfsRoutes);

/**
 * GET /api/auth/me
 * Obtener usuario actual autenticado
 */
router.get('/auth/me', verifyAuth, authController.getCurrentUser);

// ─── CARTONES ────────────────────────────────────────────────────────────

/**
 * GET /api/cartones
 * Obtener todos los cartones
 */
router.get('/cartones', verifyAuth, cartonController.getAllCartones);

/**
 * GET /api/cartones/:id
 * Obtener un cartón específico
 */
router.get('/cartones/:id', verifyAuth, cartonController.getCartonById);

/**
 * POST /api/cartones
 * Crear o actualizar un cartón
 */
router.post('/cartones', verifyAuth, validateBody(['serviceNumber']), cartonController.saveCarton);

/**
 * DELETE /api/cartones/:id
 * Eliminar un cartón
 */
router.delete('/cartones/:id', verifyAuth, requireAdmin, cartonController.deleteCarton);

// ─── FLOTA ───────────────────────────────────────────────────────────────

/**
 * GET /api/fleet/vehicles
 * Obtener todos los vehículos
 */
router.get('/fleet/vehicles', verifyAuth, fleetController.getAllVehicles);

/**
 * GET /api/fleet/vehicles/:id
 * Obtener un vehículo específico
 */
router.get('/fleet/vehicles/:id', verifyAuth, fleetController.getVehicleById);

/**
 * POST /api/fleet/check
 * Crear una inspección de vehículo
 */
router.post('/fleet/check', verifyAuth, validateBody(['vehicleId']), fleetController.createFleetCheck);

/**
 * GET /api/fleet/vehicles/:id/checks
 * Obtener inspecciones de un vehículo
 */
router.get('/fleet/vehicles/:id/checks', verifyAuth, fleetController.getVehicleChecks);

// ─── SEMANA 4-9: INTELIGENCIA COMPETITIVA Y DASHBOARD ──────────────────────

/**
 * Rutas de Análisis de Competencia (Semana 4)
 * GET /api/competition/...
 */
router.use('/competition', competitionRoutes);

/**
 * Rutas de Análisis y Validación (Semana 5)
 * GET /api/analytics/...
 */
router.use('/analytics', analyticsRoutes);

/**
 * Rutas de Predicción y Pronósticos (Semana 6-7)
 * GET /api/forecast/...
 */
router.use('/forecast', forecastRoutes);

/**
 * Rutas de Dashboard Ejecutivo (Semana 8-9)
 * GET /api/dashboard/...
 */
router.use('/dashboard', dashboardRoutes);

/**
 * Rutas de Integración STM + 5G (Semana 10-11)
 * GET /api/stm/...
 * POST /api/stm/...
 */
router.use('/stm', stmRoutes);

/**
 * Rutas de IA Multi-Modelo
 * POST /api/ai/generate  — local (gemma3, qwen2.5-coder, llama3.1)
 * POST /api/ai/cloud     — Claude API (requiere ANTHROPIC_API_KEY)
 * POST /api/ai/embed     — embeddings vectoriales
 */
router.use('/ai', aiRoutes);

/**
 * Rutas del Módulo Listero — programación diaria, ausencias, cascada operativa
 * POST /api/listero/ausencia    — registrar ausencia + disparar cascada
 * POST /api/listero/reserva     — asignar conductor de reserva
 * POST /api/listero/vehiculo-taller — enviar vehículo a taller + cascada
 * GET  /api/listero/resumen     — resumen del día
 */
router.use('/listero', listeroRoutes);

/**
 * AutoStats — Estadísticas automáticas GPS + GTFS (sin inspectores)
 * GET /api/autostats/agencies
 * GET /api/autostats/compliance/:agencyId
 * GET /api/autostats/routes/:agencyId
 * GET /api/autostats/vehicle/:idBus
 */
router.use('/autostats', autoStatsRoutes);

/**
 * FASE 3.5 — Auditoría del poller autónomo para reporte IMM.
 * GET /api/audit/poller-stats   — métricas en vivo del poller
 * GET /api/audit/coverage       — % cobertura temporal por día/agencia
 * GET /api/audit/buses-active   — buses con reporte GPS en ventana de N min
 * GET /api/audit/eta-snapshot   — ETAs más recientes calculados
 */
router.use('/audit', auditRoutes);

/**
 * FASE 4 — Bridge REST genérico para el shim Firestore del frontend.
 * GET    /api/db                       — lista de colecciones permitidas
 * GET    /api/db/:collection           — list (where, orderBy, limit, offset)
 * GET    /api/db/:collection/:id       — getDoc
 * POST   /api/db/:collection           — addDoc / setDoc nuevo
 * PUT    /api/db/:collection/:id       — setDoc / updateDoc (upsert)
 * DELETE /api/db/:collection/:id       — deleteDoc
 */
router.use('/db', dbBridgeRoutes);

export default router;
