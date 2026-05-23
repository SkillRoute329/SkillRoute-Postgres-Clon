"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const competitionController_1 = require("../controllers/competitionController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Todas las rutas requieren autenticación
router.use(auth_1.requireAuth);
/**
 * Análisis de Sobreposición
 * Obtiene líneas de competencia que se superponen con una línea UCOT
 */
router.get('/overlap/:lineaId', (0, auth_1.requireRole)('admin', 'manager'), competitionController_1.competitionController.getOverlapAnalysis);
/**
 * Detección de Conflictos
 * Identifica conflictos de horarios
 */
router.get('/conflicts/:lineaId', (0, auth_1.requireRole)('admin', 'manager'), competitionController_1.competitionController.getConflicts);
/**
 * Ingesta de Datos de Competencia
 * Permite ingresar manualmente horarios de competencia
 */
router.post('/ingress', (0, auth_1.requireRole)('admin'), competitionController_1.competitionController.ingressCompetitorData);
/**
 * Análisis Completo de Competitividad
 * Análisis integral de una línea vs competencia
 */
router.get('/analysis/:lineaId', (0, auth_1.requireRole)('admin', 'manager'), competitionController_1.competitionController.getCompetitivityAnalysis);
/**
 * Reporte de Competencia
 * Reporte mensual/semanal/diario
 */
router.get('/report', (0, auth_1.requireRole)('admin', 'manager'), competitionController_1.competitionController.getCompetitionReport);
/**
 * Amenazas Principales
 * Líneas en mayor riesgo
 */
router.get('/threats', (0, auth_1.requireRole)('admin', 'manager'), competitionController_1.competitionController.getMainThreats);
/**
 * Recomendaciones por Línea
 * Acciones sugeridas para una línea específica
 */
router.get('/recommendations/:lineaId', (0, auth_1.requireRole)('admin', 'manager'), competitionController_1.competitionController.getRecommendations);
/**
 * Sync desde STM en vivo
 * Pulls GPS público de IMM, agrega por empresa y upsert en `competidores`.
 */
router.post('/sync-from-stm', (0, auth_1.requireRole)('admin'), competitionController_1.competitionController.syncFromSTM);
/**
 * Enriquecimiento de horarios reales por competidor.
 * Scrapea stm/horarios para cada línea del competidor y popula
 * `lineas[].horarios` y `lineas[].frecuencia` con datos reales.
 * Operación pesada (~5 round-trips × ~400ms × N líneas).
 */
router.post('/enrich-horarios/:competidorId', (0, auth_1.requireRole)('admin'), competitionController_1.competitionController.enrichCompetidorHorarios);
exports.default = router;
