/**
 * feriados.ts — Colección `feriados`
 * Gestión de feriados nacionales, departamentales y especiales UCOT.
 */
import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';

const COL = 'feriados';

export type TipoFeriado =
  | 'nacional'
  | 'departamental'
  | 'ucot_especial'
  | 'sabado_especial'
  | 'domingo_especial';

export interface Feriado {
  id: string;         // YYYY-MM-DD
  fecha: string;      // YYYY-MM-DD
  nombre: string;
  tipo: TipoFeriado;
  grilla?: 'habil' | 'sabado' | 'domingo' | 'sin_servicio';
  notas?: string;
}

// Feriados fijos Uruguay 2026 pre-cargados
export const FERIADOS_URUGUAY_2026: Omit<Feriado, 'id'>[] = [
  { fecha: '2026-01-01', nombre: 'Año Nuevo',            tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-01-06', nombre: 'Reyes',                tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-02-16', nombre: 'Carnaval',             tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-02-17', nombre: 'Carnaval',             tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-03-23', nombre: 'Semana de Turismo',    tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-03-24', nombre: 'Semana de Turismo',    tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-03-25', nombre: 'Semana de Turismo',    tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-03-26', nombre: 'Semana de Turismo',    tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-04-19', nombre: 'Desembarco de los 33', tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-05-01', nombre: 'Día del Trabajo',      tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-05-18', nombre: 'Batalla de Las Piedras', tipo: 'nacional',   grilla: 'domingo' },
  { fecha: '2026-06-19', nombre: 'Artigas',              tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-07-18', nombre: 'Jura de la Constitución', tipo: 'nacional',  grilla: 'domingo' },
  { fecha: '2026-08-25', nombre: 'Independencia',        tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-10-12', nombre: 'Día de la Raza',       tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-11-02', nombre: 'Difuntos',             tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-12-25', nombre: 'Navidad',              tipo: 'nacional',     grilla: 'domingo' },
];

export const FeriadosService = {
  /** Carga feriados pre-definidos de Uruguay 2026 si no existen */
  async seedFeriados(): Promise<void> {
    for (const f of FERIADOS_URUGUAY_2026) {
      await apiClient.put(`/api/db/${COL}/${encodeURIComponent(f.fecha)}`, { ...f, id: f.fecha });
    }
  },

  /** Obtiene todos los feriados del año */
  async getAll(): Promise<Feriado[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { orderBy: 'fecha:asc', limit: 5000 },
    });
    return Array.isArray(res.data) ? (res.data as unknown as Feriado[]) : [];
  },

  /** Obtiene feriados en un rango de fechas */
  async getByRango(desde: string, hasta: string): Promise<Feriado[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: {
        where: `fecha>=${desde},fecha<=${hasta}`,
        orderBy: 'fecha:asc',
        limit: 5000,
      },
    });
    return Array.isArray(res.data) ? (res.data as unknown as Feriado[]) : [];
  },

  // FASE 5.35 (2026-05-22): bus socket en lugar de polling 15s.
  subscribe(onChange: (feriados: Feriado[]) => void): () => void {
    return subscribeViaBus<Feriado[]>(COL, () => this.getAll(), onChange);
  },

  async save(feriado: Omit<Feriado, 'id'>): Promise<void> {
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(feriado.fecha)}`, { ...feriado, id: feriado.fecha });
  },

  async delete(fecha: string): Promise<void> {
    await apiClient.delete(`/api/db/${COL}/${encodeURIComponent(fecha)}`);
  },

  /** Determina el tipo de día para una fecha dada */
  async calcularTipoDia(fecha: string): Promise<'habil' | 'sabado' | 'domingo' | 'festivo' | 'sin_servicio'> {
    const d = new Date(fecha + 'T12:00:00');
    const dow = d.getDay(); // 0=dom, 6=sab

    // Consultar feriado
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { where: `fecha:${fecha}`, limit: 1 },
    });
    const docs = Array.isArray(res.data) ? res.data : [];
    if (docs.length > 0) {
      const f = docs[0] as unknown as Feriado;
      return f.grilla ?? 'festivo';
    }

    if (dow === 0) return 'domingo';
    if (dow === 6) return 'sabado';
    return 'habil';
  },
};
