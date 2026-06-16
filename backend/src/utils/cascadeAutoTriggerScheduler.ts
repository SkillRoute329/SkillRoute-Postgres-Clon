/**
 * cascadeAutoTriggerScheduler — Disparador automático del motor de
 * consecuencias desde GPS (FASE 5.31, 2026-05-21)
 *
 * Implementa la AUTOMATIZACIÓN PASIVA del cometido de interconexión: el
 * sistema vigila constantemente bus_last_pos y, cuando detecta condiciones
 * anómalas reales, dispara el motor de consecuencias sin intervención
 * humana.
 *
 * Reglas con umbrales conservadores para no generar spam:
 *
 *   - LÍNEA con porcentaje de buses ATRASADO ≥ 30% en últimos 10min
 *     (y al menos 3 buses) → dispara RETRASO_OPERATIVO. Cooldown 60min
 *     por línea.
 *
 *   - COCHE en FUERA_DE_SERVICIO con timestamp_gps ≥ 5min de antigüedad
 *     (es decir: no es un evento transitorio del poller) → dispara
 *     VEHICULO_FUERA_DE_SERVICIO. Cooldown 4h por coche.
 *
 * El scheduler corre cada 90 segundos. Cada disparo emite `bus:cascade:summary`
 * y persiste en logs_auditoria via computeConsequencesForEvent.
 */

import sqlDb from '../config/database';
import logger from '../config/logger';
import { computeConsequencesForEvent } from '../controllers/consequenceController';
import { getMotorConfig } from '../services/motorConfigService';

const TICK_MS = 90 * 1000;
// FASE 5.32 (2026-05-21): los umbrales y cooldowns vienen de motorConfigService.
// Estas constantes locales se hidratan en cada tick.

// FASE 5.34 (2026-05-22): cooldowns persistentes en tabla `cascade_cooldowns`.
// Sobreviven a restarts del backend — evita oleadas de re-disparos inmediatos
// tras un reinicio.
//
// API helper interna: lastFiredCooldown(entity_type, entity_id, evento_tipo)
//   → devuelve ms desde el último disparo, o Infinity si nunca disparó.
// setFiredCooldown(entity_type, entity_id, evento_tipo)
//   → UPSERT con fired_at=NOW().

async function lastFiredCooldown(entityType: string, entityId: string, eventoTipo: string): Promise<number> {
  try {
    const row = await sqlDb('cascade_cooldowns')
      .where({ entity_type: entityType, entity_id: entityId, evento_tipo: eventoTipo })
      .first();
    if (!row || !row.fired_at) return Infinity;
    const ts = row.fired_at instanceof Date ? row.fired_at.getTime() : Date.parse(String(row.fired_at));
    return Date.now() - ts;
  } catch {
    return Infinity;
  }
}

async function setFiredCooldown(entityType: string, entityId: string, eventoTipo: string, meta?: Record<string, unknown>): Promise<void> {
  try {
    await sqlDb('cascade_cooldowns')
      .insert({
        entity_type: entityType,
        entity_id: entityId,
        evento_tipo: eventoTipo,
        fired_at: sqlDb.fn.now(),
        data_jsonb: meta ?? {},
      })
      .onConflict(['entity_type', 'entity_id', 'evento_tipo'])
      .merge({ fired_at: sqlDb.fn.now(), data_jsonb: meta ?? {} });
  } catch (e) {
    logger.warn('[cascadeCooldown] error UPSERT', { err: String(e).slice(0, 100) });
  }
}

let _timer: ReturnType<typeof setInterval> | null = null;

interface LineaAgg {
  linea: string;
  agency_id: string | null;
  total: number;
  atrasados: number;
}

interface CocheRow {
  id_bus: string;
  agency_id: string | null;
  linea: string | null;
  timestamp_gps: Date;
}

async function detectarRetrasoPorLinea(): Promise<void> {
  const cfg = await getMotorConfig();
  const rows: LineaAgg[] = await sqlDb('bus_last_pos')
    .select('linea', 'agency_id')
    .count<{ total: string }>('* as total')
    .select(sqlDb.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'ATRASADO') AS atrasados"))
    .whereNotNull('linea')
    .andWhere('timestamp_gps', '>=', sqlDb.raw("NOW() - INTERVAL '10 minutes'"))
    .groupBy('linea', 'agency_id') as unknown as LineaAgg[];

  const ahora = Date.now();
  for (const r of rows) {
    const total = Number(r.total);
    const atrasados = Number((r as unknown as { atrasados: string }).atrasados);
    if (total < cfg.retrasoMinBuses) continue;
    const pct = (atrasados / total) * 100;
    if (pct < cfg.retrasoThresholdPct) continue;
    const key = `${r.agency_id ?? 'NA'}:${r.linea}`;
    const elapsed = await lastFiredCooldown('linea', key, 'RETRASO_OPERATIVO');
    if (elapsed < cfg.cooldownLineaMs) continue;
    await setFiredCooldown('linea', key, 'RETRASO_OPERATIVO', { atrasados, total, pct });
    try {
      const res = await computeConsequencesForEvent({
        tipo: 'RETRASO_OPERATIVO',
        lineaId: r.linea,
        agencyId: r.agency_id ?? '',
        empresaId: r.agency_id ?? '',
        conductorId: 'sistema-auto',
        minutosRetraso: Math.round(pct / 3), // estimación: % de impuntualidad ≈ minutos
        causa: `Detección automática: ${atrasados}/${total} buses ATRASADO (${pct.toFixed(0)}%) en línea ${r.linea}`,
        fuente: 'cascadeAutoTriggerScheduler',
      });
      if (res.ok) {
        logger.info(`[AUTO-CASCADE] línea ${r.linea} (agency ${r.agency_id}) → ${atrasados}/${total} ATRASADOS (${pct.toFixed(0)}%) — efectos=${res.efectos.length}`);
      }
    } catch (e) {
      logger.warn('[AUTO-CASCADE] error en línea ' + r.linea, { err: String(e).slice(0, 100) });
    }
  }
}

async function detectarFueraDeServicio(): Promise<void> {
  const cfg = await getMotorConfig();
  const rows: CocheRow[] = await sqlDb('bus_last_pos')
    .select('id_bus', 'agency_id', 'linea', 'timestamp_gps')
    .where('estado_cumplimiento', 'FUERA_DE_SERVICIO')
    .andWhere('timestamp_gps', '<=', sqlDb.raw(`NOW() - INTERVAL '${cfg.cocheFdsMinMin} minutes'`))
    .andWhere('timestamp_gps', '>=', sqlDb.raw("NOW() - INTERVAL '30 minutes'"));

  for (const r of rows) {
    const elapsed = await lastFiredCooldown('coche', r.id_bus, 'VEHICULO_FUERA_DE_SERVICIO');
    if (elapsed < cfg.cooldownCocheMs) continue;
    await setFiredCooldown('coche', r.id_bus, 'VEHICULO_FUERA_DE_SERVICIO', { linea: r.linea });
    try {
      const res = await computeConsequencesForEvent({
        tipo: 'VEHICULO_FUERA_DE_SERVICIO',
        cocheId: r.id_bus,
        cocheNumero: r.id_bus,
        lineaId: r.linea ?? '',
        agencyId: r.agency_id ?? '',
        empresaId: r.agency_id ?? '',
        motivoVehiculo: 'desconocido_gps',
        horasEstimadas: 1,
        kmPerdidos: 20,
        fuente: 'cascadeAutoTriggerScheduler',
      });
      if (res.ok) {
        logger.info(`[AUTO-CASCADE] coche ${r.id_bus} FUERA_DE_SERVICIO ${cfg.cocheFdsMinMin}min+ — efectos=${res.efectos.length}`);
      }
    } catch (e) {
      logger.warn('[AUTO-CASCADE] error en coche ' + r.id_bus, { err: String(e).slice(0, 100) });
    }
  }
}

// FASE 5.32 (2026-05-21): bunching — 2+ buses de la misma línea en el mismo
// sentido a menos de `bunchingDistanciaMetros` (default 500m). Indica
// pérdida de regularidad: dos servicios pegados → frecuencia desbalanceada.
//
// Usa PostGIS ST_DWithin sobre la columna `geom` (geography cast para metros).
// La query devuelve pares (a.id_bus, b.id_bus) deduplicados con a.id < b.id.
async function detectarBunching(): Promise<void> {
  const cfg = await getMotorConfig();
  const distMetros = cfg.bunchingDistanciaMetros;
  let rows: Array<{ linea: string; agency_id: string | null; id_bus_a: string; id_bus_b: string; metros: number }> = [];
  try {
    rows = (await sqlDb.raw(
      `SELECT a.linea, a.agency_id, a.id_bus AS id_bus_a, b.id_bus AS id_bus_b,
              ST_Distance(a.geom::geography, b.geom::geography) AS metros
         FROM bus_last_pos a
         JOIN bus_last_pos b
           ON a.linea = b.linea
          AND a.agency_id = b.agency_id
          AND a.id_bus < b.id_bus
          AND (a.sentido IS NULL OR b.sentido IS NULL OR a.sentido = b.sentido)
        WHERE a.timestamp_gps >= NOW() - INTERVAL '5 minutes'
          AND b.timestamp_gps >= NOW() - INTERVAL '5 minutes'
          AND a.linea IS NOT NULL
          AND a.geom IS NOT NULL
          AND b.geom IS NOT NULL
          AND ST_DWithin(a.geom::geography, b.geom::geography, ?)
        LIMIT 50`,
      [distMetros],
    )).rows;
  } catch (e) {
    logger.warn('[AUTO-CASCADE] bunching SQL error', { err: String(e).slice(0, 120) });
    return;
  }
  for (const r of rows) {
    const key = `${r.agency_id ?? 'NA'}:${r.linea}:${r.id_bus_a}|${r.id_bus_b}`;
    const elapsed = await lastFiredCooldown('par_buses', key, 'BUNCHING');
    // Cooldown más corto (15min) para que el bunching del próximo ciclo no
    // se invisibilice cuando los buses se separan y vuelven a juntarse.
    if (elapsed < 15 * 60 * 1000) continue;
    await setFiredCooldown('par_buses', key, 'BUNCHING', { metros: Math.round(r.metros) });
    try {
      const res = await computeConsequencesForEvent({
        tipo: 'RETRASO_OPERATIVO',
        lineaId: r.linea,
        agencyId: r.agency_id ?? '',
        empresaId: r.agency_id ?? '',
        conductorId: 'sistema-auto',
        minutosRetraso: 8, // bunching ≈ 8 min de irregularidad equivalente
        causa: `Bunching: coches ${r.id_bus_a} y ${r.id_bus_b} a ${Math.round(r.metros)}m en línea ${r.linea}`,
        fuente: 'cascadeAutoTriggerScheduler:bunching',
      });
      if (res.ok) {
        logger.info(`[AUTO-CASCADE] BUNCHING línea ${r.linea} ${r.id_bus_a}↔${r.id_bus_b} ${Math.round(r.metros)}m — efectos=${res.efectos.length}`);
      }
    } catch (e) {
      logger.warn('[AUTO-CASCADE] error bunching', { err: String(e).slice(0, 100) });
    }
  }
}

// FASE 5.32: baja cobertura GPS — línea operativa con menos buses con ping
// reciente que el mínimo esperado. Indica que la línea está "infrabandera"
// y posiblemente no se está cubriendo el servicio.
async function detectarBajaCobertura(): Promise<void> {
  const cfg = await getMotorConfig();
  if (cfg.coberturaMinBusesPorLinea <= 0) return;

  // Líneas conocidas (vista `lineas`) con cuántos buses GPS reportan en los
  // últimos 10 min. Si una línea con servicios programados tiene menos del
  // mínimo, gatillamos.
  let rows: Array<{ linea: string; agency_id: string | null; buses_vivos: number }> = [];
  try {
    rows = (await sqlDb.raw(
      `SELECT l.numero AS linea, l.agency_id,
              COUNT(b.id_bus) FILTER (WHERE b.timestamp_gps >= NOW() - INTERVAL '10 minutes') AS buses_vivos
         FROM lineas l
         LEFT JOIN bus_last_pos b ON b.linea = l.numero AND b.agency_id = l.agency_id
        WHERE l.numero IS NOT NULL
        GROUP BY l.numero, l.agency_id
        HAVING COUNT(b.id_bus) FILTER (WHERE b.timestamp_gps >= NOW() - INTERVAL '10 minutes') > 0
           AND COUNT(b.id_bus) FILTER (WHERE b.timestamp_gps >= NOW() - INTERVAL '10 minutes') < ?`,
      [cfg.coberturaMinBusesPorLinea],
    )).rows;
  } catch (e) {
    logger.warn('[AUTO-CASCADE] baja cobertura SQL error', { err: String(e).slice(0, 120) });
    return;
  }
  for (const r of rows) {
    const buses = Number(r.buses_vivos);
    if (buses <= 0) continue; // 0 buses puede ser madrugada legítima
    const key = `${r.agency_id ?? 'NA'}:${r.linea}`;
    const elapsed = await lastFiredCooldown('linea_cobertura', key, 'VIAJE_CANCELADO');
    // Cooldown alineado con el de retraso (60min default), para no saturar.
    if (elapsed < cfg.cooldownLineaMs) continue;
    await setFiredCooldown('linea_cobertura', key, 'VIAJE_CANCELADO', { buses });
    try {
      const res = await computeConsequencesForEvent({
        tipo: 'VIAJE_CANCELADO',
        lineaId: r.linea,
        agencyId: r.agency_id ?? '',
        empresaId: r.agency_id ?? '',
        kmEsperados: Math.max(20, (cfg.coberturaMinBusesPorLinea - buses) * 15),
        causaViaje: `Baja cobertura GPS: solo ${buses} buses operando en línea ${r.linea} (mín. ${cfg.coberturaMinBusesPorLinea})`,
        fuente: 'cascadeAutoTriggerScheduler:cobertura',
      });
      if (res.ok) {
        logger.info(`[AUTO-CASCADE] BAJA COBERTURA línea ${r.linea} (agency ${r.agency_id}) buses=${buses} < mín=${cfg.coberturaMinBusesPorLinea} — efectos=${res.efectos.length}`);
      }
    } catch (e) {
      logger.warn('[AUTO-CASCADE] error cobertura', { err: String(e).slice(0, 100) });
    }
  }
}

// FASE 5.34 (2026-05-22): headway irregular — una línea con ≥headwayMinBuses
// buses GPS recientes donde coexisten pares pegados (<headwayPegadoMetros) y
// pares lejos (>headwayLejosMetros). Esa firma indica que la distribución
// de buses sobre el recorrido está desbalanceada: algunos van uno detrás del
// otro mientras otros sectores tienen huecos enormes.
async function detectarHeadwayIrregular(): Promise<void> {
  const cfg = await getMotorConfig();
  // Una sola query: por cada línea con N≥headwayMinBuses, cuántos pares
  // están "pegados" y cuántos están "lejos" usando ST_Distance sobre todos
  // los pares (a.id<b.id).
  let rows: Array<{ linea: string; agency_id: string | null; total_buses: number; pares_pegados: number; pares_lejos: number }> = [];
  try {
    rows = (await sqlDb.raw(
      `WITH activos AS (
         SELECT id_bus, agency_id, linea, geom
           FROM bus_last_pos
          WHERE timestamp_gps >= NOW() - INTERVAL '8 minutes'
            AND linea IS NOT NULL
            AND geom IS NOT NULL
       ),
       lineas_con_buses AS (
         SELECT linea, agency_id, COUNT(*) AS n
           FROM activos
          GROUP BY linea, agency_id
         HAVING COUNT(*) >= ?
       ),
       pares AS (
         SELECT a.linea, a.agency_id,
                ST_Distance(a.geom::geography, b.geom::geography) AS metros
           FROM activos a
           JOIN activos b ON a.linea = b.linea AND a.agency_id = b.agency_id AND a.id_bus < b.id_bus
       )
       SELECT lb.linea, lb.agency_id,
              lb.n::int AS total_buses,
              COUNT(*) FILTER (WHERE p.metros < ?)::int AS pares_pegados,
              COUNT(*) FILTER (WHERE p.metros > ?)::int AS pares_lejos
         FROM lineas_con_buses lb
         JOIN pares p ON p.linea = lb.linea AND p.agency_id = lb.agency_id
        GROUP BY lb.linea, lb.agency_id, lb.n`,
      [cfg.headwayMinBuses, cfg.headwayPegadoMetros, cfg.headwayLejosMetros],
    )).rows;
  } catch (e) {
    logger.warn('[AUTO-CASCADE] headway SQL error', { err: String(e).slice(0, 120) });
    return;
  }
  for (const r of rows) {
    const pegados = Number(r.pares_pegados);
    const lejos = Number(r.pares_lejos);
    // Necesitamos coexistencia real: al menos 1 par pegado Y al menos 1 lejos.
    if (pegados < 1 || lejos < 1) continue;
    const key = `${r.agency_id ?? 'NA'}:${r.linea}`;
    const elapsed = await lastFiredCooldown('linea_headway', key, 'RETRASO_OPERATIVO');
    if (elapsed < cfg.cooldownLineaMs) continue;
    await setFiredCooldown('linea_headway', key, 'RETRASO_OPERATIVO', { pegados, lejos, total: r.total_buses });
    try {
      const res = await computeConsequencesForEvent({
        tipo: 'RETRASO_OPERATIVO',
        lineaId: r.linea,
        agencyId: r.agency_id ?? '',
        empresaId: r.agency_id ?? '',
        conductorId: 'sistema-auto',
        minutosRetraso: 10, // headway irregular ≈ 10min de impuntualidad equivalente
        causa: `Headway irregular en línea ${r.linea}: ${pegados} pares pegados y ${lejos} pares >${(cfg.headwayLejosMetros / 1000).toFixed(1)}km entre sí (${r.total_buses} buses)`,
        fuente: 'cascadeAutoTriggerScheduler:headway',
      });
      if (res.ok) {
        logger.info(`[AUTO-CASCADE] HEADWAY_IRREGULAR línea ${r.linea} (agency ${r.agency_id}) pegados=${pegados} lejos=${lejos} buses=${r.total_buses} — efectos=${res.efectos.length}`);
      }
    } catch (e) {
      logger.warn('[AUTO-CASCADE] error headway', { err: String(e).slice(0, 100) });
    }
  }
}

// FASE 5.35 (2026-05-22): velocidad anómala — un coche con N pings
// consecutivos en velocidad muy baja (<velocidadAnomalaKmhMin) sostenidos
// en los últimos 8 min. Indica atascamiento serio o vehículo detenido en
// ruta.
async function detectarVelocidadAnomala(): Promise<void> {
  const cfg = await getMotorConfig();
  let rows: Array<{ id_bus: string; agency_id: string | null; linea: string | null; muestras: number; vel_avg: number }> = [];
  try {
    rows = (await sqlDb.raw(
      `SELECT id_bus,
              agency_id,
              MAX(linea) AS linea,
              COUNT(*) AS muestras,
              AVG(velocidad) AS vel_avg
         FROM vehicle_events
        WHERE timestamp_gps >= NOW() - INTERVAL '8 minutes'
          AND velocidad IS NOT NULL
          AND velocidad >= 0
        GROUP BY id_bus, agency_id
       HAVING COUNT(*) >= ?
          AND MAX(velocidad) < ?
          AND AVG(velocidad) < ?`,
      [cfg.velocidadAnomalaMuestraMin, cfg.velocidadAnomalaKmhMin, cfg.velocidadAnomalaKmhMin],
    )).rows;
  } catch (e) {
    // Si vehicle_events no tiene la columna velocidad (algunos esquemas no la tienen),
    // probamos con bus_last_pos como fallback.
    try {
      rows = (await sqlDb('bus_last_pos')
        .select('id_bus', 'agency_id', 'linea')
        .where('timestamp_gps', '>=', sqlDb.raw("NOW() - INTERVAL '8 minutes'"))
        .andWhere('velocidad', '<', cfg.velocidadAnomalaKmhMin)
        .andWhere('velocidad', '>=', 0)
        .limit(50)) as Array<{ id_bus: string; agency_id: string | null; linea: string | null }> as unknown as typeof rows;
      // Sin contar muestras en este fallback — saltamos.
      logger.warn('[AUTO-CASCADE] velocidad: usando fallback bus_last_pos (sin agregación temporal)', { err: String(e).slice(0, 80) });
      return;
    } catch (e2) {
      logger.warn('[AUTO-CASCADE] velocidad SQL error', { err: String(e2).slice(0, 100) });
      return;
    }
  }
  for (const r of rows) {
    const elapsed = await lastFiredCooldown('coche_vel', r.id_bus, 'VEHICULO_FUERA_DE_SERVICIO');
    // Cooldown 2h para velocidad anómala (entre FDS 4h y bunching 15min).
    if (elapsed < 2 * 60 * 60 * 1000) continue;
    await setFiredCooldown('coche_vel', r.id_bus, 'VEHICULO_FUERA_DE_SERVICIO', {
      muestras: Number(r.muestras),
      velPromedio: Number(r.vel_avg).toFixed(2),
    });
    try {
      const res = await computeConsequencesForEvent({
        tipo: 'VEHICULO_FUERA_DE_SERVICIO',
        cocheId: r.id_bus,
        cocheNumero: r.id_bus,
        lineaId: r.linea ?? '',
        agencyId: r.agency_id ?? '',
        empresaId: r.agency_id ?? '',
        motivoVehiculo: 'velocidad_anomala',
        horasEstimadas: 0.5,
        kmPerdidos: 8,
        causa: `Velocidad anómala: coche ${r.id_bus} con ${r.muestras} pings consecutivos a <${cfg.velocidadAnomalaKmhMin} km/h (promedio ${Number(r.vel_avg).toFixed(1)} km/h)`,
        fuente: 'cascadeAutoTriggerScheduler:velocidad',
      });
      if (res.ok) {
        logger.info(`[AUTO-CASCADE] VELOCIDAD_ANOMALA coche ${r.id_bus} (línea ${r.linea}) avg=${Number(r.vel_avg).toFixed(1)}km/h muestras=${r.muestras} — efectos=${res.efectos.length}`);
      }
    } catch (e) {
      logger.warn('[AUTO-CASCADE] error velocidad', { err: String(e).slice(0, 100) });
    }
  }
}

// FASE 5.35 (2026-05-22): inspecciones ausentes — líneas con servicios activos
// que llevan ≥inspeccionAusenteDias sin recibir ninguna inspección registrada.
// Indica gestión de inspectores deficitaria o cobertura zonal nula.
async function detectarInspeccionesAusentes(): Promise<void> {
  const cfg = await getMotorConfig();
  let rows: Array<{ linea: string; agency_id: string | null; dias_sin_inspeccion: number }> = [];
  try {
    rows = (await sqlDb.raw(
      `WITH lineas_activas AS (
         SELECT DISTINCT linea, agency_id
           FROM bus_last_pos
          WHERE timestamp_gps >= NOW() - INTERVAL '2 hours'
            AND linea IS NOT NULL
       ),
       ult_inspeccion AS (
         SELECT (data_jsonb->>'lineId') AS linea,
                agency_id,
                MAX(fecha_inspeccion) AS ultima
           FROM inspecciones
          WHERE data_jsonb->>'lineId' IS NOT NULL
          GROUP BY (data_jsonb->>'lineId'), agency_id
       )
       SELECT la.linea, la.agency_id,
              EXTRACT(EPOCH FROM (NOW() - COALESCE(ui.ultima, NOW() - INTERVAL '365 days'))) / 86400 AS dias_sin_inspeccion
         FROM lineas_activas la
         LEFT JOIN ult_inspeccion ui ON ui.linea = la.linea AND ui.agency_id = la.agency_id
        WHERE COALESCE(ui.ultima, NOW() - INTERVAL '365 days') < NOW() - (? || ' days')::interval
        LIMIT 50`,
      [cfg.inspeccionAusenteDias],
    )).rows;
  } catch (e) {
    logger.warn('[AUTO-CASCADE] inspecciones-ausentes SQL error', { err: String(e).slice(0, 120) });
    return;
  }
  for (const r of rows) {
    const dias = Number(r.dias_sin_inspeccion);
    if (!Number.isFinite(dias) || dias < cfg.inspeccionAusenteDias) continue;
    const key = `${r.agency_id ?? 'NA'}:${r.linea}`;
    const elapsed = await lastFiredCooldown('linea_inspeccion', key, 'VIAJE_CANCELADO');
    // Cooldown alineado con días (24h por defecto) — la línea no se re-evalúa
    // hasta el día siguiente.
    if (elapsed < 24 * 60 * 60 * 1000) continue;
    await setFiredCooldown('linea_inspeccion', key, 'VIAJE_CANCELADO', { diasSinInspeccion: dias });
    try {
      const res = await computeConsequencesForEvent({
        tipo: 'VIAJE_CANCELADO',
        lineaId: r.linea,
        agencyId: r.agency_id ?? '',
        empresaId: r.agency_id ?? '',
        kmEsperados: 20, // valor simbólico; el efecto real es la falta de control
        causaViaje: `Sin inspección en línea ${r.linea} hace ${Math.round(dias)} días. Riesgo de incumplimiento sin detectar.`,
        fuente: 'cascadeAutoTriggerScheduler:inspecciones-ausentes',
      });
      if (res.ok) {
        logger.info(`[AUTO-CASCADE] INSPECCIONES_AUSENTES línea ${r.linea} (agency ${r.agency_id}) días=${Math.round(dias)} — efectos=${res.efectos.length}`);
      }
    } catch (e) {
      logger.warn('[AUTO-CASCADE] error inspecciones-ausentes', { err: String(e).slice(0, 100) });
    }
  }
}

async function tick(): Promise<void> {
  try {
    await Promise.all([
      detectarRetrasoPorLinea(),
      detectarFueraDeServicio(),
      detectarBunching(),
      detectarBajaCobertura(),
      detectarHeadwayIrregular(),
      detectarVelocidadAnomala(),
      detectarInspeccionesAusentes(),
    ]);
  } catch (e) {
    logger.warn('[cascadeAutoTrigger] tick error', { err: String(e).slice(0, 200) });
  }
}

export function startCascadeAutoTrigger(): void {
  if (_timer) return;
  logger.info(`[cascadeAutoTrigger] ACTIVO · cada ${TICK_MS / 1000}s (retraso, FDS, bunching, baja-cobertura, headway, velocidad-anomala, inspecciones-ausentes — params en system_config, cooldowns en cascade_cooldowns)`);
  // Primer tick demorado 30s para no competir con el arranque.
  setTimeout(() => { void tick(); }, 30_000);
  _timer = setInterval(() => { void tick(); }, TICK_MS);
}

export function stopCascadeAutoTrigger(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
