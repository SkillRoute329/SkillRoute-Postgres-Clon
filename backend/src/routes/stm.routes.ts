import { Router } from 'express';
import { stmController } from '../controllers/stmController';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

/**
 * RUTAS STM - Semana 10-11
 * Integración con datos públicos STM Uruguay y máquinas 5G
 */

// Todas requieren autenticación
router.use(requireAuth);

/**
 * GET /api/stm/lineas
 * Obtiene todas las líneas del STM (datos públicos)
 * Disponible para todos los usuarios autenticados
 */
router.get(
  '/lineas',
  (req, res) => stmController.getLineas(req, res)
);

/**
 * GET /api/stm/horarios/:numeroLinea
 * Obtiene horarios vigentes de una línea específica
 */
router.get(
  '/horarios/:numeroLinea',
  (req, res) => stmController.getHorarios(req, res)
);

/**
 * POST /api/stm/sincronizar
 * Sincroniza horarios y datos del STM
 * Solo administradores pueden disparar sincronizaciones
 */
router.post(
  '/sincronizar',
  requireRole('admin'),
  (req, res) => stmController.sincronizarHorarios(req, res)
);

/**
 * GET /api/stm/cambios/:numeroLinea
 * Detecta cambios de horarios en una línea
 * Útil para alertas competitivas
 */
router.get(
  '/cambios/:numeroLinea',
  (req, res) => stmController.detectarCambios(req, res)
);

/**
 * POST /api/stm/boletaje-5g
 * Registra transacciones de máquinas 5G dispensadoras
 * Sistema de máquinas 5G envía datos aquí
 */
router.post(
  '/boletaje-5g',
  requireRole('admin', 'system'),
  (req, res) => stmController.registrarBoletaje5G(req, res)
);

/**
 * POST /api/stm/ocupacion-realtime
 * Actualiza conteo de pasajeros desde sensores 5G
 * Stream de datos en tiempo real desde buses
 */
router.post(
  '/ocupacion-realtime',
  requireRole('admin', 'system'),
  (req, res) => stmController.actualizarOcupacion(req, res)
);

/**
 * GET /api/stm/bus-en-vivo/:busId
 * Obtiene datos en vivo de un bus
 * GPS, ubicación, pasajeros, etc.
 */
router.get(
  '/bus-en-vivo/:busId',
  (req, res) => stmController.obtenerBusEnVivo(req, res)
);

/**
 * GET /api/stm/estadisticas/:busId/:fecha
 * Obtiene estadísticas diarias de un bus
 * Incluye ingresos, pasajeros, cumplimiento, ocupación
 */
router.get(
  '/estadisticas/:busId/:fecha',
  (req, res) => stmController.obtenerEstadisticas(req, res)
);

/**
 * GET /api/stm/calidad-datos
 * Calcula la calidad general de datos STM
 * Monitores: % sincronización, máquinas activas, transacciones
 */
router.get(
  '/calidad-datos',
  requireRole('admin', 'manager'),
  (req, res) => stmController.obtenerCalidadDatos(req, res)
);

export default router;
