/**
 * Acceso Firestore UCOT: cartones_completados (1 pestaña = 1 doc) y programacion_diaria (asignaciones Listero).
 */
import { collection, getDocs, getDoc, doc, setDoc, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';

const CARTONES_COMPLETADOS = 'cartones_completados';
const PROGRAMACION_DIARIA = 'programacion_diaria';

export type CartonFisicoDoc = {
  id: string;
  linea: string;
  servicio: string;
  paradas: string[];
  viajes: { fila: number; tiempos: string[] }[];
  notasCabecera: string[];
  notasPie: string[];
  sheetName?: string;
};

export type ProgramacionDiariaRecord = {
  id: string;
  date: string;
  linea: string;
  servicio: string;
  vehiculo: string;
  conductor: string;
  horaInicio?: string;
  createdAt?: string;
};

export const firestoreUCOT = {
  async getCartonesFisicos(): Promise<CartonFisicoDoc[]> {
    const snap = await getDocs(collection(db, CARTONES_COMPLETADOS));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CartonFisicoDoc);
  },

  async getCartonFisicoById(id: string): Promise<CartonFisicoDoc | null> {
    const snap = await getDoc(doc(db, CARTONES_COMPLETADOS, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as CartonFisicoDoc) : null;
  },

  async getProgramacionByDate(date: string): Promise<ProgramacionDiariaRecord[]> {
    const q = query(collection(db, PROGRAMACION_DIARIA), where('date', '==', date));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ProgramacionDiariaRecord);
    list.sort((a, b) => (a.horaInicio || '').localeCompare(b.horaInicio || ''));
    return list;
  },

  async addProgramacion(
    record: Omit<ProgramacionDiariaRecord, 'id' | 'createdAt'>,
  ): Promise<ProgramacionDiariaRecord> {
    const id =
      `pd_${record.date}_${record.linea}_${String(record.servicio).replace(/\s/g, '_')}_${Date.now()}`.slice(
        0,
        80,
      );
    const payload = { ...record, id, createdAt: new Date().toISOString() };
    await setDoc(doc(db, PROGRAMACION_DIARIA, id), payload, { merge: true });
    return payload as ProgramacionDiariaRecord;
  },
};
