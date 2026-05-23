/**
 * cacheWarmup — pre-calienta las queries más usadas al arranque del backend
 * y luego periódicamente para mantenerlas en cache.
 *
 * FASE 5.14 (2026-05-13): sin pre-warm el primer usuario de cada endpoint
 * paga 7-23 segundos de cold cache (fleet-ranking sobre 12M filas, etc).
 * Disparando esas queries al startup y cada N segundos, todo navegante
 * cae siempre en warm cache (<600ms).
 *
 * Cómo decide qué calentar:
 *   - Queries por operador (70, 50, 20, 10) que el frontend usa de entrada
 *   - Etapa lineas y fleet-ranking de UCOT (operador propio)
 *   - No calentamos pasadas-por-etapa porque la combinatoria es grande
 *
 * Política de errores: best-effort. Si una query falla, log warning y sigue.
 * No bloquea el arranque del servidor.
 */
import logger from '../config/logger';
import sqlDb from '../config/database';
import { cacheSet } from './responseCache';

const AGENCIES = ['70', '50', '20', '10'] as const;

async function warmFleetRanking(agencyId: string): Promise<void> {
  const days = 1;
  const limit = 200;
  const offset = 0;
  try {
    const rows = await sqlDb('vehicle_events')
      .where('agency_id', agencyId)
      .where('created_at', '>', sqlDb.raw(`NOW() - INTERVAL '${days} days'`))
      .select(
        'id_bus',
        sqlDb.raw('COUNT(*) AS total_eventos'),
        sqlDb.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'EN_TIEMPO') AS en_tiempo"),
        sqlDb.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'ATRASADO') AS atrasado"),
        sqlDb.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'ADELANTADO') AS adelantado"),
        sqlDb.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'SIN_HORARIO') AS sin_horario"),
        sqlDb.raw('AVG(velocidad) AS vel_media'),
        sqlDb.raw('AVG(desviacion_min) AS desv_media'),
        sqlDb.raw('ARRAY_AGG(DISTINCT linea ORDER BY linea) AS lineas_operadas'),
        sqlDb.raw('MIN(created_at) AS primera_actividad'),
        sqlDb.raw('MAX(created_at) AS ultima_actividad'),
      )
      .groupBy('id_bus')
      .orderByRaw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'EN_TIEMPO')::float / NULLIF(COUNT(*) FILTER (WHERE estado_cumplimiento IN ('EN_TIEMPO','ATRASADO','ADELANTADO')), 0) DESC NULLS LAST")
      .limit(limit)
      .offset(offset);
    const AGENCY_NAMES: Record<string, string> = { '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT' };
    const vehicles = (rows as Array<Record<string, unknown>>).map((r) => {
      const total = Number(r.total_eventos) || 0;
      const enTiempo = Number(r.en_tiempo) || 0;
      const atrasado = Number(r.atrasado) || 0;
      const adelantado = Number(r.adelantado) || 0;
      const sinHorario = Number(r.sin_horario) || 0;
      const conSchedule = enTiempo + atrasado + adelantado;
      return {
        idBus: String(r.id_bus),
        empresa: AGENCY_NAMES[agencyId] ?? agencyId,
        lineasOperadas: ((r.lineas_operadas as string[]) ?? []).filter((l: string | null) => !!l),
        totalEventos: total,
        velocidadMedia: Number(Number(r.vel_media ?? 0).toFixed(1)),
        pctEnTiempo: conSchedule > 0 ? Number(((enTiempo / conSchedule) * 100).toFixed(2)) : 0,
        pctAtrasado: conSchedule > 0 ? Number(((atrasado / conSchedule) * 100).toFixed(2)) : 0,
        pctAdelantado: conSchedule > 0 ? Number(((adelantado / conSchedule) * 100).toFixed(2)) : 0,
        pctSinHorario: total > 0 ? Number(((sinHorario / total) * 100).toFixed(2)) : 0,
        ultimaActividad: r.ultima_actividad instanceof Date ? r.ultima_actividad.toISOString() : (r.ultima_actividad ?? null),
        primeraActividad: r.primera_actividad instanceof Date ? r.primera_actividad.toISOString() : (r.primera_actividad ?? null),
        desviacionMediaMin: r.desv_media != null ? Number(Number(r.desv_media).toFixed(2)) : null,
      };
    });
    const payload = { ok: true, agencyId, days, totalVehiculos: vehicles.length, vehicles };
    cacheSet(`fleet-ranking:${agencyId}:${days}:${offset}:${limit}`, payload, 30_000);
  } catch (e) {
    logger.warn('[cacheWarmup] fleet-ranking ' + agencyId, { err: String(e) });
  }
}

async function warmEtapaLineas(agencyId: string): Promise<void> {
  try {
    const rows = await sqlDb('vehicle_events')
      .where('agency_id', agencyId)
      .where('created_at', '>', sqlDb.raw(`NOW() - INTERVAL '3 days'`))
      .whereNotNull('linea')
      .select('linea', sqlDb.raw('COUNT(*) AS total'))
      .groupBy('linea')
      .having(sqlDb.raw('COUNT(*) >= ?', [50]))
      .orderBy('linea');
    const lineas = rows
      .map((r) => String((r as { linea: string }).linea ?? '').trim())
      .filter((l) => l && l !== '-' && l !== '—');
    cacheSet(`etapa:lineas:${agencyId}:3:50`, { ok: true, agencyId, days: 3, lineas }, 60_000);
  } catch (e) {
    logger.warn('[cacheWarmup] etapa-lineas ' + agencyId, { err: String(e) });
  }
}

let warmupTimer: NodeJS.Timeout | null = null;

export function startCacheWarmup(): void {
  const run = async (): Promise<void> => {
    const t0 = Date.now();
    // SERIAL — el pool de Knex (default 10 conexiones) se saturaba al
    // dispararse 8 queries pesadas en paralelo y todas timeouteaban. Una
    // a una completa en ~30s totales y deja todo en cache.
    for (const ag of AGENCIES) {
      await warmEtapaLineas(ag);
      await warmFleetRanking(ag);
    }
    logger.info('[cacheWarmup] ciclo completo en ' + (Date.now() - t0) + 'ms');
  };
  // Primer ciclo 3s después del arranque
  setTimeout(() => { void run(); }, 3000);
  // Después cada 25s (antes de que expire el TTL de 30s)
  warmupTimer = setInterval(() => { void run(); }, 25_000);
}

export function stopCacheWarmup(): void {
  if (warmupTimer) clearInterval(warmupTimer);
  warmupTimer = null;
}
