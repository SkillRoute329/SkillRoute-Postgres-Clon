import { Router } from 'express';
import { gtfsService } from '../services/gtfsService';
import { requireAuth } from '../middleware/auth';
import { logger } from '../config/logger';

const router = Router();

// Requiere autenticación soberana
router.use(requireAuth);

/**
 * GET /api/gtfs/stops
 * Retorna la lista maestra de paradas. Cacheable en el cliente.
 */
router.get('/stops', async (req, res) => {
  try {
    const stops = await gtfsService.getAllStops();
    res.json({ success: true, count: stops.length, data: stops });
  } catch (err: any) {
    logger.error(`[GTFS Route] Error listing stops: ${err.message}`);
    res.status(500).json({ success: false, error: 'Error fetching stops data' });
  }
});

/**
 * GET /api/gtfs/stops/:stopId/departures
 * Retorna las próximas llegadas teóricas a una parada.
 */
router.get('/stops/:stopId/departures', async (req, res) => {
  try {
    const { stopId } = req.params;
    const departures = await gtfsService.getNextDepartures(stopId);
    res.json({ success: true, count: departures.length, data: departures });
  } catch (err: any) {
    logger.error(`[GTFS Route] Error fetching departures for stop ${req.params.stopId}: ${err.message}`);
    res.status(500).json({ success: false, error: 'Error calculating schedule adherence' });
  }
});

/**
 * GET /api/gtfs/shapes/:id
 * Retorna array de coordenadas [lat, lon] ordenadas
 */
router.get('/shapes/:shapeId', async (req, res) => {
  try {
    const { shapeId } = req.params;
    const points = await gtfsService.getShape(shapeId);
    res.json({ success: true, count: points.length, data: points });
  } catch (err: any) {
    logger.error(`[GTFS Route] Error getting shape: ${err.message}`);
    res.status(500).json({ success: false, error: 'Error fetching shape geometry' });
  }
});

/**
 * GET /api/gtfs/timetable
 * Parámetros query: serviceType=HABIL|SABADO|DOMINGO, agencyId=70
 */
router.get('/timetable', async (req, res) => {
  try {
    const { serviceType, agencyId } = req.query;
    if (!serviceType || !agencyId) {
      return res.status(400).json({ success: false, error: 'Faltan serviceType y agencyId' });
    }
    const data = await gtfsService.getDailyTimetable(serviceType as any, agencyId as string);
    res.json({ success: true, count: data.length, data });
  } catch (err: any) {
    logger.error(`[GTFS Route] Error generating timetable: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/gtfs/timetable/single
 * Trae el horario detallado de solo una línea (IDA o VUELTA) para comparativa rápida.
 */
router.get('/timetable/single', async (req, res) => {
  try {
    const { agencyId, linea, directionId, serviceType } = req.query;
    if (!agencyId || !linea || !serviceType) {
      return res.status(400).json({ success: false, error: 'Missing required params' });
    }
    const data = await gtfsService.getSpecificTimetable(
      agencyId as string, 
      linea as string, 
      Number(directionId || 0), 
      serviceType as any
    );
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/gtfs/lines
 * Lista las líneas disponibles para un operador según el GTFS local.
 */
router.get('/lines', async (req, res) => {
  try {
    const { agencyId } = req.query;
    if (!agencyId) return res.status(400).json({ success: false, error: 'Falta agencyId' });
    const lines = await gtfsService.listLinesForAgency(agencyId as string);
    res.json({ success: true, count: lines.length, data: lines });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/gtfs/geometry
 * Recupera el recorrido GPS (shape) y paradas ordenadas exactas de una línea/sentido.
 */
router.get('/geometry', async (req, res) => {
  try {
    const { agencyId, linea, directionId } = req.query;
    if (!agencyId || !linea) return res.status(400).json({ success: false, error: 'Faltan params' });
    const dirId = Number(directionId || 0);
    const data = await gtfsService.getLineGeometry(agencyId as string, linea as string, dirId);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/gtfs/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await gtfsService.getStats();
    res.json({ success: true, data: stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
