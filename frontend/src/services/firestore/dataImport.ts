import { apiClient } from '../../clients/apiClient';

const USERS_COL = 'users';
const BATCH_SIZE = 500;

export const DataImportService = {
  async upload(formData: FormData): Promise<{ count: number; errors?: string[] }> {
    // FASE 5.28 (2026-05-19) — Antes solo contaba filas del CSV y devolvía
    // count SIN persistir nada. Ahora parsea el CSV (header en primera fila)
    // e inserta cada fila como usuario via /api/db/users/:id. Devuelve el
    // count REAL de filas persistidas.
    const file = formData.get('file') as File | null;
    if (!file) return { count: 0, errors: ['sin_archivo'] };
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return { count: 0, errors: ['csv_vacio'] };
    const header = lines[0].split(',').map((h) => h.trim());
    const idxInternal = header.indexOf('internalNumber');
    if (idxInternal < 0) return { count: 0, errors: ['falta_columna_internalNumber'] };
    const errors: string[] = [];
    let count = 0;
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',');
      const id = String(cells[idxInternal] ?? '').trim();
      if (!id) { errors.push(`fila ${i + 1}: sin internalNumber`); continue; }
      const row: Record<string, unknown> = { id };
      for (let h = 0; h < header.length; h++) {
        row[header[h]] = (cells[h] ?? '').trim();
      }
      try {
        await apiClient.put(`/api/db/${USERS_COL}/${encodeURIComponent(id)}`, row);
        count += 1;
      } catch (e) {
        errors.push(`fila ${i + 1} (${id}): ${String(e).slice(0, 80)}`);
      }
    }
    return errors.length ? { count, errors } : { count };
  },

  async downloadTemplate(): Promise<Blob> {
    const header = 'internalNumber,firstName,lastName,email,role\n';
    return new Blob([header], { type: 'text/csv' });
  },

  /** Ingesta 1:1 sin límite artificial; escribe en el backend por batches de 500. */
  async ingestJson(data: unknown[]): Promise<{ count: number }> {
    const list = Array.isArray(data) ? data : [];
    let count = 0;
    for (let offset = 0; offset < list.length; offset += BATCH_SIZE) {
      const chunk = list.slice(offset, offset + BATCH_SIZE);
      for (let i = 0; i < chunk.length; i++) {
        const r = chunk[i] as Record<string, unknown>;
        const id = String(r.uid ?? r.internalNumber ?? r.id ?? offset + i);
        await apiClient.put(`/api/db/${USERS_COL}/${encodeURIComponent(id)}`, { ...r, uid: id });
        count++;
      }
    }
    return { count };
  },

  async exportEmployees(): Promise<Blob> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${USERS_COL}`, { query: { limit: 5000 } });
    const docs = Array.isArray(res.data) ? res.data : [];
    const rows = docs.map((x) => {
      const dp = (x.datos_personales ?? {}) as Record<string, unknown>;
      const de = (x.datos_empresa ?? {}) as Record<string, unknown>;
      return [de.legajo ?? x.id, dp.nombre, dp.apellido, x.email, x.rol].join(',');
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
