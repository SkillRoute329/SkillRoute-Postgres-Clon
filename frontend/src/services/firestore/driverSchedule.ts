import { apiClient } from '../../clients/apiClient';

const COL = 'daily_shifts';

export const DriverService = {
  async getSchedule(month: number, year: number, _viewMode?: string): Promise<unknown[]> {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = `${year}-${String(month).padStart(2, '0')}-31`;
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: {
        where: `date>=${start},date<=${end}`,
        orderBy: 'date:asc',
        limit: 5000,
      },
    });
    return Array.isArray(res.data) ? res.data : [];
  },
};
