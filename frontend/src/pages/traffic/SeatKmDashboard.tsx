/**
 * SeatKmDashboard — Market Share por Oferta (Seat-km) cross-operador.
 *
 * Muestra qué porcentaje de la oferta total del sistema metropolitano
 * (medida en asiento-kilómetro) corresponde a cada operador.
 *
 * Metodología visible: seat-km = viajes GTFS × longitud ruta × capacidad estimada.
 */

import { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, doc, getDoc, query, where } from '../../config/firestoreShim';
import { db } from '../../config/firebase';
import {
  PieChart, Pie, Cell, Tooltip as RechartTooltip, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from 'recharts';
import {
  AlertTriangle, RefreshCw, ChevronUp, ChevronDown,
  TrendingUp, Bus, Route, Info,
} from 'lucide-react';

// ─── Tipos ─────────────────────────────────────────────────────────────────────

interface EmpresaKpi {
  seatKm: number;
  pct: number;
  lineasActivas: number;
  viajesEstimados: number;
  capacidadPromedio: number;
}

interface CorredorRow {
  shapeKey: string;
  linea: string;
  agencyId: string;
  empresa: string;
  longKm: number;
  viajesEstimados: number;
  capacidadPromedio: number;
  seatKm: number;
  pct: number;
}

interface SeatKmSnapshot {
  date: string;
  svcType: string;
  empresas: Record<string, EmpresaKpi>;
  total: number;
  lineasConDatos: number;
  corredores: CorredorRow[];
  metodologia: {
    versionAsunciones: number;
    capacidadesPorEmpresa: Record<string, number>;
  };
}

// ─── Constantes visuales ──────────────────────────────────────────────────────

const EMPRESA_META: Record<string, { nombre: string; color: string; colorBg: string; colorBorder: string }> = {
  '70': { nombre: 'UCOT',   color: '#eab308', colorBg: 'bg-yellow-500/10',  colorBorder: 'border-yellow-500/30' },
  '50': { nombre: 'CUTCSA', color: '#3b82f6', colorBg: 'bg-blue-500/10',    colorBorder: 'border-blue-500/30'   },
  '20': { nombre: 'COME',   color: '#10b981', colorBg: 'bg-emerald-500/10', colorBorder: 'border-emerald-500/30' },
  '10': { nombre: 'COETC',  color: '#8b5cf6', colorBg: 'bg-violet-500/10',  colorBorder: 'border-violet-500/30' },
};

const ORDEN_EMPRESAS = ['70', '50', '20', '10'];

function fmtSeatKm(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} M`;
  if (v >= 1_000)    return `${(v / 1_000).toFixed(0)} K`;
  return v.toLocaleString();
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

// ─── Modo fallback: calcula desde Firestore en cliente ───────────────────────
// Se usa cuando no existe snapshot del día.

const CAPACITY_FALLBACK: Record<string, number> = { '10': 60, '20': 60, '50': 95, '70': 80 };

interface FallbackShape {
  agencyId: string; empresa: string; linea: string; sentido: string; lengthMeters: number;
}
interface FallbackTimetable {
  agencyId: string; linea: string; directionId: number; serviceType: string;
  viajes: unknown[];
}

async function calcularEnCliente(): Promise<SeatKmSnapshot> {
  const day = new Date().getDay();
  const svcType = day === 0 ? 'DOMINGO' : day === 6 ? 'SABADO' : 'HABIL';

  const [shapesSnap, ttSnap] = await Promise.all([
    getDocs(collection(db, 'shapes_cross_operator')),
    getDocs(query(collection(db, 'gtfs_timetable'), where('serviceType', '==', svcType))),
  ]);

  const shapesMap = new Map<string, number>();
  for (const d of shapesSnap.docs) {
    const s = d.data() as FallbackShape;
    if (!s.lengthMeters || s.lengthMeters <= 0) continue;
    const dir = s.sentido === 'IDA' ? 0 : 1;
    shapesMap.set(`${s.agencyId}|${s.linea}|${dir}`, s.lengthMeters);
  }

  const corredores: CorredorRow[] = [];
  for (const d of ttSnap.docs) {
    const t = d.data() as FallbackTimetable;
    if (!t.agencyId || !t.linea || !Array.isArray(t.viajes)) continue;
    const lm = shapesMap.get(`${t.agencyId}|${t.linea}|${t.directionId}`) ?? 0;
    if (lm === 0 || t.viajes.length === 0) continue;
    const cap = CAPACITY_FALLBACK[t.agencyId] ?? 70;
    const seatKm = Math.round(t.viajes.length * (lm / 1000) * cap);
    corredores.push({
      shapeKey: `${t.agencyId}|${t.linea}|${t.directionId}`,
      linea: t.linea, agencyId: t.agencyId,
      empresa: EMPRESA_META[t.agencyId]?.nombre ?? t.agencyId,
      longKm: Math.round(lm / 100) / 10,
      viajesEstimados: t.viajes.length,
      capacidadPromedio: cap, seatKm, pct: 0,
    });
  }

  const total = corredores.reduce((s, r) => s + r.seatKm, 0);
  for (const r of corredores) r.pct = total > 0 ? Math.round(r.seatKm / total * 10000) / 100 : 0;
  corredores.sort((a, b) => b.seatKm - a.seatKm);

  const empresaMap = new Map<string, { sk: number; v: number; l: Set<string> }>();
  for (const r of corredores) {
    if (!empresaMap.has(r.agencyId)) empresaMap.set(r.agencyId, { sk: 0, v: 0, l: new Set() });
    const e = empresaMap.get(r.agencyId)!;
    e.sk += r.seatKm; e.v += r.viajesEstimados; e.l.add(r.linea);
  }
  const empresas: Record<string, EmpresaKpi> = {};
  for (const [aid, e] of empresaMap) {
    empresas[aid] = {
      seatKm: e.sk, pct: total > 0 ? Math.round(e.sk / total * 10000) / 100 : 0,
      lineasActivas: e.l.size, viajesEstimados: e.v,
      capacidadPromedio: CAPACITY_FALLBACK[aid] ?? 70,
    };
  }

  return {
    date: todayStr(), svcType, empresas, total,
    lineasConDatos: corredores.length, corredores: corredores.slice(0, 500),
    metodologia: { versionAsunciones: 1, capacidadesPorEmpresa: CAPACITY_FALLBACK },
  };
}

// ─── Hook de datos ─────────────────────────────────────────────────────────────

function useSeatKmData() {
  const [snapshot, setSnapshot]   = useState<SeatKmSnapshot | null>(null);
  const [loading, setLoading]     = useState(true);
  const [modoFallback, setModoFallback] = useState(false);
  const [history, setHistory]     = useState<Array<{ date: string; empresas: Record<string, EmpresaKpi> }>>([]);

  async function cargar() {
    setLoading(true);
    try {
      // Intentar leer snapshot del día desde Firestore
      const docSnap = await getDoc(doc(db, 'seat_km_snapshot', todayStr()));
      if (docSnap.exists()) {
        setSnapshot(docSnap.data() as SeatKmSnapshot);
        setModoFallback(false);
      } else {
        // Fallback: calcular en cliente
        const calc = await calcularEnCliente();
        setSnapshot(calc);
        setModoFallback(true);
      }

      // Últimos 7 días para sparkline histórico
      const dateArr = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
      }).reverse();
      const histSnaps = await Promise.all(
        dateArr.map(d => getDoc(doc(db, 'seat_km_snapshot', d)))
      );
      const hist = histSnaps
        .filter(s => s.exists())
        .map(s => ({ date: s.id, empresas: (s.data() as SeatKmSnapshot).empresas }));
      setHistory(hist);
    } catch (err) {
      console.error('[SeatKm] Error cargando datos:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void cargar(); }, []); // eslint-disable-line
  return { snapshot, loading, modoFallback, history, recargar: cargar };
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function DonutMarketShare({ empresas }: { empresas: Record<string, EmpresaKpi> }) {
  const data = ORDEN_EMPRESAS
    .filter(aid => empresas[aid] && empresas[aid].seatKm > 0)
    .map(aid => ({
      name: EMPRESA_META[aid]?.nombre ?? aid,
      value: empresas[aid].seatKm,
      pct:   empresas[aid].pct,
      color: EMPRESA_META[aid]?.color ?? '#94a3b8',
    }));

  if (data.length === 0) return null;

  return (
    <div className="flex flex-col items-center">
      <PieChart width={260} height={220}>
        <Pie
          data={data} cx={130} cy={100}
          innerRadius={60} outerRadius={100}
          paddingAngle={2} dataKey="value"
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} stroke="transparent" />
          ))}
        </Pie>
        <RechartTooltip
          content={({ payload }) => {
            if (!payload?.length) return null;
            const d = payload[0].payload;
            return (
              <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs">
                <div className="text-white font-bold">{d.name}</div>
                <div className="text-slate-300">{fmtSeatKm(d.value)} seat-km</div>
                <div className="text-slate-400">{d.pct.toFixed(1)}% del sistema</div>
              </div>
            );
          }}
        />
        <Legend
          formatter={(value, entry) => (
            <span className="text-xs text-slate-300">
              {value} <span className="text-slate-500">
                {((entry.payload as { pct: number }).pct ?? 0).toFixed(1)}%
              </span>
            </span>
          )}
        />
      </PieChart>
    </div>
  );
}

function SparklineHistorico({
  history,
}: { history: Array<{ date: string; empresas: Record<string, EmpresaKpi> }> }) {
  if (history.length < 2) {
    return (
      <div className="flex items-center justify-center h-24 text-slate-600 text-xs">
        Sin datos históricos aún — el cron corre diariamente a las 03:00
      </div>
    );
  }
  const datos = history.map(h => ({
    fecha: h.date.slice(5), // MM-DD
    ...Object.fromEntries(
      ORDEN_EMPRESAS
        .filter(aid => h.empresas[aid])
        .map(aid => [EMPRESA_META[aid].nombre, h.empresas[aid].pct])
    ),
  }));
  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={datos} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: '#64748b' }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} unit="%" width={32} />
        {ORDEN_EMPRESAS
          .filter(aid => datos[0]?.[EMPRESA_META[aid].nombre] !== undefined)
          .map(aid => (
            <Line
              key={aid}
              type="monotone"
              dataKey={EMPRESA_META[aid].nombre}
              stroke={EMPRESA_META[aid].color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        <RechartTooltip
          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 8 }}
          labelStyle={{ color: '#94a3b8', fontSize: 11 }}
          itemStyle={{ fontSize: 11 }}
          formatter={(v: unknown) => [`${Number(v).toFixed(1)}%`, '']}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

type SortKey = 'seatKm' | 'pct' | 'longKm' | 'viajesEstimados';

function TablaCorredor({ corredores }: { corredores: CorredorRow[] }) {
  const [sortKey, setSortKey]   = useState<SortKey>('seatKm');
  const [sortAsc, setSortAsc]   = useState(false);
  const [filter, setFilter]     = useState('');
  const [empresa, setEmpresa]   = useState<string>('all');

  const sorted = useMemo(() => {
    let list = corredores.filter(r => {
      if (empresa !== 'all' && r.agencyId !== empresa) return false;
      if (filter && !r.linea.toLowerCase().includes(filter.toLowerCase()) &&
          !r.empresa.toLowerCase().includes(filter.toLowerCase())) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      const diff = (a[sortKey] as number) - (b[sortKey] as number);
      return sortAsc ? diff : -diff;
    });
    return list;
  }, [corredores, sortKey, sortAsc, filter, empresa]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc(a => !a);
    else { setSortKey(k); setSortAsc(false); }
  };
  const Ic = ({ k }: { k: SortKey }) => sortKey === k
    ? (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
    : <ChevronUp className="w-3 h-3 opacity-20" />;

  return (
    <div className="flex flex-col h-full">
      {/* Filtros */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <input
          type="text" placeholder="Filtrar línea o empresa…"
          value={filter} onChange={e => setFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none w-48"
        />
        <select
          value={empresa} onChange={e => setEmpresa(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
        >
          <option value="all">Todos los operadores</option>
          {ORDEN_EMPRESAS.map(aid => (
            <option key={aid} value={aid}>{EMPRESA_META[aid].nombre}</option>
          ))}
        </select>
        <span className="text-slate-500 text-xs">{sorted.length} corredores</span>
      </div>

      <div className="overflow-auto flex-1 rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-900/95 backdrop-blur">
            <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
              <th className="px-4 py-3 text-left">Línea</th>
              <th className="px-4 py-3 text-left">Empresa</th>
              <th className="px-4 py-3 text-right cursor-pointer hover:text-slate-300 select-none" onClick={() => toggleSort('longKm')}>
                <span className="flex items-center justify-end gap-1">Long. km <Ic k="longKm" /></span>
              </th>
              <th className="px-4 py-3 text-right cursor-pointer hover:text-slate-300 select-none" onClick={() => toggleSort('viajesEstimados')}>
                <span className="flex items-center justify-end gap-1">Viajes/día <Ic k="viajesEstimados" /></span>
              </th>
              <th className="px-4 py-3 text-right">Capacidad</th>
              <th className="px-4 py-3 text-right cursor-pointer hover:text-slate-300 select-none" onClick={() => toggleSort('seatKm')}>
                <span className="flex items-center justify-end gap-1">Seat-km <Ic k="seatKm" /></span>
              </th>
              <th className="px-4 py-3 text-right cursor-pointer hover:text-slate-300 select-none" onClick={() => toggleSort('pct')}>
                <span className="flex items-center justify-end gap-1">% sistema <Ic k="pct" /></span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const meta = EMPRESA_META[r.agencyId];
              return (
                <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-2.5 font-bold text-white">{r.linea}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ color: meta?.color, backgroundColor: `${meta?.color}20` }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta?.color }} />
                      {r.empresa}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-300 font-mono text-xs">{r.longKm.toFixed(1)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-300 font-mono text-xs">{r.viajesEstimados}</td>
                  <td className="px-4 py-2.5 text-right text-slate-400 text-xs">{r.capacidadPromedio} asientos</td>
                  <td className="px-4 py-2.5 text-right text-white font-semibold font-mono text-xs">{fmtSeatKm(r.seatKm)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(r.pct * 5, 100)}%`, backgroundColor: meta?.color }}
                        />
                      </div>
                      <span className="text-slate-300 text-xs font-mono w-10 text-right">{r.pct.toFixed(2)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SeatKmDashboard() {
  const { snapshot, loading, modoFallback, history, recargar } = useSeatKmData();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
        <span className="ml-3 text-slate-400 text-sm">
          {modoFallback ? 'Calculando desde GTFS + shapes…' : 'Cargando snapshot…'}
        </span>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        Sin datos disponibles.
      </div>
    );
  }

  const empresasOrdenadas = ORDEN_EMPRESAS.filter(aid => snapshot.empresas[aid]);

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Route className="w-5 h-5 text-blue-400" />
            Seat-km Market Share
          </h2>
          <p className="text-slate-400 text-xs mt-0.5">
            Oferta del sistema metropolitano · {snapshot.date}
            {modoFallback && (
              <span className="ml-2 text-amber-400 font-medium">Calculado en tiempo real</span>
            )}
            {!modoFallback && (
              <span className="ml-2 text-emerald-400 font-medium">Snapshot diario {snapshot.svcType}</span>
            )}
          </p>
        </div>
        <button
          onClick={recargar}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Recalcular
        </button>
      </div>

      {/* ── Banner metodología ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-900/10 p-3">
        <div className="flex gap-2 items-start">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-300/80 leading-relaxed">
            <strong className="text-amber-300">Metodología de estimación —</strong>{' '}
            Seat-km = viajes GTFS × longitud de ruta (shapes GPS) × capacidad promedio por empresa.
            Capacidades asumidas: CUTCSA {snapshot.metodologia.capacidadesPorEmpresa['50'] ?? 95} asientos
            · UCOT {snapshot.metodologia.capacidadesPorEmpresa['70'] ?? 80}
            · COME {snapshot.metodologia.capacidadesPorEmpresa['20'] ?? 60}
            · COETC {snapshot.metodologia.capacidadesPorEmpresa['10'] ?? 60}.{' '}
            <strong>Este indicador mide oferta disponible, no pasajeros transportados.</strong>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {empresasOrdenadas.map(aid => {
          const kpi  = snapshot.empresas[aid];
          const meta = EMPRESA_META[aid];
          return (
            <div
              key={aid}
              className={`rounded-xl p-4 border ${meta.colorBorder} ${meta.colorBg}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: meta.color }} />
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">{meta.nombre}</span>
              </div>
              <div className="text-2xl font-black" style={{ color: meta.color }}>
                {kpi.pct.toFixed(1)}%
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{fmtSeatKm(kpi.seatKm)} seat-km</div>
              <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Bus className="w-3 h-3" />{kpi.lineasActivas} líneas
                </span>
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />{kpi.viajesEstimados.toLocaleString()} viajes
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Donut + Sparkline ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <Info className="w-4 h-4 text-slate-500" />
            Distribución actual
          </h3>
          <DonutMarketShare empresas={snapshot.empresas} />
        </div>

        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-500" />
            Evolución últimos 7 días (%)
          </h3>
          <SparklineHistorico history={history} />
        </div>
      </div>

      {/* ── Tabla de corredores ──────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5 flex flex-col" style={{ minHeight: 400 }}>
        <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <Route className="w-4 h-4 text-slate-500" />
          Corredores — {snapshot.lineasConDatos} con datos
          <span className="ml-auto text-xs text-slate-600 font-normal">
            Total sistema: {fmtSeatKm(snapshot.total)} seat-km/día
          </span>
        </h3>
        <TablaCorredor corredores={snapshot.corredores} />
      </div>
    </div>
  );
}
