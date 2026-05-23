/**
 * Colección inspecciones_flota: multas/infracciones vinculadas a vehículo, servicio y conductor.
 * El conductor se resuelve por historial de rotación (active_assignments) para la fecha.
 */
import { apiClient } from '../../clients/apiClient';
import { ActiveAssignmentsService } from './activeAssignments';

const COL = 'inspecciones_flota';

export interface InspeccionFlotaEntry {
  id?: string;
  vehicleId: string;
  vehicleInternalNumber?: string;
  servicioId: string;
  conductorId: string | null;
  date: string;
  tipo: 'infraccion' | 'multa' | 'observacion';
  descripcion: string;
  inspectorId?: string;
  createdAt: string;
}

export const InspeccionesFlotaService = {
  /**
   * Registra una infracción. Si conductorId no se pasa, se resuelve por active_assignments.
   */
  async add(params: {
    vehicleId: string;
    vehicleInternalNumber?: string;
    servicioId: string;
    conductorId?: string | null;
    date: string;
    tipo: InspeccionFlotaEntry['tipo'];
    descripcion: string;
    inspectorId?: string;
  }): Promise<InspeccionFlotaEntry> {
    let conductorId = params.conductorId ?? null;
    if (conductorId === undefined || conductorId === null) {
      const assignments = await ActiveAssignmentsService.getByDate(params.date);
      const match = assignments.find(
        (a) => String(a.cocheId) === String(params.vehicleId) && a.servicioId === params.servicioId,
      );
      if (match?.choferId) conductorId = match.choferId;
      else {
        const byCoche = assignments.find((a) => String(a.cocheId) === String(params.vehicleId));
        if (byCoche?.choferId) conductorId = byCoche.choferId;
      }
    }
    const payload = {
      vehicleId: params.vehicleId,
      vehicleInternalNumber: params.vehicleInternalNumber,
      servicioId: params.servicioId,
      conductorId,
      date: params.date,
      tipo: params.tipo,
      descripcion: params.descripcion,
      inspectorId: params.inspectorId,
      createdAt: new Date().toISOString(),
    };
    const res = await apiClient.post<{ id: string }>(`/api/db/${COL}`, payload);
    return { id: res.data?.id ?? String(Date.now()), ...payload } as InspeccionFlotaEntry;
  },

  async getByVehicleAndDate(vehicleId: string, date: string): Promise<InspeccionFlotaEntry[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: {
        where: `vehicleId:${vehicleId},date:${date}`,
        orderBy: 'created_at:desc',
        limit: 50,
      },
    });
    return Array.isArray(res.data) ? (res.data as unknown as InspeccionFlotaEntry[]) : [];
  },

  async getByDate(date: string): Promise<InspeccionFlotaEntry[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: {
        where: `date:${date}`,
        orderBy: 'created_at:desc',
        limit: 100,
      },
    });
    return Array.isArray(res.data) ? (res.data as unknown as InspeccionFlotaEntry[]) : [];
  },
};
