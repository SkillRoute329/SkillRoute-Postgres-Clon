/**
 * CorrelativoService — Gestión de solicitudes de correlativo entre conductores.
 *
 * Colección Firestore: correlativos
 *
 * Correlativo: conductor A cubre al conductor B, realizando ambos turnos.
 * Regla UCOT:
 *  - Si ambos turnos son en el mismo coche → factible siempre.
 *  - Si son coches distintos → se necesita al menos 45 min de gap entre el fin
 *    del turno cubierto y el inicio del segundo servicio del solicitante.
 *
 * El sistema calcula la factibilidad y propone la solución; el listero aprueba.
 */
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  query,
  orderBy,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../config/firebase';

export type CorrelativoEstado = 'pendiente' | 'aprobado' | 'rechazado' | 'completado';

export interface TurnoCorrelativo {
  servicioId?: string;
  /** Número interno del coche */
  cocheInternalNumber?: string;
  linea?: string;
  horaInicio?: string;
  /** HH:MM */
  horaFin?: string;
}

export interface CorrelativoRequest {
  id?: string;
  fecha: string; // ISO YYYY-MM-DD
  /** Quien solicita el correlativo (cubre al compañero) */
  solicitanteUserId: string;
  solicitanteInternalNumber: string;
  solicitanteNombre?: string;
  /** Quien es cubierto */
  cubiertaUserId: string;
  cubiertaInternalNumber: string;
  cubiertaNombre?: string;
  /** Turno del conductor cubierto (el que asume el solicitante) */
  turno1: TurnoCorrelativo;
  /** Turno propio del solicitante */
  turno2: TurnoCorrelativo;
  /** Análisis de factibilidad */
  mismoCoche: boolean;
  /** Gap en minutos entre fin de turno1 y inicio de turno2 (si coches distintos) */
  gapMinutos?: number;
  /** true si cumple con regla 45 min o es mismo coche */
  factible: boolean;
  recomendacion?: string;
  estado: CorrelativoEstado;
  aprobadoPor?: string;
  notas?: string;
  createdAt?: string;
  updatedAt?: string;
}

const COL = 'correlativos';

const MIN_GAP_DISTINTO_COCHE = 45; // minutos

/** Parsea "HH:MM" → minutos desde medianoche */
function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Calcula si un correlativo es factible según las reglas operativas UCOT.
 * Retorna { factible, gapMinutos, mismoCoche, recomendacion }
 */
export function calcularFactibilidadCorrelativo(
  turno1: TurnoCorrelativo,
  turno2: TurnoCorrelativo,
): { factible: boolean; gapMinutos?: number; mismoCoche: boolean; recomendacion: string } {
  const mismoCoche =
    !!turno1.cocheInternalNumber &&
    turno1.cocheInternalNumber === turno2.cocheInternalNumber;

  if (mismoCoche) {
    return {
      factible: true,
      mismoCoche: true,
      recomendacion: `Mismo coche (${turno1.cocheInternalNumber}). Correlativo directo sin movimiento.`,
    };
  }

  if (!turno1.horaFin || !turno2.horaInicio) {
    return {
      factible: false,
      mismoCoche: false,
      recomendacion: 'Faltan horarios para verificar gap entre turnos.',
    };
  }

  const finT1 = timeToMinutes(turno1.horaFin);
  const inicioT2 = timeToMinutes(turno2.horaInicio);
  const gap = inicioT2 - finT1;

  const factible = gap >= MIN_GAP_DISTINTO_COCHE;
  const cocheT2 = turno2.cocheInternalNumber ? `coche ${turno2.cocheInternalNumber}` : 'otro coche';
  const recomendacion = factible
    ? `Cambio de coche: ${gap} min de gap disponibles (mín. 45 min). Pasar a ${cocheT2} línea ${turno2.linea || '–'}.`
    : `Gap insuficiente: solo ${gap} min entre ${turno1.horaFin} y ${turno2.horaInicio}. Se necesitan 45 min mínimo.`;

  return { factible, gapMinutos: gap, mismoCoche: false, recomendacion };
}

function mapCorrelativo(id: string, data: Record<string, unknown>): CorrelativoRequest {
  return {
    id,
    fecha: (data.fecha as string) ?? '',
    solicitanteUserId: (data.solicitanteUserId as string) ?? '',
    solicitanteInternalNumber: (data.solicitanteInternalNumber as string) ?? '',
    solicitanteNombre: data.solicitanteNombre as string | undefined,
    cubiertaUserId: (data.cubiertaUserId as string) ?? '',
    cubiertaInternalNumber: (data.cubiertaInternalNumber as string) ?? '',
    cubiertaNombre: data.cubiertaNombre as string | undefined,
    turno1: (data.turno1 as TurnoCorrelativo) ?? {},
    turno2: (data.turno2 as TurnoCorrelativo) ?? {},
    mismoCoche: (data.mismoCoche as boolean) ?? false,
    gapMinutos: data.gapMinutos as number | undefined,
    factible: (data.factible as boolean) ?? false,
    recomendacion: data.recomendacion as string | undefined,
    estado: (data.estado as CorrelativoEstado) ?? 'pendiente',
    aprobadoPor: data.aprobadoPor as string | undefined,
    notas: data.notas as string | undefined,
    createdAt: data.createdAt as string | undefined,
    updatedAt: data.updatedAt as string | undefined,
  };
}

export const CorrelativoService = {
  async getAll(): Promise<CorrelativoRequest[]> {
    const q = query(collection(db, COL), orderBy('fecha', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => mapCorrelativo(d.id, d.data() as Record<string, unknown>));
  },

  async getByFecha(fecha: string): Promise<CorrelativoRequest[]> {
    const q = query(collection(db, COL), where('fecha', '==', fecha));
    const snap = await getDocs(q);
    return snap.docs.map((d) => mapCorrelativo(d.id, d.data() as Record<string, unknown>));
  },

  async getPendientes(): Promise<CorrelativoRequest[]> {
    const q = query(
      collection(db, COL),
      where('estado', '==', 'pendiente'),
      orderBy('fecha', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => mapCorrelativo(d.id, d.data() as Record<string, unknown>));
  },

  subscribe(callback: (items: CorrelativoRequest[]) => void): () => void {
    const q = query(collection(db, COL), orderBy('fecha', 'desc'));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => mapCorrelativo(d.id, d.data() as Record<string, unknown>)));
    });
  },

  subscribeByFecha(fecha: string, callback: (items: CorrelativoRequest[]) => void): () => void {
    const q = query(collection(db, COL), where('fecha', '==', fecha));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => mapCorrelativo(d.id, d.data() as Record<string, unknown>)));
    });
  },

  async getById(id: string): Promise<CorrelativoRequest | null> {
    const snap = await getDoc(doc(db, COL, id));
    if (!snap.exists()) return null;
    return mapCorrelativo(snap.id, snap.data() as Record<string, unknown>);
  },

  /**
   * Crea una solicitud de correlativo y calcula automáticamente la factibilidad.
   */
  async create(
    data: Omit<CorrelativoRequest, 'id' | 'mismoCoche' | 'gapMinutos' | 'factible' | 'recomendacion' | 'createdAt' | 'updatedAt'>,
  ): Promise<CorrelativoRequest> {
    const { factible, gapMinutos, mismoCoche, recomendacion } = calcularFactibilidadCorrelativo(
      data.turno1,
      data.turno2,
    );
    const payload: Omit<CorrelativoRequest, 'id'> = {
      ...data,
      mismoCoche,
      gapMinutos,
      factible,
      recomendacion,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const ref = await addDoc(collection(db, COL), payload);
    return { ...payload, id: ref.id };
  },

  async update(id: string, data: Partial<CorrelativoRequest>): Promise<void> {
    await setDoc(doc(db, COL, id), { ...data, updatedAt: new Date().toISOString() }, { merge: true });
  },

  async aprobar(id: string, aprobadoPor: string, notas?: string): Promise<void> {
    await this.update(id, { estado: 'aprobado', aprobadoPor, notas });
  },

  async rechazar(id: string, aprobadoPor: string, notas?: string): Promise<void> {
    await this.update(id, { estado: 'rechazado', aprobadoPor, notas });
  },

  async completar(id: string): Promise<void> {
    await this.update(id, { estado: 'completado' });
  },
};
