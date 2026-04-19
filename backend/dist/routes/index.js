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
// Sub-routers (Semanas 4-11)
const competition_routes_1 = __importDefault(require("./competition.routes"));
const analytics_routes_1 = __importDefault(require("./analytics.routes"));
const forecast_routes_1 = __importDefault(require("./forecast.routes"));
const dashboard_routes_1 = __importDefault(require("./dashboard.routes"));
const stm_routes_1 = __importDefault(require("./stm.routes"));
const ai_routes_1 = __importDefault(require("./ai.routes"));
const router = (0, express_1.Router)();
// ─── PÚBLICAS (sin autenticación) ─────────────────────────────────────────
/**
 * POST /api/auth/login
 * Realizar login con internalNumber y contraseña
 */
router.post('/auth/login', (0, validation_1.validateBody)(['internalNumber', 'password']), authController.login);
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
 * GET /api/auth/me
 * Obtener usuario actual autenticado
 */
router.get('/auth/me', auth_1.verifyAuth, authController.getCurrentUser);
// ─── CARTONES ────────────────────────────────────────────────────────────
/**
 * GET /api/cartones
 * Obtener todos los cartones
 */
router.get('/cartones', auth_1.verifyAuth, cartonController.getAllCartones);
/**
 * GET /api/cartones/:id
 * Obtener un cartón específico
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
exports.default = router;
