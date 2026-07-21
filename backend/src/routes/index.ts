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
import * as complianceController from '../controllers/complianceController';
import * as positionsController from '../controllers/positionsController';
import * as adminPersonalController from '../controllers/adminPersonalController';
import * as usersController from '../controllers/usersController';
import * as shiftsBalanceController from '../controllers/shiftsBalanceController';
import * as tenantsController from '../controllers/tenantsController';
import * as configSalarialController from '../controllers/configSalarialController';
import * as boletinController from '../controllers/boletinController';
import * as intelligenceController from '../controllers/intelligenceController';
import * as consequenceController from '../controllers/consequenceController';
import * as whatsappController from '../controllers/whatsappController';
import * as adminToolsController from '../controllers/adminToolsController';
import * as cascadeFeedController from '../controllers/cascadeFeedController';
import * as cascadeActionsController from '../controllers/cascadeActionsController';
import * as miTurnoController from '../controllers/miTurnoController';
import * as operadoresKpiController from '../controllers/operadoresKpiController';
import * as motorHealthController from '../controllers/motorHealthController';
import * as cumplimientoCocheController from '../controllers/cumplimientoCocheController';
import * as alertasMantenimientoController from '../controllers/alertasMantenimientoController';

// Sub-routers (Semanas 4-11)
import cartonesBulkRoutes from './cartones.routes';
import competitionRoutes from './competition.routes';
import analyticsRoutes from './analytics.routes';
import forecastRoutes from './forecast.routes';
import dashboardRoutes from './dashboard.routes';
import stmRoutes from './stm.routes';
import aiRoutes from './ai.routes';
import listeroRoutes from './listero.routes';
import autoStatsRoutes from './autoStats.routes';
import { gtfsRoutes } from '../modules/gtfs-core';
import auditRoutes from './audit.routes';
import dbBridgeRoutes from './dbBridge.routes';
import etapaStatsRoutes from './etapaStats.routes';
import gtfsAuditoriaRoutes from './gtfsAuditoria.routes';
import stmDemandaRoutes from './stmDemanda.routes';
import stmHorariosRoutes from './stmHorarios.routes';
import conteoVehicularRoutes from './conteoVehicular.routes';
import comandoRoutes from './comando.routes';
import predictionsRoutes from './predictions.routes';
import planningRoutes from './planning.routes';
import storageRoutes from './storage.routes';
import inteligenciaRouter from './intelligenceRoutes';
import brtRoutes from './brt.routes';

const router = Router();

// ─── PÚBLICAS (sin autenticación) ─────────────────────────────────────────

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Iniciar sesión de usuario
 *     description: Permite a los empleados (conductores, inspectores, administradores) iniciar sesión en el sistema usando su número de interno y contraseña.
 *     tags:
 *       - Autenticación
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - internalNumber
 *               - password
 *             properties:
 *               internalNumber:
 *                 type: string
 *                 description: Número interno único del empleado (ej. "329")
 *               password:
 *                 type: string
 *                 description: Contraseña de acceso
 *     responses:
 *       200:
 *         description: Login exitoso, devuelve el token JWT
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                       description: Token JWT para autorización Bearer
 *                     user:
 *                       type: object
 *       400:
 *         description: Faltan campos requeridos
 *       401:
 *         description: Credenciales incorrectas
 */
router.post('/auth/login', validateBody(['internalNumber', 'password']), authController.login);

/**
 * @openapi
 * /api/doctor:
 *   get:
 *     summary: Diagnóstico del sistema
 *     description: Endpoint público de auditoría que evalúa el estado del backend, conectividad con base de datos PostgreSQL local y conteo de vehículos/schedules.
 *     tags:
 *       - Sistema
 *     responses:
 *       200:
 *         description: Diagnóstico detallado del sistema
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 data:
 *                   type: object
 */
router.get('/doctor', systemController.systemDoctor);

/**
 * @openapi
 * /api/health:
 *   get:
 *     summary: Health check
 *     description: Comprobación de estado rápida del servidor.
 *     tags:
 *       - Sistema
 *     responses:
 *       200:
 *         description: El servidor responde correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: OK
 */
router.get('/health', systemController.healthCheck);

/**
 * @openapi
 * /api/version:
 *   get:
 *     summary: Obtener versión
 *     description: Retorna los detalles de versión y entorno actual del backend.
 *     tags:
 *       - Sistema
 *     responses:
 *       200:
 *         description: Datos de versión del sistema
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
//
// FASE 5.6: el sub-router `cartonesBulkRoutes` se monta PRIMERO para que
// /cartones/bulk, /cartones/count y /cartones/triangulacion tengan prioridad
// sobre la ruta genérica /cartones/:id (que de otra forma captura 'bulk' como
// si fuera un id de cartón y devuelve null/vacío).
router.use('/cartones', cartonesBulkRoutes);

/**
 * @openapi
 * /api/cartones:
 *   get:
 *     summary: Obtener cartones de servicio
 *     description: Lista todos los cartones de servicio cargados (requiere autenticación JWT).
 *     tags:
 *       - Cartones
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de cartones cargados
 *       401:
 *         description: No autorizado (Token faltante o inválido)
 */
router.get('/cartones', verifyAuth, cartonController.getAllCartones);

/**
 * @openapi
 * /api/cartones/{id}:
 *   get:
 *     summary: Obtener un cartón por ID
 *     description: Retorna los detalles de un cartón específico (requiere autenticación JWT).
 *     tags:
 *       - Cartones
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Identificador del cartón
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Datos del cartón encontrado
 *       404:
 *         description: Cartón no encontrado
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
 * FASE 4.8 — Cumplimiento del Sistema Metropolitano (vista Regulador/Operador)
 *   GET /api/compliance/regulador?empresa=all|70|...&desde&hasta&granularidad
 *   GET /api/compliance/operador?agencyId=70&desde&hasta&granularidad
 */
router.get('/compliance/regulador', verifyAuth, complianceController.getRegulatoryData);
router.get('/compliance/operador',  verifyAuth, complianceController.getOperatorData);

/**
 * FASE 4 — Bridge REST genérico para el shim Firestore del frontend.
 * GET    /api/db                       — lista de colecciones permitidas
 * GET    /api/db/:collection           — list (where, orderBy, limit, offset)
 * GET    /api/db/:collection/:id       — getDoc
 * POST   /api/db/:collection           — addDoc / setDoc nuevo
 * PUT    /api/db/:collection/:id       — setDoc / updateDoc (upsert)
 * DELETE /api/db/:collection/:id       — deleteDoc
 */
/**
 * FASE 5.27 (2026-05-19) — Posiciones GPS de los 4 operadores en vivo.
 * Lee bus_last_pos (poller IMM). Antes era 404, devuelve filas reales.
 *
 * IMPORTANTE: estas rutas se registran ANTES del montaje
 * `router.use('/', gtfsAuditoriaRoutes)` porque ese sub-router aplica
 * `verifyAuth` global a TODA request que entra a su mount-point '/', lo
 * que mata el flujo si /positions queda detrás. Y el frontend
 * (CEODashboardV7, FleetMonitorModule, CUTCSAFleetDashboard,
 * DistribucionDiaria, CEODashboard) llama con `fetch('/api/positions')`
 * sin Authorization header.
 *
 *   GET /api/positions          — todos los operadores (~2347 buses vivos)
 *   GET /api/positions/cutcsa   — solo CUTCSA (agency_id=50)
 */
router.get('/positions/cutcsa', positionsController.getCutcsaPositions);
router.get('/positions', positionsController.getAllPositions);

/**
 * FASE 5.27 (2026-05-19) — /api/admin/personal.
 * Antes devolvía 404 (PersonalUcot.tsx, AdminRRHH.tsx). Ahora lee la tabla
 * `personal` (879 registros UCOT) con paginación y filtros.
 */
router.get('/admin/personal', verifyAuth, adminPersonalController.listPersonal);
router.get('/admin/personal/:id/legajo', verifyAuth, adminPersonalController.getDetalleLaboralEmpleado);
router.put('/admin/personal/:id', verifyAuth, adminPersonalController.updatePersonal);

/**
 * FASE 5.28 (2026-05-19) — Pase 2 de cierre de auditoría.
 *
 * /api/users                          → lista users (AdminWhatsApp, Employees)
 * /api/shifts/balances                → balance global + por usuario (AdminBalances)
 * /api/shifts/unpaid/:userId          → turnos no pagados de un usuario
 * /api/shifts/payment                 → registra pago/cobro parcial
 * /api/shifts/pay                     → salda balance total
 * /api/tenants                        → lista empresas (TenantsManager)
 * /api/admin/config-salarial          → turnos + descuentos (ConfigSalarialTab)
 */
router.get('/users', verifyAuth, usersController.listUsers);

router.get('/shifts/balance-oficial', verifyAuth, shiftsBalanceController.getBalanceOficialConductor);

// Módulo 10 — Alertas de Tráfico Vacante (Escenario Falla 1: Quiebre de Retenes)
router.get('/traffic-alerts', verifyAuth, async (req, res) => {
  try {
    const sqlDb = (await import('../config/database')).default;
    const user = (req as any).user;
    const agencyId = user?.agency_id;
    if (!agencyId) { res.status(401).json({ ok: false }); return; }
    const resuelta = req.query.resuelta === 'true';
    const rows = await sqlDb('traffic_alerts')
      .where('agency_id', agencyId)
      .where('resuelta', resuelta)
      .orderBy('created_at', 'desc')
      .limit(50);
    res.json({ ok: true, alertas: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});
router.patch('/traffic-alerts/:id/resolver', verifyAuth, async (req, res) => {
  try {
    const sqlDb = (await import('../config/database')).default;
    const user = (req as any).user;
    const agencyId = user?.agency_id;
    if (!agencyId) { res.status(401).json({ ok: false }); return; }
    await sqlDb('traffic_alerts')
      .where('id', req.params.id)
      .where('agency_id', agencyId)
      .update({ resuelta: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});


router.get('/tenants', verifyAuth, tenantsController.listTenants);
router.post('/tenants', verifyAuth, requireAdmin, tenantsController.createTenant);

router.get('/admin/config-salarial', verifyAuth, configSalarialController.getConfigSalarial);
router.put('/admin/config-salarial/turnos', verifyAuth, requireAdmin, configSalarialController.putTurnos);
router.put('/admin/config-salarial/descuentos', verifyAuth, requireAdmin, configSalarialController.putDescuentos);

// FASE 5.32 (2026-05-21): config del motor de consecuencias (tarifas, umbrales,
// cooldowns) editable desde admin sin reinicio.
router.get('/admin/config-motor', verifyAuth, configSalarialController.getMotorConfigHandler);
router.put('/admin/config-motor', verifyAuth, requireAdmin, configSalarialController.putMotorConfigHandler);

/**
 * FASE 5.28 (2026-05-19) — Boletines de inspección, rotación, inteligencia
 * por línea y motor de consecuencias (la columna vertebral de propagación
 * del cometido de interconexión).
 *
 * /api/boletin/:linea          → matriz paradas × pases desde schedule_index IMM
 * /api/boletin-verano/:linea   → mismo shape pero desde XLS oficial UCOT
 * /api/rotacion/:fecha         → coches por servicio del día (cartones_historial)
 * /api/inteligencia/:linea     → briefing en vivo de la línea (bus_last_pos)
 * /api/consequencePreview      → motor de consecuencias (simulación)
 */
router.get('/boletin/:linea', boletinController.getBoletin);
router.get('/boletin-verano/:linea', boletinController.getBoletinVerano);
router.get('/rotacion/:fecha', intelligenceController.getRotacionDiaria);
router.get('/inteligencia/:linea', intelligenceController.getInteligenciaPorLinea);
router.post('/consequencePreview', consequenceController.postConsequencePreview);

/**
 * FASE 5.31 (2026-05-21) — Historial del bus de propagación.
 * Lo consume el widget PropagacionLive al montar para arrancar con los
 * últimos eventos en lugar de empezar vacío.
 *
 *   GET /api/cascade/feed?since=<ISO>&limit=N
 */
router.get('/cascade/feed', verifyAuth, cascadeFeedController.getCascadeFeed);

// FASE 5.35 (2026-05-22): acciones operativas sobre eventos y cooldowns del motor.
router.post('/cascade/events/:id/atender', verifyAuth, cascadeActionsController.atenderEvento);
router.post('/cascade/cooldown/clear', verifyAuth, cascadeActionsController.clearCooldown);

// FASE 5.36 (2026-05-22): turno activo del conductor — usado por la vista
// "Mi Línea" para saber qué línea y coche está cubriendo el chofer hoy.
router.get('/mi-turno', verifyAuth, miTurnoController.getMiTurno);

// FASE 5.36 (2026-05-22): KPIs comparativos por operador para presentar a IMM.
router.get('/operadores/kpis', verifyAuth, operadoresKpiController.getOperadoresKpis);

// FASE 5.37 (2026-05-22): salud del motor de consecuencias (telemetría propia).
router.get('/motor/health', verifyAuth, motorHealthController.getMotorHealth);

// FASE 5.38 (2026-05-22): detalle de cumplimiento por coche+fecha.
// Resuelve el "marca atrasos sin decir cuándo en qué línea" del Panel.
router.get('/cumplimiento/coche/:idBus/eventos', verifyAuth, cumplimientoCocheController.getCocheEventos);

// FASE 5.38 (2026-05-22): purga manual de alertas viejas sin atender.
router.post('/cascade/alertas/purgar', verifyAuth, requireAdmin, alertasMantenimientoController.purgarAlertasViejas);

/**
 * FASE 5.28 (2026-05-19) — WhatsApp, admin tools y endpoints menores.
 *
 *   /api/whatsapp/{status,restart}    → estado WA (stub honesto si no integrado)
 *   /api/admin/seed-*                 → validan estado de seeds legacy (sin re-cargar)
 *   /api/system-config (PUT)          → guarda config global en system_config
 *   /api/emergency/wipe-all           → DESHABILITADO (seguridad)
 *   /api/debug/force-seed             → DESHABILITADO
 *   /api/simulation/{report,reset}    → vacío honesto
 *   /api/data-import/template         → CSV plantilla empleados
 */
router.get('/whatsapp/status', verifyAuth, whatsappController.getWhatsappStatus);
router.post('/whatsapp/restart', verifyAuth, requireAdmin, whatsappController.postWhatsappRestart);

router.post('/admin/:which(seed-[a-z-]+)', verifyAuth, requireAdmin, adminToolsController.postSeedLegacy);
router.put('/system-config', verifyAuth, requireAdmin, adminToolsController.putSystemConfig);
router.post('/emergency/wipe-all', verifyAuth, requireAdmin, adminToolsController.postEmergencyWipeAll);
router.get('/debug/force-seed', verifyAuth, requireAdmin, adminToolsController.getDebugForceSeed);
router.get('/simulation/report', verifyAuth, adminToolsController.getSimulationReport);
router.post('/simulation/reset', verifyAuth, requireAdmin, adminToolsController.postSimulationReset);
router.get('/data-import/template', verifyAuth, adminToolsController.getDataImportTemplate);

// FASE 5.14: gtfsAuditoriaRoutes monta /db/gtfs_timetable/:id y
// /db/gtfs_stops/:id. Va ANTES de dbBridgeRoutes para que esas rutas
// especificas tomen precedencia sobre el handler generico /db/:collection/:id.
router.use('/', gtfsAuditoriaRoutes);
router.use('/db', dbBridgeRoutes);
router.use('/etapa-stats', etapaStatsRoutes);
router.use('/stm-demanda', stmDemandaRoutes);
router.use('/stm-horarios', stmHorariosRoutes);
router.use('/conteo-vehicular', conteoVehicularRoutes);
router.use('/comando', comandoRoutes);
router.use('/predictions', predictionsRoutes);
router.use('/planning', planningRoutes);
// FASE 5: Storage
router.use('/storage', storageRoutes);

// FASE 7: Inteligencia Competitiva
router.use('/intelligence', verifyAuth, inteligenciaRouter);

// BRT Module
router.use('/brt', brtRoutes);

/**
 * FASE 5 (2026-05-13) — Stubs honestos para CEODashboardV7 que consume
 * /historicOtp y /historicBunching (antes Cloud Functions). El cálculo
 * real desde vehicle_events está pendiente. Mientras tanto devolvemos
 * series vacías para que la pantalla no rompa con HTTP 502.
 */
router.get('/historic/otp', verifyAuth, (_req, res) => {
  res.json({ ok: true, series: [], mensaje: 'Histórico OTP pendiente de cómputo agregado desde vehicle_events.' });
});
router.get('/historic/bunching', verifyAuth, (_req, res) => {
  res.json({ ok: true, series: [], mensaje: 'Histórico bunching pendiente de cómputo agregado desde vehicle_events.' });
});
// FASE 5.28 (2026-05-19): legacy Cloud Function MarketPenetration consume
// /penetrationHistoric. Stub honesto hasta tener el cómputo agregado.
router.get('/historic/penetration', verifyAuth, (_req, res) => {
  res.json({ ok: true, series: [], mensaje: 'Penetración histórica pendiente de cómputo agregado cross-operador.' });
});

export default router;
