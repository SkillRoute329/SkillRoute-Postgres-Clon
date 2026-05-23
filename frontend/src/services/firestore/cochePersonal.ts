/**
 * CochePersonalService — Gestión del vínculo Coche ↔ Personal asignado.
 *
 * Colección: coche_personal
 */
import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';

export type RegimenRotacionCoche = 'semana_semana' | '15_15' | 'fijo_t1' | 'fijo_t2';

/** Patrón de descanso semanal del conductor */
export type PatronDescanso = 'sabados' | 'domingos' | 'entre_semana' | 'rotativo_mensual';

export interface PersonalAsignado {
  userId: string;
  internalNumber: string;
  fullName?: string;
  /** T1 = turno mañana, T2 = turno tarde */
  turnoBase: 1 | 2;
  /** Fijo en su turno (no rota) */
  esFijo: boolean;

  // ── Modelo de descansos (6 días / 7) ─────────────────────────────
  grupoDescanso?: string;
  patronDescanso?: PatronDescanso;
  mesLibraSabado?: boolean;
  diasLibresSemana?: number[];
}

export interface BloqueSemanalCartones {
  semana: number; // 1-based dentro del mes
  servicios: string[]; // ej. ['1072','1073','1074','1075','1076']
  linea: string;
  temporada: 'invierno' | 'verano';
}

export interface CochePersonal {
  id?: string;
  cocheInternalNumber: string;
  vehicleId?: string;
  personal: PersonalAsignado[];
  regimen: RegimenRotacionCoche;
  turnoT1Actual?: string;
  turnoT2Actual?: string;
  inicioCiclo?: string;
  bloquesSemana: BloqueSemanalCartones[];
  semanaActualCartones?: number;
  activo?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Determina si un conductor descansa en una fecha dada, según su patrón.
 */
export function conductorLibraEnFecha(p: PersonalAsignado, isoDate: string): boolean {
  const date = new Date(isoDate + 'T12:00:00');
  const dayOfWeek = date.getDay(); // 0=Dom, 1=Lun, ..., 6=Sáb

  switch (p.patronDescanso) {
    case 'sabados':
      return dayOfWeek === 6;

    case 'domingos':
      return dayOfWeek === 0;

    case 'rotativo_mensual':
      if (p.mesLibraSabado === true) return dayOfWeek === 6;
      if (p.mesLibraSabado === false) return dayOfWeek === 0;
      return false;

    case 'entre_semana':
      if (!p.diasLibresSemana || p.diasLibresSemana.length === 0) return false;
      return p.diasLibresSemana.includes(dayOfWeek);

    default:
      return false;
  }
}

/**
 * Avanza el ciclo mensual de descanso de los conductores con patrón rotativo_mensual.
 */
export function invertirMesLibra(p: PersonalAsignado): PersonalAsignado {
  if (p.patronDescanso !== 'rotativo_mensual') return p;
  return { ...p, mesLibraSabado: !p.mesLibraSabado };
}

const COL = 'coche_personal';

function mapCochePersonal(id: string, data: Record<string, unknown>): CochePersonal {
  return {
    id,
    cocheInternalNumber: (data.cocheInternalNumber as string) ?? '',
    vehicleId: data.vehicleId as string | undefined,
    personal: (data.personal as PersonalAsignado[]) ?? [],
    regimen: (data.regimen as RegimenRotacionCoche) ?? 'semana_semana',
    turnoT1Actual: data.turnoT1Actual as string | undefined,
    turnoT2Actual: data.turnoT2Actual as string | undefined,
    inicioCiclo: data.inicioCiclo as string | undefined,
    bloquesSemana: (data.bloquesSemana as BloqueSemanalCartones[]) ?? [],
    semanaActualCartones: data.semanaActualCartones as number | undefined,
    activo: data.activo !== false,
    createdAt: data.createdAt as string | undefined,
    updatedAt: data.updatedAt as string | undefined,
  };
}

export const CochePersonalService = {
  async getAll(): Promise<CochePersonal[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { orderBy: 'coche_internal_number:asc', limit: 5000 },
    });
    return Array.isArray(res.data)
      ? res.data.map((d) => mapCochePersonal((d.id as string) ?? '', d))
      : [];
  },

  // FASE 5.35 (2026-05-22): bus socket en lugar de polling 10s.
  subscribe(callback: (items: CochePersonal[]) => void): () => void {
    return subscribeViaBus<CochePersonal[]>(COL, () => this.getAll(), callback);
  },

  async getByCoche(cocheInternalNumber: string): Promise<CochePersonal | null> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { where: `cocheInternalNumber:${cocheInternalNumber}`, limit: 1 },
    });
    const docs = Array.isArray(res.data) ? res.data : [];
    if (!docs.length) return null;
    const d = docs[0];
    return mapCochePersonal((d.id as string) ?? '', d);
  },

  async getById(id: string): Promise<CochePersonal | null> {
    try {
      const res = await apiClient.get<Record<string, unknown>>(`/api/db/${COL}/${encodeURIComponent(id)}`);
      return res.data ? mapCochePersonal(id, res.data) : null;
    } catch { return null; }
  },

  async create(data: Omit<CochePersonal, 'id'>): Promise<CochePersonal> {
    const payload = { ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const res = await apiClient.post<{ id: string }>(`/api/db/${COL}`, payload);
    return { ...data, id: res.data?.id ?? String(Date.now()) };
  },

  async update(id: string, data: Partial<CochePersonal>): Promise<void> {
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(id)}`, { ...data, updatedAt: new Date().toISOString() });
  },

  /**
   * Avanza la rotación semanal: intercambia T1 y T2 si el régimen es semana_semana o 15_15.
   */
  async avanzarRotacion(id: string, coche: CochePersonal): Promise<void> {
    if (coche.regimen === 'fijo_t1' || coche.regimen === 'fijo_t2') return;
    const nofijo = coche.personal.filter((p) => !p.esFijo);
    if (nofijo.length < 2) return;
    const nuevoT1 = coche.turnoT2Actual ?? nofijo[1]?.userId;
    const nuevoT2 = coche.turnoT1Actual ?? nofijo[0]?.userId;
    await this.update(id, {
      turnoT1Actual: nuevoT1,
      turnoT2Actual: nuevoT2,
      inicioCiclo: new Date().toISOString().split('T')[0],
    });
  },

  /**
   * Marca el personal de este coche como "de lista" (día libre / mantenimiento).
   */
  async marcarEnLista(id: string, userIds: string[]): Promise<void> {
    const coche = await this.getById(id);
    if (!coche) return;
    const updated = coche.personal.map((p) => ({
      ...p,
      enLista: userIds.includes(p.userId),
    }));
    await this.update(id, { personal: updated as PersonalAsignado[] });
  },
};
