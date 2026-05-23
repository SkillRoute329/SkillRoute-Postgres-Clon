/**
 * OperadoresComparativa — Vista comparativa de los 4 operadores
 * (FASE 5.36, 2026-05-22).
 *
 * Cruza GPS en vivo + motor de consecuencias + catálogo de líneas para
 * mostrar lado a lado UCOT / CUTCSA / COME / COETC con KPIs operativos
 * y económicos en el rango temporal seleccionado.
 *
 * Es la vista de "sistema metropolitano como un todo" que pide la
 * presentación IMM.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Activity, Bus, AlertTriangle, DollarSign, TrendingDown, Network, LayoutGrid, Table as TableIcon, BarChart3 } from 'lucide-react';
import { apiClient } from '../../clients/apiClient';

interface KpiPorOperador {
  agencyId: string;
  nombre: string;
  buses: { total: number; enTiempo: number; atrasado: number; fds: number };
  motor: {
    eventos: number;
    criticos: number;
    porTipo: Record<string, number>;
    impactoNomina: number;
    impactoSubsidio: number;
  };
  catalogo: { lineas: number };
  topLineas: Array<{ linea: string; eventos: number; criticos: number }>;
}

const TIPO_LABEL: Record<string, string> = {
  CONDUCTOR_AUSENTE: 'Conductor ausente',
  VEHICULO_FUERA_DE_SERVICIO: 'Vehículo fuera serv.',
  RETRASO_OPERATIVO: 'Retraso operativo',
  VIAJE_CANCELADO: 'Viaje cancelado',
};

const AGENCY_COLORS: Record<string, string> = {
  '70': 'from-blue-900 to-blue-950 border-blue-500/30',     // UCOT
  '50': 'from-amber-900 to-slate-900 border-amber-500/30',  // CUTCSA
  '20': 'from-purple-900 to-slate-900 border-purple-500/30',// COME
  '10': 'from-emerald-900 to-slate-900 border-emerald-500/30', // COETC
};

function fmtMoney(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('es-UY', { signDisplay: 'auto' });
}

function fmtPct(n: number, total: number): string {
  if (!total) return '0%';
  return Math.round((n / total) * 100) + '%';
}

const DEFAULT_HOURS_BACK = 24;

type Vista = 'cards' | 'tabla' | 'chart';

export default function OperadoresComparativa() {
  const navigate = useNavigate();
  const [operadores, setOperadores] = useState<KpiPorOperador[]>([]);
  const [since, setSince] = useState<string>(() => {
    const d = new Date(Date.now() - DEFAULT_HOURS_BACK * 3600 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [until, setUntil] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [vista, setVista] = useState<Vista>('cards');

  const cargar = async () => {
    setLoading(true);
    try {
      const query: Record<string, string> = {};
      if (since) query.since = new Date(since).toISOString();
      if (until) query.until = new Date(until).toISOString();
      const res = await apiClient.get<{ operadores?: KpiPorOperador[] }>('/api/operadores/kpis', { query });
      const data = (res as unknown as { operadores?: KpiPorOperador[] });
      setOperadores(data?.operadores ?? res.data?.operadores ?? []);
    } catch (e) {
      console.error('[OperadoresComparativa]', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [since, until]);

  // Total sistema
  const total = operadores.reduce(
    (acc, o) => ({
      buses: acc.buses + o.buses.total,
      enTiempo: acc.enTiempo + o.buses.enTiempo,
      eventos: acc.eventos + o.motor.eventos,
      criticos: acc.criticos + o.motor.criticos,
      nomina: acc.nomina + o.motor.impactoNomina,
      subsidio: acc.subsidio + o.motor.impactoSubsidio,
      lineas: acc.lineas + o.catalogo.lineas,
    }),
    { buses: 0, enTiempo: 0, eventos: 0, criticos: 0, nomina: 0, subsidio: 0, lineas: 0 },
  );

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Network className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Sistema metropolitano · comparativa por operador</h1>
            <p className="text-sm text-slate-400">
              GPS en vivo + motor de consecuencias + catálogo. Cuatro operadores lado a lado.
            </p>
          </div>
        </div>
        <button
          onClick={() => void cargar()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Recargar
        </button>
      </div>

      {/* Filtros de período */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Desde</label>
          <input
            type="datetime-local"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Hasta</label>
          <input
            type="datetime-local"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            placeholder="(ahora)"
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
          />
        </div>
      </div>

      {/* Totales del sistema */}
      <div>
        <h2 className="text-xs uppercase tracking-wide text-slate-500 font-bold mb-3">Sistema completo</h2>
        {operadores.length === 0 && loading ? (
          // FASE 5.39 (2026-05-23): skeleton mientras carga. Antes la grilla
          // mostraba 6 KPIs en "0" durante el fetch, lo que la auditoría
          // semántica reportaba como "6/9 KPIs en 0".
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-3 h-20 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Kpi label="Buses GPS" valor={total.buses} icon={Bus} color="text-emerald-300" />
            <Kpi label="EN TIEMPO" valor={total.enTiempo} icon={Activity} color="text-emerald-300" extra={fmtPct(total.enTiempo, total.buses)} />
            <Kpi label="Líneas" valor={total.lineas} icon={Network} color="text-purple-300" />
            <Kpi label="Eventos motor" valor={total.eventos} icon={Network} color="text-purple-300" />
            <Kpi label="Críticos" valor={total.criticos} icon={AlertTriangle} color="text-red-300" extra={fmtPct(total.criticos, total.eventos)} />
            <Kpi label="Impacto UYU" valor={total.nomina + total.subsidio} icon={DollarSign} color="text-yellow-300" mono />
          </div>
        )}
      </div>

      {/* Tabs de vista */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs uppercase tracking-wide text-slate-500 font-bold">Por operador</h2>
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
            <button
              onClick={() => setVista('cards')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${vista === 'cards' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <LayoutGrid className="w-3 h-3" />
              Tarjetas
            </button>
            <button
              onClick={() => setVista('tabla')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${vista === 'tabla' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <TableIcon className="w-3 h-3" />
              Tabla
            </button>
            <button
              onClick={() => setVista('chart')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${vista === 'chart' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <BarChart3 className="w-3 h-3" />
              Gráfico
            </button>
          </div>
        </div>

        {/* Vista TABLA */}
        {vista === 'tabla' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-950 text-slate-500 uppercase text-[10px]">
                <tr>
                  <th className="px-3 py-2 text-left">Operador</th>
                  <th className="px-3 py-2 text-right">Buses</th>
                  <th className="px-3 py-2 text-right">En tiempo</th>
                  <th className="px-3 py-2 text-right">Atrasado</th>
                  <th className="px-3 py-2 text-right">FDS</th>
                  <th className="px-3 py-2 text-right">Líneas</th>
                  <th className="px-3 py-2 text-right">Eventos</th>
                  <th className="px-3 py-2 text-right">Críticos</th>
                  <th className="px-3 py-2 text-right">$ Nómina</th>
                  <th className="px-3 py-2 text-right">$ Subsidio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {operadores.map((op) => {
                  const pct = op.buses.total ? Math.round((op.buses.enTiempo / op.buses.total) * 100) : 0;
                  return (
                    <tr key={op.agencyId} className="hover:bg-slate-800/30">
                      <td className="px-3 py-2 font-bold text-white">
                        {op.nombre}
                        <span className="text-[9px] text-slate-500 ml-1.5">#{op.agencyId}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{op.buses.total}</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-300">{op.buses.enTiempo} <span className="text-slate-500">({pct}%)</span></td>
                      <td className="px-3 py-2 text-right font-mono text-amber-300">{op.buses.atrasado}</td>
                      <td className="px-3 py-2 text-right font-mono text-red-300">{op.buses.fds}</td>
                      <td className="px-3 py-2 text-right font-mono text-blue-300">{op.catalogo.lineas}</td>
                      <td className="px-3 py-2 text-right font-mono text-purple-300">{op.motor.eventos}</td>
                      <td className="px-3 py-2 text-right font-mono text-red-300">{op.motor.criticos}</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-300">{fmtMoney(op.motor.impactoNomina)}</td>
                      <td className="px-3 py-2 text-right font-mono text-yellow-300">{fmtMoney(op.motor.impactoSubsidio)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Vista CHART — barras horizontales por métrica */}
        {vista === 'chart' && (
          <div className="space-y-4">
            <ChartBar title="Buses GPS en vivo" data={operadores.map((o) => ({ label: o.nombre, value: o.buses.total }))} colorClass="bg-emerald-500" />
            <ChartBar title="Eventos del motor" data={operadores.map((o) => ({ label: o.nombre, value: o.motor.eventos }))} colorClass="bg-purple-500" />
            <ChartBar title="Críticos" data={operadores.map((o) => ({ label: o.nombre, value: o.motor.criticos }))} colorClass="bg-red-500" />
            <ChartBar title="Impacto Nómina (valor absoluto UYU)" data={operadores.map((o) => ({ label: o.nombre, value: Math.abs(o.motor.impactoNomina) }))} colorClass="bg-emerald-400" fmtValor={fmtMoney} />
            <ChartBar title="Impacto Subsidio (valor absoluto UYU)" data={operadores.map((o) => ({ label: o.nombre, value: Math.abs(o.motor.impactoSubsidio) }))} colorClass="bg-yellow-500" fmtValor={fmtMoney} />
          </div>
        )}

        {/* Vista CARDS (original) */}
        {vista === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {operadores.map((op) => {
            const color = AGENCY_COLORS[op.agencyId] ?? 'from-slate-900 to-slate-950 border-slate-700';
            const pctEnTiempo = op.buses.total > 0 ? Math.round((op.buses.enTiempo / op.buses.total) * 100) : 0;
            return (
              <div key={op.agencyId} className={`bg-gradient-to-br ${color} border rounded-xl p-4 space-y-3`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-300">Operador</div>
                    <h3 className="text-2xl font-black text-white">{op.nombre}</h3>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-900/60 px-2 py-1 rounded border border-slate-700">
                    #{op.agencyId}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-950/40 rounded-lg p-2">
                    <div className="text-[9px] text-slate-500 uppercase">Buses</div>
                    <div className="text-xl font-bold text-white">{op.buses.total}</div>
                  </div>
                  <div className="bg-emerald-950/30 rounded-lg p-2">
                    <div className="text-[9px] text-emerald-400 uppercase">En tiempo</div>
                    <div className="text-xl font-bold text-emerald-300">{pctEnTiempo}%</div>
                  </div>
                  <div className="bg-red-950/30 rounded-lg p-2">
                    <div className="text-[9px] text-red-400 uppercase">FDS</div>
                    <div className="text-xl font-bold text-red-300">{op.buses.fds}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-950/40 rounded-lg p-2">
                    <div className="text-[9px] text-slate-500 uppercase">Eventos motor</div>
                    <div className="text-lg font-bold text-purple-300">
                      {op.motor.eventos}
                      <span className="text-xs text-red-300 ml-1.5">({op.motor.criticos} crít.)</span>
                    </div>
                  </div>
                  <div className="bg-slate-950/40 rounded-lg p-2">
                    <div className="text-[9px] text-slate-500 uppercase">Líneas catálogo</div>
                    <div className="text-lg font-bold text-blue-300">{op.catalogo.lineas}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-emerald-950/30 rounded-lg p-2">
                    <div className="text-[9px] text-emerald-400 uppercase flex items-center gap-1">
                      <DollarSign className="w-2.5 h-2.5" /> Nómina UYU
                    </div>
                    <div className="text-sm font-bold text-emerald-300 font-mono">{fmtMoney(op.motor.impactoNomina)}</div>
                  </div>
                  <div className="bg-yellow-950/30 rounded-lg p-2">
                    <div className="text-[9px] text-yellow-400 uppercase flex items-center gap-1">
                      <TrendingDown className="w-2.5 h-2.5" /> Subsidio UYU
                    </div>
                    <div className="text-sm font-bold text-yellow-300 font-mono">{fmtMoney(op.motor.impactoSubsidio)}</div>
                  </div>
                </div>

                {/* Top líneas con eventos — clickeables para drill-down */}
                {op.topLineas.length > 0 && (
                  <div className="bg-slate-950/30 rounded-lg p-2">
                    <div className="text-[9px] text-slate-500 uppercase mb-1.5">Top líneas con eventos · click para detalle</div>
                    <ul className="space-y-1">
                      {op.topLineas.map((l) => (
                        <li
                          key={l.linea}
                          onClick={() => navigate(`/dashboard/super-admin/cascade-audit?linea=${encodeURIComponent(l.linea)}&agency=${op.agencyId}`)}
                          className="flex items-center justify-between text-xs cursor-pointer hover:bg-slate-800/40 rounded px-1.5 py-0.5 transition-colors"
                          title={`Ver eventos de línea ${l.linea} en CascadeAudit`}
                        >
                          <span className="text-white font-bold">L{l.linea}</span>
                          <span className="text-slate-400 font-mono">
                            {l.eventos} ev
                            {l.criticos > 0 && <span className="text-red-300 ml-1">· {l.criticos} crít.</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Distribución por tipo */}
                {Object.keys(op.motor.porTipo).length > 0 && (
                  <div className="text-[10px] text-slate-400 space-y-0.5">
                    {Object.entries(op.motor.porTipo)
                      .sort(([, a], [, b]) => b - a)
                      .map(([t, c]) => (
                        <div key={t} className="flex justify-between">
                          <span>{TIPO_LABEL[t] ?? t}</span>
                          <span className="font-mono text-slate-300">{c}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}

function ChartBar({ title, data, colorClass, fmtValor }: { title: string; data: Array<{ label: string; value: number }>; colorClass: string; fmtValor?: (n: number) => string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="text-xs uppercase text-slate-500 font-bold mb-3">{title}</div>
      <div className="space-y-2">
        {data.map((d) => {
          const pct = (d.value / max) * 100;
          return (
            <div key={d.label} className="flex items-center gap-3">
              <div className="w-20 text-xs text-slate-300 font-bold shrink-0">{d.label}</div>
              <div className="flex-1 bg-slate-800/60 rounded-md h-7 relative overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 ${colorClass} rounded-md transition-all`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
                <div className="absolute inset-0 flex items-center px-2 text-[11px] font-mono text-white">
                  {fmtValor ? fmtValor(d.value) : d.value.toLocaleString('es-UY')}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({ label, valor, icon: Icon, color, extra, mono }: { label: string; valor: number; icon: React.ElementType; color: string; extra?: string; mono?: boolean }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
      <div className="text-[9px] text-slate-500 uppercase flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className={`text-2xl font-bold ${color} ${mono ? 'font-mono' : ''}`}>
        {mono ? valor.toLocaleString('es-UY') : valor}
      </div>
      {extra && <div className="text-[9px] text-slate-500 mt-0.5">{extra}</div>}
    </div>
  );
}
