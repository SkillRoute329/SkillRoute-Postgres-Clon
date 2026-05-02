import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';

interface SystemStatus {
  database: { status: string; latency: number };
  environment: { platform: string; node: string };
}

export const SystemHealthService = {
  async getStatus(): Promise<SystemStatus> {
    const start = Date.now();
    try {
      await getDoc(doc(db, '_healthcheck', 'status'));
      const latency = Date.now() - start;
      return {
        database: { status: 'READY', latency },
        environment: { platform: 'Firebase / Cloud Run', node: '22' },
      };
    } catch {
      return {
        database: { status: 'ERROR', latency: -1 },
        environment: { platform: 'desconocido', node: '—' },
      };
    }
  },

  async getLogs(): Promise<unknown[]> {
    return [];
  },

  async triggerUpdate(): Promise<{ ok: boolean; message?: string }> {
    try {
      await setDoc(doc(db, '_healthcheck', 'status'), {
        status: 'ok',
        updatedAt: serverTimestamp(),
      });
      return { ok: true, message: 'Estado de Firestore actualizado correctamente.' };
    } catch {
      return { ok: false, message: 'No se pudo actualizar el estado en Firestore.' };
    }
  },
};
