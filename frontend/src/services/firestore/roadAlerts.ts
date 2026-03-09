import {
  collection,
  doc,
  getDocs,
  addDoc,
  setDoc,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../config/firebase';

const COL = 'alertas_trafico';

export const RoadAlertService = {
  async getAll(): Promise<unknown[]> {
    try {
      const q = query(collection(db, COL), orderBy('creado_en', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => {
        const data = d.data() ?? {};
        return {
          id: d.id,
          title: data.title ?? '',
          description: data.description ?? '',
          type: data.type ?? 'DESVIO',
          severity: data.severity ?? 'MEDIUM',
          affectedLine: data.affectedLine ?? 'Todas',
          active: data.active !== false,
          creado_en: data.creado_en ?? null,
          createdAt: data.creado_en ?? data.createdAt ?? new Date().toISOString(),
        };
      });
    } catch (e) {
      console.error('RoadAlertService.getAll', e);
      return [];
    }
  },

  subscribe(callback: (items: unknown[]) => void) {
    const q = query(collection(db, COL), orderBy('creado_en', 'desc'));
    return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  },

  async create(data: Record<string, unknown>) {
    const ref = await addDoc(collection(db, COL), {
      ...data,
      active: true,
      creado_en: new Date().toISOString(),
    });
    return { id: ref.id, ...data };
  },

  async resolve(id: string) {
    await setDoc(doc(db, COL, id), { active: false, status: 'RESOLVED' }, { merge: true });
  },
};
