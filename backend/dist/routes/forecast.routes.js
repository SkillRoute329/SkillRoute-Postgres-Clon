"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const forecastController_1 = require("../controllers/forecastController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Todas las rutas requieren autenticación
router.use(auth_1.requireAuth);
/**
 * Pronóstico de Ingresos
 * Genera escenarios múltiples de ingresos
 */
router.get('/income/:lineaId', (0, auth_1.requireRole)('admin', 'manager'), forecastController_1.forecastController.getIncomesForecast);
/**
 * Simulador de Horarios
 * Simula impacto de cambios de horario
 */
router.post('/simulate', (0, auth_1.requireRole)('admin', 'manager'), forecastController_1.forecastController.simulateScheduleChanges);
/**
 * Demanda por Zona
 * Calcula demanda geográfica
 */
router.get('/demand/:zona', (0, auth_1.requireRole)('admin', 'manager'), forecastController_1.forecastController.getDemandByZone);
/**
 * Horarios Pico
 * Identifica horarios de alta demanda
 */
router.get('/peak-hours/:lineaId', (0, auth_1.requireRole)('admin', 'manager'), forecastController_1.forecastController.getPeakHours);
/**
 * Proyección de Crecimiento
 * Proyecta ingresos futuros
 */
router.get('/growth/:lineaId', (0, auth_1.requireRole)('admin', 'manager'), forecastController_1.forecastController.getGrowthProjection);
/**
 * Benchmark
 * Compara con promedio de zona
 */
router.get('/benchmark/:lineaId', (0, auth_1.requireRole)('admin', 'manager'), forecastController_1.forecastController.getBenchmark);
/**
 * Pasajeros por Hora
 * Estima pasajeros en horario específico
 */
router.get('/passengers-by-hour/:lineaId', (0, auth_1.requireRole)('admin', 'manager'), forecastController_1.forecastController.getPassengersByHour);
exports.default = router;
