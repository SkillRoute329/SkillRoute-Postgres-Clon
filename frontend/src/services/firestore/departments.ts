import {
  collection,
  doc,
  getDocs,
  addDoc,
  deleteDoc,
  setDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../config/firebase';

const COL = 'departments';

export const DepartmentService = {
  async getAll(): Promise<unknown[]> {
    const q = collection(db, COL);
    const snap = await getDocs(q);
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

  async update(id: string, data: Record<string, unknown>) {
    await setDoc(doc(db, COL, id), data, { merge: true });
    return { id, ...data };
  },

  async delete(id: string) {
    await deleteDoc(doc(db, COL, id));
  },

  async addRole(departmentId: string, data: Record<string, unknown>) {
    const ref = collection(db, COL, departmentId, 'roles');
    const docRef = await addDoc(ref, data);
    return { id: docRef.id, ...data };
  },

  async deleteRole(roleId: string) {
    const [deptId, roleDocId] = roleId.split('/');
    if (roleDocId) await deleteDoc(doc(db, COL, deptId, 'roles', roleDocId));
  },
};
