import { apiClient } from '../../clients/apiClient';

const PATH_MAP: Record<string, string> = {
  fleet: 'vehiculos',
  vehicles: 'vehiculos',
  parts: 'parts',
  users: 'users',
};

export const UniversalService = {
  async list(apiPath: string, page = 1, pageSize = 50): Promise<{ data: unknown[] }> {
    const col = PATH_MAP[apiPath] ?? apiPath;
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${col}`, {
      query: { orderBy: 'internal_number:asc', limit: pageSize * page },
    });
    return { data: Array.isArray(res.data) ? res.data : [] };
  },

  async create(apiPath: string, rawData: Record<string, unknown>) {
    const col = PATH_MAP[apiPath] ?? apiPath;
    const res = await apiClient.post<{ id: string }>(`/api/db/${col}`, rawData);
    return { id: res.data?.id ?? String(Date.now()), ...rawData };
  },

  async update(apiPath: string, id: string, rawData: Record<string, unknown>) {
    const col = PATH_MAP[apiPath] ?? apiPath;
    await apiClient.put(`/api/db/${col}/${encodeURIComponent(id)}`, rawData);
    return { id, ...rawData };
  },

  async delete(apiPath: string, id: string) {
    const col = PATH_MAP[apiPath] ?? apiPath;
    await apiClient.delete(`/api/db/${col}/${encodeURIComponent(id)}`);
  },

  async import(apiPath: string, jsonData: unknown[]): Promise<{ count: number }> {
    const col = PATH_MAP[apiPath] ?? apiPath;
    let count = 0;
    for (const item of Array.isArray(jsonData) ? jsonData : []) {
      await apiClient.post(`/api/db/${col}`, item as Record<string, unknown>);
      count++;
    }
    return { count };
  },
};
