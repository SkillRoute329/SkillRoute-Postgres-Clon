/**
 * AuditoriaRegulatoriaIMM — Resumen ejecutivo lista para imprimir
 * (FASE 5.33, 2026-05-22).
 *
 * Página IMM-ready: vista profesional con header del operador, KPIs
 * agrupados por dominio, tabla de eventos críticos del período y nota
 * de fuente. Soporta @media print para impresión a PDF.
 *
 * Datos: combina /api/cascade/feed (motor) + /api/positions (cobertura
 * GPS en vivo) + /api/inteligencia/:linea (selectivo, opcional).
 */

import { useEffect, useMemo, useState } from 'react';
import { Printer, RefreshCw, Calendar, Network, AlertTriangle, DollarSign, TrendingDown, Bus } from 'lucide-react';
import { apiClient } from '../../clients/apiClient';
import { useLiveData } from '../../context/LiveDataContext';

type Severidad = 'info' | 'advertencia' | 'critico';

interface FeedEvent {
  id: number;
  ts: string;
  tipo: string;
  evento: Record<string, unknown>;
  totalEfectos: number;
  resumen: {
    impactoNomina?: number;
    impactoSubsidio?: number;
    deltaOTP?: number;
    severidadGlobal?: Severidad;
  };
  severidad: Severidad;
}

interface PositionsResponse {
  ok: boolean;
  total: number;
  buses: Array<{ empresa: string; empresaId: number; linea: string; estado?: string | null }>;
}

const TIPO_LABEL: Record<string, string> = {
  CONDUCTOR_AUSENTE: 'Conductor ausente',
  VEHICULO_FUERA_DE_SERVICIO: 'Vehículo fuera de servicio',
  RETRASO_OPERATIVO: 'Retraso operativo',
  VIAJE_CANCELADO: 'Viaje cancelado',
};

function fmt(n: number | undefined | null): string {
  if (n == null) return '—';
  return n.toLocaleString('es-UY', { signDisplay: 'auto' });
}

function fmtDate(d: Date): string {
  return d.toLocaleString('es-UY', { hour12: false });
}

const AGENCIA_LABEL: Record<string, string> = {
  '70': 'UCOT', '50': 'CUTCSA', '20': 'COME', '10': 'COETC',
};

export default function AuditoriaRegulatoriaIMM() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [buses, setBuses] = useState<PositionsResponse['buses']>([]);
  const [loading, setLoading] = useState(false);
  const [emitidoEn, setEmitidoEn] = useState<Date>(new Date());

  // FASE 5.34 (2026-05-22): filtros del reporte. Permiten emitir un PDF
  // acotado a un período + operador específico.
  // FASE 5.39 (2026-05-22): default a últimos 30 días para que el reporte
  // muestre histórico amplio en lugar de quedar casi vacío cuando hubo
  // pocas horas de actividad reciente.
  const [sinceFilter, setSinceFilter] = useState<string>(() => {
    const d = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [untilFilter, setUntilFilter] = useState<string>('');
  // FASE 5.35 (2026-05-22): operador inicial desde el selector global.
  const { selectedOperator } = useLiveData();
  const [agencyFilter, setAgencyFilter] = useState<string>(selectedOperator || '');
  useEffect(() => { setAgencyFilter(selectedOperator || ''); }, [selectedOperator]);
  // FASE 5.39 (2026-05-22): excluir eventos auto-caducados de los KPIs
  // ejecutivos. Default ON: el reporte oficial sólo cuenta eventos que
  // requirieron atención real (intervenidos por operador o aún abiertos).
  const [excluirCaducadas, setExcluirCaducadas] = useState<boolean>(true);

  const cargar = async () => {
    setLoading(true);
    try {
      // FASE 5.39: 30 días pueden tener varios miles de eventos; subimos
      // el limit. El endpoint respeta máximo 2000.
      const query: Record<string, unknown> = { limit: 2000 };
      if (sinceFilter) query.since = new Date(sinceFilter).toISOString();
      if (untilFilter) query.until = new Date(untilFilter).toISOString();
      if (agencyFilter) query.agency_id = agencyFilter;
      // FASE 5.39: por default excluimos eventos auto-caducados de los KPIs
      // ejecutivos. El backend filtra por `atendidoPor` empezando con 'auto:'.
      if (excluirCaducadas) query.excludeCaducadas = '1';
      const [feedRes, posRes] = await Promise.all([
        apiClient.get<{ events?: FeedEvent[] }>('/api/cascade/feed', { query }),
        fetch('/api/positions').then((r) => r.json()).catch(() => ({ buses: [] })),
      ]);
      const evs = (feedRes as unknown as { events?: FeedEvent[] }).events ?? feedRes.data?.events ?? [];
      setEvents(Array.isArray(evs) ? evs : []);
      let busesFiltered = Array.isArray((posRes as PositionsResponse).buses) ? (posRes as PositionsResponse).buses : [];
      if (agencyFilter) {
        busesFiltered = busesFiltered.filter((b) => String(b.empresaId) === agencyFilter);
      }
      setBuses(busesFiltered);
      setEmitidoEn(new Date());
    } catch (e) {
      console.error('[AuditoriaIMM]', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sinceFilter, untilFilter, agencyFilter, excluirCaducadas]);

  const stats = useMemo(() => {
    const porTipo: Record<string, number> = {};
    let nomina = 0;
    let subsidio = 0;
    let otp = 0;
    let criticos = 0;
    const porLinea = new Map<string, { count: number; nomina: number; subsidio: number; crit: number }>();
    for (const e of events) {
      porTipo[e.tipo] = (porTipo[e.tipo] ?? 0) + 1;
      nomina += e.resumen?.impactoNomina ?? 0;
      subsidio += e.resumen?.impactoSubsidio ?? 0;
      otp += e.resumen?.deltaOTP ?? 0;
      if (e.severidad === 'critico') criticos++;
      const linea = String((e.evento.lineaId as string) ?? (e.evento.linea as string) ?? '—');
      const r = porLinea.get(linea) ?? { count: 0, nomina: 0, subsidio: 0, crit: 0 };
      r.count++;
      r.nomina += e.resumen?.impactoNomina ?? 0;
      r.subsidio += e.resumen?.impactoSubsidio ?? 0;
      if (e.severidad === 'critico') r.crit++;
      porLinea.set(linea, r);
    }
    const lineasOrdenadas = Array.from(porLinea.entries())
      .map(([l, v]) => ({ linea: l, ...v }))
      .sort((a, b) => Math.abs(b.subsidio) + Math.abs(b.nomina) - (Math.abs(a.subsidio) + Math.abs(a.nomina)))
      .slice(0, 15);
    return { porTipo, nomina, subsidio, otp, criticos, total: events.length, lineasOrdenadas };
  }, [events]);

  const cobertura = useMemo(() => {
    const porOperador: Record<string, number> = {};
    for (const b of buses) {
      const k = b.empresa || String(b.empresaId);
      porOperador[k] = (porOperador[k] ?? 0) + 1;
    }
    return { totalBuses: buses.length, porOperador };
  }, [buses]);

  const criticosRecientes = events.filter((e) => e.severidad === 'critico').slice(0, 20);

  return (
    <div className="space-y-6 animate-fade-in-up print:bg-white print:text-black">
      {/* Toolbar — se oculta al imprimir */}
      <div className="space-y-3 print:hidden">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <Network className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Auditoría Regulatoria — Reporte IMM</h1>
              <p className="text-sm text-slate-400">
                Vista lista para imprimir/exportar a PDF. Incluye eventos del motor, impacto monetario y cobertura GPS.
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
              Recargar datos
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold border border-blue-500"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir / Exportar PDF
            </button>
          </div>
        </div>
        {/* Filtros del reporte */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
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
        </div>
        {/* FASE 5.39: toggle excluir auto-caducadas */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={excluirCaducadas}
              onChange={(e) => setExcluirCaducadas(e.target.checked)}
              className="rounded accent-blue-500"
            />
            <span className="text-xs text-slate-300 font-bold">Excluir eventos auto-caducados</span>
            <span className="text-[10px] text-slate-500">
              (eventos cerrados por timeout sin atención humana)
            </span>
          </label>
          <span className="text-[10px] text-slate-500">
            Default <b>ON</b> · el reporte oficial sólo cuenta eventos que requirieron acción real
          </span>
        </div>
      </div>

      {/* Reporte */}
      <div className="bg-white text-slate-900 rounded-xl border border-slate-300 p-8 shadow-2xl print:shadow-none print:border-0 print:p-0 print:rounded-none print:bg-white">
        {/* Cabecera del documento */}
        <div className="border-b-2 border-slate-300 pb-4 mb-6 flex items-start justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
              SkillRoute · Sistema metropolitano de transporte
            </div>
            <h2 className="text-2xl font-bold mt-1">Auditoría Regulatoria — Informe Ejecutivo</h2>
            <p className="text-sm text-slate-600 mt-2">
              Resumen del motor de consecuencias y métricas operativas en vivo del sistema metropolitano.
              Datos provenientes del GPS oficial IMM, validados contra la operación.
            </p>
          </div>
          <div className="text-right text-sm">
            <div className="flex items-center gap-1.5 text-slate-600 justify-end">
              <Calendar className="w-4 h-4" />
              <span className="font-mono">{fmtDate(emitidoEn)}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {agencyFilter
                ? <>Operador: <b>{AGENCIA_LABEL[agencyFilter]} ({agencyFilter})</b></>
                : 'Todos los operadores'}
              {' · '}
              {(sinceFilter || untilFilter)
                ? <>Período: {sinceFilter ? fmtDate(new Date(sinceFilter)) : '—'} → {untilFilter ? fmtDate(new Date(untilFilter)) : 'ahora'}</>
                : <>Últimos {events.length} eventos</>}
            </div>
          </div>
        </div>

        {/* KPIs ejecutivos */}
        <section className="mb-6">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-bold mb-3">
            Resumen ejecutivo
          </h3>
          <div className="grid grid-cols-4 gap-3">
            <div className="border border-slate-300 rounded-lg p-4 bg-slate-50">
              <div className="text-[10px] uppercase text-slate-500">Eventos analizados</div>
              <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
              <div className="text-[11px] text-slate-500 mt-1">propagaciones cross-dominio</div>
            </div>
            <div className="border border-red-300 rounded-lg p-4 bg-red-50">
              <div className="text-[10px] uppercase text-red-700 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Críticos
              </div>
              <div className="text-2xl font-bold text-red-700">{stats.criticos}</div>
              <div className="text-[11px] text-red-600 mt-1">requieren intervención</div>
            </div>
            <div className="border border-emerald-300 rounded-lg p-4 bg-emerald-50">
              <div className="text-[10px] uppercase text-emerald-700 flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> Impacto Nómina
              </div>
              <div className="text-2xl font-bold text-emerald-700 font-mono">{fmt(stats.nomina)}</div>
              <div className="text-[11px] text-emerald-600 mt-1">UYU acumulado</div>
            </div>
            <div className="border border-yellow-300 rounded-lg p-4 bg-yellow-50">
              <div className="text-[10px] uppercase text-yellow-700 flex items-center gap-1">
                <TrendingDown className="w-3 h-3" /> Impacto Subsidio STM
              </div>
              <div className="text-2xl font-bold text-yellow-700 font-mono">{fmt(stats.subsidio)}</div>
              <div className="text-[11px] text-yellow-600 mt-1">UYU acumulado</div>
            </div>
          </div>
        </section>

        {/* Distribución por tipo */}
        <section className="mb-6">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-bold mb-3">
            Distribución por tipo de evento
          </h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-300 text-left text-[11px] uppercase text-slate-600">
                <th className="py-2 px-3">Tipo</th>
                <th className="py-2 px-3 text-right">Cantidad</th>
                <th className="py-2 px-3 text-right">% del total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(stats.porTipo).sort(([, a], [, b]) => b - a).map(([t, c]) => (
                <tr key={t} className="border-b border-slate-200">
                  <td className="py-2 px-3">{TIPO_LABEL[t] ?? t}</td>
                  <td className="py-2 px-3 text-right font-mono font-bold">{c}</td>
                  <td className="py-2 px-3 text-right text-slate-600">{stats.total ? ((c / stats.total) * 100).toFixed(1) : 0}%</td>
                </tr>
              ))}
              {stats.total === 0 && (
                <tr><td colSpan={3} className="py-4 text-center text-slate-500">Sin eventos en el período.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Cobertura GPS por operador */}
        <section className="mb-6">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-bold mb-3 flex items-center gap-1.5">
            <Bus className="w-3.5 h-3.5" /> Cobertura GPS en vivo · {cobertura.totalBuses} buses en sistema
          </h3>
          <div className="grid grid-cols-4 gap-3">
            {Object.entries(cobertura.porOperador).map(([op, n]) => (
              <div key={op} className="border border-slate-300 rounded-lg p-3 bg-white">
                <div className="text-[10px] uppercase text-slate-500">{op}</div>
                <div className="text-xl font-bold text-slate-900">{n}</div>
                <div className="text-[10px] text-slate-500">buses GPS activos</div>
              </div>
            ))}
            {cobertura.totalBuses === 0 && (
              <div className="col-span-4 text-center text-slate-500 py-4">Sin datos GPS recientes.</div>
            )}
          </div>
        </section>

        {/* Top líneas por impacto */}
        <section className="mb-6">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-bold mb-3">
            Líneas con mayor impacto cross-dominio (Top 15)
          </h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-300 text-left text-[11px] uppercase text-slate-600">
                <th className="py-2 px-3">Línea</th>
                <th className="py-2 px-3 text-right">Eventos</th>
                <th className="py-2 px-3 text-right">Críticos</th>
                <th className="py-2 px-3 text-right">Nómina UYU</th>
                <th className="py-2 px-3 text-right">Subsidio UYU</th>
              </tr>
            </thead>
            <tbody>
              {stats.lineasOrdenadas.map((l) => (
                <tr key={l.linea} className="border-b border-slate-200">
                  <td className="py-2 px-3 font-bold">L{l.linea}</td>
                  <td className="py-2 px-3 text-right font-mono">{l.count}</td>
                  <td className="py-2 px-3 text-right font-mono text-red-700">{l.crit || ''}</td>
                  <td className="py-2 px-3 text-right font-mono text-emerald-700">{fmt(l.nomina)}</td>
                  <td className="py-2 px-3 text-right font-mono text-yellow-700">{fmt(l.subsidio)}</td>
                </tr>
              ))}
              {stats.lineasOrdenadas.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-center text-slate-500">Sin datos.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Eventos críticos recientes */}
        <section className="mb-6">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-bold mb-3 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600" /> Eventos críticos recientes (Top 20)
          </h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-300 text-left text-[11px] uppercase text-slate-600">
                <th className="py-2 px-3">Fecha</th>
                <th className="py-2 px-3">Tipo</th>
                <th className="py-2 px-3">Línea</th>
                <th className="py-2 px-3 text-right">Efectos</th>
                <th className="py-2 px-3">Causa</th>
              </tr>
            </thead>
            <tbody>
              {criticosRecientes.map((e) => {
                const linea = String((e.evento.lineaId as string) ?? (e.evento.linea as string) ?? '—');
                const causa = String(
                  (e.evento.causa as string) ?? (e.evento.causaViaje as string) ?? (e.evento.motivoVehiculo as string) ?? '',
                );
                return (
                  <tr key={e.id} className="border-b border-slate-200">
                    <td className="py-2 px-3 font-mono text-[11px]">{fmtDate(new Date(e.ts))}</td>
                    <td className="py-2 px-3">{TIPO_LABEL[e.tipo] ?? e.tipo}</td>
                    <td className="py-2 px-3 font-bold">L{linea}</td>
                    <td className="py-2 px-3 text-right font-mono">{e.totalEfectos}</td>
                    <td className="py-2 px-3 text-[11px] text-slate-600 max-w-md truncate" title={causa}>{causa || '—'}</td>
                  </tr>
                );
              })}
              {criticosRecientes.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-center text-slate-500">Sin eventos críticos.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Nota de fuentes */}
        <div className="text-[10px] text-slate-500 border-t border-slate-200 pt-3 mt-6">
          <p>
            <b>Fuentes:</b> GPS poller IMM (<code>bus_last_pos</code>, refresh 5s) · motor de consecuencias
            (<code>logs_auditoria.accion=consequencePreview</code>) · tarifas configurables vía
            <code> system_config.config_motor_consecuencias</code>.
          </p>
          <p className="mt-1">
            Generado por SkillRoute v4.0. Documento auto-renderizable a PDF mediante {`Ctrl+P`} / {`Cmd+P`}.
          </p>
        </div>
      </div>
    </div>
  );
}
