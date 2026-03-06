import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';

export const SystemHealthService = {
  async getStatus(): Promise<{ status: string }> {
    try {
      const ref = doc(db, '_healthcheck', 'status');
      const snap = await getDoc(ref);
      return snap.exists() ? (snap.data() as { status: string }) : { status: 'unknown' };
    } catch {
      return { status: 'offline' };
    }
  },

  async getLogs(): Promise<unknown[]> {
    return [];
  },

  async triggerUpdate(): Promise<{ ok: boolean }> {
    try {
      await setDoc(doc(db, '_healthcheck', 'status'), {
        status: 'ok',
        updatedAt: serverTimestamp(),
      });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  },
};
