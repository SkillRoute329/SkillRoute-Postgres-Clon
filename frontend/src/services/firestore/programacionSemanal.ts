/**
 * ProgramacionSemanalService — Distribución semanal de servicios por coche.
 *
 * Colección Firestore: programacion_semanal
 *
 * Modelo operativo UCOT:
 *  - Cada documento = un día de operación completo
 *  - Cada entrada = {coche, servicio} donde servicio es el número de cartón
 *  - servicio puede ser "Paraliza" → coche fuera de servicio ese día
 *  - servicio puede ser "Noc XXXX" → servicio nocturno
 *  - Cuando un coche "Paraliza", sus conductores pasan automáticamente a Lista
 *    y el listero debe asignarles otro coche respetando su turno (T1→T1, T2→T2)
 *
 * Grupos especiales de flota (al final del Informe de Tránsito):
 *  - normal          → flota general
 *  - cableada        → trolebús / cableada expendedora
 *  - expendedora     → expendedora
 *  - aire_baterias   → Aire/Baterías
 *  - yutong          → flota Yutong
 *  - mantenimiento   → en taller ese día
 */
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../config/firebase';

export type TipoFlota = 'normal' | 'cableada' | 'expendedora' | 'aire_baterias' | 'yutong' | 'mantenimiento';

export interface DistribucionCoche {
  /** Número interno del coche, ej. "35" */
  cocheInternalNumber: string;
  /**
   * Número de servicio (= número de cartón), "Paraliza", o "Noc 1048".
   * Cuando es un número coincide 1:1 con el carton de servicio.
   */
  servicio: string;
  /** Tipo de flota al que pertenece este coche */
  tipoFlota?: TipoFlota;
  /** Posición en el listado original (para mantener el orden del informe) */
  orden?: number;
}

export interface ProgramacionSemanalRecord {
  id?: string;
  /** Fecha en formato ISO YYYY-MM-DD */
  fecha: string;
  /** Número de semana ISO (ej. "2026-W16") */
  semanaISO?: string;
  /** Día de la semana en español (para display) */
  diaNombre?: string;
  /** Lista de distribuciones: cada coche con su servicio del día */
  distribuciones: DistribucionCoche[];
  /** Coches en mantenimiento ese día (sin servicio) */
  enMantenimiento?: string[];
  /** Total de servicios operativos (excluyendo Paraliza y Mantenimientos) */
  totalServicios?: number;
  /** Total de coches que paralizan */
  totalParalizas?: number;
  createdAt?: string;
  updatedAt?: string;
}

const COL = 'programacion_semanal';

/** Normaliza un número de servicio: "paraliza" / "PARALIZA" → "Paraliza" */
export function normalizarServicio(s: string): string {
  if (!s) return '';
  const t = s.trim();
  if (t.toLowerCase() === 'paraliza') return 'Paraliza';
  // Normalizar nocturnos: "noc1048", "NOC 1048", "Noc1048" → "Noc 1048"
  const nocMatch = t.match(/^noc\s*(\d+)$/i);
  if (nocMatch) return `Noc ${nocMatch[1]}`;
  return t;
}

/** True si el servicio indica que el coche está paralizado */
export function esParaliza(servicio: string): boolean {
  return normalizarServicio(servicio) === 'Paraliza';
}

/** True si el servicio es nocturno */
export function esNocturno(servicio: string): boolean {
  return normalizarServicio(servicio).startsWith('Noc ');
}

/** Extrae el número puro del carton: "Noc 1048" → "1048", "1079" → "1079", "Paraliza" → null */
export function extraerNumeroCarton(servicio: string): string | null {
  const n = normalizarServicio(servicio);
  if (n === 'Paraliza') return null;
  if (n.startsWith('Noc ')) return n.slice(4);
  return n || null;
}

function getWeekISO(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00');
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

const DIAS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function mapRecord(id: string, data: Record<string, unknown>): ProgramacionSemanalRecord {
  return {
    id,
    fecha: (data.fecha as string) ?? '',
    semanaISO: data.semanaISO as string | undefined,
    diaNombre: data.diaNombre as string | undefined,
    distribuciones: (data.distribuciones as DistribucionCoche[]) ?? [],
    enMantenimiento: (data.enMantenimiento as string[]) ?? [],
    totalServicios: data.totalServicios as number | undefined,
    totalParalizas: data.totalParalizas as number | undefined,
    createdAt: data.createdAt as string | undefined,
    updatedAt: data.updatedAt as string | undefined,
  };
}

export const ProgramacionSemanalService = {
  docId(fecha: string): string {
    return `ps_${fecha}`;
  },

  async getByFecha(fecha: string): Promise<ProgramacionSemanalRecord | null> {
    const snap = await getDoc(doc(db, COL, this.docId(fecha)));
    if (!snap.exists()) return null;
    return mapRecord(snap.id, snap.data() as Record<string, unknown>);
  },

  async getBySemana(semanaISO: string): Promise<ProgramacionSemanalRecord[]> {
    const q = query(collection(db, COL), where('semanaISO', '==', semanaISO), orderBy('fecha', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => mapRecord(d.id, d.data() as Record<string, unknown>));
  },

  subscribe(semanaISO: string, callback: (records: ProgramacionSemanalRecord[]) => void): () => void {
    const q = query(collection(db, COL), where('semanaISO', '==', semanaISO), orderBy('fecha', 'asc'));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => mapRecord(d.id, d.data() as Record<string, unknown>)));
    });
  },

  subscribeByFecha(fecha: string, callback: (record: ProgramacionSemanalRecord | null) => void): () => void {
    const ref = doc(db, COL, this.docId(fecha));
    return onSnapshot(ref, (snap) => {
      callback(snap.exists() ? mapRecord(snap.id, snap.data() as Record<string, unknown>) : null);
    });
  },

  /**
   * Guarda o actualiza la programación de un día completo.
   * Calcula automáticamente totalServicios, totalParalizas, semanaISO y diaNombre.
   */
  async save(fecha: string, distribuciones: DistribucionCoche[], enMantenimiento: string[] = []): Promise<ProgramacionSemanalRecord> {
    const normalizadas = distribuciones.map((d, i) => ({
      ...d,
      servicio: normalizarServicio(d.servicio),
      orden: d.orden ?? i,
    }));

    const totalParalizas = normalizadas.filter((d) => esParaliza(d.servicio)).length;
    const totalServicios = normalizadas.filter((d) => !esParaliza(d.servicio)).length;
    const semanaISO = getWeekISO(fecha);
    const diaNombre = DIAS_ES[new Date(fecha + 'T12:00:00').getDay()];

    const payload: ProgramacionSemanalRecord = {
      fecha,
      semanaISO,
      diaNombre,
      distribuciones: normalizadas,
      enMantenimiento,
      totalServicios,
      totalParalizas,
      updatedAt: new Date().toISOString(),
    };

    const id = this.docId(fecha);
    const existing = await getDoc(doc(db, COL, id));
    if (!existing.exists()) {
      payload.createdAt = new Date().toISOString();
    }

    await setDoc(doc(db, COL, id), payload, { merge: true });
    return { ...payload, id };
  },

  /**
   * Actualiza el servicio de un solo coche en una fecha dada.
   */
  async updateCocheServicio(fecha: string, cocheInternalNumber: string, servicio: string): Promise<void> {
    const record = await this.getByFecha(fecha);
    if (!record) return;
    const dist = record.distribuciones.map((d) =>
      d.cocheInternalNumber === cocheInternalNumber
        ? { ...d, servicio: normalizarServicio(servicio) }
        : d,
    );
    await this.save(fecha, dist, record.enMantenimiento);
  },

  /**
   * Devuelve los coches que paralizan en una fecha dada.
   * Útil para el listero: saber qué conductores deben pasar a Lista.
   */
  async getCochesParaliza(fecha: string): Promise<string[]> {
    const record = await this.getByFecha(fecha);
    if (!record) return [];
    return record.distribuciones
      .filter((d) => esParaliza(d.servicio))
      .map((d) => d.cocheInternalNumber);
  },

  /**
   * Devuelve los servicios operativos de un día (excluyendo Paraliza).
   * Incluye el número de carton extraído para buscar en el maestro.
   */
  getServiciosOperativos(record: ProgramacionSemanalRecord): Array<DistribucionCoche & { numeroCarton: string }> {
    return record.distribuciones
      .filter((d) => !esParaliza(d.servicio))
      .map((d) => ({
        ...d,
        numeroCarton: extraerNumeroCarton(d.servicio) || d.servicio,
      }));
  },
};
