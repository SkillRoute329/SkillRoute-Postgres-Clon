/**
 * CascadeAudit — Auditor del motor de consecuencias (FASE 5.32, 2026-05-21)
 *
 * Lista todos los eventos del motor que el sistema generó automáticamente
 * o por acción manual: tipo, fecha/hora, severidad, dominios afectados,
 * impacto monetario.
 *
 * Filtros por:
 *   - Tipo de evento (CONDUCTOR_AUSENTE, VEHICULO_FUERA_DE_SERVICIO,
 *     RETRASO_OPERATIVO, VIAJE_CANCELADO)
 *   - Severidad (info / advertencia / crítico)
 *   - Línea (texto libre)
 *   - Rango de fechas
 *   - Fuente (manual o auto-trigger)
 *
 * Export a CSV.
 *
 * Datos: `/api/cascade/feed?limit=N` (lee logs_auditoria).
 */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Network, AlertTriangle, RefreshCw, Download, Search, CheckCircle } from 'lucide-react';
import { apiClient } from '../../clients/apiClient';
import { useLiveData } from '../../context/LiveDataContext';

type Severidad = 'info' | 'advertencia' | 'critico';
type Tipo = 'CONDUCTOR_AUSENTE' | 'VEHICULO_FUERA_DE_SERVICIO' | 'RETRASO_OPERATIVO' | 'VIAJE_CANCELADO' | string;

interface FeedEvent {
  id: number;
  ts: string;
  tipo: Tipo;
  evento: Record<string, unknown>;
  totalEfectos: number;
  resumen: {
    impactoNomina?: number;
    impactoSubsidio?: number;
    deltaOTP?: number;
    viajesEnRiesgo?: number;
    severidadGlobal?: Severidad;
    requiereIntervencionInmediata?: boolean;
  };
  titulo: string;
  severidad: Severidad;
  // FASE 5.35 (2026-05-22): info de atención (si fue resuelto manualmente).
  atencion?: { atendido?: boolean; atendidoPor?: string; atendidoEn?: string; comentario?: string | null };
}

const TIPO_LABEL: Record<string, string> = {
  CONDUCTOR_AUSENTE: 'Ausencia conductor',
  VEHICULO_FUERA_DE_SERVICIO: 'Vehículo fuera de servicio',
  RETRASO_OPERATIVO: 'Retraso operativo',
  VIAJE_CANCELADO: 'Viaje cancelado',
};

const SEV_COLOR: Record<Severidad, string> = {
  info: 'bg-slate-700/30 text-slate-300 border-slate-600',
  advertencia: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  critico: 'bg-red-500/15 text-red-300 border-red-500/40',
};

function fmtMoney(n: number | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('es-UY', { signDisplay: 'auto' });
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('es-UY', { hour12: false });
  } catch {
    return iso;
  }
}

function toCsv(rows: FeedEvent[]): string {
  const head = ['fecha', 'tipo', 'severidad', 'linea', 'efectos', 'nomina', 'subsidio', 'fuente', 'causa'];
  const csvRows = rows.map((r) => {
    const linea = String((r.evento.lineaId as string) ?? (r.evento.linea as string) ?? '');
    const fuente = String((r.evento.fuente as string) ?? 'manual');
    const causa = String((r.evento.causa as string) ?? (r.evento.causaViaje as string) ?? (r.evento.motivoVehiculo as string) ?? '');
    return [
      fmtDate(r.ts),
      r.tipo,
      r.severidad,
      linea,
      String(r.totalEfectos ?? ''),
      String(r.resumen?.impactoNomina ?? ''),
      String(r.resumen?.impactoSubsidio ?? ''),
      fuente,
      causa.replace(/"/g, "''"),
    ]
      .map((v) => `"${v}"`)
      .join(',');
  });
  return [head.join(','), ...csvRows].join('\n');
}

function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function CascadeAudit() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Acción "atender" en curso (id en flight)
  const [atendiendoId, setAtendiendoId] = useState<number | null>(null);

  // FASE 5.37 (2026-05-22): drill-down — leemos query params para pre-llenar
  // filtros cuando otra pantalla nos navega (ej. OperadoresComparativa).
  const [searchParams] = useSearchParams();

  // Filtros locales (client-side)
  const [tipoFilter, setTipoFilter] = useState<string>('');
  const [sevFilter, setSevFilter] = useState<string>('');
  const [lineaFilter, setLineaFilter] = useState<string>(() => searchParams.get('linea') ?? '');
  const [fuenteFilter, setFuenteFilter] = useState<string>('');
  const [limit, setLimit] = useState<number>(100);

  // FASE 5.34 (2026-05-22): filtros server-side (envían como query params).
  // Reducen el payload cuando hay miles de eventos.
  const [sinceFilter, setSinceFilter] = useState<string>(''); // YYYY-MM-DDTHH:mm
  const [untilFilter, setUntilFilter] = useState<string>('');
  // FASE 5.35 (2026-05-22): operador inicial desde el selector global del topbar.
  // FASE 5.37 (2026-05-22): si vino agency=N en la URL (drill-down), tiene prioridad.
  const { selectedOperator } = useLiveData();
  const [agencyFilter, setAgencyFilter] = useState<string>(searchParams.get('agency') ?? selectedOperator ?? '');
  // Sincronizar si el usuario cambia el operador global, salvo que haya venido
  // por URL (drill-down explícito).
  useEffect(() => {
    if (!searchParams.get('agency')) {
      setAgencyFilter(selectedOperator || '');
    }
  }, [selectedOperator, searchParams]);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const query: Record<string, unknown> = { limit };
      if (sinceFilter) query.since = new Date(sinceFilter).toISOString();
      if (untilFilter) query.until = new Date(untilFilter).toISOString();
      if (agencyFilter) query.agency_id = agencyFilter;
      const res = await apiClient.get<{ events?: FeedEvent[] }>('/api/cascade/feed', { query });
      const raw = (res as unknown as { events?: FeedEvent[] }).events
        ?? res.data?.events
        ?? [];
      setEvents(Array.isArray(raw) ? raw : []);
    } catch (e) {
      setError('No se pudo cargar el feed: ' + String(e).slice(0, 120));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, sinceFilter, untilFilter, agencyFilter]);

  // FASE 5.35 (2026-05-22): marcar evento como atendido + liberar cooldown.
  const atenderEvento = async (id: number, liberarCooldown: boolean) => {
    if (atendiendoId === id) return;
    setAtendiendoId(id);
    try {
      const comentario = window.prompt('Comentario opcional sobre la atención:', '') ?? undefined;
      await apiClient.post(`/api/cascade/events/${id}/atender`, { liberarCooldown, comentario });
      // Actualizar local sin recargar todo
      setEvents((prev) =>
        prev.map((e) =>
          e.id === id
            ? { ...e, atencion: { atendido: true, atendidoEn: new Date().toISOString(), comentario } }
            : e,
        ),
      );
    } catch (e) {
      alert('Error al marcar atendido: ' + String(e).slice(0, 200));
    } finally {
      setAtendiendoId(null);
    }
  };

  const filtrados = useMemo(() => {
    return events.filter((e) => {
      if (tipoFilter && e.tipo !== tipoFilter) return false;
      if (sevFilter && e.severidad !== sevFilter) return false;
      if (lineaFilter) {
        const ln = String((e.evento.lineaId as string) ?? (e.evento.linea as string) ?? '').toLowerCase();
        if (!ln.includes(lineaFilter.toLowerCase())) return false;
      }
      if (fuenteFilter) {
        const fu = String((e.evento.fuente as string) ?? 'manual').toLowerCase();
        if (!fu.includes(fuenteFilter.toLowerCase())) return false;
      }
      return true;
    });
  }, [events, tipoFilter, sevFilter, lineaFilter, fuenteFilter]);

  const stats = useMemo(() => {
    const total = filtrados.length;
    const criticos = filtrados.filter((e) => e.severidad === 'critico').length;
    const nomina = filtrados.reduce((s, e) => s + (e.resumen?.impactoNomina ?? 0), 0);
    const subsidio = filtrados.reduce((s, e) => s + (e.resumen?.impactoSubsidio ?? 0), 0);
    const efectos = filtrados.reduce((s, e) => s + (e.totalEfectos ?? 0), 0);
    return { total, criticos, nomina, subsidio, efectos };
  }, [filtrados]);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Network className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Auditoría del Motor de Consecuencias</h1>
            <p className="text-sm text-slate-400">
              Histórico de cada propagación cross-dominio que el sistema detectó o ejecutó.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void cargar()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Recargar
          </button>
          <button
            onClick={() => downloadCsv(`cascade_audit_${new Date().toISOString().slice(0, 10)}.csv`, toCsv(filtrados))}
            disabled={filtrados.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold border border-purple-500 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-1">Eventos</div>
          <div className="text-2xl font-bold text-white">{stats.total}</div>
        </div>
        <div className="bg-slate-900 border border-red-500/30 rounded-xl p-4">
          <div className="text-xs text-red-300 mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Críticos
          </div>
          <div className="text-2xl font-bold text-red-300">{stats.criticos}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-1">Efectos totales</div>
          <div className="text-2xl font-bold text-purple-300">{stats.efectos}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-emerald-400/80 mb-1">Impacto Nómina UYU</div>
          <div className="text-2xl font-bold text-emerald-300">{fmtMoney(stats.nomina)}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-yellow-400/80 mb-1">Impacto Subsidio UYU</div>
          <div className="text-2xl font-bold text-yellow-300">{fmtMoney(stats.subsidio)}</div>
        </div>
      </div>

      {/* Filtros — server-side (rango/operador/limit) + client-side (tipo/sev/linea/fuente) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pb-3 border-b border-slate-800/60">
          <div>
            <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Desde</label>
            <input
              type="datetime-local"
              value={sinceFilter}
              onChange={(e) => setSinceFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Hasta</label>
            <input
              type="datetime-local"
              value={untilFilter}
              onChange={(e) => setUntilFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Operador</label>
            <select
              value={agencyFilter}
              onChange={(e) => setAgencyFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
            >
              <option value="">Todos los operadores</option>
              <option value="70">UCOT (70)</option>
              <option value="50">CUTCSA (50)</option>
              <option value="20">COME (20)</option>
              <option value="10">COETC (10)</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Limit (server)</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
              <option value={2000}>2000</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Tipo</label>
            <select
              value={tipoFilter}
              onChange={(e) => setTipoFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
            >
              <option value="">Todos</option>
              {Object.keys(TIPO_LABEL).map((t) => (
                <option key={t} value={t}>{TIPO_LABEL[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Severidad</label>
            <select
              value={sevFilter}
              onChange={(e) => setSevFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
            >
              <option value="">Todas</option>
              <option value="info">Info</option>
              <option value="advertencia">Advertencia</option>
              <option value="critico">Crítico</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Línea</label>
            <input
              type="text"
              value={lineaFilter}
              onChange={(e) => setLineaFilter(e.target.value)}
              placeholder="ej: 300"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Fuente</label>
            <input
              type="text"
              value={fuenteFilter}
              onChange={(e) => setFuenteFilter(e.target.value)}
              placeholder="bunching / manual"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
            />
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {error && (
          <div className="p-4 bg-red-500/10 border-b border-red-500/30 text-sm text-red-300">
            {error}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-500 uppercase text-[10px]">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Severidad</th>
                <th className="px-3 py-2">Línea / Coche</th>
                <th className="px-3 py-2 text-right">Efectos</th>
                <th className="px-3 py-2 text-right">Nómina</th>
                <th className="px-3 py-2 text-right">Subsidio</th>
                <th className="px-3 py-2">Fuente</th>
                <th className="px-3 py-2">Causa</th>
                <th className="px-3 py-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading && filtrados.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-slate-500">
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && filtrados.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-slate-500">
                    <Search className="w-5 h-5 mx-auto mb-2 opacity-40" />
                    Sin eventos en el rango/filtros actuales.
                  </td>
                </tr>
              )}
              {filtrados.map((e) => {
                const linea = String((e.evento.lineaId as string) ?? (e.evento.linea as string) ?? '—');
                const coche = String((e.evento.cocheId as string) ?? (e.evento.cocheNumero as string) ?? '');
                const fuente = String((e.evento.fuente as string) ?? 'manual');
                const causa = String(
                  (e.evento.causa as string) ?? (e.evento.causaViaje as string) ?? (e.evento.motivoVehiculo as string) ?? '—',
                );
                return (
                  <tr key={e.id} className="hover:bg-slate-800/40">
                    <td className="px-3 py-2 text-slate-300 font-mono whitespace-nowrap">{fmtDate(e.ts)}</td>
                    <td className="px-3 py-2 text-white">{TIPO_LABEL[e.tipo] ?? e.tipo}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${SEV_COLOR[e.severidad]}`}>
                        {e.severidad.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {linea !== '—' && <span className="font-bold">L{linea}</span>}
                      {coche && <span className="ml-1 text-slate-500">· {coche}</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-purple-300 font-bold">{e.totalEfectos ?? 0}</td>
                    <td className="px-3 py-2 text-right text-emerald-300 font-mono">{fmtMoney(e.resumen?.impactoNomina)}</td>
                    <td className="px-3 py-2 text-right text-yellow-300 font-mono">{fmtMoney(e.resumen?.impactoSubsidio)}</td>
                    <td className="px-3 py-2 text-slate-400 text-[10px]">{fuente.replace('cascadeAutoTriggerScheduler:', '').replace('cascadeAutoTriggerScheduler', 'auto')}</td>
                    <td className="px-3 py-2 text-slate-500 text-[10px] max-w-xs truncate" title={causa}>
                      {causa}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {e.atencion?.atendido ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 text-[10px] font-bold" title={`Atendido ${e.atencion.atendidoPor ? 'por ' + e.atencion.atendidoPor : ''}`}>
                          <CheckCircle className="w-3 h-3" />
                          Atendido
                        </span>
                      ) : (
                        <button
                          onClick={() => void atenderEvento(e.id, true)}
                          disabled={atendiendoId === e.id}
                          className="px-2 py-1 rounded-md bg-emerald-600/80 hover:bg-emerald-500 text-white text-[10px] font-bold border border-emerald-500/50 disabled:opacity-50"
                          title="Marcar atendido + liberar cooldown para re-disparo"
                        >
                          Atender
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 border-t border-slate-800 text-[10px] text-slate-500">
          Mostrando {filtrados.length} de {events.length} eventos cargados (limit={limit}). Datos: `logs_auditoria` ·
          accion=consequencePreview.
        </div>
      </div>
    </div>
  );
}
