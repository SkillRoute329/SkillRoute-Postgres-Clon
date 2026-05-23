import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';

const COL = 'discounts';

export const DiscountService = {
  async getAll(): Promise<unknown[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, { query: { limit: 5000 } });
    return Array.isArray(res.data) ? res.data : [];
  },

  // FASE 5.35 (2026-05-22): bus socket en lugar de polling 10s.
  subscribe(callback: (items: unknown[]) => void): () => void {
    return subscribeViaBus<unknown[]>(COL, () => this.getAll(), callback);
  },

  async create(data: Record<string, unknown>) {
    const res = await apiClient.post<{ id: string }>(`/api/db/${COL}`, data);
    return { id: res.data?.id ?? String(Date.now()), ...data };
  },

  async delete(id: string) {
    await apiClient.delete(`/api/db/${COL}/${encodeURIComponent(id)}`);
  },
};
