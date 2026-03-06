/**
 * Programación diaria (Listero): asignación Fecha + Servicio + Coche + Conductor.
 * Colección: programacion_diaria. Campos: id, date, linea, servicio, vehiculo, conductor, horaInicio, createdAt.
 */
import { collection, getDocs, doc, setDoc, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';

const COL = 'programacion_diaria';

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

export const ProgramacionDiariaService = {
  async getByDate(date: string): Promise<ProgramacionDiariaRecord[]> {
    const q = query(collection(db, COL), where('date', '==', date));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ProgramacionDiariaRecord);
    list.sort((a, b) => (a.horaInicio || '').localeCompare(b.horaInicio || ''));
    return list;
  },

  async add(
    record: Omit<ProgramacionDiariaRecord, 'id' | 'createdAt'>,
  ): Promise<ProgramacionDiariaRecord> {
    const id =
      `pd_${record.date}_${record.linea}_${String(record.servicio).replace(/\s/g, '_')}_${Date.now()}`.slice(
        0,
        80,
      );
    const payload = {
      ...record,
      id,
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, COL, id), payload, { merge: true });
    return payload as ProgramacionDiariaRecord;
  },

  async update(id: string, data: Partial<ProgramacionDiariaRecord>): Promise<void> {
    await setDoc(doc(db, COL, id), data, { merge: true });
  },
};
