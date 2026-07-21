import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';
import type { Inspection, InspectionCreate } from '../../types/inspections';

const COL = 'inspections';

import { Timestamp } from '../../config/firestoreShim';

function mapDoc(id: string, data: Record<string, unknown>): Inspection {
  let actualPassedAt: any = data.actualPassedAt;
  if (typeof actualPassedAt === 'string') {
    actualPassedAt = Timestamp.fromDate(new Date(actualPassedAt));
  } else if (actualPassedAt && typeof actualPassedAt.seconds === 'number') {
    actualPassedAt = new Timestamp(actualPassedAt.seconds, actualPassedAt.nanoseconds);
  }

  let createdAt: any = data.createdAt;
  if (typeof createdAt === 'string') {
    createdAt = Timestamp.fromDate(new Date(createdAt));
  } else if (createdAt && typeof createdAt.seconds === 'number') {
    createdAt = new Timestamp(createdAt.seconds, createdAt.nanoseconds);
  }

  return {
    id,
    cartonServiceId: data.cartonServiceId as string,
    lineId: data.lineId as string,
    controlPointId: data.controlPointId as string,
    serviceDate: data.serviceDate as string,
    scheduledTime: data.scheduledTime as string,
    actualPassedAt: actualPassedAt as Inspection['actualPassedAt'],
    timeDeltaMinutes: data.timeDeltaMinutes as number,
    passengerLoad: data.passengerLoad as Inspection['passengerLoad'],
    inspectorId: data.inspectorId as string | undefined,
    createdAt: createdAt as Inspection['createdAt'],
  };
}

/** Payload para crear inspección: actualPassedAt puede ser un número (ms) o ISO string */
type CreatePayload = Omit<InspectionCreate, 'actualPassedAt'> & {
  actualPassedAt: number | string;
};

export const InspectionService = {
  async create(data: CreatePayload): Promise<Inspection> {
    // Normalize actualPassedAt to ISO string for REST backend
    const actualPassedAt =
      typeof data.actualPassedAt === 'number'
        ? new Date(data.actualPassedAt).toISOString()
        : data.actualPassedAt;
    const payload = {
      ...data,
      actualPassedAt,
      createdAt: new Date().toISOString(),
    };
    const res = await apiClient.post<{ id: string }>(`/api/db/${COL}`, payload);
    return mapDoc(res.data?.id ?? String(Date.now()), { ...payload, id: res.data?.id });
  },

  async getAll(filters?: { serviceDate?: string; lineId?: string }): Promise<Inspection[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { orderBy: 'actual_passed_at:desc', limit: 5000 },
    });
    let list = Array.isArray(res.data)
      ? res.data.map((d) => mapDoc((d.id as string) ?? '', { ...d }))
      : [];
    if (filters?.serviceDate) list = list.filter((i) => i.serviceDate === filters.serviceDate);
    if (filters?.lineId) list = list.filter((i) => i.lineId === filters.lineId);
    return list;
  },

  /** Inspecciones de un cartón/servicio para análisis cruzado (motor de alertas). */
  async getByCartonServiceId(cartonServiceId: string): Promise<Inspection[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { where: `cartonServiceId:${cartonServiceId}`, limit: 5000 },
    });
    return Array.isArray(res.data)
      ? res.data.map((d) => mapDoc((d.id as string) ?? '', { ...d }))
      : [];
  },

  /**
   * Inspecciones de un día (y opcionalmente una línea) para Control Inspectores.
   */
  async getForDate(serviceDate: string, lineId?: string): Promise<Inspection[]> {
    const whereParts = [`serviceDate:${serviceDate}`];
    if (lineId) whereParts.push(`lineId:${lineId}`);
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: {
        where: whereParts.join(','),
        orderBy: 'actual_passed_at:asc',
        limit: 5000,
      },
    });
    return Array.isArray(res.data)
      ? res.data.map((d) => mapDoc((d.id as string) ?? '', { ...d }))
      : [];
  },

  /**
   * Suscripción en tiempo real a inspecciones del día (y opcionalmente línea).
   * Retorna función de limpieza (unsubscribe).
   * TODO FASE 4.5: optimizar a Socket.io cuando el backend emita evento firestore:inspections
   */
  // FASE 5.34 (2026-05-22): bus socket en lugar de polling 10s.
  subscribeForDate(
    serviceDate: string,
    lineId: string | undefined,
    callback: (inspections: Inspection[]) => void,
  ): () => void {
    return subscribeViaBus<Inspection[]>(
      COL,
      () => this.getForDate(serviceDate, lineId),
      callback,
      { alsoListen: ['bus:db:inspecciones:any'] },
    );
  },
};
