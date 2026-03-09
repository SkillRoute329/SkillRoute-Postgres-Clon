import {
  collection,
  doc,
  getDocs,
  addDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../config/firebase';

const COL = 'discounts';

export const DiscountService = {
  async getAll(): Promise<unknown[]> {
    const snap = await getDocs(collection(db, COL));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  subscribe(callback: (items: unknown[]) => void) {
    return onSnapshot(collection(db, COL), (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  },

  async create(data: Record<string, unknown>) {
    const ref = await addDoc(collection(db, COL), data);
    return { id: ref.id, ...data };
  },

  async delete(id: string) {
    await deleteDoc(doc(db, COL, id));
  },
};
