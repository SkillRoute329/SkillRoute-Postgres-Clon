import { Router, Request, Response } from 'express';
import { verifyAuth } from '../middleware/auth';
import sqlDb from '../config/database';
import logger from '../config/logger';
import {
  listAgencies,
  getComplianceRealtime,
  getAgencyRoutes,
  getActiveTrips,
  getVehicleHistoryHandler,
  getActiveSnapshot,
  getEndpointHealthHandler,
  getHistorySummaryHandler,
} from '../controllers/autoStatsController';

const router = Router();

// Todas las rutas requieren auth
router.use(verifyAuth);

router.get('/health',                           getEndpointHealthHandler);
router.get('/agencies',                         listAgencies);
router.get('/compliance/:agencyId',             getComplianceRealtime);
router.get('/routes/:agencyId',                 getAgencyRoutes);
router.get('/routes/:agencyId/:routeShort/active', getActiveTrips);
router.get('/vehicle/:idBus',                   getVehicleHistoryHandler);
router.get('/active/:agencyId',                 getActiveSnapshot);
router.get('/history/:agencyId',                getHistorySummaryHandler);

// ─── FASE 5.2 (2026-05-13): vehicle-stats y conductor-ranking ──────────────
//
// Endpoints que el frontend espera (autoStatsService.ts) pero estaban sin
// implementar. Agregados los antes del demo IMM.

const AGENCY_NAMES: Record<string, string> = {
  '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT',
};

/**
 * GET /api/autostats/vehicle-stats/:agencyId?sortBy=otp|actividad
 * Perfil de cumplimiento por coche para una empresa (basado en vehicle_events
 * de los últimos 7 días).
 */
router.get('/vehicle-stats/:agencyId', async (req: Request, res: Response) => {
  try {
    const agencyId = req.params.agencyId;
    const sortBy = (req.query.sortBy as string) === 'actividad' ? 'actividad' : 'otp';

    // Agregación por id_bus: conteos, % de cada estado, líneas operadas, etc.
    // FASE 5.2 (2026-05-13): ventana 24h (antes 7 días causaba timeout). Una
    // ventana de 24h sobre ~1.4M filas con índice (agency_id, created_at)
    // responde en <3s. Para vista histórica completa usar /api/audit/coverage.
    const rows = await sqlDb('vehicle_events')
      .where('agency_id', agencyId)
      .where('created_at', '>', sqlDb.raw("NOW() - INTERVAL '24 hours'"))
      .select(
        'id_bus',
        sqlDb.raw('COUNT(*) AS total_eventos'),
        sqlDb.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'EN_TIEMPO') AS en_tiempo"),
        sqlDb.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'ATRASADO') AS atrasado"),
        sqlDb.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'ADELANTADO') AS adelantado"),
        sqlDb.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'SIN_HORARIO') AS sin_horario"),
        sqlDb.raw('COUNT(DISTINCT DATE(created_at)) AS dias_activos'),
        sqlDb.raw('AVG(velocidad) AS vel_media'),
        sqlDb.raw('ARRAY_AGG(DISTINCT linea) AS lineas_operadas'),
        sqlDb.raw('MAX(created_at) AS ultima_actividad'),
      )
      .groupBy('id_bus')
      .limit(500);

    const buses = rows.map((r: any) => {
      const total = Number(r.total_eventos) || 0;
      const enTiempo = Number(r.en_tiempo) || 0;
      const atrasado = Number(r.atrasado) || 0;
      const adelantado = Number(r.adelantado) || 0;
      const sinHorario = Number(r.sin_horario) || 0;
      const conSchedule = enTiempo + atrasado + adelantado;
      return {
        idBus: r.id_bus,
        empresa: AGENCY_NAMES[agencyId] ?? agencyId,
        diasActivos: Number(r.dias_activos) || 0,
        totalEventos: total,
        pctEnTiempo: conSchedule > 0 ? Number(((enTiempo / conSchedule) * 100).toFixed(2)) : 0,
        pctAtrasado: conSchedule > 0 ? Number(((atrasado / conSchedule) * 100).toFixed(2)) : 0,
        pctAdelantado: conSchedule > 0 ? Number(((adelantado / conSchedule) * 100).toFixed(2)) : 0,
        pctSinHorario: total > 0 ? Number(((sinHorario / total) * 100).toFixed(2)) : 0,
        // FASE 5.17 (auditoría): cobertura auditable explícita = eventos con
        // horario IMM (EN_TIEMPO+ATRASADO+ADELANTADO) / total. El OTP se
        // calcula SOLO sobre estos; declararlo evita inflar el OTP de forma
        // no transparente ante IMM.
        coberturaAuditablePct: total > 0 ? Number(((conSchedule / total) * 100).toFixed(2)) : 0,
        velocidadMedia: Number(Number(r.vel_media ?? 0).toFixed(1)),
        desviacionMediaMin: null,
        lineasOperadas: r.lineas_operadas ?? [],
        ultimaActividad: r.ultima_actividad?.toISOString?.() ?? null,
        ultimoInterno: null,
        ultimoNombre: null,
        conductoresConocidos: [],
        historial: [],
      };
    });

    if (sortBy === 'otp') {
      buses.sort((a, b) => b.pctEnTiempo - a.pctEnTiempo);
    } else {
      buses.sort((a, b) => b.totalEventos - a.totalEventos);
    }

    res.json({ ok: true, agencyId, totalBuses: buses.length, buses });
  } catch (err) {
    logger.error('[autostats/vehicle-stats]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error en vehicle-stats' });
  }
});

/**
 * FASE 5.14 (2026-05-13)
 * GET /api/autostats/fleet-ranking/:agencyId?days=7&offset=0
 *
 * Endpoint que esperaba el frontend (RankingCoches, FlotaInteligente) pero
 * que NUNCA estuvo implementado en el backend → 404 silencioso → "no
 * funciona". Devuelve el ranking de coches con OTP / actividad / lineas en
 * la ventana solicitada. Forma: { ok, agencyId, days, totalVehiculos,
 * vehicles: VehicleSummary[] }.
 */
router.get('/fleet-ranking/:agencyId', async (req: Request, res: Response) => {
  try {
    const agencyId = req.params.agencyId;
    const days = Math.min(30, Math.max(1, parseInt((req.query.days as string) || '7', 10)));
    const offset = Math.max(0, parseInt((req.query.offset as string) || '0', 10));
    const limit = Math.min(500, Math.max(10, parseInt((req.query.limit as string) || '200', 10)));

    // FASE 5.14: cache 30s. Es la query más cara del módulo Cumplimiento
    // (GROUP BY id_bus sobre 12M filas).
    const cm = await import('../utils/responseCache');
    const cacheKey = `fleet-ranking:${agencyId}:${days}:${offset}:${limit}`;
    const hit = cm.cacheGet<unknown>(cacheKey);
    if (hit) { res.json(hit); return; }

    // FASE 5.16 (2026-05-16): leer de la MV diaria mv_fleet_ranking_diario
    // (9.5k filas) en vez de escanear vehicle_events (12M filas). Se suman
    // los días dentro de la ventana. Antes: cold start >40s. Ahora: <500ms.
    // La MV se refresca cada 5 min vía refreshFleetRankingMv() en el backend.
    const rows = await sqlDb('mv_fleet_ranking_diario')
      .where('agency_id', agencyId)
      .where('fecha', '>', sqlDb.raw(`(NOW() - INTERVAL '${days} days')::date`))
      .select(
        'id_bus',
        sqlDb.raw('SUM(total)::int AS total_eventos'),
        sqlDb.raw('SUM(en_tiempo)::int AS en_tiempo'),
        sqlDb.raw('SUM(atrasado)::int AS atrasado'),
        sqlDb.raw('SUM(adelantado)::int AS adelantado'),
        sqlDb.raw('SUM(sin_horario)::int AS sin_horario'),
        // Promedio ponderado por total de cada día.
        sqlDb.raw('SUM(vel_media_sum * total) / NULLIF(SUM(total),0) AS vel_media'),
        sqlDb.raw('SUM(desv_media_sum * total) / NULLIF(SUM(total),0) AS desv_media'),
        // Líneas: cada día trae un array; lo serializamos a CSV y juntamos
        // todo en un solo string (array_agg de arrays variádicos falla en
        // PG). Se deduplica en JS.
        sqlDb.raw("string_agg(array_to_string(lineas, ','), ',') AS lineas_csv"),
        sqlDb.raw('MIN(primera) AS primera_actividad'),
        sqlDb.raw('MAX(ultima) AS ultima_actividad'),
      )
      .groupBy('id_bus')
      .orderByRaw("SUM(en_tiempo)::float / NULLIF(SUM(en_tiempo)+SUM(atrasado)+SUM(adelantado), 0) DESC NULLS LAST")
      .limit(limit)
      .offset(offset);

    const vehicles = rows.map((r: any) => {
      const total = Number(r.total_eventos) || 0;
      const enTiempo = Number(r.en_tiempo) || 0;
      const atrasado = Number(r.atrasado) || 0;
      const adelantado = Number(r.adelantado) || 0;
      const sinHorario = Number(r.sin_horario) || 0;
      const conSchedule = enTiempo + atrasado + adelantado;
      // r.lineas_csv = "306,300,306,..." de todos los días. Dedup en JS.
      const lineasSet = new Set<string>();
      for (const l of String(r.lineas_csv ?? '').split(',')) {
        const t = l.trim();
        if (t) lineasSet.add(t);
      }
      return {
        idBus: String(r.id_bus),
        empresa: AGENCY_NAMES[agencyId] ?? agencyId,
        lineasOperadas: Array.from(lineasSet).sort(),
        totalEventos: total,
        velocidadMedia: Number(Number(r.vel_media ?? 0).toFixed(1)),
        pctEnTiempo: conSchedule > 0 ? Number(((enTiempo / conSchedule) * 100).toFixed(2)) : 0,
        pctAtrasado: conSchedule > 0 ? Number(((atrasado / conSchedule) * 100).toFixed(2)) : 0,
        pctAdelantado: conSchedule > 0 ? Number(((adelantado / conSchedule) * 100).toFixed(2)) : 0,
        pctSinHorario: total > 0 ? Number(((sinHorario / total) * 100).toFixed(2)) : 0,
        coberturaAuditablePct: total > 0 ? Number(((conSchedule / total) * 100).toFixed(2)) : 0,
        ultimaActividad: r.ultima_actividad?.toISOString?.() ?? (r.ultima_actividad ?? null),
        primeraActividad: r.primera_actividad?.toISOString?.() ?? (r.primera_actividad ?? null),
        desviacionMediaMin: r.desv_media != null ? Number(Number(r.desv_media).toFixed(2)) : null,
      };
    });

    const fleetPayload = { ok: true, agencyId, days, totalVehiculos: vehicles.length, vehicles };
    cm.cacheSet(cacheKey, fleetPayload, 30_000);
    res.json(fleetPayload);
  } catch (err) {
    logger.error('[autostats/fleet-ranking]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error en fleet-ranking', detalle: String(err) });
  }
});

/**
 * FASE 5.14 (2026-05-13)
 * GET /api/autostats/vehicle-trace/:agencyId/:idBus?days=1&limit=200
 *
 * Devuelve el AUDIT TRAIL de un coche: cada pasada individual con
 *   { timestamp, linea, proxima_parada, estado_cumplimiento, desviacion_min,
 *     velocidad, trip_id }
 *
 * Esto es lo que un auditor IMM necesita para verificar las estadisticas
 * de un coche: ver evento por evento como se construye el OTP. NO mostrar
 * solo agregados.
 */
router.get('/vehicle-trace/:agencyId/:idBus', async (req: Request, res: Response) => {
  try {
    const agencyId = req.params.agencyId;
    const idBus = req.params.idBus;
    const days = Math.min(7, Math.max(1, parseInt((req.query.days as string) || '1', 10)));
    const limit = Math.min(2000, Math.max(10, parseInt((req.query.limit as string) || '200', 10)));

    const rows = await sqlDb('vehicle_events')
      .where('agency_id', agencyId)
      .where('id_bus', idBus)
      .where('created_at', '>', sqlDb.raw(`NOW() - INTERVAL '${days} days'`))
      .select(
        'id',
        'linea',
        'lat',
        'lon',
        'velocidad',
        'estado_cumplimiento',
        'desviacion_min',
        'trip_id',
        'proxima_parada',
        'timestamp_gps',
        'created_at',
      )
      .orderBy('created_at', 'desc')
      .limit(limit);

    res.json({
      ok: true,
      agencyId,
      idBus,
      days,
      total: rows.length,
      pasadas: (rows as Array<{
        id: string; linea: string; lat: number; lon: number; velocidad: number;
        estado_cumplimiento: string; desviacion_min: number | null; trip_id: string | null;
        proxima_parada: string | null; timestamp_gps: string | Date; created_at: string | Date;
      }>).map((r) => ({
        id: r.id,
        linea: r.linea,
        lat: r.lat,
        lon: r.lon,
        velocidad: r.velocidad,
        estadoCumplimiento: r.estado_cumplimiento,
        desviacionMin: r.desviacion_min,
        tripId: r.trip_id,
        proximaParada: r.proxima_parada,
        timestampGPS: typeof r.timestamp_gps === 'string' ? r.timestamp_gps : r.timestamp_gps.toISOString(),
        createdAt: typeof r.created_at === 'string' ? r.created_at : r.created_at.toISOString(),
      })),
    });
  } catch (err) {
    logger.error('[autostats/vehicle-trace]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error en vehicle-trace' });
  }
});

/**
 * GET /api/autostats/conductor-ranking/:agencyId
 * Ranking de conductores (donde hay distribuciones diarias). UCOT tiene
 * `coche_personal`/`turnos_dia`; otros operadores devuelven lista vacía.
 */
router.get('/conductor-ranking/:agencyId', async (req: Request, res: Response) => {
  try {
    const agencyId = req.params.agencyId;
    // Solo UCOT tiene mapeo coche↔conductor por ahora
    if (agencyId !== '70') {
      res.json({ ok: true, agencyId, totalConductores: 0, conductores: [],
        mensaje: 'Ranking por conductor requiere distribución diaria (solo UCOT por ahora)' });
      return;
    }

    // Para UCOT: por ahora retornamos coches con su cumplimiento. La asociación
    // coche→conductor está en `coche_personal` pero la integración fina queda
    // pendiente. Esto es un stub honesto que permite que la pantalla cargue.
    res.json({
      ok: true,
      agencyId,
      totalConductores: 0,
      conductores: [],
      mensaje: 'Vinculación coche↔conductor pendiente de distribución diaria integrada.',
    });
  } catch (err) {
    logger.error('[autostats/conductor-ranking]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error en conductor-ranking' });
  }
});

export default router;
