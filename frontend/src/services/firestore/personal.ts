/**
 * personal.ts — Servicio de personal/conductores (FASE 4.4 LOTE 1)
 *
 * REGLA -6: opera EXCLUSIVAMENTE contra el backend del clon (Postgres),
 * no contra Firebase del original.
 *
 * Migración FASE 4.4: este archivo ya NO importa firebase/*. Usa apiClient
 * que pega a /api/db/personal y /api/db/personal_exceptions del clon.
 *
 * REGLA -1 NO REGRESIÓN: la API pública (`PersonalService.getAll`,
 * `getById`, `getExceptionsForDriver`, `setException`, `getExceptionsForDate`)
 * se mantiene idéntica para que los componentes que la consumen sigan
 * funcionando sin cambios.
 */

import { apiClient } from '../../clients/apiClient';

const COL = 'personal';
const EXCEPTIONS_COL = 'personal_exceptions';

export interface PersonalRecord {
  id: string;
  fullName?: string;
  /** Número interno del empleado (legajo). */
  internalNumber?: string;
  /** Alias para legajo: número interno. */
  legajo?: string;
  /** ID del coche asignado si es propietario/fijo (maestro UCOT 2026). */
  coche_fijo?: string;
  /** Apodo o apellido para visualización rápida en el Dashboard. */
  apodo?: string;
  ci?: string;
  vencimiento_carne_salud?: string;
  vencimiento_libreta?: string;
  estado?: string;
  tipo?: string;
  [key: string]: unknown;
}

export interface DayException {
  driverId: string;
  date: string;
  type: 'falta_medica' | 'franco' | 'licencia' | 'otro';
  note?: string;
}

interface PersonalRowFromBackend {
  id: string;
  full_name?: string | null;
  internal_number?: string | null;
  data_jsonb?: Record<string, unknown> | null;
  [key: string]: unknown;
}

/** Normaliza la respuesta del backend a la shape histórica de PersonalRecord. */
function rowToPersonal(row: PersonalRowFromBackend): PersonalRecord {
  const data = (row.data_jsonb ?? {}) as Record<string, unknown>;
  return {
    id: String(row.id),
    fullName: (row.full_name as string) ?? (data.fullName as string) ?? undefined,
    internalNumber: (row.internal_number as string) ?? (data.internalNumber as string) ?? undefined,
    legajo: (data.legajo as string) ?? (row.internal_number as string) ?? undefined,
    ...data,
  } as PersonalRecord;
}

export const PersonalService = {
  async getAll(): Promise<PersonalRecord[]> {
    const res = await apiClient.get<PersonalRowFromBackend[]>(`/api/db/${COL}`, {
      query: { orderBy: 'internal_number:asc', limit: 5000 },
    });
    const rows = Array.isArray(res.data) ? res.data : [];
    return rows.map(rowToPersonal);
  },

  async getById(id: string): Promise<PersonalRecord | null> {
    try {
      const res = await apiClient.get<PersonalRowFromBackend>(`/api/db/${COL}/${encodeURIComponent(id)}`);
      return res.data ? rowToPersonal(res.data) : null;
    } catch {
      return null;
    }
  },

  async getExceptionsForDriver(
    driverId: string,
    monthStart: string,
    monthEnd: string,
  ): Promise<DayException[]> {
    // Backend soporta operadores range (>= <=) en /api/db.
    const where = `driverId:${driverId},date>=${monthStart},date<=${monthEnd}`;
    const res = await apiClient.get<Array<Record<string, unknown>>>(`/api/db/${EXCEPTIONS_COL}`, {
      query: { where, limit: 200 },
    });
    const rows = Array.isArray(res.data) ? res.data : [];
    return rows.map((d) => ({
      driverId: String(d.driverId ?? d.driver_id ?? ''),
      date: String(d.date ?? ''),
      type: (d.type as DayException['type']) ?? 'otro',
      note: (d.note as string) ?? undefined,
    }));
  },

  async setException(data: DayException): Promise<void> {
    const id = `${data.driverId}_${data.date}`;
    await apiClient.put(`/api/db/${EXCEPTIONS_COL}/${encodeURIComponent(id)}`, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  },

  /** Excepciones de un día (para Lista Diaria). */
  async getExceptionsForDate(date: string): Promise<DayException[]> {
    const res = await apiClient.get<Array<Record<string, unknown>>>(`/api/db/${EXCEPTIONS_COL}`, {
      query: { where: `date:${date}`, limit: 500 },
    });
    const rows = Array.isArray(res.data) ? res.data : [];
    return rows.map((d) => ({
      driverId: String(d.driverId ?? d.driver_id ?? ''),
      date: String(d.date ?? ''),
      type: (d.type as DayException['type']) ?? 'otro',
      note: (d.note as string) ?? undefined,
    }));
  },
};
