import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';
import type { AssignmentConflict } from './types';

const COL = 'assignment_conflicts';

function mapConflict(id: string, data: Record<string, unknown>): AssignmentConflict {
  return {
    id,
    type: (data?.type as 'Conflicto de Asignación') ?? 'Conflicto de Asignación',
    shiftId: data?.shiftId as string | undefined,
    serviceId: data?.serviceId as string | undefined,
    vehicleId: data?.vehicleId as string | undefined,
    driverId: data?.driverId as string | undefined,
    guardId: data?.guardId as string | undefined,
    driverName: data?.driverName as string | undefined,
    guardName: data?.guardName as string | undefined,
    vehicleInternalNumber: data?.vehicleInternalNumber as string | undefined,
    message: data?.message as string | undefined,
    status: (data?.status as 'open' | 'resolved') ?? 'open',
    createdAt: data?.createdAt as string | undefined,
    resolvedAt: data?.resolvedAt as string | undefined,
    ...data,
  } as AssignmentConflict;
}

export const AssignmentConflictService = {
  async getOpen(): Promise<AssignmentConflict[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { where: 'status:open', limit: 5000 },
    });
    const list = Array.isArray(res.data)
      ? res.data.map((d) => mapConflict((d.id as string) ?? '', { ...d }))
      : [];
    list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return list;
  },

  // FASE 5.35 (2026-05-22): bus socket en lugar de polling 10s.
  subscribe(callback: (conflicts: AssignmentConflict[]) => void): () => void {
    return subscribeViaBus<AssignmentConflict[]>(COL, () => this.getOpen(), callback);
  },

  async markResolved(id: string) {
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(id)}`, {
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
    });
  },

  /** Registra notificación de atraso/incidencia para inspector (sin conflicto de asignación). */
  async notifyInspector(params: {
    serviceId: string;
    message: string;
    vehicleId?: string;
    vehicleInternalNumber?: string;
  }) {
    const id = `notif_${params.serviceId}_${Date.now()}`;
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(id)}`, {
      type: 'Notificación Inspector',
      serviceId: params.serviceId,
      message: params.message,
      vehicleId: params.vehicleId,
      vehicleInternalNumber: params.vehicleInternalNumber,
      status: 'open',
      createdAt: new Date().toISOString(),
    });
  },
};
