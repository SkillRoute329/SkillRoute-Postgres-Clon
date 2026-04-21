import { Request, Response } from 'express';
import {
  analyzeComplianceForAgency,
  summarizeByRoute,
  getAvailableAgencies,
  getRoutesForAgency,
  getActiveTripsNow,
} from '../services/scheduleComplianceEngine';
import {
  saveComplianceSnapshot,
  getVehicleHistory,
  getVehicleSummary,
  getActiveBusesSnapshot,
} from '../services/vehicleHistoryService';
import { logger } from '../config/logger';

/** GET /api/autostats/agencies — lista empresas disponibles en GTFS */
export async function listAgencies(req: Request, res: Response) {
  try {
    const agencies = getAvailableAgencies();
    res.json({ ok: true, agencies });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

/** GET /api/autostats/compliance/:agencyId — análisis en tiempo real */
export async function getComplianceRealtime(req: Request, res: Response) {
  const { agencyId } = req.params;
  try {
    const results = await analyzeComplianceForAgency(agencyId);
    const summary = summarizeByRoute(results);

    // Guardar snapshot en historial (background, no bloquear respuesta)
    saveComplianceSnapshot(results).catch(err =>
      logger.warn('[AutoStats] Error guardando snapshot:', err),
    );

    res.json({
      ok: true,
      agencyId,
      timestamp: new Date().toISOString(),
      totalBuses: results.length,
      summary,
      buses: results,
    });
  } catch (err: any) {
    logger.error('[AutoStats] compliance error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

/** GET /api/autostats/routes/:agencyId — horario GTFS por empresa */
export async function getAgencyRoutes(req: Request, res: Response) {
  const { agencyId } = req.params;
  try {
    const routes = getRoutesForAgency(agencyId);
    if (!routes) return res.status(404).json({ ok: false, error: 'Agency no encontrada' });
    // Devolver solo metadatos (sin los trips completos para no saturar)
    const meta = Object.entries(routes).map(([routeShort, r]) => ({
      route: routeShort,
      longName: r.route_long_name,
      totalHabiles: r.habiles.length,
      totalSabados: r.sabados.length,
      totalDomingos: r.domingos.length,
    }));
    res.json({ ok: true, agencyId, routes: meta });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

/** GET /api/autostats/routes/:agencyId/:routeShort/active — viajes activos ahora */
export async function getActiveTrips(req: Request, res: Response) {
  const { agencyId, routeShort } = req.params;
  try {
    const trips = getActiveTripsNow(agencyId, routeShort);
    res.json({ ok: true, agencyId, route: routeShort, activeTrips: trips });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

/** GET /api/autostats/vehicle/:idBus — historial de un coche */
export async function getVehicleHistoryHandler(req: Request, res: Response) {
  const { idBus } = req.params;
  const days = parseInt(req.query.days as string) || 7;
  try {
    const [history, summary] = await Promise.all([
      getVehicleHistory(idBus, days),
      getVehicleSummary(idBus, days),
    ]);
    res.json({ ok: true, idBus, days, summary, history });
  } catch (err: any) {
    logger.error('[AutoStats] vehicle history error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

/** GET /api/autostats/active/:agencyId — buses activos últimos 3 min (desde Firestore) */
export async function getActiveSnapshot(req: Request, res: Response) {
  const { agencyId } = req.params;
  try {
    const buses = await getActiveBusesSnapshot(agencyId);
    res.json({ ok: true, agencyId, buses });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
