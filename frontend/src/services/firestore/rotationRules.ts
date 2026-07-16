import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';
import type { ReglaRotacion } from '../../types/rotation';

const COL = 'reglas_rotacion';

function mapRegla(id: string, data: Record<string, unknown>): ReglaRotacion {
  return {
    id,
    nombre: (data?.nombre as string) ?? '',
    regimen: (data?.regimen as ReglaRotacion) ?? '15_15',
    patronDescanso:
      (data?.patronDescanso as ReglaRotacion['patronDescanso']) ?? 'fin_de_semana_rotativo',
    descripcion: data?.descripcion as string | undefined,
    activo: data?.activo !== false,
    createdAt: data?.createdAt as string | undefined,
    updatedAt: data?.updatedAt as string | undefined,
    ...data,
  } as ReglaRotacion;
}

export const RotationRulesService = {
  async getAll(): Promise<ReglaRotacion[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { orderBy: 'nombre:asc', limit: 5000 },
    });
    return Array.isArray(res.data)
      ? res.data.map((d) => mapRegla((d.id as string) ?? '', { ...d }))
      : [];
  },

  // FASE 5.35 (2026-05-22): bus socket en lugar de polling 10s.
  subscribe(callback: (reglas: ReglaRotacion[]) => void): () => void {
    return subscribeViaBus<ReglaRotacion[]>(COL, () => this.getAll(), callback);
  },

  async getById(id: string): Promise<ReglaRotacion | null> {
    try {
      const res = await apiClient.get<Record<string, unknown>>(`/api/db/${COL}/${encodeURIComponent(id)}`);
      return res.data ? mapRegla(id, { ...res.data }) : null;
    } catch { return null; }
  },

  async create(data: Omit<ReglaRotacion, 'id'>): Promise<ReglaRotacion> {
    const payload = {
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const res = await apiClient.post<{ id: string }>(`/api/db/${COL}`, payload);
    return { ...data, id: res.data?.id ?? String(Date.now()) } as ReglaRotacion;
  },

  async update(id: string, data: Partial<ReglaRotacion>): Promise<void> {
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(id)}`, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/api/db/${COL}/${encodeURIComponent(id)}`);
  },
};
