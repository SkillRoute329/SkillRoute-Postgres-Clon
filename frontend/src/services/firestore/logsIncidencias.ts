/**
 * Colección logs_incidencias: incidencias reportadas por el chofer.
 */
import { apiClient } from '../../clients/apiClient';

const COL = 'logs_incidencias';

export interface LogIncidenciaEntry {
  driverId: string;
  servicioId?: string;
  ultimoPuntoControl?: string;
  prioridad: 'alta' | 'media' | 'normal';
  mensaje?: string;
  createdAt: string;
}

export const LogsIncidenciasService = {
  async add(entry: Omit<LogIncidenciaEntry, 'createdAt'>): Promise<string> {
    const res = await apiClient.post<{ id: string }>(`/api/db/${COL}`, {
      ...entry,
      createdAt: new Date().toISOString(),
    });
    return res.data?.id ?? String(Date.now());
  },

  async createPrioridadAlta(params: {
    driverId: string;
    servicioId?: string;
    ultimoPuntoControl: string;
    mensaje?: string;
  }): Promise<string> {
    return this.add({
      ...params,
      prioridad: 'alta',
    });
  },

  async getRecent(limitCount = 50): Promise<LogIncidenciaEntry[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { orderBy: 'created_at:desc', limit: limitCount },
    });
    return Array.isArray(res.data) ? (res.data as unknown as LogIncidenciaEntry[]) : [];
  },
};
