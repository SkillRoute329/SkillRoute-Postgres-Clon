/**
 * Configuración global del sistema (Parámetros del Sistema).
 * Un solo documento en Firestore; leído por el motor de desvíos (tolerancia, etc.).
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';

const DOC_PATH = 'system_config';

export interface SystemConfigRecord {
  toleranciaMinutos: number;
  updatedAt?: string;
}

const DEFAULTS: SystemConfigRecord = {
  toleranciaMinutos: 10,
};

export const SystemConfigService = {
  async get(): Promise<SystemConfigRecord> {
    const ref = doc(db, DOC_PATH, 'params');
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ...DEFAULTS };
    const d = snap.data();
    return {
      toleranciaMinutos:
        typeof d?.toleranciaMinutos === 'number' ? d.toleranciaMinutos : DEFAULTS.toleranciaMinutos,
      updatedAt: d?.updatedAt as string | undefined,
    };
  },

  async setToleranciaMinutos(minutos: number): Promise<void> {
    const ref = doc(db, DOC_PATH, 'params');
    await setDoc(
      ref,
      {
        toleranciaMinutos: Math.max(0, Math.min(60, minutos)),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  },
};
