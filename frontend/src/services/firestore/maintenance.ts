import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';

const COL = 'incidencias';

export const MaintenanceService = {
  async getAll(filters: { vehicleId?: string } = {}): Promise<unknown[]> {
    const query: Record<string, unknown> = { orderBy: 'timestamp:desc', limit: 5000 };
    if (filters.vehicleId) query.where = `vehicleId:${filters.vehicleId}`;
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, { query });
    return Array.isArray(res.data) ? res.data : [];
  },

  // FASE 5.31 (2026-05-21): bus socket en lugar de polling 10s.
  subscribe(callback: (items: unknown[]) => void, filters: { vehicleId?: string } = {}): () => void {
    return subscribeViaBus<unknown[]>(COL, () => this.getAll(filters), callback);
  },

  async create(data: Record<string, unknown>) {
    const res = await apiClient.post<{ id: string }>(`/api/db/${COL}`, {
      ...data,
      timestamp: new Date().toISOString(),
      status: 'OPEN',
    });
    return { id: res.data?.id ?? String(Date.now()), ...data };
  },

  async closeTicket(id: string, data: Record<string, unknown>) {
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(id)}`, { ...data, status: 'CLOSED' });
  },

  async uploadFile(file: File): Promise<{ url: string; error?: string }> {
    // FASE 5.28 (2026-05-19) — Antes devolvía {url: ''} silencioso. Ahora
    // convierte el archivo a data URL inline (válido como src de <img/>).
    // Para producción real, conviene un microservicio de uploads, pero esta
    // implementación honesta evita que la pantalla quede con URL vacía.
    if (!file) return { url: '', error: 'sin_archivo' };
    if (file.size > 2 * 1024 * 1024) {
      return { url: '', error: 'archivo_demasiado_grande_2MB_max' };
    }
    return await new Promise<{ url: string; error?: string }>((resolve) => {
      const reader = new FileReader();
      reader.onerror = () => resolve({ url: '', error: 'no_se_pudo_leer' });
      reader.onload = () => resolve({ url: String(reader.result ?? '') });
      reader.readAsDataURL(file);
    });
  },
};
