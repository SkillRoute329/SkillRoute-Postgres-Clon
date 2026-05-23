import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';

const COL = 'departments';

export const DepartmentService = {
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

  async update(id: string, data: Record<string, unknown>) {
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(id)}`, data);
    return { id, ...data };
  },

  async delete(id: string) {
    await apiClient.delete(`/api/db/${COL}/${encodeURIComponent(id)}`);
  },

  async addRole(departmentId: string, data: Record<string, unknown>) {
    // Subcollection departments/{departmentId}/roles → tabla departments_roles
    // TODO: confirmar tabla subcollection
    const res = await apiClient.post<{ id: string }>(`/api/db/departments_roles`, {
      ...data,
      departmentId,
    });
    return { id: res.data?.id ?? String(Date.now()), ...data };
  },

  async deleteRole(roleId: string) {
    const [deptId, roleDocId] = roleId.split('/');
    if (roleDocId) {
      await apiClient.delete(`/api/db/departments_roles/${encodeURIComponent(roleDocId)}`);
    }
  },
};
