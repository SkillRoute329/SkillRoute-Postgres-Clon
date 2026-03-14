import { Router } from 'express';
import { dashboardController } from '../controllers/dashboardController';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// Todas las rutas requieren autenticación
router.use(requireAuth);

/**
 * Dashboard Ejecutivo Completo
 * Retorna todos los datos: métricas, líneas, alertas, recomendaciones, proyecciones
 */
router.get(
  '/executive/:operador',
  requireRole('admin', 'manager'),
  (req, res) => dashboardController.getExecutiveDashboard(req, res)
);

/**
 * Métricas Principales
 * Carga rápida de KPIs e indicadores clave
 */
router.get(
  '/metricas/:operador',
  requireRole('admin', 'manager'),
  (req, res) => dashboardController.getMetricas(req, res)
);

/**
 * Estado de Líneas
 * Obtiene estado operativo de todas las líneas
 */
router.get(
  '/lineas/:operador',
  requireRole('admin', 'manager'),
  (req, res) => dashboardController.getLineas(req, res)
);

/**
 * Alertas Críticas
 * Filtra y retorna alertas por severidad
 */
router.get(
  '/alertas/:operador',
  requireRole('admin', 'manager'),
  (req, res) => dashboardController.getAlertas(req, res)
);

/**
 * Recomendaciones Ejecutivas
 * Retorna recomendaciones ordenadas por urgencia e impacto
 */
router.get(
  '/recomendaciones/:operador',
  requireRole('admin', 'manager'),
  (req, res) => dashboardController.getRecomendaciones(req, res)
);

/**
 * Salud Operacional
 * Calcula índice general y estado (excelente/bueno/regular/crítico)
 */
router.get(
  '/salud/:operador',
  requireRole('admin', 'manager'),
  (req, res) => dashboardController.getSalud(req, res)
);

/**
 * Proyecciones de Ingresos
 * Retorna pronósticos para este mes, próximo mes y próximos 3 meses
 */
router.get(
  '/proyecciones/:operador',
  requireRole('admin', 'manager'),
  (req, res) => dashboardController.getProyecciones(req, res)
);

/**
 * Resumen Ejecutivo
 * Retorna resumen en texto para reportes
 */
router.get(
  '/resumen/:operador',
  requireRole('admin', 'manager'),
  (req, res) => dashboardController.getResumen(req, res)
);

export default router;
