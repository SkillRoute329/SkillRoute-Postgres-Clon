/**
 * Colección central active_assignments: vínculo dinámico Coche ↔ Servicio ↔ Conductor.
 * Reasignar no borra el registro previo; se mantiene historial.
 */
import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';

const COL = 'active_assignments';

export interface ActiveAssignmentRecord {
  servicioId: string;
  date: string;
  cocheId: string | null;
  choferId: string | null;
  linea?: string;
  horaInicio?: string;
  historial: Array<{ cocheId: string; choferId: string; at: string }>;
  updatedAt: string;
}

function docId(servicioId: string, date: string): string {
  return `${String(servicioId).replace(/\s+/g, '_')}_${date}`.slice(0, 80);
}

function mapRecord(x: Record<string, unknown>, fallbackId?: string): ActiveAssignmentRecord {
  return {
    servicioId: (x?.servicioId as string) ?? fallbackId ?? '',
    date: (x?.date as string) ?? '',
    cocheId: (x?.cocheId as string) ?? null,
    choferId: (x?.choferId as string) ?? null,
    linea: x?.linea as string | undefined,
    horaInicio: x?.horaInicio as string | undefined,
    historial: ((x?.historial ?? []) as ActiveAssignmentRecord['historial']).slice(-50),
    updatedAt: (x?.updatedAt as string) ?? '',
  };
}

export const ActiveAssignmentsService = {
  docId,

  async get(servicioId: string, date: string): Promise<ActiveAssignmentRecord | null> {
    const id = docId(servicioId, date);
    try {
      const res = await apiClient.get<Record<string, unknown>>(`/api/db/${COL}/${encodeURIComponent(id)}`);
      return res.data ? mapRecord(res.data, servicioId) : null;
    } catch { return null; }
  },

  async getByDate(date: string): Promise<ActiveAssignmentRecord[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { where: `date:${date}`, limit: 5000 },
    });
    return Array.isArray(res.data) ? res.data.map((x) => mapRecord(x)) : [];
  },

  /**
   * Historial de rotación: cuántas veces cambió de manos un coche en el mes (para CEO).
   */
  async getRotacionByCocheMonth(
    cocheId: string,
    yearMonth: string,
  ): Promise<{
    cambios: number;
    detalle: Array<{ date: string; servicioId: string; cambios: number }>;
  }> {
    const [y, m] = yearMonth.split('-').map(Number);
    const start = `${yearMonth}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const end = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { where: `date>=${start},date<=${end}`, limit: 5000 },
    });
    const docs = Array.isArray(res.data) ? res.data : [];
    const detalle: Array<{ date: string; servicioId: string; cambios: number }> = [];
    let total = 0;
    const cid = String(cocheId);
    docs.forEach((x) => {
      const coche = x?.cocheId ?? null;
      const hist = (x?.historial ?? []) as ActiveAssignmentRecord['historial'];
      const cambiosCoche =
        coche === cid ? hist.length : hist.filter((h) => h.cocheId === cid).length;
      if (cambiosCoche > 0) {
        detalle.push({
          date: (x?.date as string) ?? '',
          servicioId: (x?.servicioId as string) ?? '',
          cambios: cambiosCoche,
        });
        total += cambiosCoche;
      }
    });
    return { cambios: total, detalle };
  },

  // FASE 5.35 (2026-05-22): bus socket en lugar de polling 10s.
  subscribeByDate(date: string, callback: (records: ActiveAssignmentRecord[]) => void): () => void {
    return subscribeViaBus<ActiveAssignmentRecord[]>(COL, () => this.getByDate(date), callback);
  },

  /**
   * Historial por conductor: todos los servicios que corrió en un rango de fechas.
   */
  async getByChofer(
    choferId: string,
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<ActiveAssignmentRecord[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: {
        where: `choferId:${choferId},date>=${fechaDesde},date<=${fechaHasta}`,
        orderBy: 'date:desc',
        limit: 200,
      },
    });
    return Array.isArray(res.data) ? res.data.map((x) => mapRecord(x)) : [];
  },

  /**
   * Historial por coche: todos los servicios que corrió ese coche en un rango de fechas.
   */
  async getByCoche(
    cocheId: string,
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<ActiveAssignmentRecord[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: {
        where: `cocheId:${cocheId},date>=${fechaDesde},date<=${fechaHasta}`,
        orderBy: 'date:desc',
        limit: 200,
      },
    });
    return Array.isArray(res.data) ? res.data.map((x) => mapRecord(x)) : [];
  },

  /**
   * Registra o actualiza la asignación activa sin borrar el registro previo (añade a historial).
   */
  async recordAssignment(
    servicioId: string,
    date: string,
    cocheId: string,
    choferId: string,
    meta?: { linea?: string; horaInicio?: string },
  ): Promise<void> {
    const id = docId(servicioId, date);
    const existing = await this.get(servicioId, date);
    const historial: ActiveAssignmentRecord['historial'] = existing?.historial ?? [];
    const prevCoche = existing?.cocheId;
    const prevChofer = existing?.choferId;
    if (prevCoche && prevChofer && (prevCoche !== cocheId || prevChofer !== choferId)) {
      historial.push({
        cocheId: prevCoche,
        choferId: prevChofer,
        at: new Date().toISOString(),
      });
    }
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(id)}`, {
      servicioId,
      date,
      cocheId,
      choferId,
      linea: meta?.linea ?? existing?.linea,
      horaInicio: meta?.horaInicio ?? existing?.horaInicio,
      historial: historial.slice(-50),
      updatedAt: new Date().toISOString(),
    });
  },
};
