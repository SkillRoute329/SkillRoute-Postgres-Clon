/**
 * pollerService.ts — Poller autónomo IMM → Postgres (FASE 3.5)
 *
 * Corazón de la soberanía de datos del clon: corre 24/7 dentro del backend,
 * pega a la API IMM cada N segundos, calcula compliance contra GTFS local,
 * persiste resultados en Postgres (vehicle_events, bus_last_pos), y registra
 * cada ciclo en poller_health para audit trail.
 *
 * Reglas aplicadas:
 *   - REGLA -4 ESCALABILIDAD: corre stateless, sin acumular memoria; los datos
 *     viven en Postgres, no en RAM.
 *   - REGLA -3 ESTÁNDARES: cada ciclo se loguea en poller_health (ISO 27001
 *     A.12.1). Compatible con KPIs UITP (OTP, headway, coverage).
 *   - REGLA -2 NO SIMULACIÓN: solo persiste lo que IMM devuelve realmente. Si
 *     IMM cae, registra el error y reintenta; no inventa data.
 *   - REGLA -1 NO REGRESIÓN: cero impacto en endpoints existentes. Es un loop
 *     independiente.
 *   - REGLA #0 SONNET: este código es directo, sin sobreingeniería.
 *
 * Configuración por env:
 *   POLLER_ENABLED=true|false        (default true)
 *   POLLER_AGENCIES=70,50,20,10      (CSV de agencyIds STM: 70=UCOT, 50=CUTCSA,
 *                                     20=COME, 10=COETC. Default: las 4.)
 *   POLLER_INTERVAL_MS=10000         (10 seg; mínimo seguro 5000)
 *   POLLER_VERSION=1.0
 *
 * Endpoints expuestos en otro archivo (audit.routes.ts) consumen poller_health
 * y bus_eta_predictions para reportes de auditoría IMM.
 */

import sqlDb from '../config/database';
import logger from '../config/logger';
import {
  analyzeComplianceForAgency,
  BusComplianceResult,
} from './scheduleComplianceEngine';
import { saveComplianceSnapshot } from './vehicleHistoryService';

// ─── Configuración ──────────────────────────────────────────────────────────

interface PollerConfig {
  enabled: boolean;
  agencies: string[];
  intervalMs: number;
  version: string;
}

function readConfig(): PollerConfig {
  const enabled = (process.env.POLLER_ENABLED ?? 'true').toLowerCase() !== 'false';
  // Default: las 4 operadoras STM en orden de relevancia para la auditoría IMM:
  // 70=UCOT (operador del clon), 50=CUTCSA, 20=COME, 10=COETC.
  const agenciesRaw = process.env.POLLER_AGENCIES ?? '70,50,20,10';
  const agencies = agenciesRaw.split(',').map((s) => s.trim()).filter(Boolean);
  const intervalMs = Math.max(5000, parseInt(process.env.POLLER_INTERVAL_MS ?? '10000', 10));
  const version = process.env.POLLER_VERSION ?? '1.0';
  return { enabled, agencies, intervalMs, version };
}

// ─── Estado interno (singleton) ────────────────────────────────────────────

let timer: NodeJS.Timeout | null = null;
let isRunning = false;
let cycleInFlight = false;
let totalCycles = 0;
let totalErrors = 0;
let totalEventsPersisted = 0;
let lastCycleAt: Date | null = null;
let config: PollerConfig = readConfig();

export interface PollerStats {
  isRunning: boolean;
  totalCycles: number;
  totalErrors: number;
  totalEventsPersisted: number;
  lastCycleAt: string | null;
  config: PollerConfig;
}

export function getPollerStats(): PollerStats {
  return {
    isRunning,
    totalCycles,
    totalErrors,
    totalEventsPersisted,
    lastCycleAt: lastCycleAt?.toISOString() ?? null,
    config,
  };
}

// ─── Actualización de bus_last_pos a partir del compliance result ──────────

async function updateBusLastPos(results: BusComplianceResult[]): Promise<number> {
  if (results.length === 0) return 0;
  let updated = 0;
  for (const r of results) {
    try {
      // FASE 5.14 (2026-05-13): id_bus DEBE incluir agency_id como prefijo,
      // porque CUTCSA, UCOT, COME, COETC pueden tener buses con el mismo
      // codigoBus (ej. cada uno tiene un bus 46). Sin prefijo, el UPSERT por
      // id_bus colisiona entre operadores y se pierden registros. El formato
      // estandar es `${agency_id}_${codigoBus}`.
      const rawId = String(r.idBus);
      const id = rawId.startsWith(`${r.agencyId}_`) ? rawId : `${r.agencyId}_${rawId}`;
      const row = {
        id_bus: id,
        agency_id: r.agencyId,
        linea: r.linea,
        lat: r.lat,
        lon: r.lon,
        geom: sqlDb.raw('ST_SetSRID(ST_MakePoint(?, ?), 4326)', [r.lon, r.lat]),
        velocidad: r.velocidad,
        estado_cumplimiento: r.estadoCumplimiento,
        timestamp_gps: r.timestampGPS,
        // FASE 5.14: destino + sentido top-level (ademas de data_jsonb).
        destino: r.destino ?? null,
        sentido: r.sentido ?? null,
        data_jsonb: JSON.stringify({
          empresa: r.empresa,
          codigoBus: rawId,
          tripId: r.tripActivo?.trip_id ?? null,
          proximaParada: r.proximaParadaControl?.name ?? null,
          desviacionMin: r.desviacionMin,
          distanciaParadaKm: r.distanciaParadaKm,
          minutosParaProximaParada: r.minutosParaProximaParada,
          destino: r.destino ?? null,
          sentido: r.sentido ?? null,
        }),
      };
      await sqlDb('bus_last_pos')
        .insert(row)
        .onConflict('id_bus')
        .merge(['agency_id', 'linea', 'lat', 'lon', 'geom', 'velocidad', 'estado_cumplimiento', 'timestamp_gps', 'destino', 'sentido', 'data_jsonb']);
      updated++;
    } catch (e) {
      logger.warn(`[Poller] error actualizando bus_last_pos para ${r.idBus}`, { err: String(e) });
    }
  }
  return updated;
}

// ─── Cálculo de ETAs por parada (sub-componente FASE 3.5.4) ────────────────

async function updateEtaPredictions(results: BusComplianceResult[]): Promise<number> {
  let written = 0;
  for (const r of results) {
    if (!r.tripActivo || !r.proximaParadaControl || r.minutosParaProximaParada == null) continue;

    // ETA mínima: la próxima parada conocida del trip activo.
    // Versión 1.0: solo guardamos ETA a 1 parada (la próxima). La extensión a
    // las próximas N paradas requiere agregar lookup en gtfs.stop_times del
    // trip activo — se hace en una versión 1.1 cuando haya frontend pidiéndolo.
    try {
      const stopId = r.proximaParadaControl.stop_id ?? r.proximaParadaControl.name;
      if (!stopId) continue;
      const etaSeconds = Math.round((r.minutosParaProximaParada ?? 0) * 60);
      const etaTs = new Date(Date.now() + etaSeconds * 1000);
      const distanceMeters = r.distanciaParadaKm != null ? Math.round(r.distanciaParadaKm * 1000) : null;

      // FASE 5.14 (2026-05-13): id_bus prefijado con agency_id para evitar
      // colisión cuando dos operadores tienen mismo codigoBus (mismo bug que
      // bus_last_pos). Sin prefijo, el ETA UCOT pisa al ETA CUTCSA para la
      // misma parada.
      const rawId = String(r.idBus);
      const id = rawId.startsWith(`${r.agencyId}_`) ? rawId : `${r.agencyId}_${rawId}`;
      const row = {
        id_bus: id,
        stop_id: String(stopId),
        agency_id: r.agencyId,
        linea: r.linea,
        trip_id: r.tripActivo.trip_id ?? null,
        stop_sequence: null,
        eta_seconds: etaSeconds,
        eta_timestamp: etaTs,
        distance_meters: distanceMeters,
        speed_kmh: r.velocidad,
        computed_at: new Date(),
      };
      await sqlDb('bus_eta_predictions')
        .insert(row)
        .onConflict(['id_bus', 'stop_id'])
        .merge(['agency_id', 'linea', 'trip_id', 'stop_sequence', 'eta_seconds', 'eta_timestamp', 'distance_meters', 'speed_kmh', 'computed_at']);
      written++;
    } catch (e) {
      logger.warn(`[Poller] error actualizando ETA para ${r.idBus}`, { err: String(e) });
    }
  }
  return written;
}

// ─── Registro del ciclo en poller_health ───────────────────────────────────

interface CycleSummary {
  agencyId: string;
  cycleStart: Date;
  cycleEnd: Date;
  busesReceived: number;
  eventsPersisted: number;
  lastPosUpdated: number;
  etaPredictions: number;
  errors: number;
  errorMessage: string | null;
}

async function recordCycleHealth(s: CycleSummary): Promise<void> {
  try {
    await sqlDb('poller_health').insert({
      agency_id: s.agencyId,
      cycle_start: s.cycleStart,
      cycle_end: s.cycleEnd,
      duration_ms: s.cycleEnd.getTime() - s.cycleStart.getTime(),
      buses_received: s.busesReceived,
      events_persisted: s.eventsPersisted,
      last_pos_updated: s.lastPosUpdated,
      eta_predictions: s.etaPredictions,
      errors: s.errors,
      error_message: s.errorMessage,
      source: 'IMM_API',
      poller_version: config.version,
    });
  } catch (e) {
    // El registro en poller_health no debe romper el poller. Solo loguear.
    logger.error('[Poller] no se pudo persistir poller_health', { err: String(e) });
  }
}

// ─── Un ciclo del poller ───────────────────────────────────────────────────

async function runCycle(agencyId: string): Promise<void> {
  const cycleStart = new Date();
  let busesReceived = 0;
  let eventsPersisted = 0;
  let lastPosUpdated = 0;
  let etaPredictions = 0;
  let errors = 0;
  let errorMessage: string | null = null;

  try {
    // 1. Compliance + persistencia de vehicle_events (vía vehicleHistoryService).
    const results = await analyzeComplianceForAgency(agencyId);
    busesReceived = results.length;

    if (results.length > 0) {
      // Esto persiste a vehicle_events (FASE 2.4 migrada a Postgres)
      await saveComplianceSnapshot(results);
      eventsPersisted = results.length;

      // 2. Actualizar bus_last_pos (snapshot rápido)
      lastPosUpdated = await updateBusLastPos(results);

      // 3. ETAs por parada (FASE 3.5.4)
      etaPredictions = await updateEtaPredictions(results);
    }

    totalEventsPersisted += eventsPersisted;
  } catch (e) {
    errors = 1;
    errorMessage = e instanceof Error ? e.message : String(e);
    totalErrors++;
    logger.error(`[Poller] error en ciclo agency=${agencyId}`, { err: errorMessage });
  }

  const cycleEnd = new Date();

  await recordCycleHealth({
    agencyId,
    cycleStart,
    cycleEnd,
    busesReceived,
    eventsPersisted,
    lastPosUpdated,
    etaPredictions,
    errors,
    errorMessage,
  });

  totalCycles++;
  lastCycleAt = cycleEnd;

  if (totalCycles % 30 === 0) {
    // Cada 30 ciclos (= ~5 min con interval=10s) log heartbeat informativo
    logger.info(
      `[Poller] heartbeat — cycles=${totalCycles} events=${totalEventsPersisted} errors=${totalErrors} lastAgency=${agencyId}`,
    );
  }
}

// ─── Ciclo cooperativo (todas las agencies configuradas, una vez) ──────────

async function runAllAgencies(): Promise<void> {
  if (cycleInFlight) {
    logger.warn('[Poller] ciclo anterior aún en curso; salteando para evitar overlap');
    return;
  }
  cycleInFlight = true;
  try {
    for (const agencyId of config.agencies) {
      await runCycle(agencyId);
    }
  } finally {
    cycleInFlight = false;
  }
}

// ─── API pública ───────────────────────────────────────────────────────────

export function startPoller(): void {
  config = readConfig(); // re-lee env por si cambió
  if (!config.enabled) {
    logger.info('[Poller] desactivado por POLLER_ENABLED=false');
    return;
  }
  if (isRunning) {
    logger.warn('[Poller] ya está corriendo, ignoro start');
    return;
  }
  logger.info(
    `[Poller] arrancando — agencies=[${config.agencies.join(',')}] interval=${config.intervalMs}ms version=${config.version}`,
  );
  isRunning = true;

  // Primer ciclo inmediato (no esperar el primer interval)
  runAllAgencies().catch((e) =>
    logger.error('[Poller] error en primer ciclo', { err: String(e) }),
  );

  timer = setInterval(() => {
    runAllAgencies().catch((e) =>
      logger.error('[Poller] error en ciclo programado', { err: String(e) }),
    );
  }, config.intervalMs);
}

export function stopPoller(): void {
  if (!isRunning) return;
  logger.info(`[Poller] deteniendo — total cycles=${totalCycles} events=${totalEventsPersisted}`);
  if (timer) clearInterval(timer);
  timer = null;
  isRunning = false;
}
