import { Router } from 'express';
import { stmController } from '../controllers/stmController';
import {
  fetchLineCatalog,
  fetchLineSchedule,
  TipoDia,
} from '../services/stmHorariosScraperService';
import { requireAuth, requireRole } from '../middleware/auth';
import { logger } from '../config/logger';

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

/**
 * GET /api/stm/scraper/lineas
 * Catálogo en vivo de líneas desde stm/horarios (PrimeFaces JSF).
 * Devuelve los ~140 números de línea reales, no la lista cacheada/local.
 */
router.get(
  '/scraper/lineas',
  requireRole('admin', 'manager'),
  async (_req, res) => {
    try {
      const catalogo = await fetchLineCatalog();
      res.json({
        success: true,
        total: catalogo.length,
        lineas: catalogo.map((l) => l.numero),
      });
    } catch (err: any) {
      logger.error(`[stm/scraper/lineas] ${err?.message}`);
      res.status(502).json({ success: false, error: err?.message ?? String(err) });
    }
  }
);

/**
 * GET /api/stm/scraper/horarios/:linea
 * Scrape en vivo del horario REAL de una línea específica.
 * Query: ?tipoDia=Ahora|Hábiles|Sábados|Domingos (default: Hábiles)
 *
 * Ejemplo: GET /api/stm/scraper/horarios/300?tipoDia=Hábiles
 *   → 12 variantes (pares O→D), 223 salidas total para la 300.
 */
router.get(
  '/scraper/horarios/:linea',
  requireRole('admin', 'manager'),
  async (req, res) => {
    try {
      const linea = req.params.linea;
      if (!linea) {
        res.status(400).json({ success: false, error: 'Falta parámetro :linea' });
        return;
      }
      const tipoDiaQ = (req.query.tipoDia as string) ?? 'Hábiles';
      const valid: TipoDia[] = ['Ahora', 'Hábiles', 'Sábados', 'Domingos'];
      if (!valid.includes(tipoDiaQ as TipoDia)) {
        res.status(400).json({
          success: false,
          error: `tipoDia inválido. Valores permitidos: ${valid.join(', ')}`,
        });
        return;
      }
      const data = await fetchLineSchedule(linea, tipoDiaQ as TipoDia);
      res.json({ success: true, data });
    } catch (err: any) {
      logger.error(`[stm/scraper/horarios] ${err?.message}`);
      res.status(502).json({ success: false, error: err?.message ?? String(err) });
    }
  }
);

export default router;
