import { collection, getDocs, addDoc, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';

const COL = 'boletines';

export const BulletinService = {
  async getEntries(filters: { line?: string; date?: string }) {
    const colRef = collection(db, COL);
    let q = query(colRef, orderBy('date', 'desc'));
    if (filters.line) q = query(colRef, where('line', '==', filters.line), orderBy('date', 'desc'));
    if (filters.date)
      q = query(colRef, where('date', '==', filters.date), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  subscribeEntries(
    callback: (entries: unknown[]) => void,
    filters: { line?: string; date?: string } = {},
  ) {
    const colRef = collection(db, COL);
    let q = query(colRef, orderBy('date', 'desc'));
    if (filters.line) q = query(colRef, where('line', '==', filters.line), orderBy('date', 'desc'));
    if (filters.date)
      q = query(colRef, where('date', '==', filters.date), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  },

  async save(data: Record<string, unknown>) {
    await addDoc(collection(db, COL), { ...data, createdAt: new Date().toISOString() });
  },

  async getMyStats(): Promise<unknown> {
    const snap = await getDocs(collection(db, COL));
    return { total: snap.size };
  },

  async getVehicleStats(_vehicleId: string): Promise<unknown> {
    return {};
  },

  async generateCarton(_opts: { serviceNumber: string; date: string }) {
    return {};
  },
};
