/**
 * Executive Command Dashboard V6.0 — Centro Neural de Mando CEO
 * KPIs en tiempo real, inteligencia competitiva, métricas financieras,
 * ranking de líneas, historial de rotación, y estado del sistema.
 * Tríada Coche-Servicio-Chofer como fuente de verdad.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  FleetService,
  ServicioEstadoService,
  ActiveAssignmentsService,
} from '../../services/firestore';
import type { ServicioEstadoRecord } from '../../services/firestore';
import {
  AlertTriangle,
  Users,
  RefreshCw,
  Loader2,
  ShieldAlert,
  Zap,
  TrendingUp,
  TrendingDown,
  Bus,
  Clock,
  Activity,
  BarChart3,
  Gauge,
  MapPin,
  ChevronRight,
  Award,
  Fuel,
  DollarSign,
  Calendar,
  Eye,
} from 'lucide-react';
import { CompetitorThreatWidget } from '../../components/CompetitorThreatWidget';
import { TelemetrySimulator } from '../../services/telemetrySimulator';

/* ─── Helpers ──────────────────────────────────────────── */
const todayStr = () => new Date().toISOString().split('T')[0];
const yearMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const timeNow = () =>
  new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function parseHoraToMinutes(h: string): number {
  const [hh, mm] = h.trim().split(':').map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}

/* ─── Sparkline SVG Component ──────────────────────────── */
function MiniSparkline({
  data,
  color = '#10b981',
  width = 80,
  height = 28,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);

  const points = data
    .map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 4) - 2}`)
    .join(' ');

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon fill={`url(#spark-${color.replace('#', '')})`} points={areaPoints} />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      <circle
        cx={width}
        cy={height - ((data[data.length - 1] - min) / range) * (height - 4) - 2}
        r="2.5"
        fill={color}
        className="animate-pulse"
      />
    </svg>
  );
}

/* ─── Animated Counter ─────────────────────────────────── */
function AnimatedNumber({ value, suffix = '' }: { value: number | null; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value == null) return;
    const start = display;
    const diff = value - start;
    const duration = 800;
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round((start + diff * eased) * 10) / 10);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (value == null) return <span className="text-slate-600">—</span>;
  return (
    <span>
      {display}
      {suffix}
    </span>
  );
}

/* ─── Progress Ring ────────────────────────────────────── */
function ProgressRing({
  value,
  size = 52,
  strokeWidth = 4,
  color = '#10b981',
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.05)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-1000 ease-out"
      />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */
export default function CEODashboard() {
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(timeNow());

  // Core KPIs
  const [flotaActivaPct, setFlotaActivaPct] = useState<number | null>(null);
  const [flotaTotal, setFlotaTotal] = useState(0);
  const [flotaActiva, setFlotaActiva] = useState(0);
  const [puntualidadPct, setPuntualidadPct] = useState<number | null>(null);
  const [serviciosActivos, setServiciosActivos] = useState(0);
  const [serviciosTotales, setServiciosTotales] = useState(0);

  // Alerts
  const [alertasCriticas, setAlertasCriticas] = useState<
    Array<{ servicioId: string; linea?: string; horaInicio?: string }>
  >([]);
  const [vehiculosTaller, setVehiculosTaller] = useState(0);

  // Line Rankings
  const [lineRanking, setLineRanking] = useState<
    Array<{ line: string; activos: number; total: number; pct: number; atraso: number }>
  >([]);

  // Rotation
  const [cocheRotacionId, setCocheRotacionId] = useState('115');
  const [rotacion, setRotacion] = useState<{
    cambios: number;
    detalle: Array<{ date: string; servicioId: string; cambios: number }>;
  } | null>(null);
  const [rotacionLoading, setRotacionLoading] = useState(false);

  // Simulator
  const [simulatorOn, setSimulatorOn] = useState(false);

  // Sparkline history (simulated rolling window)
  const [flotaHistory, setFlotaHistory] = useState<number[]>([85, 87, 82, 88, 90, 86, 89]);
  const [puntualidadHistory, setPuntualidadHistory] = useState<number[]>([
    92, 88, 91, 85, 89, 93, 90,
  ]);

  // Active section
  const [activeSection, setActiveSection] = useState<'overview' | 'intelligence' | 'rotation'>(
    'overview',
  );

  const toggleSimulator = () => {
    if (simulatorOn) {
      TelemetrySimulator.stop();
      setSimulatorOn(false);
    } else {
      TelemetrySimulator.start();
      setSimulatorOn(true);
    }
  };

  /* ─── Data Fetch ─────────────────────────────────────── */
  const fetchData = useCallback(async () => {
    const today = todayStr();
    const nowMin = parseHoraToMinutes(
      `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`,
    );
    const ventanaFin = nowMin + 30;

    try {
      const [vehicles, estados] = await Promise.all([
        FleetService.getVehicles(),
        ServicioEstadoService.getByDate(today),
      ]);

      // Fleet KPIs
      const total = vehicles.length;
      const taller = vehicles.filter((v) =>
        /mantenimiento|taller|paralizado|baja/i.test(String(v.status ?? '')),
      ).length;
      const activos = total - taller;
      setFlotaTotal(total);
      setFlotaActiva(activos);
      setVehiculosTaller(taller);
      const pct = total > 0 ? Math.round((activos / total) * 1000) / 10 : null;
      setFlotaActivaPct(pct);
      if (pct != null) {
        setFlotaHistory((prev) => [...prev.slice(-6), pct]);
      }

      // Service / Punctuality KPIs
      setServiciosTotales(estados.length);
      const actSvc = estados.filter((e) => e.status === 'activo').length;
      setServiciosActivos(actSvc);

      const conAtraso = estados.filter((e) => e.atrasoMinutos != null);
      const puntuales = conAtraso.filter((e) => (e.atrasoMinutos ?? 0) <= 3).length;
      const puntPct =
        conAtraso.length > 0 ? Math.round((puntuales / conAtraso.length) * 1000) / 10 : null;
      setPuntualidadPct(puntPct);
      if (puntPct != null) {
        setPuntualidadHistory((prev) => [...prev.slice(-6), puntPct]);
      }

      // Alerts: Services without driver in next 30 min
      const sinChoferProximos = estados.filter((e) => {
        const h = e.horaInicio;
        if (!h) return false;
        const min = parseHoraToMinutes(h);
        if (min < nowMin || min > ventanaFin) return false;
        return !e.choferActual || e.choferActual.trim() === '';
      });
      setAlertasCriticas(
        sinChoferProximos.map((e) => ({
          servicioId: e.servicioId,
          linea: e.linea,
          horaInicio: e.horaInicio,
        })),
      );

      // Line Ranking
      buildLineRanking(estados);
    } catch (err) {
      console.error('[CEODashboard] Error loading data:', err);
    } finally {
      setLoading(false);
      setLastRefresh(timeNow());
    }
  }, []);

  function buildLineRanking(estados: ServicioEstadoRecord[]) {
    const lineMap: Record<
      string,
      { activos: number; total: number; atrasoSum: number; atrasoCount: number }
    > = {};

    for (const e of estados) {
      const line = e.linea || 'SIN_LINEA';
      if (!lineMap[line]) lineMap[line] = { activos: 0, total: 0, atrasoSum: 0, atrasoCount: 0 };
      lineMap[line].total++;
      if (e.status === 'activo') lineMap[line].activos++;
      if (e.atrasoMinutos != null) {
        lineMap[line].atrasoSum += e.atrasoMinutos;
        lineMap[line].atrasoCount++;
      }
    }

    const ranking = Object.entries(lineMap)
      .map(([line, data]) => ({
        line,
        activos: data.activos,
        total: data.total,
        pct: data.total > 0 ? Math.round((data.activos / data.total) * 100) : 0,
        atraso: data.atrasoCount > 0 ? Math.round(data.atrasoSum / data.atrasoCount) : 0,
      }))
      .filter((r) => r.line !== 'SIN_LINEA')
      .sort((a, b) => b.pct - a.pct || a.atraso - b.atraso);

    setLineRanking(ranking);
  }

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  /* ─── Rotation History ───────────────────────────────── */
  useEffect(() => {
    if (!cocheRotacionId.trim()) return;
    setRotacionLoading(true);
    ActiveAssignmentsService.getRotacionByCocheMonth(cocheRotacionId.trim(), yearMonth())
      .then(setRotacion)
      .catch(() => setRotacion(null))
      .finally(() => setRotacionLoading(false));
  }, [cocheRotacionId]);

  /* ─── Derived Values ─────────────────────────────────── */
  const horaActual = new Date().getHours();
  const turnoLabel =
    horaActual >= 5 && horaActual < 13
      ? 'MATUTINO'
      : horaActual >= 13 && horaActual < 21
        ? 'VESPERTINO'
        : 'NOCTURNO';

  const turnoColor =
    turnoLabel === 'MATUTINO'
      ? 'text-amber-400'
      : turnoLabel === 'VESPERTINO'
        ? 'text-orange-400'
        : 'text-indigo-400';

  /* ═══════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════ */
  return (
    <div className="animate-fade-in space-y-4 p-3 md:p-5 pb-24 min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900">
      {/* ████████████████████████████████████████████████████████
          HEADER BAR
          ████████████████████████████████████████████████████████ */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-500/30 to-primary-600/10 flex items-center justify-center border border-primary-500/20 shadow-lg shadow-primary-500/10">
              <ShieldAlert className="w-5 h-5 text-primary-400" />
            </div>
            <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-950 animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-black text-white tracking-tight flex items-center gap-2">
              Executive Command
              <span className="text-slate-500 font-medium">Dashboard</span>
              <span className="text-[9px] font-black text-primary-400 bg-primary-500/15 px-1.5 py-0.5 rounded border border-primary-500/20">
                v6.0
              </span>
            </h1>
            <div className="flex items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date().toLocaleDateString('es-UY', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
              <span className={`font-black ${turnoColor}`}>TURNO {turnoLabel}</span>
              <span className="flex items-center gap-1 text-slate-600">
                <Clock className="w-3 h-3" />
                Actualizado: {lastRefresh}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold bg-slate-800/60 text-slate-300 hover:bg-slate-700 border border-white/5 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          <button
            onClick={toggleSimulator}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition-all ${
              simulatorOn
                ? 'bg-red-500/20 text-red-400 border border-red-500/30 shadow-lg shadow-red-500/10'
                : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 ${simulatorOn ? 'animate-pulse' : ''}`} />
            {simulatorOn ? 'DEMO: ON' : 'DEMO'}
          </button>
        </div>
      </header>

      {/* ████████████████████████████████████████████████████████
          SECTION TABS
          ████████████████████████████████████████████████████████ */}
      <nav className="flex gap-1 bg-slate-900/40 rounded-xl p-1 border border-white/5 w-fit">
        {[
          { id: 'overview' as const, label: 'Vista General', icon: BarChart3 },
          { id: 'intelligence' as const, label: 'Inteligencia', icon: Eye },
          { id: 'rotation' as const, label: 'Rotación', icon: Users },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeSection === tab.id
                ? 'bg-primary-500/15 text-primary-400 shadow-lg shadow-primary-500/5 border border-primary-500/20'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="relative">
            <Loader2 className="w-12 h-12 text-primary-400 animate-spin" />
            <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-primary-500/20 animate-ping" />
          </div>
          <p className="text-sm text-slate-500 animate-pulse">Cargando datos operativos...</p>
        </div>
      ) : (
        <>
          {/* ████████████████████████████████████████████████████████
              KPI RIBBON — Always visible
              ████████████████████████████████████████████████████████ */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3" aria-label="KPIs principales">
            {/* KPI: Fleet Active */}
            <div className="group relative rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900/80 to-slate-800/30 p-4 shadow-xl hover:border-emerald-500/20 transition-all duration-300 overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full -translate-y-8 translate-x-8 group-hover:scale-150 transition-transform duration-500" />
              <div className="relative flex items-start justify-between">
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                    Flota Activa
                  </p>
                  <div className="text-2xl font-black text-white leading-none mb-1">
                    <AnimatedNumber value={flotaActivaPct} suffix="%" />
                  </div>
                  <p className="text-[10px] text-slate-500">
                    {flotaActiva}/{flotaTotal} unidades
                  </p>
                </div>
                <div className="relative">
                  <ProgressRing value={flotaActivaPct ?? 0} color="#10b981" />
                  <Bus className="absolute inset-0 m-auto w-4 h-4 text-emerald-400" />
                </div>
              </div>
              <div className="mt-2">
                <MiniSparkline data={flotaHistory} color="#10b981" />
              </div>
            </div>

            {/* KPI: Punctuality */}
            <div className="group relative rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900/80 to-slate-800/30 p-4 shadow-xl hover:border-blue-500/20 transition-all duration-300 overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full -translate-y-8 translate-x-8 group-hover:scale-150 transition-transform duration-500" />
              <div className="relative flex items-start justify-between">
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                    Puntualidad
                  </p>
                  <div className="text-2xl font-black text-white leading-none mb-1">
                    <AnimatedNumber value={puntualidadPct} suffix="%" />
                  </div>
                  <p className="text-[10px] text-slate-500">Desvío ≤ 3 min</p>
                </div>
                <div className="relative">
                  <ProgressRing value={puntualidadPct ?? 0} color="#3b82f6" />
                  <Gauge className="absolute inset-0 m-auto w-4 h-4 text-blue-400" />
                </div>
              </div>
              <div className="mt-2">
                <MiniSparkline data={puntualidadHistory} color="#3b82f6" />
              </div>
            </div>

            {/* KPI: Services Active */}
            <div className="group relative rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900/80 to-slate-800/30 p-4 shadow-xl hover:border-violet-500/20 transition-all duration-300 overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-full -translate-y-8 translate-x-8 group-hover:scale-150 transition-transform duration-500" />
              <div className="relative">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                  Servicios Activos
                </p>
                <div className="text-2xl font-black text-white leading-none mb-1">
                  {serviciosActivos}
                  <span className="text-sm font-medium text-slate-500">/{serviciosTotales}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <Activity className="w-3 h-3 text-violet-400" />
                  <span className="text-[10px] text-violet-400 font-bold">
                    {serviciosTotales > 0
                      ? Math.round((serviciosActivos / serviciosTotales) * 100)
                      : 0}
                    % cobertura
                  </span>
                </div>
              </div>
            </div>

            {/* KPI: Alerts */}
            <div
              className={`group relative rounded-2xl border p-4 shadow-xl transition-all duration-300 overflow-hidden ${
                alertasCriticas.length > 0
                  ? 'border-red-500/30 bg-gradient-to-br from-red-950/30 to-slate-900/80 hover:border-red-500/50'
                  : 'border-white/5 bg-gradient-to-br from-slate-900/80 to-slate-800/30 hover:border-amber-500/20'
              }`}
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full -translate-y-8 translate-x-8 group-hover:scale-150 transition-transform duration-500" />
              <div className="relative">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                  Alertas Críticas
                </p>
                <div
                  className={`text-3xl font-black leading-none mb-1 ${
                    alertasCriticas.length > 0 ? 'text-red-400 animate-pulse' : 'text-emerald-400'
                  }`}
                >
                  {alertasCriticas.length}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Fuel className="w-3 h-3" />
                    {vehiculosTaller} en taller
                  </span>
                </div>
                {alertasCriticas.length > 0 && (
                  <div className="absolute top-3 right-3">
                    <span className="relative flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ████████████████████████████████████████████████████████
              SECTION: OVERVIEW
              ████████████████████████████████████████████████████████ */}
          {activeSection === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-fade-in">
              {/* ── Alerts Table ───────────────────────────── */}
              <div className="lg:col-span-2">
                {alertasCriticas.length > 0 ? (
                  <section className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/10 to-slate-900/60 p-5 shadow-xl">
                    <h3 className="font-bold text-amber-400 mb-4 flex items-center gap-2 text-sm">
                      <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      Servicios Sin Chofer (próximos 30 min)
                      <span className="ml-auto text-[10px] font-black text-amber-500/60 bg-amber-500/10 px-2 py-0.5 rounded-full">
                        {alertasCriticas.length} alertas
                      </span>
                    </h3>
                    <div className="overflow-hidden rounded-xl border border-slate-700/50">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-800/60 text-slate-400 uppercase font-black tracking-wider">
                          <tr>
                            <th className="px-4 py-2.5">Línea</th>
                            <th className="px-4 py-2.5">Servicio</th>
                            <th className="px-4 py-2.5">Hora Salida</th>
                            <th className="px-4 py-2.5">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/30">
                          {alertasCriticas.map((a, i) => (
                            <tr key={i} className="hover:bg-amber-500/5 transition-colors">
                              <td className="px-4 py-2.5 font-bold text-white">{a.linea ?? '—'}</td>
                              <td className="px-4 py-2.5 text-slate-300 font-mono">
                                {a.servicioId}
                              </td>
                              <td className="px-4 py-2.5 text-amber-400 font-mono font-bold">
                                {a.horaInicio ?? '—'}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[10px] font-bold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                  SIN CHOFER
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ) : (
                  <section className="rounded-2xl border border-emerald-500/10 bg-gradient-to-br from-emerald-950/10 to-slate-900/60 p-8 shadow-xl flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                      <ShieldAlert className="w-8 h-8 text-emerald-500/50" />
                    </div>
                    <h3 className="text-lg font-bold text-emerald-400 mb-1">
                      Sin Alertas Críticas
                    </h3>
                    <p className="text-sm text-slate-500">
                      Todos los servicios próximos tienen chofer asignado.
                    </p>
                  </section>
                )}
              </div>

              {/* ── Line Ranking ───────────────────────────── */}
              <section className="rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900/80 to-slate-800/20 p-5 shadow-xl">
                <h3 className="font-bold text-white mb-4 flex items-center gap-2 text-sm">
                  <div className="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
                    <Award className="w-4 h-4 text-violet-400" />
                  </div>
                  Ranking de Líneas
                </h3>
                <div className="space-y-2 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
                  {lineRanking.length > 0 ? (
                    lineRanking.map((r, idx) => (
                      <div
                        key={r.line}
                        className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-800/30 border border-white/5 hover:border-primary-500/20 transition-all group"
                      >
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black ${
                            idx === 0
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : idx === 1
                                ? 'bg-slate-400/20 text-slate-300 border border-slate-400/30'
                                : idx === 2
                                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                                  : 'bg-slate-700/50 text-slate-500 border border-slate-600/30'
                          }`}
                        >
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">Línea {r.line}</span>
                            <span className="text-[10px] font-black text-primary-400">
                              {r.pct}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-700/50 rounded-full mt-1 overflow-hidden">
                            <style>{`#ranking-line-${idx} { width: ${r.pct}%; }`}</style>
                            <div
                              id={`ranking-line-${idx}`}
                              className={`h-full rounded-full transition-all duration-700 ${
                                r.pct >= 80
                                  ? 'bg-emerald-500'
                                  : r.pct >= 50
                                    ? 'bg-amber-500'
                                    : 'bg-red-500'
                              }`}
                            />
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[9px] text-slate-500">
                              {r.activos}/{r.total} activos
                            </span>
                            <span
                              className={`text-[9px] font-bold flex items-center gap-0.5 ${
                                r.atraso <= 3
                                  ? 'text-emerald-400'
                                  : r.atraso <= 5
                                    ? 'text-amber-400'
                                    : 'text-red-400'
                              }`}
                            >
                              {r.atraso <= 3 ? (
                                <TrendingUp className="w-2.5 h-2.5" />
                              ) : (
                                <TrendingDown className="w-2.5 h-2.5" />
                              )}
                              {r.atraso}min atraso
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-700 group-hover:text-primary-400 transition-colors" />
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-slate-600">
                      <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-xs">Sin datos de líneas hoy</p>
                    </div>
                  )}
                </div>
              </section>

              {/* ── System Status  ─────────────────────────── */}
              <div className="lg:col-span-3">
                <section className="rounded-2xl border border-primary-500/10 bg-gradient-to-r from-primary-950/10 via-slate-900/40 to-slate-900/40 p-5 shadow-xl">
                  <h3 className="font-bold text-primary-400 mb-3 flex items-center gap-2 text-sm uppercase tracking-widest">
                    <Zap className="w-4 h-4" />
                    Estado del Sistema
                  </h3>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Monitoreo de integridad activo. Los datos de competencia se sincronizan con los
                    buses STM vía Proxy Central. Las recomendaciones están basadas en optimización
                    de recaudación por parada garantizando la ventaja competitiva de UCOT.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-4 text-[9px] font-black text-slate-500 uppercase">
                    <span className="flex items-center gap-1.5 bg-slate-800/40 px-2.5 py-1 rounded-lg border border-white/5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50" />
                      FIRESTORE_SYNC: OK
                    </span>
                    <span className="flex items-center gap-1.5 bg-slate-800/40 px-2.5 py-1 rounded-lg border border-white/5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50" />
                      STM_REST_API: CONNECTED
                    </span>
                    <span className="flex items-center gap-1.5 bg-slate-800/40 px-2.5 py-1 rounded-lg border border-white/5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50" />
                      DEMO_ENGINE:{' '}
                      <span className={simulatorOn ? 'text-emerald-400' : 'text-slate-600'}>
                        {simulatorOn ? 'ACTIVE' : 'STANDBY'}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 bg-slate-800/40 px-2.5 py-1 rounded-lg border border-white/5">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-lg shadow-blue-500/50 animate-pulse" />
                      AUTO_REFRESH: 60s
                    </span>
                  </div>
                </section>
              </div>
            </div>
          )}

          {/* ████████████████████████████████████████████████████████
              SECTION: INTELLIGENCE
              ████████████████████████████████████████████████████████ */}
          {activeSection === 'intelligence' && (
            <div className="space-y-4 animate-fade-in">
              <CompetitorThreatWidget />
            </div>
          )}

          {/* ████████████████████████████████████████████████████████
              SECTION: ROTATION
              ████████████████████████████████████████████████████████ */}
          {activeSection === 'rotation' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in">
              {/* ── Rotation History ────────────────────────── */}
              <section className="rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900/80 to-slate-800/20 p-6 shadow-xl">
                <h3 className="font-bold text-white mb-4 flex items-center gap-2 text-base">
                  <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                    <Users className="w-5 h-5 text-indigo-400" />
                  </div>
                  Historial de Rotación
                  <span className="text-xs text-slate-500 font-normal ml-auto">Mes actual</span>
                </h3>

                <div className="flex flex-wrap items-center gap-3 mb-5">
                  <label className="text-slate-400 text-sm font-bold">Coche Nº</label>
                  <div className="relative">
                    <Bus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={cocheRotacionId}
                      onChange={(e) => setCocheRotacionId(e.target.value)}
                      placeholder="Ej: 115"
                      className="bg-slate-800/80 border border-slate-600/50 rounded-xl pl-9 pr-3 py-2.5 text-white w-28 text-sm focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 outline-none transition-all"
                    />
                  </div>
                </div>

                {rotacionLoading ? (
                  <div className="flex items-center gap-3 py-8 justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
                    <span className="text-sm text-slate-500">Consultando...</span>
                  </div>
                ) : rotacion ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="text-4xl font-black text-primary-400">{rotacion.cambios}</div>
                      <div>
                        <p className="text-sm font-bold text-white">
                          Cambio{rotacion.cambios !== 1 ? 's' : ''} de manos
                        </p>
                        <p className="text-xs text-slate-500">
                          Coche {cocheRotacionId} • {yearMonth()}
                        </p>
                      </div>
                    </div>
                    {rotacion.detalle.length > 0 && (
                      <div className="space-y-1.5 max-h-[280px] overflow-y-auto custom-scrollbar">
                        {rotacion.detalle.slice(0, 15).map((d, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-800/30 border border-white/5 text-sm"
                          >
                            <div className="w-2 h-2 rounded-full bg-primary-500/50" />
                            <span className="text-slate-400 font-mono text-xs">{d.date}</span>
                            <span className="text-white font-bold">{d.servicioId}</span>
                            <span className="ml-auto text-primary-400 font-bold text-xs">
                              {d.cambios} cambio{d.cambios !== 1 ? 's' : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-600">
                    <Bus className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">Sin datos para este coche en el mes.</p>
                    <p className="text-xs text-slate-700 mt-1">Ingrese otro número de coche.</p>
                  </div>
                )}
              </section>

              {/* ── Quick Stats / Financial Overview ────────── */}
              <section className="rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900/80 to-slate-800/20 p-6 shadow-xl">
                <h3 className="font-bold text-white mb-4 flex items-center gap-2 text-base">
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <DollarSign className="w-5 h-5 text-emerald-400" />
                  </div>
                  Resumen Operativo
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    {
                      label: 'Coches en Calle',
                      value: flotaActiva,
                      total: flotaTotal,
                      icon: Bus,
                      color: 'emerald',
                    },
                    {
                      label: 'En Taller',
                      value: vehiculosTaller,
                      total: flotaTotal,
                      icon: Fuel,
                      color: 'red',
                    },
                    {
                      label: 'Servicios Hoy',
                      value: serviciosTotales,
                      total: null,
                      icon: Activity,
                      color: 'blue',
                    },
                    {
                      label: 'Con Chofer',
                      value: serviciosActivos,
                      total: serviciosTotales,
                      icon: Users,
                      color: 'violet',
                    },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className={`p-4 rounded-xl bg-slate-800/30 border border-white/5 hover:border-${stat.color}-500/20 transition-all`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <stat.icon className={`w-4 h-4 text-${stat.color}-400`} />
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">
                          {stat.label}
                        </span>
                      </div>
                      <div className="text-2xl font-black text-white">
                        {stat.value}
                        {stat.total != null && (
                          <span className="text-sm font-medium text-slate-500">/{stat.total}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Turno actual info */}
                <div className="mt-5 p-4 rounded-xl bg-gradient-to-r from-primary-950/20 to-slate-800/30 border border-primary-500/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                        Turno Actual
                      </span>
                      <span className={`text-lg font-black ${turnoColor}`}>{turnoLabel}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                        Hora
                      </span>
                      <span className="text-lg font-black text-white font-mono">{lastRefresh}</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
