/**
 * Servicio de desvíos UCOT — persistencia en Firestore (Zero-Mocks).
 *
 * Los desvíos ahora se definen dibujando el recorrido alternativo en el mapa.
 *
 * Tipos:
 *  - 'puntual'  → ocurre en una fecha específica (ej: evento, obra un día)
 *  - 'semanal'  → ocurre ciertos días de la semana (ej: ferias vecinales)
 *  - 'indefinido' → siempre activo hasta que se desactive manualmente
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';

const COL = 'desvios_guardados';

export interface LatLng {
  lat: number;
  lng: number;
}

export type TipoDesvio = 'puntual' | 'semanal' | 'indefinido';

export interface DesvioGuardado {
  id: string;
  lineaCodigo: string;
  nombre: string;
  descripcion?: string;
  tipo: TipoDesvio;
  /** Solo para tipo 'puntual': fecha ISO "YYYY-MM-DD" */
  fecha?: string;
  /** Solo para tipo 'puntual': hora de inicio "HH:MM" */
  horaInicio?: string;
  /** Solo para tipo 'puntual': hora de fin "HH:MM" */
  horaFin?: string;
  /** Solo para tipo 'semanal': días de la semana [0=Dom, 1=Lun, ..., 6=Sáb] */
  diasSemana?: number[];
  /** Solo para tipo 'semanal': hora de inicio en esos días "HH:MM" */
  horaInicioSemanal?: string;
  /** Solo para tipo 'semanal': hora de fin en esos días "HH:MM" */
  horaFinSemanal?: string;
  /** Trazado alternativo (puntos del recorrido deviado, dibujados en el mapa) */
  rutaAlternativa: LatLng[];
  /** Si el desvío está activo o fue desactivado manualmente */
  activo: boolean;
  creadoEn: string; // ISO timestamp
  actualizadoEn: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD FIRESTORE
// ─────────────────────────────────────────────────────────────────────────────

function generateId(): string {
  return `dsv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Obtiene todos los desvíos de una línea de una vez. (Para casos sin onSnapshot) */
export async function getDesviosPorLinea(lineaCodigo: string): Promise<DesvioGuardado[]> {
  const q = query(collection(db, COL), where('lineaCodigo', '==', lineaCodigo));
  const snap = await getDocs(q);
  return snap.docs.map((doc) => doc.data() as DesvioGuardado);
}

/** Escucha los desvíos de una línea en tiempo real. */
export function listenDesviosPorLinea(
  lineaCodigo: string,
  onUpdate: (desvios: DesvioGuardado[]) => void,
): () => void {
  const q = query(collection(db, COL), where('lineaCodigo', '==', lineaCodigo));
  return onSnapshot(
    q,
    (snap) => {
      const desvios = snap.docs.map((d) => d.data() as DesvioGuardado);
      onUpdate(desvios);
    },
    (err) => {
      console.error('[desviosService] Error escuchando desvios:', err, new Error().stack);
    },
  );
}

/** Guarda un desvío nuevo. */
export async function crearDesvio(
  data: Omit<DesvioGuardado, 'id' | 'creadoEn' | 'actualizadoEn'>,
): Promise<DesvioGuardado> {
  const now = new Date().toISOString();
  const nuevo: DesvioGuardado = {
    ...data,
    id: generateId(),
    creadoEn: now,
    actualizadoEn: now,
  };
  const ref = doc(db, COL, nuevo.id);
  await setDoc(ref, nuevo);
  return nuevo;
}

/** Actualiza un desvío existente. */
export async function actualizarDesvio(
  id: string,
  changes: Partial<Omit<DesvioGuardado, 'id' | 'creadoEn'>>,
): Promise<void> {
  const ref = doc(db, COL, id);
  await updateDoc(ref, {
    ...changes,
    actualizadoEn: new Date().toISOString(),
  });
}

/** Elimina un desvío. */
export async function eliminarDesvio(id: string): Promise<void> {
  const ref = doc(db, COL, id);
  await deleteDoc(ref);
}

/** Activa/desactiva un desvío. */
export async function toggleDesvio(id: string, activo: boolean): Promise<void> {
  await actualizarDesvio(id, { activo });
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDADES LOGICAS LOCALES
// ─────────────────────────────────────────────────────────────────────────────

/** Devuelve solo los desvíos activos y vigentes HOY Y AHORA (filtrado sobre un array ya obtenido). */
export function filterDesviosVigentes(desvios: DesvioGuardado[]): DesvioGuardado[] {
  return desvios.filter(esDesvioVigenteAhora);
}

/** Texto legible del horario de un desvío. */
export function formatSchedule(d: DesvioGuardado): string {
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  if (d.tipo === 'indefinido') return 'Siempre activo';
  if (d.tipo === 'puntual') {
    const partes: string[] = [];
    if (d.fecha) partes.push(d.fecha.split('-').reverse().join('/'));
    if (d.horaInicio && d.horaFin) partes.push(`${d.horaInicio} – ${d.horaFin}`);
    else if (d.horaInicio) partes.push(`desde ${d.horaInicio}`);
    return partes.join(' ') || 'Fecha sin especificar';
  }
  if (d.tipo === 'semanal') {
    const dias = (d.diasSemana ?? []).map((n) => DIAS[n]).join(', ');
    const horario =
      d.horaInicioSemanal && d.horaFinSemanal ? ` ${d.horaInicioSemanal}–${d.horaFinSemanal}` : '';
    return `${dias}${horario}`;
  }
  return '';
}

/**
 * Devuelve total y activos a partir de un array de desvíos.
 */
export function contarDesviosLocal(desvios: DesvioGuardado[]): { total: number; activos: number } {
  return {
    total: desvios.length,
    activos: desvios.filter((d) => d.activo).length,
  };
}

/**
 * Indica si un desvío específico está vigente en este momento
 * (combinando su flag `activo` + validez horaria).
 */
export function esDesvioVigenteAhora(d: DesvioGuardado): boolean {
  if (!d.activo || d.rutaAlternativa.length < 2) return false;
  const ahora = new Date();
  const hora = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
  const hoy = ahora.toISOString().slice(0, 10);
  const dia = ahora.getDay();

  if (d.tipo === 'indefinido') return true;
  if (d.tipo === 'puntual') {
    if (d.fecha !== hoy) return false;
    if (d.horaInicio && hora < d.horaInicio) return false;
    if (d.horaFin && hora > d.horaFin) return false;
    return true;
  }
  if (d.tipo === 'semanal') {
    if (!d.diasSemana?.includes(dia)) return false;
    if (d.horaInicioSemanal && hora < d.horaInicioSemanal) return false;
    if (d.horaFinSemanal && hora > d.horaFinSemanal) return false;
    return true;
  }
  return false;
}
