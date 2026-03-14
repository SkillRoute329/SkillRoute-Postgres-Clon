import { Router } from 'express';
import { competitionController } from '../controllers/competitionController';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// Todas las rutas requieren autenticación
router.use(requireAuth);

/**
 * Análisis de Sobreposición
 * Obtiene líneas de competencia que se superponen con una línea UCOT
 */
router.get(
  '/overlap/:lineaId',
  requireRole('admin', 'manager'),
  competitionController.getOverlapAnalysis
);

/**
 * Detección de Conflictos
 * Identifica conflictos de horarios
 */
router.get(
  '/conflicts/:lineaId',
  requireRole('admin', 'manager'),
  competitionController.getConflicts
);

/**
 * Ingesta de Datos de Competencia
 * Permite ingresar manualmente horarios de competencia
 */
router.post(
  '/ingress',
  requireRole('admin'),
  competitionController.ingressCompetitorData
);

/**
 * Análisis Completo de Competitividad
 * Análisis integral de una línea vs competencia
 */
router.get(
  '/analysis/:lineaId',
  requireRole('admin', 'manager'),
  competitionController.getCompetitivityAnalysis
);

/**
 * Reporte de Competencia
 * Reporte mensual/semanal/diario
 */
router.get(
  '/report',
  requireRole('admin', 'manager'),
  competitionController.getCompetitionReport
);

/**
 * Amenazas Principales
 * Líneas en mayor riesgo
 */
router.get(
  '/threats',
  requireRole('admin', 'manager'),
  competitionController.getMainThreats
);

/**
 * Recomendaciones por Línea
 * Acciones sugeridas para una línea específica
 */
router.get(
  '/recommendations/:lineaId',
  requireRole('admin', 'manager'),
  competitionController.getRecommendations
);

export default router;
