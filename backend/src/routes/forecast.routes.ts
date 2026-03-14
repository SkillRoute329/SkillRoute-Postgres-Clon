import { Router } from 'express';
import { forecastController } from '../controllers/forecastController';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// Todas las rutas requieren autenticación
router.use(requireAuth);

/**
 * Pronóstico de Ingresos
 * Genera escenarios múltiples de ingresos
 */
router.get(
  '/income/:lineaId',
  requireRole('admin', 'manager'),
  forecastController.getIncomesForecast
);

/**
 * Simulador de Horarios
 * Simula impacto de cambios de horario
 */
router.post(
  '/simulate',
  requireRole('admin', 'manager'),
  forecastController.simulateScheduleChanges
);

/**
 * Demanda por Zona
 * Calcula demanda geográfica
 */
router.get(
  '/demand/:zona',
  requireRole('admin', 'manager'),
  forecastController.getDemandByZone
);

/**
 * Horarios Pico
 * Identifica horarios de alta demanda
 */
router.get(
  '/peak-hours/:lineaId',
  requireRole('admin', 'manager'),
  forecastController.getPeakHours
);

/**
 * Proyección de Crecimiento
 * Proyecta ingresos futuros
 */
router.get(
  '/growth/:lineaId',
  requireRole('admin', 'manager'),
  forecastController.getGrowthProjection
);

/**
 * Benchmark
 * Compara con promedio de zona
 */
router.get(
  '/benchmark/:lineaId',
  requireRole('admin', 'manager'),
  forecastController.getBenchmark
);

/**
 * Pasajeros por Hora
 * Estima pasajeros en horario específico
 */
router.get(
  '/passengers-by-hour/:lineaId',
  requireRole('admin', 'manager'),
  forecastController.getPassengersByHour
);

export default router;
