/**
 * schedulesService.ts — Cronogramas oficiales STM cross-operador
 * =================================================================
 * Lee `horarios_stm/{linea}` (poblado por refreshAllStmHorarios cron) y
 * expone una API uniforme para consultar:
 *  - Lista de salidas del día (Hábiles / Sábados / Domingos)
 *  - Frecuencia dominante en minutos
 *  - Próxima salida dada una hora
 *  - Hora de origen ↔ destino del primer/último servicio del día
 *
 * Compatible con TODOS los operadores del sistema metropolitano (UCOT,
 * CUTCSA, COME, COETC) ya que `horarios_stm` no filtra por agencyId
 * — la línea es la clave única (ej. '300', 'CE1', 'L-12').
 *
 * Cache en memoria por línea (10 min TTL) para evitar reads repetidos.
 */
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export type TipoDiaSTM = 'Hábiles' | 'Sábados' | 'Domingos';

export interface SalidaProgramada {
  desde: string;   // HH:MM hora de salida
  hacia: string;   // HH:MM hora estimada llegada
  origen: string;  // Terminal / parada de origen
  destino: string; // Terminal / parada de destino
}

export interface DiaProgramado {
  variantes?: unknown[];
  salidasTodas: SalidaProgramada[];
  frecuenciaDominanteMin: number;
}

export interface HorarioLinea {
  linea: string;
  dias: Partial<Record<TipoDiaSTM, DiaProgramado>>;
  scrapedAt?: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { ts: number; data: HorarioLinea | null }>();

/** Determina el TipoDia a partir de una fecha. Default Mvd UTC-3. */
export function tipoDiaDe(d: Date = new Date()): TipoDiaSTM {
  const local = new Date(d.getTime() - 3 * 3600 * 1000);
  const dow = local.getUTCDay();
  if (dow === 0) return 'Domingos';
  if (dow === 6) return 'Sábados';
  return 'Hábiles';
}

/** Carga el doc de horarios para una línea. Cache por línea. */
export async function getHorarioByLinea(linea: string): Promise<HorarioLinea | null> {
  const key = String(linea).trim();
  if (!key) return null;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  try {
    const ref = doc(db, 'horarios_stm', key);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      cache.set(key, { ts: Date.now(), data: null });
      return null;
    }
    const data = snap.data() as HorarioLinea;
    cache.set(key, { ts: Date.now(), data });
    return data;
  } catch (err) {
    console.warn(`[schedulesService] Error cargando horarios_stm/${key}:`, err);
    return null;
  }
}

/** Devuelve las salidas del día indicado. Vacío si no hay datos. */
export async function getSalidasByLineaTipoDia(
  linea: string,
  tipoDia: TipoDiaSTM = tipoDiaDe(),
): Promise<SalidaProgramada[]> {
  const horario = await getHorarioByLinea(linea);
  return horario?.dias?.[tipoDia]?.salidasTodas ?? [];
}

/** Cuenta de viajes programados del día (proxy para "viajesDia"). */
export async function getViajesDia(
  linea: string,
  tipoDia: TipoDiaSTM = tipoDiaDe(),
): Promise<number> {
  const salidas = await getSalidasByLineaTipoDia(linea, tipoDia);
  return salidas.length;
}

/** Frecuencia dominante (minutos) o null si no hay datos. */
export async function getFrecuenciaDominante(
  linea: string,
  tipoDia: TipoDiaSTM = tipoDiaDe(),
): Promise<number | null> {
  const horario = await getHorarioByLinea(linea);
  const f = horario?.dias?.[tipoDia]?.frecuenciaDominanteMin;
  return typeof f === 'number' ? f : null;
}

function hhmmToMinutes(hhmm: string): number | null {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1]!, 10);
  const min = parseInt(m[2]!, 10);
  return h * 60 + min;
}

/** Próxima salida desde una hora dada. */
export async function getNextDeparture(
  linea: string,
  atTime?: string | Date,
): Promise<{ desde: string; hacia: string; origen: string; destino: string; enMinutos: number } | null> {
  const tipo = atTime instanceof Date ? tipoDiaDe(atTime) : tipoDiaDe();
  const salidas = await getSalidasByLineaTipoDia(linea, tipo);
  if (salidas.length === 0) return null;

  let nowMin: number;
  if (typeof atTime === 'string') {
    const m = hhmmToMinutes(atTime);
    if (m === null) return null;
    nowMin = m;
  } else {
    const d = atTime instanceof Date ? atTime : new Date();
    const local = new Date(d.getTime() - 3 * 3600 * 1000);
    nowMin = local.getUTCHours() * 60 + local.getUTCMinutes();
  }

  let best: { salida: SalidaProgramada; enMinutos: number } | null = null;
  for (const s of salidas) {
    const sm = hhmmToMinutes(s.desde);
    if (sm === null) continue;
    let delta = sm - nowMin;
    if (delta < 0) delta += 24 * 60; // wraparound mañana siguiente
    if (best === null || delta < best.enMinutos) {
      best = { salida: s, enMinutos: delta };
    }
  }
  if (!best) return null;
  return {
    desde: best.salida.desde,
    hacia: best.salida.hacia,
    origen: best.salida.origen,
    destino: best.salida.destino,
    enMinutos: best.enMinutos,
  };
}

/** Hora de la primera y última salida del día. */
export async function getVentanaOperativa(
  linea: string,
  tipoDia: TipoDiaSTM = tipoDiaDe(),
): Promise<{ primera: string; ultima: string } | null> {
  const salidas = await getSalidasByLineaTipoDia(linea, tipoDia);
  if (salidas.length === 0) return null;
  let primMin = Infinity;
  let ultMin = -Infinity;
  let primDesde = '';
  let ultDesde = '';
  for (const s of salidas) {
    const m = hhmmToMinutes(s.desde);
    if (m === null) continue;
    if (m < primMin) {
      primMin = m;
      primDesde = s.desde;
    }
    if (m > ultMin) {
      ultMin = m;
      ultDesde = s.desde;
    }
  }
  if (!primDesde || !ultDesde) return null;
  return { primera: primDesde, ultima: ultDesde };
}

/** Limpia cache (útil después de actualizar horarios). */
export function invalidateScheduleCache(linea?: string): void {
  if (linea) cache.delete(String(linea).trim());
  else cache.clear();
}
