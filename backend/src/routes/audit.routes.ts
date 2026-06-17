/**
 * audit.routes.ts — Endpoints de auditoría para reporte IMM (FASE 3.5)
 *
 * Todos requieren JWT (regla -3 OWASP A07: rutas sensibles auth-gated).
 * Mount point: /api/audit/*
 */

import { Router, Request, Response } from 'express';
import { verifyAuth } from '../middleware/auth';
import sqlDb from '../config/database';
import logger from '../config/logger';
import {
  getPollerStatsHandler,
  getCoverageHandler,
  getActiveBusesHandler,
  getEtaSnapshotHandler,
} from '../controllers/auditController';

const router = Router();

// GET /api/audit/poller-stats
router.get('/poller-stats', verifyAuth, getPollerStatsHandler);

// GET /api/audit/coverage?from=YYYY-MM-DD&to=YYYY-MM-DD&agency=70
router.get('/coverage', verifyAuth, getCoverageHandler);

// GET /api/audit/buses-active?agency=70&minutes=5
router.get('/buses-active', verifyAuth, getActiveBusesHandler);

// GET /api/audit/eta-snapshot?agency=70&limit=50
router.get('/eta-snapshot', verifyAuth, getEtaSnapshotHandler);

/**
 * FASE 5.12 (2026-05-13)
 * GET /api/audit/resumen-imm
 *
 * Snapshot único para auditoría IMM en JSON. Agrega en una sola request las
 * métricas clave del sistema metropolitano: cobertura, OTP por operador,
 * volumen GPS, alertas, salud del poller, top líneas problemáticas.
 *
 * Diseñado para que un auditor pueda hacer:
 *   curl -s -H "Authorization: Bearer TOKEN" \
 *        http://localhost:3001/api/audit/resumen-imm > resumen.json
 *
 * y tener un JSON portable con la fotografía completa del sistema en este
 * momento.
 */
router.get('/resumen-imm', verifyAuth, async (_req: Request, res: Response) => {
  const t0 = Date.now();
  try {
    // FASE 5.12 r2: queries LIGHT que NO tocan vehicle_events (10M filas; el
    // poller hace inserts continuamente y el endpoint quedaba esperando pool).
    // Para OTP detallado, el cliente usa /api/compliance/regulador en su lugar.
    const [
      pollerRow,
      buses5min,
      eventosApprox,
      cartonesCargados,
      dro4ops,
      autoStatsRecent,
    ] = await Promise.all([
      sqlDb('poller_health')
        .select(
          sqlDb.raw('COUNT(*) AS total_ciclos'),
          sqlDb.raw('SUM(buses_received) AS total_buses_recibidos'),
          sqlDb.raw('SUM(events_persisted) AS total_eventos_persistidos'),
          sqlDb.raw('MAX(cycle_end) AS ultimo_ciclo'),
          sqlDb.raw('EXTRACT(EPOCH FROM (NOW() - MAX(cycle_end)))::int AS segundos_desde_ultimo'),
        )
        .first(),

      sqlDb('bus_last_pos')
        .where('updated_at', '>', sqlDb.raw("NOW() - INTERVAL '5 minutes'"))
        .select(
          'agency_id',
          sqlDb.raw('COUNT(*) AS buses_live'),
          sqlDb.raw('COUNT(DISTINCT linea) AS lineas_live'),
        )
        .groupBy('agency_id')
        .orderBy('agency_id'),

      // Approximate count desde pg_stat (instant, no scan)
      sqlDb.raw(`SELECT n_live_tup AS count FROM pg_stat_user_tables WHERE relname='vehicle_events'`)
        .then((r: { rows: Array<{ count: number }> }) => r.rows[0]),

      sqlDb('cartones_completados')
        .select('agency_id', sqlDb.raw('COUNT(*) AS total'))
        .groupBy('agency_id'),

      sqlDb('corridor_overlap')
        .select(
          sqlDb.raw('COUNT(*) AS total_pares'),
          sqlDb.raw("COUNT(*) FILTER (WHERE tier = 'T1') AS t1_alta_competencia"),
          sqlDb.raw("COUNT(*) FILTER (WHERE tier = 'T2') AS t2_media_competencia"),
          sqlDb.raw("COUNT(*) FILTER (WHERE tier = 'T3') AS t3_baja_competencia"),
        )
        .first(),

      // Alertas regulación recientes (24h) — solo COUNT
      sqlDb('alertas_regulacion')
        .where('timestamp', '>', sqlDb.raw("NOW() - INTERVAL '24 hours'"))
        .select('agency_id', sqlDb.raw('COUNT(*) AS total'))
        .groupBy('agency_id'),
    ]);
    // Obtener la fecha mas reciente de la MV de forma eficiente (o usar la fecha de hoy)
    const maxFechaRow = (await sqlDb('mv_fleet_ranking_diario').max('fecha as max_fecha').first()) as { max_fecha: string | Date } | undefined;
    const fechaConsulta = maxFechaRow?.max_fecha
      ? new Date(maxFechaRow.max_fecha).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const [
      rawToday,
      rawProblematic
    ] = await Promise.all([
      sqlDb('mv_fleet_ranking_diario')
        .where('fecha', fechaConsulta)
        .select('agency_id', 'id_bus', 'total', 'en_tiempo', 'atrasado', 'adelantado', 'sin_horario', 'lineas'),

      sqlDb.raw(`
        SELECT 
          agency_id,
          l AS linea,
          SUM(en_tiempo)::int AS en_tiempo,
          SUM(atrasado)::int AS atrasado,
          SUM(adelantado)::int AS adelantado
        FROM mv_fleet_ranking_diario,
        UNNEST(lineas) AS l
        WHERE fecha >= (?::date - INTERVAL '3 days')
        GROUP BY agency_id, l
        HAVING (SUM(en_tiempo) + SUM(atrasado) + SUM(adelantado)) >= 100
        ORDER BY (SUM(en_tiempo)::float / NULLIF(SUM(en_tiempo) + SUM(atrasado) + SUM(adelantado), 0)) ASC
        LIMIT 10
      `, [fechaConsulta])
    ]);

    // Procesar cobertura 24h y OTP diario en memoria a partir de los datos pre-agregados por bus
    const coberturaMap = new Map<string, { eventos: number; buses: Set<string>; lineas: Set<string> }>();
    const otpMap = new Map<string, { total: number; en_tiempo: number }>();

    for (const r of rawToday) {
      const agencyId = String(r.agency_id);
      const totalEventos = Number(r.total) || 0;
      const enTiempo = Number(r.en_tiempo) || 0;
      const atrasado = Number(r.atrasado) || 0;
      const adelantado = Number(r.adelantado) || 0;
      const conSchedule = enTiempo + atrasado + adelantado;

      if (!coberturaMap.has(agencyId)) {
        coberturaMap.set(agencyId, { eventos: 0, buses: new Set(), lineas: new Set() });
      }
      const cob = coberturaMap.get(agencyId)!;
      cob.eventos += totalEventos;
      cob.buses.add(String(r.id_bus));
      if (Array.isArray(r.lineas)) {
        for (const l of r.lineas) {
          if (l) cob.lineas.add(String(l));
        }
      }

      if (!otpMap.has(agencyId)) {
        otpMap.set(agencyId, { total: 0, en_tiempo: 0 });
      }
      const otp = otpMap.get(agencyId)!;
      otp.total += conSchedule;
      otp.en_tiempo += enTiempo;
    }

    const cobertura24h = Array.from(coberturaMap.entries()).map(([agencyId, val]) => ({
      agency_id: agencyId,
      eventos: val.eventos,
      buses_unicos: val.buses.size,
      lineas_activas: val.lineas.size,
    }));

    const otpPorAgencia = Array.from(otpMap.entries()).map(([agencyId, val]) => ({
      agency_id: agencyId,
      total: val.total,
      en_tiempo: val.en_tiempo,
    }));

    const topLineasProblematicas = (rawProblematic.rows ?? rawProblematic).map((r: any) => {
      const enTiempo = Number(r.en_tiempo) || 0;
      const atrasado = Number(r.atrasado) || 0;
      const adelantado = Number(r.adelantado) || 0;
      const total = enTiempo + atrasado + adelantado;
      return {
        agency_id: r.agency_id,
        linea: r.linea,
        muestras: total,
        pct_en_tiempo: total > 0 ? Number(((enTiempo / total) * 100).toFixed(2)) : 0
      };
    });

    const eventos24h = eventosApprox;
    const alertasUltimas24h = autoStatsRecent;

    const operadores: Record<string, string> = { '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT' };

    res.json({
      meta: {
        generado_en: new Date().toISOString(),
        ms: Date.now() - t0,
        ciudad: 'Montevideo',
        pais: 'Uruguay',
        operadores_monitoreados: Object.entries(operadores).map(([id, nombre]) => ({ id, nombre })),
        fuente: 'Postgres soberano skillroute_master + GPS oficial IMM stm-online',
      },
      salud_sistema: {
        poller: {
          total_ciclos: Number((pollerRow as any)?.total_ciclos ?? 0),
          total_buses_recibidos: Number((pollerRow as any)?.total_buses_recibidos ?? 0),
          total_eventos_persistidos: Number((pollerRow as any)?.total_eventos_persistidos ?? 0),
          ultimo_ciclo: (pollerRow as any)?.ultimo_ciclo,
          segundos_desde_ultimo_ciclo: Number((pollerRow as any)?.segundos_desde_ultimo ?? 0),
          estado: Number((pollerRow as any)?.segundos_desde_ultimo ?? 999) < 60 ? 'LIVE' : 'STALE',
        },
        eventos_historicos_totales: Number((eventos24h as Record<string, unknown>)?.count ?? 0),
      },
      cobertura_24h: (cobertura24h as Array<Record<string, unknown>>).map((r) => ({
        agency_id: r.agency_id,
        operador: operadores[String(r.agency_id)] ?? r.agency_id,
        eventos: Number(r.eventos),
        buses_unicos: Number(r.buses_unicos),
        lineas_activas: Number(r.lineas_activas),
      })),
      buses_live_5min: (buses5min as Array<Record<string, unknown>>).map((r) => ({
        agency_id: r.agency_id,
        operador: operadores[String(r.agency_id)] ?? r.agency_id,
        buses_live: Number(r.buses_live),
      })),
      otp_hoy_por_operador: (otpPorAgencia as Array<Record<string, unknown>>).map((r) => {
        const total = Number(r.total);
        const enTiempo = Number(r.en_tiempo);
        return {
          agency_id: r.agency_id,
          operador: operadores[String(r.agency_id)] ?? r.agency_id,
          eventos_clasificados: total,
          en_tiempo: enTiempo,
          pct_otp: total > 0 ? Number(((enTiempo / total) * 100).toFixed(2)) : 0,
        };
      }),
      top_10_lineas_mas_problematicas_3d: (topLineasProblematicas as Array<Record<string, unknown>>).map((r) => ({
        agency_id: r.agency_id,
        operador: operadores[String(r.agency_id)] ?? r.agency_id,
        linea: r.linea,
        muestras: Number(r.muestras),
        pct_en_tiempo: Number(r.pct_en_tiempo),
      })),
      cartones: {
        por_agencia: (cartonesCargados as Array<Record<string, unknown>>).map((r) => ({
          agency_id: r.agency_id,
          operador: operadores[String(r.agency_id ?? '')] ?? r.agency_id,
          total: Number(r.total),
        })),
        total_cargados: (cartonesCargados as Array<Record<string, unknown>>).reduce((s, r) => s + Number(r.total ?? 0), 0),
      },
      dro_cross_operador: {
        total_pares: Number((dro4ops as Record<string, unknown>)?.total_pares ?? 0),
        t1_alta_competencia: Number((dro4ops as Record<string, unknown>)?.t1_alta_competencia ?? 0),
        t2_media_competencia: Number((dro4ops as Record<string, unknown>)?.t2_media_competencia ?? 0),
        t3_baja_competencia: Number((dro4ops as Record<string, unknown>)?.t3_baja_competencia ?? 0),
      },
      alertas_regulacion_ultimas_24h: (alertasUltimas24h as Array<Record<string, unknown>>).map((r) => ({
        agency_id: r.agency_id,
        operador: operadores[String(r.agency_id)] ?? r.agency_id,
        total: Number(r.total),
      })),
      otp_por_operador_consultar: '/api/compliance/regulador (devuelve OTP detallado para hoy)',
      politica_otp: {
        tolerancia_minutos: 4,
        fuente: 'TCRP 165 + Política unificada IMM',
      },
    });
  } catch (err) {
    logger.error('[audit/resumen-imm]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error generando resumen IMM', detalle: String(err) });
  }
});

export default router;
