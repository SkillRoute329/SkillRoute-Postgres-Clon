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
 *
 * Modelo de descansos UCOT (6 días trabajo / 7 posibles):
 *  - patronDescanso: tipo de grupo al que pertenece el conductor
 *    · 'sabados'      → libra todos los sábados este mes
 *    · 'domingos'     → libra todos los domingos este mes
 *    · 'entre_semana' → libra días variables según necesidad operativa
 *    · 'rotativo_mensual' → alterna sabados/domingos cada mes
 *  - grupoDescanso: identificador del grupo (ej. 'A', 'B', 'C1', 'C2')
 *  - mesLibraSabado: para grupos rotativos, true = este mes libra sábados
 *  - diasLibresSemana: para grupos entre_semana, días de la semana (0=Dom..6=Sáb)
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

/** Patrón de descanso semanal del conductor */
export type PatronDescanso = 'sabados' | 'domingos' | 'entre_semana' | 'rotativo_mensual';

export interface PersonalAsignado {
  userId: string;
  internalNumber: string;
  fullName?: string;
  /** T1 = turno mañana, T2 = turno tarde */
  turnoBase: 1 | 2;
  /** Fijo en su turno (no rota) */
  esFijo: boolean;

  // ── Modelo de descansos (6 días / 7) ─────────────────────────────
  /** Identificador del grupo de descanso: 'A', 'B', 'C1', 'C2', etc. */
  grupoDescanso?: string;
  /** Patrón de descanso del conductor */
  patronDescanso?: PatronDescanso;
  /**
   * Para patronDescanso = 'rotativo_mensual':
   * true  → este mes libra sábados
   * false → este mes libra domingos
   * Se invierte automáticamente al cambiar de mes.
   */
  mesLibraSabado?: boolean;
  /**
   * Para patronDescanso = 'entre_semana':
   * Array de días de la semana que libra (0=Dom, 1=Lun, ..., 6=Sáb)
   * Ejemplo: [3] = libra los miércoles
   * Puede cambiar según necesidad operativa.
   */
  diasLibresSemana?: number[];
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

/**
 * Determina si un conductor descansa en una fecha dada, según su patrón.
 * @param p - PersonalAsignado con datos de descanso
 * @param isoDate - Fecha en formato YYYY-MM-DD
 * @returns true si el conductor libra ese día
 */
export function conductorLibraEnFecha(p: PersonalAsignado, isoDate: string): boolean {
  const date = new Date(isoDate + 'T12:00:00');
  const dayOfWeek = date.getDay(); // 0=Dom, 1=Lun, ..., 6=Sáb

  switch (p.patronDescanso) {
    case 'sabados':
      return dayOfWeek === 6;

    case 'domingos':
      return dayOfWeek === 0;

    case 'rotativo_mensual':
      if (p.mesLibraSabado === true) return dayOfWeek === 6;
      if (p.mesLibraSabado === false) return dayOfWeek === 0;
      return false;

    case 'entre_semana':
      if (!p.diasLibresSemana || p.diasLibresSemana.length === 0) return false;
      return p.diasLibresSemana.includes(dayOfWeek);

    default:
      return false;
  }
}

/**
 * Avanza el ciclo mensual de descanso de los conductores con patrón rotativo_mensual.
 * Llamar al inicio de cada mes.
 */
export function invertirMesLibra(p: PersonalAsignado): PersonalAsignado {
  if (p.patronDescanso !== 'rotativo_mensual') return p;
  return { ...p, mesLibraSabado: !p.mesLibraSabado };
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
