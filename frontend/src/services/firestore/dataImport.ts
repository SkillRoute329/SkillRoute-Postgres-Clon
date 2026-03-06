import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import { db } from '../../config/firebase';

const USERS_COL = 'users';
const BATCH_SIZE = 500;

export const DataImportService = {
  async upload(formData: FormData): Promise<{ count: number }> {
    const file = formData.get('file') as File | null;
    if (!file) return { count: 0 };
    const text = await file.text();
    const rows = text.split(/\r?\n/).filter(Boolean).length - 1;
    return { count: Math.max(0, rows) };
  },

  async downloadTemplate(): Promise<Blob> {
    const header = 'internalNumber,firstName,lastName,email,role\n';
    return new Blob([header], { type: 'text/csv' });
  },

  /** Ingesta 1:1 sin límite artificial; escribe en Firestore por batches de 500. */
  async ingestJson(data: unknown[]): Promise<{ count: number }> {
    const list = Array.isArray(data) ? data : [];
    let count = 0;
    for (let offset = 0; offset < list.length; offset += BATCH_SIZE) {
      const chunk = list.slice(offset, offset + BATCH_SIZE);
      const batch = writeBatch(db);
      for (let i = 0; i < chunk.length; i++) {
        const r = chunk[i] as Record<string, unknown>;
        const id = String(r.uid ?? r.internalNumber ?? r.id ?? offset + i);
        batch.set(doc(db, USERS_COL, id), { ...r, uid: id }, { merge: true });
        count++;
      }
      await batch.commit();
    }
    return { count };
  },

  async exportEmployees(): Promise<Blob> {
    const snap = await getDocs(collection(db, USERS_COL));
    const rows = snap.docs.map((d) => {
      const x = d.data();
      const dp = x.datos_personales ?? {};
      const de = x.datos_empresa ?? {};
      return [de.legajo ?? d.id, dp.nombre, dp.apellido, x.email, x.rol].join(',');
    });
    const csv = 'internalNumber,firstName,lastName,email,role\n' + rows.join('\n');
    return new Blob([csv], { type: 'text/csv' });
  },

  async uploadEmployees(formData: FormData): Promise<{ count: number }> {
    return this.upload(formData);
  },

  async downloadEmployeeTemplate(): Promise<Blob> {
    return this.downloadTemplate();
  },
};
