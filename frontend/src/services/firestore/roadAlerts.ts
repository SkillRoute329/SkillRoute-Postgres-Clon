import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';

const COL = 'alertas_trafico';

export const RoadAlertService = {
  async getAll(): Promise<unknown[]> {
    try {
      const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
        query: { orderBy: 'creado_en:desc', limit: 5000 },
      });
      return Array.isArray(res.data)
        ? res.data.map((data) => ({
            id: data.id ?? '',
            title: data.title ?? '',
            description: data.description ?? '',
            type: data.type ?? 'DESVIO',
            severity: data.severity ?? 'MEDIUM',
            affectedLine: data.affectedLine ?? 'Todas',
            active: data.active !== false,
            creado_en: data.creado_en ?? null,
            createdAt: data.creado_en ?? data.createdAt ?? new Date().toISOString(),
          }))
        : [];
    } catch (e) {
      console.error('RoadAlertService.getAll', e);
      return [];
    }
  },

  // FASE 5.34 (2026-05-22): bus socket en lugar de polling 10s.
  subscribe(callback: (items: unknown[]) => void): () => void {
    return subscribeViaBus<unknown[]>(
      COL,
      () => this.getAll(),
      callback,
      { alsoListen: ['bus:db:road_alerts:any', 'bus:db:roadAlerts:any', 'bus:db:traffic_alerts:any'] },
    );
  },

  async create(data: Record<string, unknown>) {
    const res = await apiClient.post<{ id: string }>(`/api/db/${COL}`, {
      ...data,
      active: true,
      creado_en: new Date().toISOString(),
    });
    return { id: res.data?.id ?? String(Date.now()), ...data };
  },

  async resolve(id: string) {
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(id)}`, { active: false, status: 'RESOLVED' });
  },
};
