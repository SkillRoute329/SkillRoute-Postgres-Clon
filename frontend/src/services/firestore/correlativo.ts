/**
 * CorrelativoService — Gestión de solicitudes de correlativo entre conductores.
 *
 * Colección: correlativos
 */
import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';

export type CorrelativoEstado = 'pendiente' | 'aprobado' | 'rechazado' | 'completado';

export interface TurnoCorrelativo {
  servicioId?: string;
  cocheInternalNumber?: string;
  linea?: string;
  horaInicio?: string;
  horaFin?: string;
}

export interface CorrelativoRequest {
  id?: string;
  fecha: string;
  solicitanteUserId: string;
  solicitanteInternalNumber: string;
  solicitanteNombre?: string;
  cubiertaUserId: string;
  cubiertaInternalNumber: string;
  cubiertaNombre?: string;
  turno1: TurnoCorrelativo;
  turno2: TurnoCorrelativo;
  mismoCoche: boolean;
  gapMinutos?: number;
  factible: boolean;
  recomendacion?: string;
  estado: CorrelativoEstado;
  aprobadoPor?: string;
  notas?: string;
  createdAt?: string;
  updatedAt?: string;
}

const COL = 'correlativos';

const MIN_GAP_DISTINTO_COCHE = 45; // minutos

/** Parsea "HH:MM" → minutos desde medianoche */
function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Calcula si un correlativo es factible según las reglas operativas UCOT.
 */
export function calcularFactibilidadCorrelativo(
  turno1: TurnoCorrelativo,
  turno2: TurnoCorrelativo,
): { factible: boolean; gapMinutos?: number; mismoCoche: boolean; recomendacion: string } {
  const mismoCoche =
    !!turno1.cocheInternalNumber &&
    turno1.cocheInternalNumber === turno2.cocheInternalNumber;

  if (mismoCoche) {
    return {
      factible: true,
      mismoCoche: true,
      recomendacion: `Mismo coche (${turno1.cocheInternalNumber}). Correlativo directo sin movimiento.`,
    };
  }

  if (!turno1.horaFin || !turno2.horaInicio) {
    return {
      factible: false,
      mismoCoche: false,
      recomendacion: 'Faltan horarios para verificar gap entre turnos.',
    };
  }

  const finT1 = timeToMinutes(turno1.horaFin);
  const inicioT2 = timeToMinutes(turno2.horaInicio);
  const gap = inicioT2 - finT1;

  const factible = gap >= MIN_GAP_DISTINTO_COCHE;
  const cocheT2 = turno2.cocheInternalNumber ? `coche ${turno2.cocheInternalNumber}` : 'otro coche';
  const recomendacion = factible
    ? `Cambio de coche: ${gap} min de gap disponibles (mín. 45 min). Pasar a ${cocheT2} línea ${turno2.linea || '–'}.`
    : `Gap insuficiente: solo ${gap} min entre ${turno1.horaFin} y ${turno2.horaInicio}. Se necesitan 45 min mínimo.`;

  return { factible, gapMinutos: gap, mismoCoche: false, recomendacion };
}

function mapCorrelativo(id: string, data: Record<string, unknown>): CorrelativoRequest {
  return {
    id,
    fecha: (data.fecha as string) ?? '',
    solicitanteUserId: (data.solicitanteUserId as string) ?? '',
    solicitanteInternalNumber: (data.solicitanteInternalNumber as string) ?? '',
    solicitanteNombre: data.solicitanteNombre as string | undefined,
    cubiertaUserId: (data.cubiertaUserId as string) ?? '',
    cubiertaInternalNumber: (data.cubiertaInternalNumber as string) ?? '',
    cubiertaNombre: data.cubiertaNombre as string | undefined,
    turno1: (data.turno1 as TurnoCorrelativo) ?? {},
    turno2: (data.turno2 as TurnoCorrelativo) ?? {},
    mismoCoche: (data.mismoCoche as boolean) ?? false,
    gapMinutos: data.gapMinutos as number | undefined,
    factible: (data.factible as boolean) ?? false,
    recomendacion: data.recomendacion as string | undefined,
    estado: (data.estado as CorrelativoEstado) ?? 'pendiente',
    aprobadoPor: data.aprobadoPor as string | undefined,
    notas: data.notas as string | undefined,
    createdAt: data.createdAt as string | undefined,
    updatedAt: data.updatedAt as string | undefined,
  };
}

export const CorrelativoService = {
  async getAll(): Promise<CorrelativoRequest[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { orderBy: 'fecha:desc', limit: 5000 },
    });
    return Array.isArray(res.data)
      ? res.data.map((d) => mapCorrelativo((d.id as string) ?? '', d))
      : [];
  },

  async getByFecha(fecha: string): Promise<CorrelativoRequest[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { where: `fecha:${fecha}`, limit: 5000 },
    });
    return Array.isArray(res.data)
      ? res.data.map((d) => mapCorrelativo((d.id as string) ?? '', d))
      : [];
  },

  async getPendientes(): Promise<CorrelativoRequest[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { where: 'estado:pendiente', orderBy: 'fecha:asc', limit: 5000 },
    });
    return Array.isArray(res.data)
      ? res.data.map((d) => mapCorrelativo((d.id as string) ?? '', d))
      : [];
  },

  // FASE 5.35 (2026-05-22): bus socket en lugar de polling 10s.
  subscribe(callback: (items: CorrelativoRequest[]) => void): () => void {
    return subscribeViaBus<CorrelativoRequest[]>(COL, () => this.getAll(), callback);
  },

  // FASE 5.35 (2026-05-22): bus socket en lugar de polling 10s.
  subscribeByFecha(fecha: string, callback: (items: CorrelativoRequest[]) => void): () => void {
    return subscribeViaBus<CorrelativoRequest[]>(COL, () => this.getByFecha(fecha), callback);
  },

  async getById(id: string): Promise<CorrelativoRequest | null> {
    try {
      const res = await apiClient.get<Record<string, unknown>>(`/api/db/${COL}/${encodeURIComponent(id)}`);
      return res.data ? mapCorrelativo(id, res.data) : null;
    } catch { return null; }
  },

  /**
   * Crea una solicitud de correlativo y calcula automáticamente la factibilidad.
   */
  async create(
    data: Omit<CorrelativoRequest, 'id' | 'mismoCoche' | 'gapMinutos' | 'factible' | 'recomendacion' | 'createdAt' | 'updatedAt'>,
  ): Promise<CorrelativoRequest> {
    const { factible, gapMinutos, mismoCoche, recomendacion } = calcularFactibilidadCorrelativo(
      data.turno1,
      data.turno2,
    );
    const payload: Omit<CorrelativoRequest, 'id'> = {
      ...data,
      mismoCoche,
      gapMinutos,
      factible,
      recomendacion,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const res = await apiClient.post<{ id: string }>(`/api/db/${COL}`, payload);
    return { ...payload, id: res.data?.id ?? String(Date.now()) };
  },

  async update(id: string, data: Partial<CorrelativoRequest>): Promise<void> {
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(id)}`, { ...data, updatedAt: new Date().toISOString() });
  },

  async aprobar(id: string, aprobadoPor: string, notas?: string): Promise<void> {
    await this.update(id, { estado: 'aprobado', aprobadoPor, notas });
  },

  async rechazar(id: string, aprobadoPor: string, notas?: string): Promise<void> {
    await this.update(id, { estado: 'rechazado', aprobadoPor, notas });
  },

  async completar(id: string): Promise<void> {
    await this.update(id, { estado: 'completado' });
  },
};
