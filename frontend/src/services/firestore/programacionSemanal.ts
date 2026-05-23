/**
 * ProgramacionSemanalService — Distribución semanal de servicios por coche.
 *
 * Colección: programacion_semanal
 */
import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';

export type TipoFlota = 'normal' | 'cableada' | 'expendedora' | 'aire_baterias' | 'yutong' | 'mantenimiento';

export interface DistribucionCoche {
  cocheInternalNumber: string;
  servicio: string;
  tipoFlota?: TipoFlota;
  orden?: number;
}

export interface ProgramacionSemanalRecord {
  id?: string;
  fecha: string;
  semanaISO?: string;
  diaNombre?: string;
  distribuciones: DistribucionCoche[];
  enMantenimiento?: string[];
  totalServicios?: number;
  totalParalizas?: number;
  createdAt?: string;
  updatedAt?: string;
}

const COL = 'programacion_semanal';

/** Normaliza un número de servicio: "paraliza" / "PARALIZA" → "Paraliza" */
export function normalizarServicio(s: string): string {
  if (!s) return '';
  const t = s.trim();
  if (t.toLowerCase() === 'paraliza') return 'Paraliza';
  const nocMatch = t.match(/^noc\s*(\d+)$/i);
  if (nocMatch) return `Noc ${nocMatch[1]}`;
  return t;
}

/** True si el servicio indica que el coche está paralizado */
export function esParaliza(servicio: string): boolean {
  return normalizarServicio(servicio) === 'Paraliza';
}

/** True si el servicio es nocturno */
export function esNocturno(servicio: string): boolean {
  return normalizarServicio(servicio).startsWith('Noc ');
}

/** Extrae el número puro del carton */
export function extraerNumeroCarton(servicio: string): string | null {
  const n = normalizarServicio(servicio);
  if (n === 'Paraliza') return null;
  if (n.startsWith('Noc ')) return n.slice(4);
  return n || null;
}

function getWeekISO(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00');
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

const DIAS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function mapRecord(id: string, data: Record<string, unknown>): ProgramacionSemanalRecord {
  return {
    id,
    fecha: (data.fecha as string) ?? '',
    semanaISO: data.semanaISO as string | undefined,
    diaNombre: data.diaNombre as string | undefined,
    distribuciones: (data.distribuciones as DistribucionCoche[]) ?? [],
    enMantenimiento: (data.enMantenimiento as string[]) ?? [],
    totalServicios: data.totalServicios as number | undefined,
    totalParalizas: data.totalParalizas as number | undefined,
    createdAt: data.createdAt as string | undefined,
    updatedAt: data.updatedAt as string | undefined,
  };
}

export const ProgramacionSemanalService = {
  docId(fecha: string): string {
    return `ps_${fecha}`;
  },

  async getByFecha(fecha: string): Promise<ProgramacionSemanalRecord | null> {
    try {
      const res = await apiClient.get<Record<string, unknown>>(`/api/db/${COL}/${encodeURIComponent(this.docId(fecha))}`);
      return res.data ? mapRecord(this.docId(fecha), res.data) : null;
    } catch { return null; }
  },

  async getBySemana(semanaISO: string): Promise<ProgramacionSemanalRecord[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { where: `semanaISO:${semanaISO}`, orderBy: 'fecha:asc', limit: 7 },
    });
    return Array.isArray(res.data)
      ? res.data.map((d) => mapRecord((d.id as string) ?? '', d))
      : [];
  },

  // FASE 5.35 (2026-05-22): bus socket en lugar de polling 10s.
  subscribe(semanaISO: string, callback: (records: ProgramacionSemanalRecord[]) => void): () => void {
    return subscribeViaBus<ProgramacionSemanalRecord[]>(
      COL,
      () => this.getBySemana(semanaISO),
      callback,
    );
  },

  // FASE 5.35 (2026-05-22): bus socket en lugar de polling 10s.
  subscribeByFecha(fecha: string, callback: (record: ProgramacionSemanalRecord | null) => void): () => void {
    return subscribeViaBus<ProgramacionSemanalRecord | null>(
      COL,
      () => this.getByFecha(fecha),
      callback,
    );
  },

  /**
   * Guarda o actualiza la programación de un día completo.
   */
  async save(fecha: string, distribuciones: DistribucionCoche[], enMantenimiento: string[] = []): Promise<ProgramacionSemanalRecord> {
    const normalizadas = distribuciones.map((d, i) => ({
      ...d,
      servicio: normalizarServicio(d.servicio),
      orden: d.orden ?? i,
    }));

    const totalParalizas = normalizadas.filter((d) => esParaliza(d.servicio)).length;
    const totalServicios = normalizadas.filter((d) => !esParaliza(d.servicio)).length;
    const semanaISO = getWeekISO(fecha);
    const diaNombre = DIAS_ES[new Date(fecha + 'T12:00:00').getDay()];

    const id = this.docId(fecha);
    const existing = await this.getByFecha(fecha);

    const payload: ProgramacionSemanalRecord = {
      fecha,
      semanaISO,
      diaNombre,
      distribuciones: normalizadas,
      enMantenimiento,
      totalServicios,
      totalParalizas,
      updatedAt: new Date().toISOString(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };

    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(id)}`, payload);
    return { ...payload, id };
  },

  /**
   * Actualiza el servicio de un solo coche en una fecha dada.
   */
  async updateCocheServicio(fecha: string, cocheInternalNumber: string, servicio: string): Promise<void> {
    const record = await this.getByFecha(fecha);
    if (!record) return;
    const dist = record.distribuciones.map((d) =>
      d.cocheInternalNumber === cocheInternalNumber
        ? { ...d, servicio: normalizarServicio(servicio) }
        : d,
    );
    await this.save(fecha, dist, record.enMantenimiento);
  },

  /**
   * Devuelve los coches que paralizan en una fecha dada.
   */
  async getCochesParaliza(fecha: string): Promise<string[]> {
    const record = await this.getByFecha(fecha);
    if (!record) return [];
    return record.distribuciones
      .filter((d) => esParaliza(d.servicio))
      .map((d) => d.cocheInternalNumber);
  },

  /**
   * Devuelve los servicios operativos de un día (excluyendo Paraliza).
   */
  getServiciosOperativos(record: ProgramacionSemanalRecord): Array<DistribucionCoche & { numeroCarton: string }> {
    return record.distribuciones
      .filter((d) => !esParaliza(d.servicio))
      .map((d) => ({
        ...d,
        numeroCarton: extraerNumeroCarton(d.servicio) || d.servicio,
      }));
  },
};
