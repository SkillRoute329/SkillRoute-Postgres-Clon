import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';
import type { Vehicle } from './types';
import { ServicioEstadoService } from './servicioEstado';
import { MantenimientoLogsService } from './mantenimientoLogs';
import { NotificacionesFlotaService } from './notificacionesFlota';

const COL = 'vehiculos';
const SHIFTS_COL = 'daily_shifts';
const CONFLICTS_COL = 'assignment_conflicts';
const ROTATION_COL = 'rotation_schemes';

function mapVehicle(id: string, data: Record<string, unknown>): Vehicle {
  return {
    id: data?.id ?? data?.internalNumber ?? id,
    internalNumber: (data?.internalNumber as string) ?? id,
    plate: data?.plate as string,
    brand: data?.brand as string,
    model: data?.model as string,
    make: data?.make ?? data?.brand,
    year: data?.year as string,
    capacity: data?.capacity as number,
    status: data?.status as string,
    features: data?.features as Record<string, unknown>,
    ...data,
  } as Vehicle;
}

export const FleetService = {
  async getVehicles(agencyId?: string | number): Promise<Vehicle[]> {
    if (agencyId == null) {
      const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
        query: { orderBy: 'internal_number:asc', limit: 5000 },
      });
      return Array.isArray(res.data)
        ? res.data.map((d) => mapVehicle((d.id as string) ?? '', { ...d }))
        : [];
    }
    const aid = String(agencyId);
    // Try both agencyId and empresa filters; merge results deduped
    const [res1, res2, res3, res4] = await Promise.allSettled([
      apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, { query: { where: `agencyId:${aid}`, limit: 5000 } }),
      apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, { query: { where: `agencyId:${agencyId}`, limit: 5000 } }),
      apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, { query: { where: `empresa:${aid}`, limit: 5000 } }),
      apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, { query: { where: `empresa:${agencyId}`, limit: 5000 } }),
    ]);

    const seen = new Set<string>();
    const out: Vehicle[] = [];
    for (const result of [res1, res2, res3, res4]) {
      if (result.status === 'fulfilled' && Array.isArray(result.value.data)) {
        result.value.data.forEach((d) => {
          const id = (d.id as string) ?? '';
          if (seen.has(id)) return;
          seen.add(id);
          out.push(mapVehicle(id, { ...d }));
        });
      }
    }

    if (out.length === 0) {
      console.warn(
        `[FleetService] getVehicles(${aid}) → 0 docs con filtro agencyId/empresa. ` +
        `Probable mismatch de nombre de campo. Cargando todos los docs como fallback.`,
      );
      const resAll = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
        query: { orderBy: 'internal_number:asc', limit: 5000 },
      });
      return Array.isArray(resAll.data)
        ? resAll.data.map((d) => mapVehicle((d.id as string) ?? '', { ...d }))
        : [];
    }

    return out.sort((a, b) =>
      String(a.internalNumber).localeCompare(String(b.internalNumber)),
    );
  },

  // FASE 5.34 (2026-05-22): bus socket en lugar de polling 10s.
  subscribeVehicles(callback: (vehicles: Vehicle[]) => void): () => void {
    return subscribeViaBus<Vehicle[]>(
      COL,
      () => this.getVehicles(),
      callback,
      { alsoListen: ['bus:db:coaches:any', 'bus:db:fleet:any'] },
    );
  },

  async getVehicleById(id: number | string): Promise<Vehicle | null> {
    try {
      const res = await apiClient.get<Record<string, unknown>>(`/api/db/${COL}/${encodeURIComponent(String(id))}`);
      return res.data ? mapVehicle(String(id), { ...res.data, id: String(id) }) : null;
    } catch { return null; }
  },

  async createVehicle(data: Record<string, unknown>) {
    const res = await apiClient.post<{ id: string }>(`/api/db/${COL}`, data);
    return { id: res.data?.id ?? String(Date.now()), ...data };
  },

  async updateVehicle(id: number | string, data: Record<string, unknown>) {
    const idStr = String(id);
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(idStr)}`, data);

    if (data.status === 'MAINTENANCE' || data.status === 'Taller') {
      const today = new Date().toISOString().split('T')[0];
      const vehicleRes = await apiClient.get<Record<string, unknown>>(`/api/db/${COL}/${encodeURIComponent(idStr)}`);
      const vehicle = vehicleRes.data;
      const internalNumber = (vehicle?.internalNumber ?? vehicle?.id ?? id) as string;

      const estados = await ServicioEstadoService.getByDate(today);
      const afectados = estados.filter((e) => e.cocheActual && String(e.cocheActual) === idStr);
      const servicioIds: string[] = [];
      const choferIds: string[] = [];

      for (const e of afectados) {
        await ServicioEstadoService.setState(e.servicioId, today, {
          status: 'pendiente_de_coche',
          cocheActual: null,
          choferActual: e.choferActual,
        });
        servicioIds.push(e.servicioId);
        if (e.choferActual) choferIds.push(e.choferActual);
      }

      await MantenimientoLogsService.add({
        vehicleId: idStr,
        vehicleInternalNumber: internalNumber,
        date: today,
        status: 'Taller',
        servicioIdsAfectados: servicioIds,
        choferIdsNotificados: [...new Set(choferIds)],
      });

      for (const driverId of [...new Set(choferIds)]) {
        const svcId = afectados.find((e) => e.choferActual === driverId)?.servicioId;
        await NotificacionesFlotaService.notifyServicioSuspendido({
          driverId,
          servicioId: svcId ?? '',
          vehicleId: idStr,
          vehicleInternalNumber: internalNumber,
        });
      }

      // Register conflicts for affected shifts
      const shiftsRes = await apiClient.get<Record<string, unknown>[]>(`/api/db/${SHIFTS_COL}`, {
        query: { where: `date:${today},vehicleId:${idStr}`, limit: 500 },
      });
      const shifts = Array.isArray(shiftsRes.data) ? shiftsRes.data : [];
      for (const s of shifts) {
        await apiClient.post(`/api/db/${CONFLICTS_COL}`, {
          type: 'Conflicto de Asignación',
          shiftId: s.id,
          serviceId: s.serviceId,
          vehicleId: idStr,
          vehicleInternalNumber: internalNumber,
          driverId: s.driverId ?? s.assignedTo,
          driverName: s.driverName ?? '',
          guardId: s.guardId,
          guardName: s.guardName ?? '',
          status: 'open',
          message: `Coche ${internalNumber} a taller`,
          createdAt: new Date().toISOString(),
        });
      }
    }
    return { id, ...data };
  },

  async getVehicleHistory(vehicleId: number | string): Promise<unknown[]> {
    // Subcollection vehiculos/{vehicleId}/history → tabla vehiculos_history
    // TODO: confirmar tabla subcollection
    try {
      const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/vehiculos_history`, {
        query: { where: `vehicleId:${String(vehicleId)}`, limit: 5000 },
      });
      return Array.isArray(res.data) ? res.data : [];
    } catch { return []; }
  },

  async getRotationSchemes(): Promise<unknown[]> {
    try {
      const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${ROTATION_COL}`, { query: { limit: 5000 } });
      return Array.isArray(res.data) ? res.data : [];
    } catch {
      return [];
    }
  },

  async getLastInspection(vehicleId: string): Promise<unknown> {
    try {
      const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/inspections`, {
        query: { where: `vehiculo_id:${vehicleId}`, orderBy: 'fecha_inspeccion:desc', limit: 1 },
      });
      const docs = Array.isArray(res.data) ? res.data : (Array.isArray(res as any) ? (res as any) : []);
      return docs.length > 0 ? docs[0] : null;
    } catch { return null; }
  },

  async createInspection(data: { vehicleId: string; [k: string]: unknown }) {
    const payload = {
      ...data,
      vehiculo_id: data.vehicleId,
      fecha_inspeccion: new Date().toISOString()
    };
    const res = await apiClient.post<{ id: string }>(`/api/db/inspections`, payload);
    return { id: res.data?.id ?? (res as any).id ?? String(Date.now()), ...payload };
  },
};
