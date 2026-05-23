/**
 * Programación diaria (Listero): asignación Fecha + Servicio + Coche + Conductor.
 * Colección: programacion_diaria.
 */
import { apiClient } from '../../clients/apiClient';

const COL = 'programacion_diaria';

export type ProgramacionDiariaRecord = {
  id: string;
  date: string;
  linea: string;
  servicio: string;
  vehiculo: string;
  conductor: string;
  horaInicio?: string;
  createdAt?: string;
  firmaConductor?: boolean;
  fechaFirma?: string;
};

export const ProgramacionDiariaService = {
  async getByDate(date: string): Promise<ProgramacionDiariaRecord[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { where: `date:${date}`, limit: 5000 },
    });
    const list = Array.isArray(res.data)
      ? (res.data as unknown as ProgramacionDiariaRecord[])
      : [];
    list.sort((a, b) => (a.horaInicio || '').localeCompare(b.horaInicio || ''));
    return list;
  },

  async add(
    record: Omit<ProgramacionDiariaRecord, 'id' | 'createdAt'>,
  ): Promise<ProgramacionDiariaRecord> {
    const id =
      `pd_${record.date}_${record.linea}_${String(record.servicio).replace(/\s/g, '_')}_${Date.now()}`.slice(
        0,
        80,
      );
    const payload = {
      ...record,
      id,
      createdAt: new Date().toISOString(),
    };
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(id)}`, payload);
    return payload as ProgramacionDiariaRecord;
  },

  async update(id: string, data: Partial<ProgramacionDiariaRecord>): Promise<void> {
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(id)}`, data);
  },

  async getLastShiftByDriver(driverId: string): Promise<ProgramacionDiariaRecord | null> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { where: `conductor:${driverId}`, limit: 5000 },
    });
    if (!res.data || !Array.isArray(res.data) || res.data.length === 0) return null;
    const list = res.data as unknown as ProgramacionDiariaRecord[];
    list.sort((a, b) => {
      const dtA = `${a.date}T${a.horaInicio || '00:00'}`;
      const dtB = `${b.date}T${b.horaInicio || '00:00'}`;
      return dtB.localeCompare(dtA);
    });
    return list[0];
  },
};
