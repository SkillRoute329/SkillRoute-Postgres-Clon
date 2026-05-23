/**
 * Estado dinámico del servicio (Cerebro Operativo CEO).
 * Fuente de verdad de asignación: servicioId como clave primaria.
 */
import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';

const COL = 'servicio_estado';

export type ServicioEstadoStatus = 'activo' | 'pendiente' | 'incidencia' | 'pendiente_de_coche';

export interface ServicioEstadoRecord {
  servicioId: string;
  date: string;
  status: ServicioEstadoStatus;
  cocheActual: string | null;
  choferActual: string | null;
  linea?: string;
  servicio?: string;
  horaInicio?: string;
  atrasoMinutos?: number;
  historial?: Array<{ choferId: string; cocheId: string; at: string }>;
  lat?: number;
  lng?: number;
  updatedAt?: string;
}

function mapDoc(id: string, data: Record<string, unknown>): ServicioEstadoRecord {
  return {
    servicioId: (data.servicioId as string) ?? id,
    date: data.date as string,
    status: (data.status as ServicioEstadoStatus) ?? 'pendiente',
    cocheActual: (data.cocheActual as string) ?? null,
    choferActual: (data.choferActual as string) ?? null,
    linea: data.linea as string | undefined,
    servicio: data.servicio as string | undefined,
    horaInicio: data.horaInicio as string | undefined,
    atrasoMinutos: data.atrasoMinutos != null ? Number(data.atrasoMinutos) : undefined,
    historial: (data.historial as ServicioEstadoRecord['historial']) ?? [],
    updatedAt: data.updatedAt as string | undefined,
    ...data,
  } as ServicioEstadoRecord;
}

export const ServicioEstadoService = {
  docId(servicioId: string, date: string): string {
    return `${servicioId}_${date}`.replace(/\s+/g, '_').slice(0, 80);
  },

  async getByDate(date: string): Promise<ServicioEstadoRecord[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { where: `date:${date}`, limit: 5000 },
    });
    const list = Array.isArray(res.data)
      ? res.data.map((d) => mapDoc((d.id as string) ?? '', { ...d, servicioId: d.servicioId ?? d.id }))
      : [];
    list.sort((a, b) => (a.servicioId || '').localeCompare(b.servicioId || ''));
    return list;
  },

  async getByServicioId(servicioId: string, date: string): Promise<ServicioEstadoRecord | null> {
    const id = ServicioEstadoService.docId(servicioId, date);
    try {
      const res = await apiClient.get<Record<string, unknown>>(`/api/db/${COL}/${encodeURIComponent(id)}`);
      return res.data
        ? mapDoc(id, { ...res.data, servicioId: res.data?.servicioId ?? servicioId })
        : null;
    } catch { return null; }
  },

  // FASE 5.35 (2026-05-22): bus socket en lugar de polling 10s.
  subscribeByDate(date: string, callback: (records: ServicioEstadoRecord[]) => void): () => void {
    return subscribeViaBus<ServicioEstadoRecord[]>(COL, () => this.getByDate(date), callback);
  },

  async setState(
    servicioId: string,
    date: string,
    patch: Partial<
      Pick<
        ServicioEstadoRecord,
        | 'status'
        | 'cocheActual'
        | 'choferActual'
        | 'linea'
        | 'servicio'
        | 'horaInicio'
        | 'atrasoMinutos'
      >
    >,
  ): Promise<ServicioEstadoRecord> {
    const id = ServicioEstadoService.docId(servicioId, date);
    const existing = await this.getByServicioId(servicioId, date);
    const historial: ServicioEstadoRecord['historial'] = existing?.historial ?? [];
    if (patch.choferActual && patch.cocheActual) {
      historial.push({
        choferId: patch.choferActual,
        cocheId: patch.cocheActual,
        at: new Date().toISOString(),
      });
    }
    const payload: Record<string, unknown> = {
      servicioId,
      date,
      status: patch.status ?? existing?.status ?? 'pendiente',
      cocheActual: patch.cocheActual ?? existing?.cocheActual ?? null,
      choferActual: patch.choferActual ?? existing?.choferActual ?? null,
      linea: patch.linea ?? existing?.linea,
      servicio: patch.servicio ?? existing?.servicio,
      horaInicio: patch.horaInicio ?? existing?.horaInicio,
      atrasoMinutos:
        patch.atrasoMinutos !== undefined
          ? patch.atrasoMinutos
          : existing?.atrasoMinutos,
      historial: historial.slice(-50),
      updatedAt: new Date().toISOString(),
    };
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(id)}`, payload);
    return payload as unknown as ServicioEstadoRecord;
  },

  /** Asigna conductor/coche a un servicio sin borrar historial (Vínculo de Oro). */
  async assignDriverToService(
    servicioId: string,
    date: string,
    choferId: string,
    cocheId: string,
    meta?: { linea?: string; servicio?: string; horaInicio?: string },
  ): Promise<void> {
    await ServicioEstadoService.setState(servicioId, date, {
      choferActual: choferId,
      cocheActual: cocheId,
      status: 'activo',
      ...meta,
    });
  },
};
