/**
 * licencias.ts — Colección `licencias_personal`
 * Gestión completa de ausencias, licencias y días compensatorios del personal.
 */
import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';

const COL = 'licencias_personal';
const COL_COMP = 'compensatorios_personal';

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export type TipoLicencia =
  | 'medica'
  | 'administrativa'
  | 'sindical'
  | 'estudio'
  | 'maternidad'
  | 'falta_injustificada'
  | 'compensatorio'
  | 'cambio_libre'
  | 'franco_adicional'
  | 'otro';

export type EstadoLicencia = 'pendiente' | 'aprobada' | 'rechazada' | 'completada';

export interface LicenciaPersonal {
  id: string;
  driverId: string;
  internalNumber: string;
  tipo: TipoLicencia;
  estado: EstadoLicencia;
  fechaDesde: string;
  fechaHasta: string;
  diasHabiles: number;
  motivo?: string;
  documentoUrl?: string;
  aprobadoPor?: string;
  rechazadoPor?: string;
  motivoRechazo?: string;
  creadoEn: string;
  actualizadoEn: string;
  diaLibreOriginal?: string;
  diaLibreNuevo?: string;
}

export interface CompensatorioPersonal {
  id: string;
  driverId: string;
  internalNumber: string;
  concepto: string;
  fecha: string;
  diasDisponibles: number;
  diasUsados: number;
  vencimiento: string;
  creadoEn: string;
}

// ─── SERVICIO ─────────────────────────────────────────────────────────────────

export const LicenciasService = {
  async crear(data: Omit<LicenciaPersonal, 'id' | 'creadoEn' | 'actualizadoEn'>): Promise<string> {
    const id = `lic_${data.driverId}_${data.fechaDesde}_${Date.now()}`;
    const now = new Date().toISOString();
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(id)}`, { ...data, id, creadoEn: now, actualizadoEn: now });
    return id;
  },

  async aprobar(id: string, aprobadoPor: string): Promise<void> {
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(id)}`, {
      estado: 'aprobada',
      aprobadoPor,
      actualizadoEn: new Date().toISOString(),
    });
  },

  async rechazar(id: string, rechazadoPor: string, motivo: string): Promise<void> {
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(id)}`, {
      estado: 'rechazada',
      rechazadoPor,
      motivoRechazo: motivo,
      actualizadoEn: new Date().toISOString(),
    });
  },

  async getByDriver(driverId: string): Promise<LicenciaPersonal[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: {
        where: `driverId:${driverId}`,
        orderBy: 'fecha_desde:desc',
        limit: 5000,
      },
    });
    return Array.isArray(res.data) ? (res.data as unknown as LicenciaPersonal[]) : [];
  },

  async getPendientes(): Promise<LicenciaPersonal[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: {
        where: 'estado:pendiente',
        orderBy: 'creado_en:asc',
        limit: 5000,
      },
    });
    return Array.isArray(res.data) ? (res.data as unknown as LicenciaPersonal[]) : [];
  },

  /** Ausencias de un conductor en un rango de fechas */
  async getAusenciasByRango(driverId: string, desde: string, hasta: string): Promise<LicenciaPersonal[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: {
        where: `driverId:${driverId},fechaDesde>=${desde},fechaHasta<=${hasta}`,
        limit: 5000,
      },
    });
    return Array.isArray(res.data) ? (res.data as unknown as LicenciaPersonal[]) : [];
  },

  /** Todos los conductores ausentes en una fecha específica */
  async getAusentesPorFecha(fecha: string): Promise<LicenciaPersonal[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: {
        where: `fechaDesde<=${fecha},fechaHasta>=${fecha}`,
        limit: 5000,
      },
    });
    // Filter by estado in memory since backend may not support 'in' operator
    const all = Array.isArray(res.data) ? (res.data as unknown as LicenciaPersonal[]) : [];
    return all.filter((l) => l.estado === 'aprobada' || l.estado === 'pendiente');
  },

  // FASE 5.34 (2026-05-22): bus socket en lugar de polling 10s.
  subscribe(onChange: (items: LicenciaPersonal[]) => void): () => void {
    return subscribeViaBus<LicenciaPersonal[]>(
      COL,
      async () => {
        const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
          query: { orderBy: 'creado_en:desc', limit: 5000 },
        });
        return Array.isArray(res.data) ? (res.data as unknown as LicenciaPersonal[]) : [];
      },
      onChange,
      { alsoListen: ['bus:db:licencias:any'] },
    );
  },
};

// ─── COMPENSATORIOS ───────────────────────────────────────────────────────────

export const CompensatoriosService = {
  async acreditar(data: Omit<CompensatorioPersonal, 'id' | 'creadoEn' | 'diasUsados'>): Promise<string> {
    const id = `comp_${data.driverId}_${data.fecha}_${Date.now()}`;
    await apiClient.put(`/api/db/${COL_COMP}/${encodeURIComponent(id)}`, {
      ...data, id, diasUsados: 0, creadoEn: new Date().toISOString(),
    });
    return id;
  },

  async usar(id: string, dias: number): Promise<void> {
    const res = await apiClient.get<CompensatorioPersonal>(`/api/db/${COL_COMP}/${encodeURIComponent(id)}`);
    if (!res.data) return;
    const data = res.data;
    await apiClient.put(`/api/db/${COL_COMP}/${encodeURIComponent(id)}`, {
      diasUsados: Math.min(data.diasUsados + dias, data.diasDisponibles),
    });
  },

  async getSaldo(driverId: string): Promise<{ disponibles: number; registros: CompensatorioPersonal[] }> {
    const hoy = new Date().toISOString().split('T')[0];
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL_COMP}`, {
      query: {
        where: `driverId:${driverId},vencimiento>=${hoy}`,
        limit: 5000,
      },
    });
    const registros = Array.isArray(res.data) ? (res.data as unknown as CompensatorioPersonal[]) : [];
    const disponibles = registros.reduce((s, r) => s + r.diasDisponibles - r.diasUsados, 0);
    return { disponibles, registros };
  },
};

// ─── ETIQUETAS UI ─────────────────────────────────────────────────────────────

export const TIPO_LICENCIA_LABEL: Record<TipoLicencia, string> = {
  medica:              'Licencia Médica',
  administrativa:      'Licencia Administrativa',
  sindical:            'Licencia Sindical',
  estudio:             'Licencia por Estudio',
  maternidad:          'Maternidad / Paternidad',
  falta_injustificada: 'Falta Injustificada',
  compensatorio:       'Compensatorio',
  cambio_libre:        'Cambio de Día Libre',
  franco_adicional:    'Franco Adicional',
  otro:                'Otro',
};

export const TIPO_LICENCIA_COLOR: Record<TipoLicencia, string> = {
  medica:              'text-blue-400 bg-blue-900/30 border-blue-800',
  administrativa:      'text-cyan-400 bg-cyan-900/30 border-cyan-800',
  sindical:            'text-purple-400 bg-purple-900/30 border-purple-800',
  estudio:             'text-indigo-400 bg-indigo-900/30 border-indigo-800',
  maternidad:          'text-pink-400 bg-pink-900/30 border-pink-800',
  falta_injustificada: 'text-red-400 bg-red-900/30 border-red-800',
  compensatorio:       'text-emerald-400 bg-emerald-900/30 border-emerald-800',
  cambio_libre:        'text-amber-400 bg-amber-900/30 border-amber-800',
  franco_adicional:    'text-teal-400 bg-teal-900/30 border-teal-800',
  otro:                'text-slate-400 bg-slate-800 border-slate-700',
};
