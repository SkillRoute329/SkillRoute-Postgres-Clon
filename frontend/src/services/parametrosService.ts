/**
 * parametrosService — Gestión de parámetros del sistema con trazabilidad histórica.
 * Estructura Firestore: parametros_sistema/{parametroId} → { versiones: VersionParametro[] }
 * Regla fundamental: nunca se edita un valor pasado, solo se agrega uno nuevo.
 */
import { db } from '../config/firebase';
import { doc, getDoc, updateDoc, setDoc, arrayUnion } from 'firebase/firestore';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface VersionParametro {
  valor: number;
  /** Fecha ISO YYYY-MM-DD desde la que este valor entra en vigencia */
  fechaDesde: string;
  creadoPor: string;
  nota: string;
  creadoEn: string; // ISO datetime — servidor, no editable
}

export const PARAMETRO_IDS = [
  'tarifa_base',
  'tarifa_efectivo',
  'pasajeros_pico',
  'pasajeros_valle',
  'costo_falla_bajo',
  'costo_falla_alto',
] as const;

export type ParametroId = typeof PARAMETRO_IDS[number];

export const PARAMETRO_META: Record<ParametroId, { label: string; unidad: string; defaultValor: number }> = {
  tarifa_base:       { label: 'Tarifa Base',                   unidad: '$UYU / pasajero', defaultValor: 33    },
  tarifa_efectivo:   { label: 'Tarifa Efectivo (boleto físico)', unidad: '$UYU / pasajero', defaultValor: 37  },
  pasajeros_pico:    { label: 'Pasajeros Hora Pico',           unidad: 'pax / viaje',     defaultValor: 50    },
  pasajeros_valle:   { label: 'Pasajeros Hora Valle',          unidad: 'pax / viaje',     defaultValor: 30    },
  costo_falla_bajo:  { label: 'Costo Mínimo por Falla de Bus', unidad: 'USD',             defaultValor: 5000  },
  costo_falla_alto:  { label: 'Costo Máximo por Falla de Bus', unidad: 'USD',             defaultValor: 15000 },
};

// ─── Lectura ──────────────────────────────────────────────────────────────────

export async function getVersiones(id: ParametroId): Promise<VersionParametro[]> {
  const ref = doc(db, 'parametros_sistema', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return [];
  return ((snap.data().versiones ?? []) as VersionParametro[]).sort(
    (a, b) => b.fechaDesde.localeCompare(a.fechaDesde),
  );
}

export async function getAllVersiones(): Promise<Record<ParametroId, VersionParametro[]>> {
  const pairs = await Promise.all(
    PARAMETRO_IDS.map(async (id) => [id, await getVersiones(id)] as const),
  );
  return Object.fromEntries(pairs) as Record<ParametroId, VersionParametro[]>;
}

/**
 * Devuelve el valor vigente en una fecha dada.
 * Si no hay versiones cargadas para esa fecha, usa el default hardcodeado.
 */
export function getValorEnFecha(versiones: VersionParametro[], fecha: string, fallback: number): number {
  const candidatos = versiones.filter((v) => v.fechaDesde <= fecha);
  if (candidatos.length === 0) return fallback;
  // Ya vienen ordenadas desc, el primero que pase el filtro es el más reciente antes de `fecha`
  return candidatos[0].valor;
}

export function getValorActual(versiones: VersionParametro[], fallback: number): number {
  const hoy = new Date().toISOString().slice(0, 10);
  return getValorEnFecha(versiones, hoy, fallback);
}

// ─── Escritura ────────────────────────────────────────────────────────────────

export async function agregarVersion(
  id: ParametroId,
  datos: { valor: number; fechaDesde: string; creadoPor: string; nota: string },
): Promise<void> {
  const ref = doc(db, 'parametros_sistema', id);
  const nueva: VersionParametro = { ...datos, creadoEn: new Date().toISOString() };
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { versiones: [nueva] });
  } else {
    await updateDoc(ref, { versiones: arrayUnion(nueva) });
  }
}
