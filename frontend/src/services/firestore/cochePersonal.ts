/**
 * CochePersonalService — Gestión del vínculo Coche ↔ Personal asignado.
 *
 * Colección Firestore: coche_personal
 * Cada documento = un coche con su personal asignado, régimen de rotación
 * y cartones semanales asignados.
 *
 * Modelo operativo UCOT:
 *  - Cada coche tiene mínimo 2 personas asignadas (T1 y T2)
 *  - Régimen: semana_semana | 15_15 | fijo_t1 | fijo_t2
 *  - Cartones: bloque de 5 servicios por semana (ej. 1072-1076 sem1, 1077-1081 sem2)
 *  - turnoActualSemana: quién hace T1 esta semana
 */
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  where,
} from 'firebase/firestore';
import { db } from '../../config/firebase';

export type RegimenRotacionCoche = 'semana_semana' | '15_15' | 'fijo_t1' | 'fijo_t2';

export interface PersonalAsignado {
  userId: string;
  internalNumber: string;
  fullName?: string;
  /** T1 = turno mañana, T2 = turno tarde */
  turnoBase: 1 | 2;
  /** Fijo en su turno (no rota) */
  esFijo: boolean;
}

export interface BloqueSemanalCartones {
  semana: number; // 1-based dentro del mes
  servicios: string[]; // ej. ['1072','1073','1074','1075','1076']
  linea: string;
  temporada: 'invierno' | 'verano';
}

export interface CochePersonal {
  id?: string;
  /** Número interno del coche, ej. "104" */
  cocheInternalNumber: string;
  vehicleId?: string;
  /** Personal asignado a este coche (mín 2) */
  personal: PersonalAsignado[];
  /** Régimen de rotación entre el personal */
  regimen: RegimenRotacionCoche;
  /** Quién está en T1 esta semana (userId) */
  turnoT1Actual?: string;
  /** Quién está en T2 esta semana (userId) */
  turnoT2Actual?: string;
  /** Inicio del ciclo actual de rotación (ISO date) */
  inicioCiclo?: string;
  /** Bloques semanales de cartones asignados */
  bloquesSemana: BloqueSemanalCartones[];
  /** Semana actual del ciclo de cartones (1-based) */
  semanaActualCartones?: number;
  activo?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const COL = 'coche_personal';

function mapCochePersonal(id: string, data: Record<string, unknown>): CochePersonal {
  return {
    id,
    cocheInternalNumber: (data.cocheInternalNumber as string) ?? '',
    vehicleId: data.vehicleId as string | undefined,
    personal: (data.personal as PersonalAsignado[]) ?? [],
    regimen: (data.regimen as RegimenRotacionCoche) ?? 'semana_semana',
    turnoT1Actual: data.turnoT1Actual as string | undefined,
    turnoT2Actual: data.turnoT2Actual as string | undefined,
    inicioCiclo: data.inicioCiclo as string | undefined,
    bloquesSemana: (data.bloquesSemana as BloqueSemanalCartones[]) ?? [],
    semanaActualCartones: data.semanaActualCartones as number | undefined,
    activo: data.activo !== false,
    createdAt: data.createdAt as string | undefined,
    updatedAt: data.updatedAt as string | undefined,
  };
}

export const CochePersonalService = {
  async getAll(): Promise<CochePersonal[]> {
    const q = query(collection(db, COL), orderBy('cocheInternalNumber', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => mapCochePersonal(d.id, d.data() as Record<string, unknown>));
  },

  subscribe(callback: (items: CochePersonal[]) => void): () => void {
    const q = query(collection(db, COL), orderBy('cocheInternalNumber', 'asc'));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => mapCochePersonal(d.id, d.data() as Record<string, unknown>)));
    });
  },

  async getByCoche(cocheInternalNumber: string): Promise<CochePersonal | null> {
    const q = query(
      collection(db, COL),
      where('cocheInternalNumber', '==', cocheInternalNumber),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return mapCochePersonal(d.id, d.data() as Record<string, unknown>);
  },

  async getById(id: string): Promise<CochePersonal | null> {
    const snap = await getDoc(doc(db, COL, id));
    if (!snap.exists()) return null;
    return mapCochePersonal(snap.id, snap.data() as Record<string, unknown>);
  },

  async create(data: Omit<CochePersonal, 'id'>): Promise<CochePersonal> {
    const payload = { ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const ref = await addDoc(collection(db, COL), payload);
    return { ...data, id: ref.id };
  },

  async update(id: string, data: Partial<CochePersonal>): Promise<void> {
    await setDoc(doc(db, COL, id), { ...data, updatedAt: new Date().toISOString() }, { merge: true });
  },

  /**
   * Avanza la rotación semanal: intercambia T1 y T2 si el régimen es semana_semana o 15_15.
   * Para fijo_t1 / fijo_t2 no hace nada.
   */
  async avanzarRotacion(id: string, coche: CochePersonal): Promise<void> {
    if (coche.regimen === 'fijo_t1' || coche.regimen === 'fijo_t2') return;
    const nofijo = coche.personal.filter((p) => !p.esFijo);
    if (nofijo.length < 2) return;
    // Intercambiar T1/T2
    const nuevoT1 = coche.turnoT2Actual ?? nofijo[1]?.userId;
    const nuevoT2 = coche.turnoT1Actual ?? nofijo[0]?.userId;
    await this.update(id, {
      turnoT1Actual: nuevoT1,
      turnoT2Actual: nuevoT2,
      inicioCiclo: new Date().toISOString().split('T')[0],
    });
  },

  /**
   * Marca el personal de este coche como "de lista" (día libre / mantenimiento).
   * El personal queda disponible para asignación en otros coches.
   */
  async marcarEnLista(id: string, userIds: string[]): Promise<void> {
    const coche = await this.getById(id);
    if (!coche) return;
    const updated = coche.personal.map((p) => ({
      ...p,
      enLista: userIds.includes(p.userId),
    }));
    await this.update(id, { personal: updated as PersonalAsignado[] });
  },
};
