import {
  collection,
  doc,
  getDocs,
  addDoc,
  setDoc,
  deleteDoc,
  query,
  limit,
  orderBy,
} from 'firebase/firestore';
import { db } from '../../config/firebase';

const PATH_MAP: Record<string, string> = {
  fleet: 'vehiculos',
  vehicles: 'vehiculos',
  parts: 'parts',
  users: 'users',
};

export const UniversalService = {
  async list(apiPath: string, page = 1, pageSize = 50): Promise<{ data: unknown[] }> {
    const col = PATH_MAP[apiPath] ?? apiPath;
    const q = query(collection(db, col), orderBy('internalNumber', 'asc'), limit(pageSize * page));
    const snap = await getDocs(q);
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return { data };
  },

  async create(apiPath: string, rawData: Record<string, unknown>) {
    const col = PATH_MAP[apiPath] ?? apiPath;
    const ref = await addDoc(collection(db, col), rawData);
    return { id: ref.id, ...rawData };
  },

  async update(apiPath: string, id: string, rawData: Record<string, unknown>) {
    const col = PATH_MAP[apiPath] ?? apiPath;
    await setDoc(doc(db, col, id), rawData, { merge: true });
    return { id, ...rawData };
  },

  async delete(apiPath: string, id: string) {
    const col = PATH_MAP[apiPath] ?? apiPath;
    await deleteDoc(doc(db, col, id));
  },

  async import(apiPath: string, jsonData: unknown[]): Promise<{ count: number }> {
    const col = PATH_MAP[apiPath] ?? apiPath;
    const colRef = collection(db, col);
    let count = 0;
    for (const item of Array.isArray(jsonData) ? jsonData : []) {
      await addDoc(colRef, item as Record<string, unknown>);
      count++;
    }
    return { count };
  },
};
