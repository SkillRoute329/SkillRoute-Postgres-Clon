/**
 * auditController.ts — Endpoints de auditoría para reportes IMM (FASE 3.5)
 *
 * Sirve datos del poller_health y bus_eta_predictions para que el operador
 * pueda demostrar a IMM la cobertura temporal real del sistema de captura
 * GPS, sin huecos, comparable contra los datos de la IMM.
 *
 * Reglas aplicadas:
 *   - REGLA -3 ESTÁNDARES: ISO 27001 A.12.1 (logging), UITP (KPIs).
 *   - REGLA -2 NO SIMULACIÓN: todo viene de poller_health real; si no hay
 *     ciclos para una fecha, devuelve "0 ciclos" honesto, no rellena.
 *   - REGLA -1 NO REGRESIÓN: endpoints nuevos en /api/audit/*, no tocan nada.
 *
 * Endpoints:
 *   GET /api/audit/poller-stats
 *   GET /api/audit/coverage?from=YYYY-MM-DD&to=YYYY-MM-DD&agency=70
 *   GET /api/audit/buses-active?agency=70&minutes=5
 *   GET /api/audit/eta-snapshot?agency=70&limit=50
 */

import { Request, Response } from 'express';
import sqlDb from '../config/database';
import logger from '../config/logger';
import { getPollerStats } from '../services/pollerService';

/** GET /api/audit/poller-stats — métricas en vivo del poller en memoria */
export async function getPollerStatsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const stats = getPollerStats();
    res.json({ ok: true, data: stats });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('[Audit] poller-stats error', { error: msg });
    res.status(500).json({ ok: false, error: msg });
  }
}

/**
 * GET /api/audit/coverage?from=YYYY-MM-DD&to=YYYY-MM-DD&agency=70
 *
 * Devuelve % cobertura del poller por día y agencia. Comparable contra dato
 * IMM en la reunión de auditoría: "el clon capturó GPS X% del horario
 * operativo entre tales y cuales fechas".
 *
 * Si no se pasan from/to, usa los últimos 7 días.
 * Si no se pasa agency, devuelve todas las agencias.
 */
export async function getCoverageHandler(req: Request, res: Response): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

    const from = (req.query.from as string) || sevenDaysAgo;
    const to = (req.query.to as string) || today;
    const agency = req.query.agency as string | undefined;

    let q = sqlDb('v_poller_coverage_diario')
      .whereBetween('fecha', [from, to])
      .orderBy([
        { column: 'fecha', order: 'desc' },
        { column: 'agency_id', order: 'asc' },
      ]);
    if (agency) q = q.where('agency_id', agency);

    const rows = await q;

    // Agregado: promedio global de cobertura en el rango
    const promedio =
      rows.length > 0
        ? Number(
            (
              rows.reduce(
                (acc: number, r: any) => acc + Number(r.pct_cobertura_estimado ?? 0),
                0,
              ) / rows.length
            ).toFixed(2),
          )
        : 0;

    res.json({
      ok: true,
      data: {
        from,
        to,
        agency: agency ?? 'todas',
        pct_cobertura_promedio: promedio,
        total_dias: rows.length,
        dias: rows,
      },
      meta: {
        nota:
          'Cobertura estimada vs un horario operativo de 19h (5am-12am). Ciclos esperados con interval=10s ~= 6840/día.',
        regla_uitp: 'OTP UITP estándar tolerancia ±4 min',
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('[Audit] coverage error', { error: msg });
    res.status(500).json({ ok: false, error: msg });
  }
}

/**
 * GET /api/audit/buses-active?agency=70&minutes=5
 *
 * Devuelve los buses que tienen reporte GPS en los últimos N minutos.
 * Útil para mostrar a IMM "estos son los buses que estamos viendo ahora mismo".
 */
export async function getActiveBusesHandler(req: Request, res: Response): Promise<void> {
  try {
    const agency = (req.query.agency as string) || '70';
    const minutes = Math.min(60, Math.max(1, parseInt((req.query.minutes as string) || '5', 10)));

    const since = new Date(Date.now() - minutes * 60_000);
    const rows = await sqlDb('bus_last_pos')
      .where('agency_id', agency)
      .where('timestamp_gps', '>=', since)
      .orderBy('timestamp_gps', 'desc')
      .limit(500);

    res.json({
      ok: true,
      data: {
        agency,
        ventana_minutos: minutes,
        total_buses_activos: rows.length,
        buses: rows.map((r: any) => ({
          id_bus: r.id_bus,
          linea: r.linea,
          lat: r.lat,
          lon: r.lon,
          velocidad: r.velocidad,
          estado_cumplimiento: r.estado_cumplimiento,
          timestamp_gps: r.timestamp_gps,
        })),
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('[Audit] buses-active error', { error: msg });
    res.status(500).json({ ok: false, error: msg });
  }
}

/**
 * GET /api/audit/eta-snapshot?agency=70&limit=50
 *
 * Devuelve las ETAs más recientes calculadas por el poller. Útil para
 * mostrar a IMM "estos son los tiempos estimados de llegada que el sistema
 * está calculando ahora mismo, comparables contra los reales".
 */
export async function getEtaSnapshotHandler(req: Request, res: Response): Promise<void> {
  try {
    const agency = (req.query.agency as string) || '70';
    const limit = Math.min(500, Math.max(1, parseInt((req.query.limit as string) || '50', 10)));

    const rows = await sqlDb('bus_eta_predictions')
      .where('agency_id', agency)
      .orderBy('computed_at', 'desc')
      .limit(limit);

    res.json({
      ok: true,
      data: {
        agency,
        total: rows.length,
        eta: rows.map((r: any) => ({
          id_bus: r.id_bus,
          linea: r.linea,
          stop_id: r.stop_id,
          trip_id: r.trip_id,
          eta_seconds: r.eta_seconds,
          eta_timestamp: r.eta_timestamp,
          distance_meters: r.distance_meters,
          speed_kmh: r.speed_kmh,
          computed_at: r.computed_at,
        })),
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('[Audit] eta-snapshot error', { error: msg });
    res.status(500).json({ ok: false, error: msg });
  }
}
