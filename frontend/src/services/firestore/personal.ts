import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from '../../config/firebase';

const COL = 'personal';
const EXCEPTIONS_COL = 'personal_exceptions';

export interface PersonalRecord {
  id: string;
  fullName?: string;
  /** Número interno del empleado (legajo). */
  internalNumber?: string;
  /** Alias para legajo: número interno. */
  legajo?: string;
  /** ID del coche asignado si es propietario/fijo (maestro UCOT 2026). */
  coche_fijo?: string;
  /** Apodo o apellido para visualización rápida en el Dashboard. */
  apodo?: string;
  ci?: string;
  vencimiento_carne_salud?: string;
  vencimiento_libreta?: string;
  estado?: string;
  tipo?: string;
  [key: string]: unknown;
}

export interface DayException {
  driverId: string;
  date: string;
  type: 'falta_medica' | 'franco' | 'licencia' | 'otro';
  note?: string;
}

export const PersonalService = {
  async getAll(): Promise<PersonalRecord[]> {
    const snap = await getDocs(query(collection(db, COL), orderBy('internalNumber', 'asc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PersonalRecord);
  },

  async getById(id: string): Promise<PersonalRecord | null> {
    const ref = doc(db, COL, id);
    const snap = await getDoc(ref);
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as PersonalRecord) : null;
  },

  async getExceptionsForDriver(
    driverId: string,
    monthStart: string,
    monthEnd: string,
  ): Promise<DayException[]> {
    const q = query(
      collection(db, EXCEPTIONS_COL),
      where('driverId', '==', driverId),
      where('date', '>=', monthStart),
      where('date', '<=', monthEnd),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        driverId: data.driverId as string,
        date: data.date as string,
        type: (data.type as DayException['type']) ?? 'otro',
        note: data.note as string | undefined,
      };
    });
  },

  async setException(data: DayException): Promise<void> {
    const id = `${data.driverId}_${data.date}`;
    await setDoc(
      doc(db, EXCEPTIONS_COL, id),
      { ...data, updatedAt: new Date().toISOString() },
      { merge: true },
    );
  },

  /** Excepciones de un día (para Lista Diaria: mismos datos que Centro de Talento). */
  async getExceptionsForDate(date: string): Promise<DayException[]> {
    const q = query(collection(db, EXCEPTIONS_COL), where('date', '==', date));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        driverId: data.driverId as string,
        date: data.date as string,
        type: (data.type as DayException['type']) ?? 'otro',
        note: data.note as string | undefined,
      };
    });
  },
};
