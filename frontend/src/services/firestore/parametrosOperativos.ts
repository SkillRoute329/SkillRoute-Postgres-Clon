/**
 * parametrosOperativos.ts — Service para parámetros operativos
 * =====================================================================
 *
 * Migrado FASE 4.4: usa apiClient hacia el backend del clon (Postgres).
 *
 * Arquitectura:
 *   Backend `parametros_operativos/{key}`   → valor vigente
 *   Backend `parametros_operativos_historial/{autoId}` → auditoría
 *   Cache en memoria                          → lectura sincrónica rápida
 *   Archivo local `config/parametros-operativos.ts` → defaults/fallback
 */

import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';
import {
  PARAMETROS_REGISTRY,
  type ParametroEconomico,
  type ConfidenceLevel,
} from '../../config/parametros-operativos';

/** Colecciones. */
const COL_PARAMS = 'parametros_operativos';
const COL_HISTORIAL = 'parametros_operativos_historial';

/** Cache en memoria — clave → parámetro completo (defaults + override backend). */
const cache = new Map<string, ParametroEconomico>();

/** Flag de inicialización: true tras el primer load exitoso desde el backend. */
let initialized = false;

/** Handle del setInterval activo para subscribeAll. */
let activeIntervalHandle: ReturnType<typeof setInterval> | null = null;

// ═══════════════════════════════════════════════════════════════════════════
// MODELO DOCUMENTO
// ═══════════════════════════════════════════════════════════════════════════

export interface ParametroDoc extends ParametroEconomico {
  updatedBy?: string;
  updatedByName?: string;
  updatedAt?: string;
}

export interface HistorialEntry {
  id?: string;
  key: string;
  valorAnterior: any;
  valorNuevo: any;
  fuenteAnterior?: string;
  fuenteNueva?: string;
  changedBy: string;
  changedByName: string;
  timestamp: string;
  motivo?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// INICIALIZACIÓN Y CACHE
// ═══════════════════════════════════════════════════════════════════════════

function bootDefaults(): void {
  for (const [key, param] of Object.entries(PARAMETROS_REGISTRY)) {
    if (!cache.has(key)) cache.set(key, param);
  }
}

export async function loadAll(): Promise<ParametroEconomico[]> {
  bootDefaults();
  try {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL_PARAMS}`, { query: { limit: 5000 } });
    (Array.isArray(res.data) ? res.data : []).forEach((d) => {
      const key = (d.id as string) ?? (d.key as string);
      if (key) cache.set(key, { ...PARAMETROS_REGISTRY[key], ...(d as ParametroDoc) });
    });
    initialized = true;
  } catch (err) {
    console.warn('[parametrosOperativos] Fallo al leer el backend, usando defaults locales:', err);
  }
  return Array.from(cache.values());
}

// FASE 5.35 (2026-05-22): bus socket en lugar de polling 15s.
export function subscribeAll(cb: (params: ParametroEconomico[]) => void): () => void {
  bootDefaults();
  return subscribeViaBus<ParametroEconomico[]>(
    COL_PARAMS,
    async () => {
      try { return await loadAll(); }
      catch { return Array.from(cache.values()); }
    },
    cb,
    { alsoListen: ['bus:db:parametros_sistema:any'] },
  );
}

export function getParametroValor<T = number>(key: string): T | undefined {
  bootDefaults();
  const p = cache.get(key);
  return p?.valor as T | undefined;
}

export function getParametro(key: string): ParametroEconomico | undefined {
  bootDefaults();
  return cache.get(key);
}

export function listParametros(): Array<{ key: string; param: ParametroEconomico }> {
  bootDefaults();
  return Array.from(cache.entries()).map(([key, param]) => ({ key, param }));
}

export function isInitialized(): boolean {
  return initialized;
}

// ═══════════════════════════════════════════════════════════════════════════
// ESCRITURA — solo Super Admin (validado por backend)
// ═══════════════════════════════════════════════════════════════════════════

export async function updateParametro(
  key: string,
  updates: Partial<ParametroEconomico>,
  motivo?: string,
): Promise<void> {
  bootDefaults();

  const prev = cache.get(key) ?? PARAMETROS_REGISTRY[key];
  if (!prev) throw new Error(`Parámetro desconocido: ${key}`);

  const now = new Date().toISOString();
  const merged: ParametroDoc = {
    ...prev,
    ...updates,
    unidad: prev.unidad,
    fechaVigenciaDesde: updates.fechaVigenciaDesde ?? now.slice(0, 10),
    updatedAt: now,
  };

  // 1. Upsert documento principal
  await apiClient.put(`/api/db/${COL_PARAMS}/${encodeURIComponent(key)}`, merged);

  // 2. Append historial (audit trail)
  await apiClient.post(`/api/db/${COL_HISTORIAL}`, {
    key,
    valorAnterior: prev.valor,
    valorNuevo: merged.valor,
    fuenteAnterior: prev.fuente,
    fuenteNueva: merged.fuente,
    timestamp: now,
    motivo: motivo ?? null,
  });

  // 3. Actualizar cache local
  cache.set(key, merged);
}

export async function seedInitial(): Promise<{ creados: number; existentes: number }> {
  let creados = 0;
  let existentes = 0;
  for (const [key, param] of Object.entries(PARAMETROS_REGISTRY)) {
    try {
      const res = await apiClient.get<Record<string, unknown>>(`/api/db/${COL_PARAMS}/${encodeURIComponent(key)}`);
      if (res.data) {
        existentes++;
        continue;
      }
    } catch { /* not found, proceed to create */ }

    const now = new Date().toISOString();
    await apiClient.put(`/api/db/${COL_PARAMS}/${encodeURIComponent(key)}`, {
      ...param,
      updatedAt: now,
    });
    await apiClient.post(`/api/db/${COL_HISTORIAL}`, {
      key,
      valorAnterior: null,
      valorNuevo: param.valor,
      fuenteAnterior: null,
      fuenteNueva: param.fuente,
      timestamp: now,
      motivo: 'Seed inicial desde archivo local',
    });
    creados++;
  }
  return { creados, existentes };
}

// ═══════════════════════════════════════════════════════════════════════════
// HISTORIAL
// ═══════════════════════════════════════════════════════════════════════════

export async function getHistorial(key: string, max: number = 10): Promise<HistorialEntry[]> {
  try {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL_HISTORIAL}`, {
      query: {
        where: `key:${key}`,
        orderBy: 'timestamp:desc',
        limit: max,
      },
    });
    return Array.isArray(res.data)
      ? res.data.map((d) => ({ id: d.id as string | undefined, ...(d as Omit<HistorialEntry, 'id'>) }))
      : [];
  } catch (err) {
    console.warn('[parametrosOperativos] Historial no disponible:', err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILIDADES PARA UI
// ═══════════════════════════════════════════════════════════════════════════

export function confidenceBadgeClass(c: ConfidenceLevel): string {
  switch (c) {
    case 'oficial':   return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'calibrado': return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    case 'estimado':  return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'hardcoded': return 'bg-red-500/15 text-red-400 border-red-500/30';
    default:          return 'bg-slate-700/40 text-slate-400 border-slate-600';
  }
}

export function confidenceLabelEs(c: ConfidenceLevel): string {
  switch (c) {
    case 'oficial':   return 'Oficial';
    case 'calibrado': return 'Calibrado (literatura)';
    case 'estimado':  return 'Estimación';
    case 'hardcoded': return 'Provisional';
    default:          return 'Desconocido';
  }
}
