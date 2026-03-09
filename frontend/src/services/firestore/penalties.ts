import {
  collection,
  doc,
  getDocs,
  addDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../config/firebase';

const RULES_COL = 'penalty_rules';
const RED_NUMBERS_COL = 'abl_red_numbers';

export const PenaltyService = {
  async getRules(): Promise<unknown[]> {
    const snap = await getDocs(collection(db, RULES_COL));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  subscribeRules(callback: (items: unknown[]) => void) {
    return onSnapshot(collection(db, RULES_COL), (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  },

  async saveRule(data: Record<string, unknown>) {
    const ref = await addDoc(collection(db, RULES_COL), data);
    return { id: ref.id, ...data };
  },

  async deleteRule(id: string) {
    await deleteDoc(doc(db, RULES_COL, id));
  },

  async getRedNumbers(): Promise<unknown[]> {
    try {
      const snap = await getDocs(collection(db, RED_NUMBERS_COL));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch {
      return [];
    }
  },
};
