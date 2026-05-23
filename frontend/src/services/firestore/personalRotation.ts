import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';
import type { PersonalRotacion } from '../../types/rotation';

const COL = 'personal';

function mapPersonal(id: string, data: Record<string, unknown>): PersonalRotacion {
  const turno = data?.turnoActual;
  const t = turno === 1 || turno === 2 || turno === 3 ? turno : 1;
  return {
    id,
    userId: data?.userId as string | undefined,
    internalNumber: (data?.internalNumber as string) ?? '',
    fullName: data?.fullName as string | undefined,
    cocheFijo: (data?.cocheFijo as string | null) ?? null,
    reglaId: (data?.reglaId as string) ?? '',
    turnoActual: t as 1 | 2 | 3,
    patronDescanso:
      (data?.patronDescanso as PersonalRotacion['patronDescanso']) ?? 'fin_de_semana_rotativo',
    diaDescansoSemana: data?.diaDescansoSemana as number | undefined,
    activo: data?.activo !== false,
    createdAt: data?.createdAt as string | undefined,
    updatedAt: data?.updatedAt as string | undefined,
    ...data,
  } as PersonalRotacion;
}

export const PersonalRotationService = {
  async getAll(): Promise<PersonalRotacion[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { orderBy: 'internal_number:asc', limit: 5000 },
    });
    return Array.isArray(res.data)
      ? res.data.map((d) => mapPersonal((d.id as string) ?? '', { ...d }))
      : [];
  },

  // FASE 5.35 (2026-05-22): bus socket en lugar de polling 10s.
  subscribe(callback: (personal: PersonalRotacion[]) => void): () => void {
    return subscribeViaBus<PersonalRotacion[]>(COL, () => this.getAll(), callback);
  },

  async getByCocheFijo(cocheInternalNumber: string): Promise<PersonalRotacion[]> {
    const all = await this.getAll();
    return all.filter((p) => p.cocheFijo === cocheInternalNumber);
  },

  async getDeLista(): Promise<PersonalRotacion[]> {
    const all = await this.getAll();
    return all.filter((p) => p.cocheFijo == null || p.cocheFijo === '');
  },

  async create(data: Omit<PersonalRotacion, 'id'>): Promise<PersonalRotacion> {
    const payload = {
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const res = await apiClient.post<{ id: string }>(`/api/db/${COL}`, payload);
    return { ...data, id: res.data?.id ?? String(Date.now()) } as PersonalRotacion;
  },

  async update(id: string, data: Partial<PersonalRotacion>): Promise<void> {
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(id)}`, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  },
};
