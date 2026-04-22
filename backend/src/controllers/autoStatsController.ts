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
  getLastKnownBusesSnapshot,
  getEndpointHealth,
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

/** GET /api/autostats/compliance/:agencyId — análisis en tiempo real, con fallback a Firestore */
export async function getComplianceRealtime(req: Request, res: Response) {
  const { agencyId } = req.params;
  try {
    const results = await analyzeComplianceForAgency(agencyId);
    const summary = summarizeByRoute(results);

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
      gpsSource: 'live',
    });
  } catch (err: any) {
    // GPS caído: devolver último snapshot conocido desde Firestore
    logger.warn('[AutoStats] GPS fallido, usando historial Firestore:', err?.message);
    try {
      const { buses, dataTimestamp } = await getLastKnownBusesSnapshot(agencyId, 24);
      const summary = buses.reduce<Record<string, any>>((acc, b) => {
        if (!acc[b.linea]) acc[b.linea] = { linea: b.linea, busesActivos: 0, enTiempo: 0, atrasados: 0, adelantados: 0, sinHorario: 0, pctCumplimiento: 0 };
        acc[b.linea].busesActivos++;
        if (b.estadoCumplimiento === 'EN_TIEMPO') acc[b.linea].enTiempo++;
        else if (b.estadoCumplimiento === 'ATRASADO') acc[b.linea].atrasados++;
        else if (b.estadoCumplimiento === 'ADELANTADO') acc[b.linea].adelantados++;
        else acc[b.linea].sinHorario++;
        return acc;
      }, {});
      Object.values(summary).forEach((s: any) => {
        const total = s.enTiempo + s.atrasados + s.adelantados;
        s.pctCumplimiento = total > 0 ? Math.round((s.enTiempo / total) * 100) : 0;
      });
      res.json({
        ok: true,
        agencyId,
        timestamp: new Date().toISOString(),
        totalBuses: buses.length,
        summary,
        buses,
        gpsSource: 'historical',
        dataTimestamp,
        gpsError: err?.message,
      });
    } catch (fbErr: any) {
      res.status(503).json({ ok: false, error: 'GPS y Firestore no disponibles', detail: fbErr?.message });
    }
  }
}

/** GET /api/autostats/health — estado del endpoint GPS STM */
export async function getEndpointHealthHandler(_req: Request, res: Response) {
  try {
    const health = await getEndpointHealth();
    res.json({ ok: true, health });
  } catch (err: any) {
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
