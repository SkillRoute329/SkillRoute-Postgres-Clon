import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Shift } from './types';

const COL = 'daily_shifts';
const CATEGORIES_COL = 'shift_categories';
const CONFIG_DOC = 'system/global_config';

function mapShift(id: string, data: Record<string, unknown>): Shift {
  return {
    id: data?.id ?? id,
    date: data?.date as string,
    start: data?.start as string,
    end: data?.end as string,
    status: data?.status as string,
    assignedTo: data?.assignedTo as number | string,
    createdBy: data?.createdBy as number | string,
    totalValue: data?.totalValue as number,
    categoryId: data?.categoryId as number,
    vehicleId: data?.vehicleId as number | string,
    serviceId: data?.serviceId as string,
    ...data,
  } as Shift;
}

export const ShiftService = {
  async getAll(date?: string): Promise<Shift[]> {
    const colRef = collection(db, COL);
    const q = date
      ? query(colRef, where('date', '==', date), orderBy('start', 'asc'))
      : query(colRef, orderBy('start', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => mapShift(d.id, { ...d.data(), id: d.id }));
  },

  subscribe(callback: (shifts: Shift[]) => void, date?: string) {
    const colRef = collection(db, COL);
    const q = date
      ? query(colRef, where('date', '==', date), orderBy('start', 'asc'))
      : query(colRef, orderBy('start', 'desc'));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => mapShift(d.id, { ...d.data(), id: d.id })));
    });
  },

  async create(data: Partial<Shift>) {
    const ref = await addDoc(collection(db, COL), { ...data });
    return { id: ref.id, ...data };
  },

  async update(id: string | number, data: Partial<Shift>) {
    const ref = doc(db, COL, String(id));
    await setDoc(ref, data, { merge: true });
    return { id, ...data };
  },

  async delete(id: number | string) {
    await deleteDoc(doc(db, COL, String(id)));
  },

  async assign(id: number | string, userId: number | string) {
    const ref = doc(db, COL, String(id));
    await setDoc(ref, { assignedTo: userId, status: 'Assigned' }, { merge: true });
  },

  async publish(id: number | string) {
    const ref = doc(db, COL, String(id));
    await setDoc(ref, { status: 'Public' }, { merge: true });
  },

  async getCategories(
    _date?: string,
  ): Promise<{ id: number; name: string; baseValue: string; extraHourValue: string }[]> {
    const snap = await getDocs(collection(db, CATEGORIES_COL));
    return snap.docs.map(
      (d, i) =>
        ({ id: i + 1, ...d.data() }) as {
          id: number;
          name: string;
          baseValue: string;
          extraHourValue: string;
        },
    );
  },

  async getSystemConfig(): Promise<Record<string, unknown>> {
    const snap = await getDoc(doc(db, CONFIG_DOC));
    return snap.exists() ? (snap.data() ?? {}) : {};
  },

  async createCategory(data: { name: string; baseValue: number; extraHourValue: number }) {
    const ref = await addDoc(collection(db, CATEGORIES_COL), data);
    return { id: ref.id, ...data };
  },

  async getCategoryHistory(_id: number): Promise<unknown[]> {
    return [];
  },

  async updateCategory(id: string | number, data: Record<string, unknown>) {
    const ref = doc(db, CATEGORIES_COL, String(id));
    await setDoc(ref, data, { merge: true });
    return { id, ...data };
  },

  async addCategoryPriceHistory(_id: number, _entry: Record<string, unknown>) {
    return {};
  },

  async deleteCategory(id: number | string) {
    await deleteDoc(doc(db, CATEGORIES_COL, String(id)));
  },

  async getBalances(): Promise<unknown[]> {
    const snap = await getDocs(collection(db, COL));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
};
