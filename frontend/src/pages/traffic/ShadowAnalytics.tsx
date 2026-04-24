/**
 * ShadowAnalytics.tsx — Analytics histórico de eventos Shadow
 * =============================================================
 * DIRECTRIZ 2026-04-24: producto nivel internacional.
 *
 * Convierte las alertas acumuladas en `alertas_regulacion` (generadas por
 * shadowDispatcher.ts backend + el radar frontend) en insights de negocio
 * para el pitch y para el operador:
 *   - Dónde y cuándo ocurre el bunching cross-operador
 *   - Qué parejas de líneas pierden más eficiencia por paralelismo
 *   - Patrones horarios (picos de la mañana vs tarde)
 *   - Ranking de "corredores calientes" por frecuencia de eventos
 *
 * Referencia internacional:
 *   - TCRP 100 "Bunching Analysis"
 *   - TfL iBus performance reports
 *   - NYC MTA BusTime historical analytics
 *
 * Data source: colección `alertas_regulacion` (onCreate del backend +
 * frontend ShadowDispatcher). Docs incluyen tipo, coche_id, linea_id,
 * empresa_id, rival_empresa, rival_linea, distancia_metros, timestamp.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import * as XLSX from 'xlsx';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts';
import {
  Download,
  TrendingUp,
  Activity,
  AlertTriangle,
  Loader2,
  Clock,
  Swords,
  Gauge,
} from 'lucide-react';

// ─── Tipos ─────────────────────────────────────────────────────────────────

interface AlertaDoc {
  id: string;
  tipo: string;
  coche_id: string;
  linea_id: string;
  empresa_id?: number | string;
  rival_empresa?: string;
  rival_linea?: string;
  distancia_metros?: number;
  timestamp: Timestamp;
  instruccion?: string;
  fuente?: string;
}

// ─── Constantes ────────────────────────────────────────────────────────────

const EMPRESA_COLOR: Record<string, string> = {
  UCOT: '#eab308',
  CUTCSA: '#3b82f6',
  COME: '#22c55e',
  COETC: '#ef4444',
};

const EMPRESA_TO_ID: Record<string, string> = {
  UCOT: '70',
  CUTCSA: '50',
  COME: '20',
  COETC: '10',
};

// ─── Componente principal ──────────────────────────────────────────────────

export default function ShadowAnalyticsPage() {
  const [alertas, setAlertas] = useState<AlertaDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [daysBack, setDaysBack] = useState<number>(7);
  const [filterEmpresa, setFilterEmpresa] = useState<string>(''); // id numérico
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  // ── Load ───────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const since = Timestamp.fromMillis(Date.now() - daysBack * 24 * 3600 * 1000);
      const q = query(
        collection(db, 'alertas_regulacion'),
        where('timestamp', '>=', since),
        orderBy('timestamp', 'desc'),
        limit(10000),
      );
      const snap = await getDocs(q);
      const list: AlertaDoc[] = [];
      for (const doc of snap.docs) {
        list.push({ id: doc.id, ...doc.data() } as AlertaDoc);
      }
      setAlertas(list);
      setLastLoadedAt(new Date());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [daysBack]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Filtrado por empresa propia ────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!filterEmpresa) return alertas;
    return alertas.filter((a) => String(a.empresa_id ?? '') === filterEmpresa);
  }, [alertas, filterEmpresa]);

  // ── KPIs ───────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const total = filtered.length;
    const criticos = filtered.filter((a) => a.tipo === 'RIVAL_PISANDO_TURNO').length;
    const lineasUnicas = new Set(filtered.map((a) => a.linea_id)).size;
    const operadoresInvolucrados = new Set<string>();
    for (const a of filtered) {
      if (a.empresa_id) operadoresInvolucrados.add(String(a.empresa_id));
      if (a.rival_empresa) operadoresInvolucrados.add(a.rival_empresa);
    }
    return {
      total,
      criticos,
      pctCriticos: total > 0 ? Math.round((criticos / total) * 100) : 0,
      lineasUnicas,
      operadoresInvolucrados: operadoresInvolucrados.size,
    };
  }, [filtered]);

  // ── Serie temporal por día (últimos N días) ────────────────────────────

  const dailySeries = useMemo(() => {
    const byDay = new Map<string, { date: string; total: number; criticos: number }>();
    // Inicializar últimos N días con 0 para que el chart no tenga huecos
    for (let i = daysBack - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000);
      const key = d.toISOString().slice(0, 10);
      byDay.set(key, { date: key, total: 0, criticos: 0 });
    }
    for (const a of filtered) {
      const ms = a.timestamp?.toMillis?.() ?? 0;
      if (!ms) continue;
      const key = new Date(ms).toISOString().slice(0, 10);
      const entry = byDay.get(key);
      if (!entry) continue;
      entry.total += 1;
      if (a.tipo === 'RIVAL_PISANDO_TURNO') entry.criticos += 1;
    }
    return [...byDay.values()].map((d) => ({
      ...d,
      dateShort: d.date.slice(5),
    }));
  }, [filtered, daysBack]);

  // ── Distribución por hora del día ──────────────────────────────────────

  const hourlyDistribution = useMemo(() => {
    const counts = new Array(24).fill(0) as number[];
    for (const a of filtered) {
      const ms = a.timestamp?.toMillis?.() ?? 0;
      if (!ms) continue;
      const h = new Date(ms).getHours();
      counts[h] += 1;
    }
    return counts.map((c, h) => ({
      hour: `${String(h).padStart(2, '0')}h`,
      count: c,
      isPeak:
        (h >= 7 && h <= 9) || (h >= 17 && h <= 20),
    }));
  }, [filtered]);

  // ── Top 10 líneas con más eventos ──────────────────────────────────────

  const topLines = useMemo(() => {
    const counts = new Map<string, { linea: string; count: number; criticos: number }>();
    for (const a of filtered) {
      const linea = a.linea_id || '—';
      const entry = counts.get(linea) ?? { linea, count: 0, criticos: 0 };
      entry.count += 1;
      if (a.tipo === 'RIVAL_PISANDO_TURNO') entry.criticos += 1;
      counts.set(linea, entry);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filtered]);

  // ── Top duelos rivales (línea propia ↔ línea rival) ───────────────────

  const topDuelos = useMemo(() => {
    const pairs = new Map<string, {
      lineaPropia: string;
      empresaRival: string;
      lineaRival: string;
      count: number;
      avgDist: number;
      minDist: number;
    }>();
    for (const a of filtered) {
      if (!a.rival_empresa || !a.rival_linea) continue;
      const key = `${a.linea_id}__${a.rival_empresa}-${a.rival_linea}`;
      const dist = typeof a.distancia_metros === 'number' ? a.distancia_metros : 0;
      const entry = pairs.get(key);
      if (entry) {
        entry.count += 1;
        entry.avgDist = (entry.avgDist * (entry.count - 1) + dist) / entry.count;
        if (dist > 0 && (entry.minDist === 0 || dist < entry.minDist)) entry.minDist = dist;
      } else {
        pairs.set(key, {
          lineaPropia: a.linea_id,
          empresaRival: a.rival_empresa,
          lineaRival: a.rival_linea,
          count: 1,
          avgDist: dist,
          minDist: dist,
        });
      }
    }
    return [...pairs.values()].sort((a, b) => b.count - a.count).slice(0, 15);
  }, [filtered]);

  // ── Export ─────────────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    if (filtered.length === 0) return;
    const wb = XLSX.utils.book_new();

    const sheet1 = XLSX.utils.json_to_sheet(
      filtered.slice(0, 5000).map((a) => ({
        Fecha: a.timestamp?.toDate?.()?.toLocaleString('es-UY') ?? '',
        Tipo: a.tipo,
        'Coche propio': a.coche_id,
        'Línea propia': a.linea_id,
        'Empresa ID': a.empresa_id ?? '',
        'Empresa rival': a.rival_empresa ?? '',
        'Línea rival': a.rival_linea ?? '',
        'Distancia (m)': a.distancia_metros ?? '',
        Instrucción: a.instruccion ?? '',
        Fuente: a.fuente ?? '',
      })),
    );
    XLSX.utils.book_append_sheet(wb, sheet1, 'Eventos');

    const sheet2 = XLSX.utils.json_to_sheet(
      topDuelos.map((d) => ({
        'Línea propia': d.lineaPropia,
        'Empresa rival': d.empresaRival,
        'Línea rival': d.lineaRival,
        'Eventos totales': d.count,
        'Distancia promedio (m)': Math.round(d.avgDist),
        'Mínima distancia (m)': d.minDist,
      })),
    );
    XLSX.utils.book_append_sheet(wb, sheet2, 'Top Duelos');

    const sheet3 = XLSX.utils.json_to_sheet(
      dailySeries.map((d) => ({ Día: d.date, Total: d.total, Críticos: d.criticos })),
    );
    XLSX.utils.book_append_sheet(wb, sheet3, 'Serie diaria');

    const sheet4 = XLSX.utils.json_to_sheet(
      hourlyDistribution.map((h) => ({ Hora: h.hour, Eventos: h.count })),
    );
    XLSX.utils.book_append_sheet(wb, sheet4, 'Distribución horaria');

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `skillroute-shadow-analytics-${date}.xlsx`);
  }, [filtered, topDuelos, dailySeries, hourlyDistribution]);

  // ── UI ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 p-6 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Cargando histórico de eventos…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 p-6">
        <div className="max-w-xl mx-auto bg-red-950/30 border border-red-800/50 rounded-xl p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-red-300">Error al cargar eventos</div>
            <div className="text-red-400/80 text-sm mt-1">{error}</div>
            <button
              onClick={load}
              className="mt-3 px-3 py-1.5 bg-red-800/40 hover:bg-red-800/60 text-red-200 rounded text-xs"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6 font-sans text-slate-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-slate-800 pb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-fuchsia-400 to-amber-400 bg-clip-text text-transparent flex items-center gap-3">
            <Activity className="w-8 h-8 text-fuchsia-400" />
            Analytics Shadow — Histórico de competencia
          </h1>
          <p className="text-slate-400 mt-2 text-sm max-w-3xl">
            Análisis retrospectivo de eventos de bunching y competencia cross-operador
            detectados por el Radar Shadow. Insights para optimización operacional y
            pitch comercial. Base metodológica: TCRP 100 (Bunching Analysis) + TfL iBus
            performance reports.
          </p>
          {lastLoadedAt && (
            <div className="text-xs text-slate-600 mt-2">
              {filtered.length.toLocaleString('es-UY')} eventos cargados · sincronizado {lastLoadedAt.toLocaleTimeString('es-UY')}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={daysBack}
            onChange={(e) => setDaysBack(Number(e.target.value))}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
            title="Rango temporal"
          >
            <option value={1}>Últimas 24h</option>
            <option value={3}>Últimos 3 días</option>
            <option value={7}>Últimos 7 días</option>
            <option value={14}>Últimos 14 días</option>
            <option value={30}>Últimos 30 días</option>
          </select>
          <select
            value={filterEmpresa}
            onChange={(e) => setFilterEmpresa(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
            title="Empresa propia"
          >
            <option value="">Todos los operadores</option>
            <option value="70">UCOT</option>
            <option value="50">CUTCSA</option>
            <option value="20">COME</option>
            <option value="10">COETC</option>
          </select>
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-fuchsia-600/80 hover:bg-fuchsia-500 text-white font-bold rounded-lg text-sm shadow-lg disabled:opacity-50"
            title="Exportar a Excel (4 hojas)"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">Eventos totales</div>
          <div className="text-3xl font-bold text-fuchsia-400 mt-1">{kpis.total.toLocaleString('es-UY')}</div>
          <div className="text-[10px] text-slate-600 mt-1">ventana de {daysBack} día{daysBack > 1 ? 's' : ''}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">Eventos críticos</div>
          <div className="text-3xl font-bold text-red-400 mt-1">{kpis.criticos.toLocaleString('es-UY')}</div>
          <div className="text-[10px] text-slate-600 mt-1">{kpis.pctCriticos}% del total (RIVAL_PISANDO_TURNO)</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">Líneas afectadas</div>
          <div className="text-3xl font-bold text-amber-400 mt-1">{kpis.lineasUnicas}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">Operadores involucrados</div>
          <div className="text-3xl font-bold text-cyan-400 mt-1">{kpis.operadoresInvolucrados}</div>
        </div>
      </div>

      {/* Serie temporal */}
      <section className="mb-6 bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-fuchsia-400" />
          Evolución diaria — últimos {daysBack} día{daysBack > 1 ? 's' : ''}
        </h2>
        {filtered.length === 0 ? (
          <EmptySeries days={daysBack} />
        ) : (
          <div style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer>
              <LineChart data={dailySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="dateShort" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <ReTooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="total" stroke="#e879f9" strokeWidth={2} dot={{ r: 3 }} name="Total" />
                <Line type="monotone" dataKey="criticos" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Críticos" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Distribución horaria */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            Patrón horario — picos de bunching
          </h2>
          {filtered.length === 0 ? (
            <div className="text-slate-500 text-sm text-center py-8">Sin eventos en el período</div>
          ) : (
            <div style={{ width: '100%', height: 230 }}>
              <ResponsiveContainer>
                <BarChart data={hourlyDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="hour" stroke="#64748b" fontSize={10} interval={2} />
                  <YAxis stroke="#64748b" fontSize={10} />
                  <ReTooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                  />
                  <Bar dataKey="count" name="Eventos">
                    {hourlyDistribution.map((e, i) => (
                      <Cell key={i} fill={e.isPeak ? '#f59e0b' : '#64748b'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="text-[10px] text-slate-500 mt-2">
            Horas pico destacadas en ámbar (7-9h y 17-20h según patrón operativo estándar Montevideo).
          </p>
        </section>

        {/* Top líneas */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
            <Gauge className="w-4 h-4 text-red-400" />
            Top 10 líneas con más eventos
          </h2>
          {topLines.length === 0 ? (
            <div className="text-slate-500 text-sm text-center py-8">Sin eventos en el período</div>
          ) : (
            <div className="space-y-1.5">
              {topLines.map((l) => {
                const pctCritico = l.count > 0 ? (l.criticos / l.count) * 100 : 0;
                return (
                  <div key={l.linea} className="flex items-center gap-2 text-xs">
                    <div className="w-14 font-mono font-bold text-slate-300">L {l.linea}</div>
                    <div className="flex-1 bg-slate-800/60 rounded-full overflow-hidden h-5 relative">
                      <div
                        className="h-full bg-red-500/50"
                        style={{ width: `${(l.criticos / (topLines[0]?.count || 1)) * 100}%` }}
                      />
                      <div
                        className="h-full bg-amber-500/30 absolute top-0"
                        style={{
                          left: `${(l.criticos / (topLines[0]?.count || 1)) * 100}%`,
                          width: `${((l.count - l.criticos) / (topLines[0]?.count || 1)) * 100}%`,
                        }}
                      />
                      <div className="absolute inset-0 flex items-center justify-end px-2 text-[10px] font-mono text-white/90">
                        {l.count} ({pctCritico.toFixed(0)}% crít)
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Top duelos */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
          <Swords className="w-4 h-4 text-amber-400" />
          Top duelos rivales — pares más frecuentes
        </h2>
        <p className="text-[10px] text-slate-500 mb-3">
          Pares (línea propia ↔ línea rival) con mayor frecuencia de eventos. Un par que aparece muchas
          veces con distancia mínima baja es un corredor crítico para negociación operativa o re-spacing.
        </p>
        {topDuelos.length === 0 ? (
          <div className="text-slate-500 text-sm text-center py-8">Sin duelos registrados en el período</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 uppercase tracking-wider border-b border-slate-800">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Línea propia</th>
                  <th className="px-3 py-2">Empresa rival</th>
                  <th className="px-3 py-2">Línea rival</th>
                  <th className="px-3 py-2 text-right">Eventos</th>
                  <th className="px-3 py-2 text-right">Dist. promedio</th>
                  <th className="px-3 py-2 text-right">Mín. registrada</th>
                </tr>
              </thead>
              <tbody>
                {topDuelos.map((d, i) => (
                  <tr key={`${d.lineaPropia}_${d.empresaRival}_${d.lineaRival}`} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-3 py-2 text-slate-600">{i + 1}</td>
                    <td className="px-3 py-2 font-mono font-bold">L {d.lineaPropia}</td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-1.5"
                        style={{ background: EMPRESA_COLOR[d.empresaRival] ?? '#94a3b8' }}
                      />
                      {d.empresaRival}
                    </td>
                    <td className="px-3 py-2 font-mono">L {d.lineaRival}</td>
                    <td className="px-3 py-2 text-right font-mono text-fuchsia-400 font-bold">
                      {d.count}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400">
                      {Math.round(d.avgDist)} m
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-red-400 font-bold">
                      {d.minDist} m
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Nota pie */}
      <div className="mt-6 text-center text-[10px] text-slate-600">
        SkillRoute · Analytics Shadow · TCRP 100 bunching framework · datos de{' '}
        <code className="bg-slate-900 px-1 rounded">alertas_regulacion</code>
      </div>
    </div>
  );
}

// ─── Empty state de la serie temporal ───────────────────────────────────────

function EmptySeries({ days }: { days: number }) {
  return (
    <div className="py-12 text-center">
      <Activity className="w-10 h-10 text-slate-700 mx-auto mb-3" />
      <div className="text-sm text-slate-400">
        Sin eventos en los últimos {days} día{days > 1 ? 's' : ''}.
      </div>
      <div className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
        Posibles causas: shadowDispatcher backend o frontend no han registrado alertas en la
        ventana seleccionada, o filtro de empresa demasiado restrictivo. Ampliá el rango o quitá
        el filtro.
      </div>
    </div>
  );
}
