/**
 * gtfsSchedulesService — lee horarios oficiales GTFS desde el backend local.
 *
 * Fuente: colección `gtfs_horarios` importada por gtfsImporter (semanal).
 * Los docs tienen docId: `{agencyId}_{routeShortName}_{directionId}`.
 *
 * Uso principal: mostrar frecuencias reales de competidores en
 * CompetitorIntelligencePage y ShadowRadar.
 */

import { apiClient } from '../clients/apiClient';

export interface HorarioGTFS {
  id: string;
  linea: string;
  empresa: string;
  agencyId: string;
  sentido: 'IDA' | 'VUELTA';
  directionId: number;
  frecuenciaPromMin: number;
  primerSalida: string;
  ultimaSalida: string;
  totalViajes: number;
  salidas: string[];
  fuente: 'GTFS_OFICIAL';
}

const COLLECTION = 'gtfs_horarios';

/** Cache en memoria para la sesión (los datos cambian semanalmente). */
const cache = new Map<string, { data: HorarioGTFS[]; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

function cacheGet(key: string): HorarioGTFS[] | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data;
  return null;
}
function cacheSet(key: string, data: HorarioGTFS[]): void {
  cache.set(key, { data, ts: Date.now() });
}

/** Horarios de una empresa específica (todas sus líneas). */
export async function getHorariosByEmpresa(agencyId: string): Promise<HorarioGTFS[]> {
  const cacheKey = `empresa:${agencyId}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const result = await apiClient.get(`/api/db/${COLLECTION}`, {
      query: { where: `agencyId:${agencyId}`, orderBy: 'linea:asc', limit: 500 },
    }) as HorarioGTFS[];
    const data = Array.isArray(result) ? result : [];
    cacheSet(cacheKey, data);
    return data;
  } catch {
    return [];
  }
}

/** Horarios de una línea específica (ambas direcciones). */
export async function getHorariosByLinea(
  linea: string,
  agencyId?: string,
): Promise<HorarioGTFS[]> {
  const cacheKey = `linea:${agencyId ?? 'all'}:${linea}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const whereClause = agencyId
      ? `linea:${linea},agencyId:${agencyId}`
      : `linea:${linea}`;
    const result = await apiClient.get(`/api/db/${COLLECTION}`, {
      query: { where: whereClause, limit: 10 },
    }) as HorarioGTFS[];
    const data = Array.isArray(result) ? result : [];
    cacheSet(cacheKey, data);
    return data;
  } catch {
    return [];
  }
}

/** Frecuencia promedio de una empresa en toda su red (para comparación rápida). */
export function calcFrecuenciaRedPromedio(horarios: HorarioGTFS[]): number {
  const validos = horarios.filter(h => h.frecuenciaPromMin > 0 && h.frecuenciaPromMin < 120);
  if (validos.length === 0) return 0;
  return Math.round(validos.reduce((a, b) => a + b.frecuenciaPromMin, 0) / validos.length);
}

/** Calcula pico/valle a partir de salidas (antes y después de 10:00). */
export function calcFrecuenciaPicoValle(salidas: string[]): {
  pico: number;
  valle: number;
} {
  if (salidas.length < 4) return { pico: 0, valle: 0 };

  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const pico = salidas.filter(t => {
    const m = toMin(t);
    return (m >= 7 * 60 && m <= 9 * 60) || (m >= 17 * 60 && m <= 19 * 60);
  });
  const valle = salidas.filter(t => {
    const m = toMin(t);
    return m >= 10 * 60 && m < 16 * 60;
  });

  const intervalos = (arr: string[]) => {
    if (arr.length < 2) return 0;
    const mins = arr.map(toMin).sort((a, b) => a - b);
    const diffs: number[] = [];
    for (let i = 1; i < mins.length; i++) {
      const d = mins[i] - mins[i - 1];
      if (d > 0 && d < 90) diffs.push(d);
    }
    return diffs.length ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length) : 0;
  };

  return { pico: intervalos(pico), valle: intervalos(valle) };
}
