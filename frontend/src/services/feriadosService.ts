import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../config/firebase';

const FERIADOS_COL = 'feriados';

export interface Feriado {
  id?: string;
  fecha: string; // YYYY-MM-DD
  nombre: string;
  recurrente: boolean; // Si es verdadero, se repite todos los años el mismo MM-DD
  tipoHorario?: 'DOMINGO' | 'SABADO' | 'ESPECIAL'; // Qué grilla usar
}

export const FeriadosService = {
  subscribe(callback: (feriados: Feriado[]) => void): () => void {
    const q = query(collection(db, FERIADOS_COL), orderBy('fecha', 'asc'));
    return onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Feriado[];
      callback(data);
    });
  },

  async getAll(): Promise<Feriado[]> {
    const q = query(collection(db, FERIADOS_COL), orderBy('fecha', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Feriado[];
  },

  async isFeriado(fechaStr: string): Promise<Feriado | null> {
    // fechaStr format: YYYY-MM-DD
    const all = await this.getAll();
    const mmdd = fechaStr.substring(5);
    const result = all.find(
      (f) => f.fecha === fechaStr || (f.recurrente && f.fecha.substring(5) === mmdd),
    );
    return result || null;
  },

  async add(feriado: Omit<Feriado, 'id'>): Promise<string> {
    const docRef = await addDoc(collection(db, FERIADOS_COL), feriado);
    return docRef.id;
  },

  async update(id: string, updates: Partial<Feriado>): Promise<void> {
    const docRef = doc(db, FERIADOS_COL, id);
    await updateDoc(docRef, updates);
  },

  async remove(id: string): Promise<void> {
    const docRef = doc(db, FERIADOS_COL, id);
    await deleteDoc(docRef);
  },
};
