"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dashboardController_1 = require("../controllers/dashboardController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Todas las rutas requieren autenticación
router.use(auth_1.requireAuth);
/**
 * Dashboard Ejecutivo Completo
 * Retorna todos los datos: métricas, líneas, alertas, recomendaciones, proyecciones
 */
router.get('/executive/:operador', (0, auth_1.requireRole)('admin', 'manager'), (req, res) => dashboardController_1.dashboardController.getExecutiveDashboard(req, res));
/**
 * Métricas Principales
 * Carga rápida de KPIs e indicadores clave
 */
router.get('/metricas/:operador', (0, auth_1.requireRole)('admin', 'manager'), (req, res) => dashboardController_1.dashboardController.getMetricas(req, res));
/**
 * Estado de Líneas
 * Obtiene estado operativo de todas las líneas
 */
router.get('/lineas/:operador', (0, auth_1.requireRole)('admin', 'manager'), (req, res) => dashboardController_1.dashboardController.getLineas(req, res));
/**
 * Alertas Críticas
 * Filtra y retorna alertas por severidad
 */
router.get('/alertas/:operador', (0, auth_1.requireRole)('admin', 'manager'), (req, res) => dashboardController_1.dashboardController.getAlertas(req, res));
/**
 * Recomendaciones Ejecutivas
 * Retorna recomendaciones ordenadas por urgencia e impacto
 */
router.get('/recomendaciones/:operador', (0, auth_1.requireRole)('admin', 'manager'), (req, res) => dashboardController_1.dashboardController.getRecomendaciones(req, res));
/**
 * Salud Operacional
 * Calcula índice general y estado (excelente/bueno/regular/crítico)
 */
router.get('/salud/:operador', (0, auth_1.requireRole)('admin', 'manager'), (req, res) => dashboardController_1.dashboardController.getSalud(req, res));
/**
 * Proyecciones de Ingresos
 * Retorna pronósticos para este mes, próximo mes y próximos 3 meses
 */
router.get('/proyecciones/:operador', (0, auth_1.requireRole)('admin', 'manager'), (req, res) => dashboardController_1.dashboardController.getProyecciones(req, res));
/**
 * Resumen Ejecutivo
 * Retorna resumen en texto para reportes
 */
router.get('/resumen/:operador', (0, auth_1.requireRole)('admin', 'manager'), (req, res) => dashboardController_1.dashboardController.getResumen(req, res));
exports.default = router;
