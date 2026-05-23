/**
 * Colección mantenimiento_logs: registro automático cuando un coche pasa a Taller.
 */
import { apiClient } from '../../clients/apiClient';

const COL = 'mantenimiento_logs';

export interface MantenimientoLogEntry {
  vehicleId: string;
  vehicleInternalNumber?: string;
  date: string;
  status: string;
  servicioIdsAfectados?: string[];
  choferIdsNotificados?: string[];
  createdAt: string;
}

export const MantenimientoLogsService = {
  async add(entry: Omit<MantenimientoLogEntry, 'createdAt'>): Promise<string> {
    const res = await apiClient.post<{ id: string }>(`/api/db/${COL}`, {
      ...entry,
      createdAt: new Date().toISOString(),
    });
    return res.data?.id ?? String(Date.now());
  },

  async getByVehicleAndMonth(
    vehicleId: string,
    monthStart: string,
    monthEnd: string,
  ): Promise<MantenimientoLogEntry[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: {
        where: `vehicleId:${vehicleId},date>=${monthStart},date<=${monthEnd}`,
        orderBy: 'date:desc',
        limit: 50,
      },
    });
    return Array.isArray(res.data)
      ? (res.data as unknown as MantenimientoLogEntry[])
      : [];
  },
};
