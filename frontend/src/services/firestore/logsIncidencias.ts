/**
 * Colección logs_incidencias: incidencias reportadas por el chofer (ej. Reportar Incidente – Prioridad Alta).
 */
import { collection, addDoc, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../../config/firebase';

const COL = 'logs_incidencias';

export interface LogIncidenciaEntry {
  driverId: string;
  servicioId?: string;
  ultimoPuntoControl?: string;
  prioridad: 'alta' | 'media' | 'normal';
  mensaje?: string;
  createdAt: string;
}

export const LogsIncidenciasService = {
  async add(entry: Omit<LogIncidenciaEntry, 'createdAt'>): Promise<string> {
    const ref = await addDoc(collection(db, COL), {
      ...entry,
      createdAt: new Date().toISOString(),
    });
    return ref.id;
  },

  async createPrioridadAlta(params: {
    driverId: string;
    servicioId?: string;
    ultimoPuntoControl: string;
    mensaje?: string;
  }): Promise<string> {
    return this.add({
      ...params,
      prioridad: 'alta',
    });
  },

  async getRecent(limitCount = 50): Promise<LogIncidenciaEntry[]> {
    const q = query(collection(db, COL), orderBy('createdAt', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as LogIncidenciaEntry);
  },
};
