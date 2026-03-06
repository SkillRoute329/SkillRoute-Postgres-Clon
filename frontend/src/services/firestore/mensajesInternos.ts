/**
 * Colección mensajes_internos: avisos rápidos Listero ↔ Chofer (y solicitudes como Cambio de Turno).
 */
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';

const COL = 'mensajes_internos';

export interface MensajeInternoEntry {
  id?: string;
  fromUserId: string;
  toUserId: string;
  tipo: 'aviso' | 'cambio_turno' | 'notificacion';
  titulo: string;
  mensaje: string;
  servicioId?: string;
  date?: string;
  readAt?: string | null;
  createdAt: string;
}

export const MensajesInternosService = {
  async create(params: {
    fromUserId: string;
    toUserId: string;
    tipo: MensajeInternoEntry['tipo'];
    titulo: string;
    mensaje: string;
    servicioId?: string;
    date?: string;
  }): Promise<MensajeInternoEntry> {
    const ref = await addDoc(collection(db, COL), {
      ...params,
      createdAt: Timestamp.now(),
    });
    return { id: ref.id, ...params, createdAt: new Date().toISOString() } as MensajeInternoEntry;
  },

  async getByUser(uid: string, limitCount = 30): Promise<MensajeInternoEntry[]> {
    const q = query(
      collection(db, COL),
      where('toUserId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(limitCount),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        fromUserId: String(data.fromUserId || ''),
        toUserId: String(data.toUserId || ''),
        tipo: (data.tipo as MensajeInternoEntry['tipo']) || 'aviso',
        titulo: String(data.titulo || ''),
        mensaje: String(data.mensaje || ''),
        servicioId: data.servicioId ? String(data.servicioId) : undefined,
        date: data.date ? String(data.date) : undefined,
        readAt: data.readAt ? String(data.readAt) : null,
        createdAt: (data.createdAt as Timestamp)?.toDate?.()?.toISOString?.() ?? '',
      } satisfies MensajeInternoEntry;
    });
  },

  subscribeByUser(uid: string, callback: (items: MensajeInternoEntry[]) => void): () => void {
    const q = query(
      collection(db, COL),
      where('toUserId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: (data.createdAt as Timestamp)?.toDate?.()?.toISOString?.() ?? '',
        } as unknown as MensajeInternoEntry;
      });
      callback(list);
    });
  },

  /** Para el Listero: alertas de solicitud de cambio de turno (toUserId 'listero' para que cualquier listero las vea). */
  subscribeCambioTurnoAlerts(callback: (items: MensajeInternoEntry[]) => void): () => void {
    const q = query(
      collection(db, COL),
      where('toUserId', '==', 'listero'),
      where('tipo', '==', 'cambio_turno'),
      orderBy('createdAt', 'desc'),
      limit(20),
    );
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: (data.createdAt as Timestamp)?.toDate?.()?.toISOString?.() ?? '',
        } as unknown as MensajeInternoEntry;
      });
      callback(list);
    });
  },
};
