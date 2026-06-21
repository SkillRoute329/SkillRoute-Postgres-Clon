"use strict";
/**
 * Enrutador principal - Agrupa todas las rutas
 * TransformaFacil 2.0: Centro de Comando Unificado
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
// Middleware
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
// Controllers
const authController = __importStar(require("../controllers/authController"));
const cartonController = __importStar(require("../controllers/cartonController"));
const fleetController = __importStar(require("../controllers/fleetController"));
const systemController = __importStar(require("../controllers/systemController"));
const complianceController = __importStar(require("../controllers/complianceController"));
const positionsController = __importStar(require("../controllers/positionsController"));
const adminPersonalController = __importStar(require("../controllers/adminPersonalController"));
const usersController = __importStar(require("../controllers/usersController"));
const shiftsBalanceController = __importStar(require("../controllers/shiftsBalanceController"));
const tenantsController = __importStar(require("../controllers/tenantsController"));
const configSalarialController = __importStar(require("../controllers/configSalarialController"));
const boletinController = __importStar(require("../controllers/boletinController"));
const intelligenceController = __importStar(require("../controllers/intelligenceController"));
const consequenceController = __importStar(require("../controllers/consequenceController"));
const whatsappController = __importStar(require("../controllers/whatsappController"));
const adminToolsController = __importStar(require("../controllers/adminToolsController"));
const cascadeFeedController = __importStar(require("../controllers/cascadeFeedController"));
const cascadeActionsController = __importStar(require("../controllers/cascadeActionsController"));
const miTurnoController = __importStar(require("../controllers/miTurnoController"));
const operadoresKpiController = __importStar(require("../controllers/operadoresKpiController"));
const motorHealthController = __importStar(require("../controllers/motorHealthController"));
const cumplimientoCocheController = __importStar(require("../controllers/cumplimientoCocheController"));
const alertasMantenimientoController = __importStar(require("../controllers/alertasMantenimientoController"));
// Sub-routers (Semanas 4-11)
const cartones_routes_1 = __importDefault(require("./cartones.routes"));
const competition_routes_1 = __importDefault(require("./competition.routes"));
const analytics_routes_1 = __importDefault(require("./analytics.routes"));
const forecast_routes_1 = __importDefault(require("./forecast.routes"));
const dashboard_routes_1 = __importDefault(require("./dashboard.routes"));
const stm_routes_1 = __importDefault(require("./stm.routes"));
const ai_routes_1 = __importDefault(require("./ai.routes"));
const listero_routes_1 = __importDefault(require("./listero.routes"));
const autoStats_routes_1 = __importDefault(require("./autoStats.routes"));
const gtfs_routes_1 = __importDefault(require("./gtfs.routes"));
const audit_routes_1 = __importDefault(require("./audit.routes"));
const dbBridge_routes_1 = __importDefault(require("./dbBridge.routes"));
const etapaStats_routes_1 = __importDefault(require("./etapaStats.routes"));
const gtfsAuditoria_routes_1 = __importDefault(require("./gtfsAuditoria.routes"));
const stmDemanda_routes_1 = __importDefault(require("./stmDemanda.routes"));
const stmHorarios_routes_1 = __importDefault(require("./stmHorarios.routes"));
const conteoVehicular_routes_1 = __importDefault(require("./conteoVehicular.routes"));
const comando_routes_1 = __importDefault(require("./comando.routes"));
const predictions_routes_1 = __importDefault(require("./predictions.routes"));
const planning_routes_1 = __importDefault(require("./planning.routes"));
const router = (0, express_1.Router)();
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
router.post('/auth/login', (0, validation_1.validateBody)(['internalNumber', 'password']), authController.login);
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
router.use('/gtfs', gtfs_routes_1.default);
/**
 * GET /api/auth/me
 * Obtener usuario actual autenticado
 */
router.get('/auth/me', auth_1.verifyAuth, authController.getCurrentUser);
// ─── CARTONES ────────────────────────────────────────────────────────────
//
// FASE 5.6: el sub-router `cartonesBulkRoutes` se monta PRIMERO para que
// /cartones/bulk, /cartones/count y /cartones/triangulacion tengan prioridad
// sobre la ruta genérica /cartones/:id (que de otra forma captura 'bulk' como
// si fuera un id de cartón y devuelve null/vacío).
router.use('/cartones', cartones_routes_1.default);
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
router.get('/cartones', auth_1.verifyAuth, cartonController.getAllCartones);
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
router.get('/cartones/:id', auth_1.verifyAuth, cartonController.getCartonById);
/**
 * POST /api/cartones
 * Crear o actualizar un cartón
 */
router.post('/cartones', auth_1.verifyAuth, (0, validation_1.validateBody)(['serviceNumber']), cartonController.saveCarton);
/**
 * DELETE /api/cartones/:id
 * Eliminar un cartón
 */
router.delete('/cartones/:id', auth_1.verifyAuth, auth_1.requireAdmin, cartonController.deleteCarton);
// ─── FLOTA ───────────────────────────────────────────────────────────────
/**
 * GET /api/fleet/vehicles
 * Obtener todos los vehículos
 */
router.get('/fleet/vehicles', auth_1.verifyAuth, fleetController.getAllVehicles);
/**
 * GET /api/fleet/vehicles/:id
 * Obtener un vehículo específico
 */
router.get('/fleet/vehicles/:id', auth_1.verifyAuth, fleetController.getVehicleById);
/**
 * POST /api/fleet/check
 * Crear una inspección de vehículo
 */
router.post('/fleet/check', auth_1.verifyAuth, (0, validation_1.validateBody)(['vehicleId']), fleetController.createFleetCheck);
/**
 * GET /api/fleet/vehicles/:id/checks
 * Obtener inspecciones de un vehículo
 */
router.get('/fleet/vehicles/:id/checks', auth_1.verifyAuth, fleetController.getVehicleChecks);
// ─── SEMANA 4-9: INTELIGENCIA COMPETITIVA Y DASHBOARD ──────────────────────
/**
 * Rutas de Análisis de Competencia (Semana 4)
 * GET /api/competition/...
 */
router.use('/competition', competition_routes_1.default);
/**
 * Rutas de Análisis y Validación (Semana 5)
 * GET /api/analytics/...
 */
router.use('/analytics', analytics_routes_1.default);
/**
 * Rutas de Predicción y Pronósticos (Semana 6-7)
 * GET /api/forecast/...
 */
router.use('/forecast', forecast_routes_1.default);
/**
 * Rutas de Dashboard Ejecutivo (Semana 8-9)
 * GET /api/dashboard/...
 */
router.use('/dashboard', dashboard_routes_1.default);
/**
 * Rutas de Integración STM + 5G (Semana 10-11)
 * GET /api/stm/...
 * POST /api/stm/...
 */
router.use('/stm', stm_routes_1.default);
/**
 * Rutas de IA Multi-Modelo
 * POST /api/ai/generate  — local (gemma3, qwen2.5-coder, llama3.1)
 * POST /api/ai/cloud     — Claude API (requiere ANTHROPIC_API_KEY)
 * POST /api/ai/embed     — embeddings vectoriales
 */
router.use('/ai', ai_routes_1.default);
/**
 * Rutas del Módulo Listero — programación diaria, ausencias, cascada operativa
 * POST /api/listero/ausencia    — registrar ausencia + disparar cascada
 * POST /api/listero/reserva     — asignar conductor de reserva
 * POST /api/listero/vehiculo-taller — enviar vehículo a taller + cascada
 * GET  /api/listero/resumen     — resumen del día
 */
router.use('/listero', listero_routes_1.default);
/**
 * AutoStats — Estadísticas automáticas GPS + GTFS (sin inspectores)
 * GET /api/autostats/agencies
 * GET /api/autostats/compliance/:agencyId
 * GET /api/autostats/routes/:agencyId
 * GET /api/autostats/vehicle/:idBus
 */
router.use('/autostats', autoStats_routes_1.default);
/**
 * FASE 3.5 — Auditoría del poller autónomo para reporte IMM.
 * GET /api/audit/poller-stats   — métricas en vivo del poller
 * GET /api/audit/coverage       — % cobertura temporal por día/agencia
 * GET /api/audit/buses-active   — buses con reporte GPS en ventana de N min
 * GET /api/audit/eta-snapshot   — ETAs más recientes calculados
 */
router.use('/audit', audit_routes_1.default);
/**
 * FASE 4.8 — Cumplimiento del Sistema Metropolitano (vista Regulador/Operador)
 *   GET /api/compliance/regulador?empresa=all|70|...&desde&hasta&granularidad
 *   GET /api/compliance/operador?agencyId=70&desde&hasta&granularidad
 */
router.get('/compliance/regulador', auth_1.verifyAuth, complianceController.getRegulatoryData);
router.get('/compliance/operador', auth_1.verifyAuth, complianceController.getOperatorData);
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
router.get('/admin/personal', auth_1.verifyAuth, adminPersonalController.listPersonal);
router.put('/admin/personal/:id', auth_1.verifyAuth, adminPersonalController.updatePersonal);
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
router.get('/users', auth_1.verifyAuth, usersController.listUsers);
router.get('/shifts/balances', auth_1.verifyAuth, shiftsBalanceController.getBalances);
router.get('/shifts/unpaid/:userId', auth_1.verifyAuth, shiftsBalanceController.getUnpaidShifts);
router.post('/shifts/payment', auth_1.verifyAuth, shiftsBalanceController.postPayment);
router.post('/shifts/pay', auth_1.verifyAuth, shiftsBalanceController.postPayAll);
router.get('/tenants', auth_1.verifyAuth, tenantsController.listTenants);
router.post('/tenants', auth_1.verifyAuth, auth_1.requireAdmin, tenantsController.createTenant);
router.get('/admin/config-salarial', auth_1.verifyAuth, configSalarialController.getConfigSalarial);
router.put('/admin/config-salarial/turnos', auth_1.verifyAuth, auth_1.requireAdmin, configSalarialController.putTurnos);
router.put('/admin/config-salarial/descuentos', auth_1.verifyAuth, auth_1.requireAdmin, configSalarialController.putDescuentos);
// FASE 5.32 (2026-05-21): config del motor de consecuencias (tarifas, umbrales,
// cooldowns) editable desde admin sin reinicio.
router.get('/admin/config-motor', auth_1.verifyAuth, configSalarialController.getMotorConfigHandler);
router.put('/admin/config-motor', auth_1.verifyAuth, auth_1.requireAdmin, configSalarialController.putMotorConfigHandler);
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
router.get('/cascade/feed', auth_1.verifyAuth, cascadeFeedController.getCascadeFeed);
// FASE 5.35 (2026-05-22): acciones operativas sobre eventos y cooldowns del motor.
router.post('/cascade/events/:id/atender', auth_1.verifyAuth, cascadeActionsController.atenderEvento);
router.post('/cascade/cooldown/clear', auth_1.verifyAuth, cascadeActionsController.clearCooldown);
// FASE 5.36 (2026-05-22): turno activo del conductor — usado por la vista
// "Mi Línea" para saber qué línea y coche está cubriendo el chofer hoy.
router.get('/mi-turno', auth_1.verifyAuth, miTurnoController.getMiTurno);
// FASE 5.36 (2026-05-22): KPIs comparativos por operador para presentar a IMM.
router.get('/operadores/kpis', auth_1.verifyAuth, operadoresKpiController.getOperadoresKpis);
// FASE 5.37 (2026-05-22): salud del motor de consecuencias (telemetría propia).
router.get('/motor/health', auth_1.verifyAuth, motorHealthController.getMotorHealth);
// FASE 5.38 (2026-05-22): detalle de cumplimiento por coche+fecha.
// Resuelve el "marca atrasos sin decir cuándo en qué línea" del Panel.
router.get('/cumplimiento/coche/:idBus/eventos', auth_1.verifyAuth, cumplimientoCocheController.getCocheEventos);
// FASE 5.38 (2026-05-22): purga manual de alertas viejas sin atender.
router.post('/cascade/alertas/purgar', auth_1.verifyAuth, auth_1.requireAdmin, alertasMantenimientoController.purgarAlertasViejas);
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
router.get('/whatsapp/status', auth_1.verifyAuth, whatsappController.getWhatsappStatus);
router.post('/whatsapp/restart', auth_1.verifyAuth, auth_1.requireAdmin, whatsappController.postWhatsappRestart);
router.post('/admin/:which(seed-[a-z-]+)', auth_1.verifyAuth, auth_1.requireAdmin, adminToolsController.postSeedLegacy);
router.put('/system-config', auth_1.verifyAuth, auth_1.requireAdmin, adminToolsController.putSystemConfig);
router.post('/emergency/wipe-all', auth_1.verifyAuth, auth_1.requireAdmin, adminToolsController.postEmergencyWipeAll);
router.get('/debug/force-seed', auth_1.verifyAuth, auth_1.requireAdmin, adminToolsController.getDebugForceSeed);
router.get('/simulation/report', auth_1.verifyAuth, adminToolsController.getSimulationReport);
router.post('/simulation/reset', auth_1.verifyAuth, auth_1.requireAdmin, adminToolsController.postSimulationReset);
router.get('/data-import/template', auth_1.verifyAuth, adminToolsController.getDataImportTemplate);
// FASE 5.14: gtfsAuditoriaRoutes monta /db/gtfs_timetable/:id y
// /db/gtfs_stops/:id. Va ANTES de dbBridgeRoutes para que esas rutas
// especificas tomen precedencia sobre el handler generico /db/:collection/:id.
router.use('/', gtfsAuditoria_routes_1.default);
router.use('/db', dbBridge_routes_1.default);
router.use('/etapa-stats', etapaStats_routes_1.default);
router.use('/stm-demanda', stmDemanda_routes_1.default);
router.use('/stm-horarios', stmHorarios_routes_1.default);
router.use('/conteo-vehicular', conteoVehicular_routes_1.default);
router.use('/comando', comando_routes_1.default);
router.use('/predictions', predictions_routes_1.default);
router.use('/planning', planning_routes_1.default);
/**
 * FASE 5 (2026-05-13) — Stubs honestos para CEODashboardV7 que consume
 * /historicOtp y /historicBunching (antes Cloud Functions). El cálculo
 * real desde vehicle_events está pendiente. Mientras tanto devolvemos
 * series vacías para que la pantalla no rompa con HTTP 502.
 */
router.get('/historic/otp', auth_1.verifyAuth, (_req, res) => {
    res.json({ ok: true, series: [], mensaje: 'Histórico OTP pendiente de cómputo agregado desde vehicle_events.' });
});
router.get('/historic/bunching', auth_1.verifyAuth, (_req, res) => {
    res.json({ ok: true, series: [], mensaje: 'Histórico bunching pendiente de cómputo agregado desde vehicle_events.' });
});
// FASE 5.28 (2026-05-19): legacy Cloud Function MarketPenetration consume
// /penetrationHistoric. Stub honesto hasta tener el cómputo agregado.
router.get('/historic/penetration', auth_1.verifyAuth, (_req, res) => {
    res.json({ ok: true, series: [], mensaje: 'Penetración histórica pendiente de cómputo agregado cross-operador.' });
});
exports.default = router;
