/**
 * MarketPenetration.tsx — Análisis de Penetración cross-operador histórico
 * ===========================================================================
 * Visualiza la evolución de la cuota de mercado (penetración) de cada
 * operador por línea-corredor a lo largo del tiempo. Datos de
 * `penetracion_diaria/{ymd}_{linea}` poblada por el cron
 * `computePenetrationCron` cada noche.
 *
 * Vistas:
 *   - KPIs globales (líneas dominadas, líneas en disputa, share promedio)
 *   - LineChart de evolución temporal del share del operador seleccionado
 *     en sus top líneas
 *   - Tabla con ranking de líneas por penetración del operador
 *   - Comparación con otros operadores en una línea drill-down
 *
 * Diferenciador: ningún competidor (Optibus, Swiftly) tiene este análisis
 * cross-operador con histórico. Lo único comparable es BusBetter (UK)
 * pero a nivel agencia única.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Loader2,
  AlertTriangle,
  TrendingUp,
  Globe,
  Crown,
  Sword,
  Download,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import * as XLSX from 'xlsx';

const OPERADORES = [
  { codigo: 70, agencyId: '70', label: 'UCOT', color: '#eab308' },
  { codigo: 50, agencyId: '50', label: 'CUTCSA', color: '#3b82f6' },
  { codigo: 20, agencyId: '20', label: 'COME', color: '#22c55e' },
  { codigo: 10, agencyId: '10', label: 'COETC', color: '#ef4444' },
] as const;

interface TopLineaHistoric {
  linea: string;
  avgShare: number;
  samples: number;
  fechas: Record<string, { count: number; sharePct: number }>;
}

interface ApiResponse {
  ok: boolean;
  agencyId: string;
  days: number;
  topLineas: TopLineaHistoric[];
  error?: string;
}

const HISTORIC_ENDPOINT = '/penetrationHistoric';

function dayKeyMvd(d: Date): string {
  const localMs = d.getTime() - 3 * 3600 * 1000;
  return new Date(localMs).toISOString().slice(0, 10);
}

function lastNDays(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    out.push(dayKeyMvd(new Date(today.getTime() - i * 24 * 3600 * 1000)));
  }
  return out;
}

export default function MarketPenetrationPage() {
  const { user } = useAuth();
  const { empresaPropia, setEmpresaPropia } = useEmpresaPropia();
  const agencyId = String(empresaPropia);
  const setAgencyId = (s: string) => setEmpresaPropia(Number(s) || 70);
  const [days, setDays] = useState<number>(14);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLineas, setSelectedLineas] = useState<Set<string>>(new Set());

  const empresaCfg = OPERADORES.find((o) => o.agencyId === agencyId) ?? OPERADORES[0]!;

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const url = `${HISTORIC_ENDPOINT}?agencyId=${agencyId}&days=${days}&topLineas=20`;
      const res = await fetch(url);
      const body = (await res.json()) as ApiResponse;
      if (!body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setData(body);
      // Auto-select top 5 líneas para el chart
      const top5 = body.topLineas.slice(0, 5).map((l) => l.linea);
      setSelectedLineas(new Set(top5));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user, agencyId, days]);

  useEffect(() => {
    load();
  }, [load]);

  // Serie para LineChart: para cada día en el rango, share % de cada línea seleccionada
  const chartData = useMemo(() => {
    if (!data) return [];
    const dates = lastNDays(days);
    return dates.map((fecha) => {
      const point: Record<string, string | number> = { fecha };
      for (const l of data.topLineas) {
        if (selectedLineas.has(l.linea)) {
          const f = l.fechas[fecha];
          point[l.linea] = f ? Math.round(f.sharePct * 10) / 10 : 0;
        }
      }
      return point;
    });
  }, [data, days, selectedLineas]);

  // KPIs globales
  const kpis = useMemo(() => {
    if (!data) return null;
    const dominadas = data.topLineas.filter((l) => l.avgShare >= 60).length;
    const enDisputa = data.topLineas.filter((l) => l.avgShare >= 40 && l.avgShare < 60).length;
    const cedidas = data.topLineas.filter((l) => l.avgShare < 40).length;
    const promedio = data.topLineas.length > 0
      ? data.topLineas.reduce((s, l) => s + l.avgShare, 0) / data.topLineas.length
      : 0;
    return { dominadas, enDisputa, cedidas, promedio };
  }, [data]);

  const handleExport = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    // Hoja 1: ranking
    const sheet1 = XLSX.utils.json_to_sheet(
      data.topLineas.map((l, i) => ({
        '#': i + 1,
        Línea: l.linea,
        'Share promedio (%)': Math.round(l.avgShare * 10) / 10,
        'Días con datos': l.samples,
      })),
    );
    XLSX.utils.book_append_sheet(wb, sheet1, 'Ranking penetración');

    // Hoja 2: serie temporal
    const dates = lastNDays(days);
    const sheet2 = XLSX.utils.json_to_sheet(
      dates.map((fecha) => {
        const row: Record<string, string | number> = { Fecha: fecha };
        for (const l of data.topLineas) {
          const f = l.fechas[fecha];
          row[`L${l.linea}`] = f ? Math.round(f.sharePct * 10) / 10 : 0;
        }
        return row;
      }),
    );
    XLSX.utils.book_append_sheet(wb, sheet2, 'Serie temporal');

    XLSX.writeFile(wb, `skillroute-penetracion-${empresaCfg.label}-${dayKeyMvd(new Date())}.xlsx`);
  };

  const toggleLinea = (linea: string) => {
    setSelectedLineas((prev) => {
      const next = new Set(prev);
      if (next.has(linea)) next.delete(linea);
      else next.add(linea);
      return next;
    });
  };

  if (loading && !data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <header className="border-b border-slate-800 pb-4 flex flex-col md:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-fuchsia-400" />
            Análisis de Penetración — Cuota histórica cross-operador
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-3xl">
            Evolución de la cuota de mercado de cada operador por línea
            sobre la base de buses GPS observados. Snapshot diario
            (cron 23:45 Mvd). Permite ver tendencias, detectar pérdida de
            penetración, identificar oportunidades.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={agencyId}
            onChange={(e) => setAgencyId(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {OPERADORES.map((o) => (
              <option key={o.agencyId} value={o.agencyId}>{o.label}</option>
            ))}
          </select>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value={7}>7 días</option>
            <option value={14}>14 días</option>
            <option value={30}>30 días</option>
            <option value={60}>60 días</option>
          </select>
          <button
            onClick={handleExport}
            disabled={!data || data.topLineas.length === 0}
            className="flex items-center gap-2 px-3 py-2 bg-fuchsia-600/80 hover:bg-fuchsia-500 text-white font-bold rounded-lg text-sm disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            Excel
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-red-950/30 border border-red-700/50 rounded-lg p-3 flex items-center gap-2 text-sm text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-900/60 border border-emerald-500/20 rounded-lg p-4">
            <div className="text-[10px] text-emerald-400 uppercase tracking-wider font-bold flex items-center gap-1">
              <Crown className="w-3 h-3" />
              Líneas dominadas
            </div>
            <div className="text-3xl font-black text-emerald-400 mt-1 tabular-nums">
              {kpis.dominadas}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">share ≥ 60%</div>
          </div>
          <div className="bg-slate-900/60 border border-amber-500/20 rounded-lg p-4">
            <div className="text-[10px] text-amber-400 uppercase tracking-wider font-bold flex items-center gap-1">
              <Sword className="w-3 h-3" />
              En disputa
            </div>
            <div className="text-3xl font-black text-amber-400 mt-1 tabular-nums">
              {kpis.enDisputa}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">40-60% share</div>
          </div>
          <div className="bg-slate-900/60 border border-red-500/20 rounded-lg p-4">
            <div className="text-[10px] text-red-400 uppercase tracking-wider font-bold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Cedidas (oportunidad rival)
            </div>
            <div className="text-3xl font-black text-red-400 mt-1 tabular-nums">
              {kpis.cedidas}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">share &lt; 40%</div>
          </div>
          <div className="bg-slate-900/60 border border-cyan-500/20 rounded-lg p-4">
            <div className="text-[10px] text-cyan-400 uppercase tracking-wider font-bold flex items-center gap-1">
              <Globe className="w-3 h-3" />
              Share promedio
            </div>
            <div className="text-3xl font-black text-cyan-400 mt-1 tabular-nums">
              {kpis.promedio.toFixed(1)}%
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              de {data?.topLineas.length ?? 0} líneas analizadas
            </div>
          </div>
        </div>
      )}

      {/* Chart de evolución */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-fuchsia-400" />
          Evolución del share de {empresaCfg.label} en sus líneas top
        </h2>
        {chartData.length === 0 || selectedLineas.size === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            Seleccioná al menos una línea de la tabla para verla en el chart.
          </div>
        ) : (
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="fecha" stroke="#64748b" fontSize={10}
                  tickFormatter={(v) => v.slice(5)} />
                <YAxis
                  stroke="#64748b"
                  fontSize={10}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
                <ReTooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {[...selectedLineas].map((linea, idx) => (
                  <Line
                    key={linea}
                    type="monotone"
                    dataKey={linea}
                    stroke={`hsl(${(idx * 60) % 360}, 70%, 60%)`}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    name={`L${linea}`}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Tabla ranking */}
      <section className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-400" />
            Ranking de penetración — top {data?.topLineas.length ?? 0} líneas
          </h2>
          <p className="text-[10px] text-slate-500 mt-1">
            Click en una fila para alternar la línea en el chart de evolución.
          </p>
        </div>
        {!data || data.topLineas.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            Sin datos de penetración para {empresaCfg.label} en los últimos {days} días.
            Probá ampliar el rango o esperar a que el cron diario popule la colección.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 uppercase tracking-wider font-black">
                <tr>
                  <th className="px-4 py-2.5 w-12">#</th>
                  <th className="px-4 py-2.5">Línea</th>
                  <th className="px-4 py-2.5 text-right">Share promedio</th>
                  <th className="px-4 py-2.5">Posición</th>
                  <th className="px-4 py-2.5 text-right">Días con datos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {data.topLineas.map((l, i) => {
                  const isSelected = selectedLineas.has(l.linea);
                  const status =
                    l.avgShare >= 60
                      ? { label: 'DOMINANTE', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-900/20' }
                      : l.avgShare >= 40
                        ? { label: 'EN DISPUTA', color: 'text-amber-400 border-amber-500/30 bg-amber-900/20' }
                        : { label: 'CEDIDA', color: 'text-red-400 border-red-500/30 bg-red-900/20' };
                  return (
                    <tr
                      key={l.linea}
                      onClick={() => toggleLinea(l.linea)}
                      className={`hover:bg-slate-800/30 transition-colors cursor-pointer ${
                        isSelected ? 'bg-fuchsia-900/10' : ''
                      }`}
                    >
                      <td className="px-4 py-2.5 text-slate-500 font-mono">{i + 1}</td>
                      <td className="px-4 py-2.5 font-mono font-bold text-white">
                        L{l.linea}
                        {isSelected && <span className="ml-2 text-[9px] text-fuchsia-400">●</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-32 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, l.avgShare)}%`,
                                background:
                                  l.avgShare >= 60
                                    ? '#10b981'
                                    : l.avgShare >= 40
                                      ? '#f59e0b'
                                      : '#ef4444',
                              }}
                            />
                          </div>
                          <span className="font-mono font-black text-white w-12 tabular-nums">
                            {l.avgShare.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-bold border rounded ${status.color}`}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500 font-mono">
                        {l.samples}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-center text-[10px] text-slate-600">
        SkillRoute · Análisis de Penetración · datos de{' '}
        <code className="bg-slate-900 px-1 rounded">penetracion_diaria</code>{' '}
        (snapshot 23:45 Mvd · ventana 4h)
      </p>
    </div>
  );
}
