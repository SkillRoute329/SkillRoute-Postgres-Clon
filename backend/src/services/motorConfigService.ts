/**
 * motorConfigService — Parámetros del motor de consecuencias y los auto-
 * triggers GPS, cargados desde `system_config` con cache (FASE 5.32, 2026-05-21).
 *
 * Antes eran constantes hardcoded en `consequenceController.ts` y
 * `cascadeAutoTriggerScheduler.ts`. Ahora admin las edita en vivo y todo
 * el motor las toma con TTL de 60s (sin reinicio).
 *
 * Clave en system_config: 'config_motor_consecuencias'
 * Defaults razonables si la clave no existe.
 */

import sqlDb from '../config/database';
import logger from '../config/logger';

export interface MotorConfig {
  // Tarifas (UYU)
  tarifaHoraUyu: number;        // jornal por hora
  subsidioPorKmUyu: number;     // valor STM por km
  costoReservaExtraUyu: number; // costo de activar reserva por turno
  // Umbrales del auto-trigger
  retrasoThresholdPct: number;  // % de buses ATRASADO en línea para gatillar
  retrasoMinBuses: number;      // mínimo de buses con GPS para tomar la línea
  cocheFdsMinMin: number;       // minutos en FUERA_DE_SERVICIO antes de gatillar
  bunchingDistanciaMetros: number; // distancia bajo la cual 2 buses misma línea = bunching
  coberturaMinBusesPorLinea: number; // mínimo de buses GPS esperados por línea
  // FASE 5.34 (2026-05-22): headway irregular — coexistencia de pares
  // pegados (<headwayPegadoMetros) y pares lejos (>headwayLejosMetros) en
  // la misma línea con ≥headwayMinBuses buses GPS.
  headwayMinBuses: number;
  headwayPegadoMetros: number;
  headwayLejosMetros: number;
  // FASE 5.35 (2026-05-22): nuevos detectores
  velocidadAnomalaKmhMin: number;     // velocidad bajo la cual se considera anómala (atascamiento)
  velocidadAnomalaMuestraMin: number; // cantidad de pings consecutivos en velocidad anómala
  inspeccionAusenteDias: number;      // días sin inspección en una línea para gatillar alerta
  // Cooldowns (ms)
  cooldownLineaMs: number;
  cooldownCocheMs: number;
}

export const DEFAULTS: MotorConfig = {
  tarifaHoraUyu: 1350,
  subsidioPorKmUyu: 87,
  costoReservaExtraUyu: 1800,
  retrasoThresholdPct: 30,
  retrasoMinBuses: 3,
  cocheFdsMinMin: 5,
  bunchingDistanciaMetros: 500,
  coberturaMinBusesPorLinea: 3,
  headwayMinBuses: 4,
  headwayPegadoMetros: 300,
  headwayLejosMetros: 3000,
  velocidadAnomalaKmhMin: 4,
  velocidadAnomalaMuestraMin: 3,
  inspeccionAusenteDias: 7,
  cooldownLineaMs: 60 * 60 * 1000,
  cooldownCocheMs: 4 * 60 * 60 * 1000,
};

const KEY = 'config_motor_consecuencias';
const TTL_MS = 60_000;

let cached: { value: MotorConfig; loadedAt: number } | null = null;
let inflight: Promise<MotorConfig> | null = null;

function merge(raw: Record<string, unknown> | null): MotorConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULTS };
  const out = { ...DEFAULTS };
  for (const k of Object.keys(out) as Array<keyof MotorConfig>) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      (out as Record<string, number>)[k as string] = v;
    }
  }
  return out;
}

async function fetchFromDb(): Promise<MotorConfig> {
  try {
    const row = await sqlDb('system_config').where('key', KEY).first();
    const v = row?.value_jsonb;
    const cfg = merge(v && typeof v === 'object' ? (v as Record<string, unknown>) : null);
    cached = { value: cfg, loadedAt: Date.now() };
    return cfg;
  } catch (e) {
    logger.warn('[motorConfig] error leyendo system_config, uso defaults', { err: String(e).slice(0, 100) });
    cached = { value: { ...DEFAULTS }, loadedAt: Date.now() };
    return cached.value;
  }
}

export async function getMotorConfig(): Promise<MotorConfig> {
  const now = Date.now();
  if (cached && now - cached.loadedAt < TTL_MS) return cached.value;
  if (inflight) return inflight;
  inflight = fetchFromDb().finally(() => { inflight = null; });
  return inflight;
}

export function invalidateMotorConfig(): void {
  cached = null;
}

/** Persiste config en system_config y limpia el cache para forzar reload. */
export async function setMotorConfig(partial: Partial<MotorConfig>): Promise<MotorConfig> {
  const current = await getMotorConfig();
  const merged = { ...current, ...partial };
  // Validar tipos antes de guardar
  for (const k of Object.keys(merged) as Array<keyof MotorConfig>) {
    const v = (merged as Record<string, number>)[k as string];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      throw new Error(`Valor inválido para ${String(k)}: ${v}`);
    }
  }
  const exists = await sqlDb('system_config').where('key', KEY).first();
  if (exists) {
    await sqlDb('system_config').where('key', KEY).update({ value_jsonb: merged });
  } else {
    await sqlDb('system_config').insert({ key: KEY, value_jsonb: merged });
  }
  invalidateMotorConfig();
  return merged;
}
