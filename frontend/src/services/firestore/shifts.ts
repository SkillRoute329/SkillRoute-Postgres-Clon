import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';
import type { Shift } from './types';

const COL = 'daily_shifts';
const CATEGORIES_COL = 'shift_categories';
const CONFIG_COL = 'system';
const CONFIG_DOC_ID = 'global_config';

function mapShift(id: string, data: Record<string, unknown>): Shift {
  return {
    id: data?.id ?? id,
    date: data?.date as string,
    start: data?.start as string,
    end: data?.end as string,
    status: data?.status as string,
    assignedTo: data?.assignedTo as number | string,
    createdBy: data?.createdBy as number | string,
    totalValue: data?.totalValue as number,
    categoryId: data?.categoryId as number,
    vehicleId: data?.vehicleId as number | string,
    serviceId: data?.serviceId as string,
    ...data,
  } as Shift;
}

export const ShiftService = {
  async getAll(date?: string): Promise<Shift[]> {
    const query: Record<string, unknown> = date
      ? { where: `date:${date}`, orderBy: 'start:asc', limit: 5000 }
      : { orderBy: 'start:desc', limit: 5000 };
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, { query });
    return Array.isArray(res.data)
      ? res.data.map((d) => mapShift((d.id as string) ?? '', { ...d }))
      : [];
  },

  // FASE 5.31 (2026-05-21): bus socket en lugar de polling 10s. Cuando el
  // backend emite bus:db:daily_shifts:* (o el alias 'shifts'), refetch
  // inmediato. Polling de respaldo a 60s.
  subscribe(callback: (shifts: Shift[]) => void, date?: string): () => void {
    return subscribeViaBus<Shift[]>(
      COL,
      () => this.getAll(date),
      callback,
      { alsoListen: ['bus:db:shifts:any', 'bus:db:turnos_dia:any'] },
    );
  },

  async create(data: Partial<Shift>) {
    const res = await apiClient.post<{ id: string }>(`/api/db/${COL}`, { ...data });
    return { id: res.data?.id ?? String(Date.now()), ...data };
  },

  async update(id: string | number, data: Partial<Shift>) {
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(String(id))}`, data);
    return { id, ...data };
  },

  async delete(id: number | string) {
    await apiClient.delete(`/api/db/${COL}/${encodeURIComponent(String(id))}`);
  },

  async assign(id: number | string, userId: number | string) {
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(String(id))}`, {
      assignedTo: userId,
      status: 'Assigned',
    });
  },

  async publish(id: number | string) {
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(String(id))}`, { status: 'Public' });
  },

  async getCategories(
    _date?: string,
  ): Promise<{ id: number; name: string; baseValue: string; extraHourValue: string }[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${CATEGORIES_COL}`, { query: { limit: 5000 } });
    return Array.isArray(res.data)
      ? res.data.map((d, i) => ({ id: i + 1, ...d }) as { id: number; name: string; baseValue: string; extraHourValue: string })
      : [];
  },

  async getSystemConfig(): Promise<Record<string, unknown>> {
    try {
      const res = await apiClient.get<Record<string, unknown>>(`/api/db/${CONFIG_COL}/${encodeURIComponent(CONFIG_DOC_ID)}`);
      return res.data ?? {};
    } catch { return {}; }
  },

  async createCategory(data: { name: string; baseValue: number; extraHourValue: number }) {
    const res = await apiClient.post<{ id: string }>(`/api/db/${CATEGORIES_COL}`, data);
    return { id: res.data?.id ?? String(Date.now()), ...data };
  },

  async getCategoryHistory(_id: number): Promise<unknown[]> {
    return [];
  },

  async updateCategory(id: string | number, data: Record<string, unknown>) {
    await apiClient.put(`/api/db/${CATEGORIES_COL}/${encodeURIComponent(String(id))}`, data);
    return { id, ...data };
  },

  async addCategoryPriceHistory(_id: number, _entry: Record<string, unknown>) {
    return {};
  },

  async deleteCategory(id: number | string) {
    await apiClient.delete(`/api/db/${CATEGORIES_COL}/${encodeURIComponent(String(id))}`);
  },

  async getBalances(): Promise<unknown[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, { query: { limit: 5000 } });
    return Array.isArray(res.data) ? res.data : [];
  },
};
