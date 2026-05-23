/**
 * Colección notificaciones_flota: notificaciones al chofer (ej. "Servicio Suspendido").
 */
import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';

const COL = 'notificaciones_flota';

export interface NotificacionFlotaEntry {
  driverId: string;
  tipo: 'servicio_suspendido' | 'prioridad_alta' | 'alerta_general';
  titulo: string;
  mensaje: string;
  servicioId?: string;
  vehicleId?: string;
  leida?: boolean;
  createdAt: string;
}

export const NotificacionesFlotaService = {
  async create(entry: Omit<NotificacionFlotaEntry, 'createdAt'>): Promise<string> {
    const res = await apiClient.post<{ id: string }>(`/api/db/${COL}`, {
      ...entry,
      leida: false,
      createdAt: new Date().toISOString(),
    });
    return res.data?.id ?? String(Date.now());
  },

  async notifyServicioSuspendido(params: {
    driverId: string;
    servicioId: string;
    vehicleId: string;
    vehicleInternalNumber?: string;
  }): Promise<string> {
    return this.create({
      driverId: params.driverId,
      tipo: 'servicio_suspendido',
      titulo: 'Servicio Suspendido',
      mensaje: `El coche ${params.vehicleInternalNumber ?? params.vehicleId} está en taller. Su servicio ha sido suspendido. Consulte con el listero.`,
      servicioId: params.servicioId,
      vehicleId: params.vehicleId,
    });
  },

  async getByDriver(driverId: string, limitCount = 20): Promise<NotificacionFlotaEntry[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { where: `driverId:${driverId}`, limit: limitCount * 2 },
    });
    const list = Array.isArray(res.data)
      ? (res.data as unknown as NotificacionFlotaEntry[])
      : [];
    list.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return list.slice(0, limitCount);
  },

  // FASE 5.35 (2026-05-22): bus socket en lugar de polling 10s.
  subscribeByDriver(driverId: string, callback: (items: NotificacionFlotaEntry[]) => void): () => void {
    return subscribeViaBus<NotificacionFlotaEntry[]>(
      COL,
      () => this.getByDriver(driverId, 30),
      callback,
    );
  },
};
