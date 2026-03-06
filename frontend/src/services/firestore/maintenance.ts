import {
  collection,
  doc,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { db } from '../../config/firebase';

const COL = 'incidencias';

export const MaintenanceService = {
  async getAll(filters: { vehicleId?: string } = {}): Promise<unknown[]> {
    const colRef = collection(db, COL);
    const q = filters.vehicleId
      ? query(colRef, where('vehicleId', '==', filters.vehicleId), orderBy('timestamp', 'desc'))
      : query(colRef, orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  subscribe(callback: (items: unknown[]) => void, filters: { vehicleId?: string } = {}) {
    const colRef = collection(db, COL);
    const q = filters.vehicleId
      ? query(colRef, where('vehicleId', '==', filters.vehicleId), orderBy('timestamp', 'desc'))
      : query(colRef, orderBy('timestamp', 'desc'));
    return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  },

  async create(data: Record<string, unknown>) {
    const ref = await addDoc(collection(db, COL), {
      ...data,
      timestamp: new Date().toISOString(),
      status: 'OPEN',
    });
    return { id: ref.id, ...data };
  },

  async closeTicket(id: string, data: Record<string, unknown>) {
    await setDoc(doc(db, COL, id), { ...data, status: 'CLOSED' }, { merge: true });
  },

  async uploadFile(_file: File): Promise<{ url: string }> {
    return { url: '' };
  },
};
