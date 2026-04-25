/**
 * CEO Dashboard V7 — Executive Command (cross-operador, production-grade)
 * ────────────────────────────────────────────────────────────────────────
 * Filosofía: 1 score sintético + 4 KPIs accionables + Hot Zones + Mercado
 * + Riesgos. Sin duplicar funciones de otros módulos — cada KPI linkea al
 * módulo especializado (ShadowRadar, OTPDashboard, CorridorIntelligence).
 *
 * Comparable a: Optibus Network Health, Swiftly Service Reliability,
 * TfL EWT, NYC MTA Bunching Index, RATP Régularité.
 *
 * Cross-operador desde el primer pixel (DIRECTRIZ 2026-04-24).
 *
 * Datos:
 *   - corridor_overlap (matriz DRO pre-calculada por droMatrix.ts)
 *   - shapes_cross_operator (metadata de shapes con agencyId)
 *   - alertas_regulacion (eventos shadow live + 7d)
 *   - incidencias (operacionales, incidentService)
 *   - servicios_estado (puntualidad y cobertura del día)
 *   - GET /api/positions (GPS STM cross-operador, refresh 30s)
 *   - FleetService.getVehicles (taller / disponibles)
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  collection,
  getDocs,
  query,
  limit,
  where,
  Timestamp,
} from 'firebase/firestore';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bus,
  Clock,
  ExternalLink,
  Gauge,
  Globe,
  Loader2,
  RefreshCw,
  Shield,
  TrendingDown,
  TrendingUp,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';

import { db } from '../../config/firebase';
import { FleetService, ServicioEstadoService } from '../../services/firestore';
import { formatHoraSegundosMvd } from '../../utils/formatTimestamp';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
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

/* ═══════════════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════════════ */

interface OperadorConfig {
  codigo: number;
  label: string;
  agencyId: string; // valor en shapes_cross_operator.agencyId
}

// agencyId = string del codigoEmpresa (formato shapes_cross_operator/corridor_overlap).
// Mantener sincronizado con ShadowRadar.tsx EMPRESA_TO_AGENCY.
const EMPRESAS_OPCIONES: ReadonlyArray<OperadorConfig> = [
  { codigo: 70, label: 'UCOT', agencyId: '70' },
  { codigo: 50, label: 'CUTCSA', agencyId: '50' },
  { codigo: 20, label: 'COME', agencyId: '20' },
  { codigo: 10, label: 'COETC', agencyId: '10' },
];

const PERIODOS = [
  { id: 'today' as const, label: 'Hoy' },
  { id: '7d' as const, label: '7 días' },
  { id: '30d' as const, label: '30 días' },
];

type Periodo = (typeof PERIODOS)[number]['id'];

/* ═══════════════════════════════════════════════════════════
   TIPOS
   ═══════════════════════════════════════════════════════════ */

interface NetworkHealth {
  score: number; // 0-100 (calculado sólo sobre componentes disponibles)
  components: {
    otp: number; // 0-100 (0 si null)
    bunching: number; // 0-100
    coverage: number; // 0-100
    risk: number; // 0-100
  };
  componentsAvailable: number; // de 4 — <4 indica score parcial
  bunchingCapped: boolean; // true si el query subestima el conteo
  meta: {
    serviciosTotales: number;
    serviciosPuntuales: number;
    bunchingEvents24h: number | null;
    flotaActiva: number;
    flotaTotal: number;
    incidenciasAbiertas: number | null;
    otpAvailable: boolean;
    coverageAvailable: boolean;
  };
}

interface OverlapDoc {
  shapeAKey: string;
  shapeBKey: string;
  agencyA: string;
  empresaA: string;
  lineaA: string;
  sentidoA: 'IDA' | 'VUELTA';
  agencyB: string;
  empresaB: string;
  lineaB: string;
  sentidoB: 'IDA' | 'VUELTA';
  pctAInB: number;
  sharedKm: number;
  sameEmpresa: boolean;
}

interface ShapeMeta {
  key: string;
  agencyId: string;
  empresa: string;
  linea: string;
  sentido: 'IDA' | 'VUELTA';
  lengthMeters: number;
}

interface HotZone {
  ownLine: string;
  ownSentido: string;
  ownAgency: string;
  rivalAgency: string;
  rivalLine: string;
  rivalSentido: string;
  pctOverlap: number;
  sharedKm: number;
  severity: 'CRITICAL' | 'WARN' | 'OK';
}

interface MarketShareRow {
  linea: string;
  busesPropia: number;
  busesRivales: number;
  totalBuses: number;
  sharePct: number;
  rivales: Record<string, number>; // agencyId -> count
}

interface RiskItem {
  type: 'personnel' | 'fleet' | 'incident';
  count: number;
  severity: 'high' | 'medium';
  link: string;
  label: string;
  icon: typeof AlertTriangle;
}

/**
 * Shape devuelto por GET /api/positions
 * (functions/src/intelligenceApi.ts → posicionesHandler).
 * Cada bus es un objeto plano, NO un GeoJSON Feature.
 */
interface PositionBus {
  idBus: string;
  codigoBus: string;
  linea: string;
  sublinea?: string;
  destino?: string;
  empresa: string;
  empresaId: number; // 70 / 50 / 20 / 10
  lat: number;
  lng: number;
  timestamp: string;
}

interface PositionsResponse {
  ok: boolean;
  total?: number;
  buses: PositionBus[];
  timestamp?: string;
  fuente?: string;
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */

const todayStr = () => new Date().toISOString().split('T')[0];

function severityFromScore(score: number): 'CRITICAL' | 'WARN' | 'OK' {
  if (score < 50) return 'CRITICAL';
  if (score < 75) return 'WARN';
  return 'OK';
}

function colorFromSeverity(s: 'CRITICAL' | 'WARN' | 'OK') {
  return s === 'CRITICAL'
    ? 'text-red-400'
    : s === 'WARN'
      ? 'text-amber-400'
      : 'text-emerald-400';
}

function ringColorFromScore(score: number): string {
  if (score < 50) return '#ef4444';
  if (score < 75) return '#f59e0b';
  return '#10b981';
}

/**
 * Salud de la Red 0-100 — combinación ponderada UITP-style.
 * Pesos base: 40% OTP / 25% Aglomeración / 20% Cobertura / 15% Riesgo.
 *
 * Si un componente NO TIENE DATOS, su peso se redistribuye entre los demás
 * (no se trata como "0% performance"). Esto evita scores artificialmente
 * bajos cuando faltan ingestas. El campo `componentsAvailable` indica cuántos
 * componentes pesaron en el cálculo; si <2 el score se considera no
 * representativo y la UI debe avisarlo.
 */
function computeNetworkHealthScore(input: {
  otpPct: number | null; // null = sin datos hoy
  bunchingEvents24h: number | null; // null = sin acceso a Firestore
  bunchingCapped: boolean; // true si el query devolvió el límite (subestima)
  flotaActivaPct: number | null;
  incidenciasAbiertasAlta: number | null;
  bunchingThreshold?: number;
  incidentThreshold?: number;
}): {
  score: number;
  components: NetworkHealth['components'];
  componentsAvailable: number;
  bunchingCapped: boolean;
} {
  const bunchingThreshold = input.bunchingThreshold ?? 200;
  const incidentThreshold = input.incidentThreshold ?? 10;

  const otp = input.otpPct;
  const bunching =
    input.bunchingEvents24h == null
      ? null
      : Math.max(0, 100 - (input.bunchingEvents24h / bunchingThreshold) * 100);
  const coverage = input.flotaActivaPct;
  const risk =
    input.incidenciasAbiertasAlta == null
      ? null
      : Math.max(0, 100 - (input.incidenciasAbiertasAlta / incidentThreshold) * 100);

  // Pesos base
  const baseWeights = { otp: 0.4, bunching: 0.25, coverage: 0.2, risk: 0.15 };
  const available: Array<keyof typeof baseWeights> = [];
  if (otp != null) available.push('otp');
  if (bunching != null) available.push('bunching');
  if (coverage != null) available.push('coverage');
  if (risk != null) available.push('risk');

  const totalWeight = available.reduce((sum, k) => sum + baseWeights[k], 0);
  const values: Record<keyof typeof baseWeights, number | null> = {
    otp,
    bunching,
    coverage,
    risk,
  };

  let total = 0;
  if (totalWeight > 0) {
    for (const k of available) {
      total += (values[k]! * baseWeights[k]) / totalWeight;
    }
  }

  return {
    score: Math.round(total * 10) / 10,
    components: {
      otp: otp == null ? 0 : Math.round(otp * 10) / 10,
      bunching: bunching == null ? 0 : Math.round(bunching * 10) / 10,
      coverage: coverage == null ? 0 : Math.round(coverage * 10) / 10,
      risk: risk == null ? 0 : Math.round(risk * 10) / 10,
    },
    componentsAvailable: available.length,
    bunchingCapped: input.bunchingCapped,
  };
}

/* ═══════════════════════════════════════════════════════════
   SUB-COMPONENTES
   ═══════════════════════════════════════════════════════════ */

function HealthGauge({ score }: { score: number }) {
  const radius = 70;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;
  const color = ringColorFromScore(score);

  return (
    <div className="relative flex items-center justify-center">
      <svg width={170} height={170} className="-rotate-90">
        <circle
          cx={85}
          cy={85}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={10}
        />
        <circle
          cx={85}
          cy={85}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-black text-white tabular-nums">{Math.round(score)}</span>
        <span className="text-[10px] font-black tracking-widest text-slate-500 uppercase">
          /100
        </span>
      </div>
    </div>
  );
}

function KPICard({
  label,
  value,
  suffix,
  trend,
  description,
  link,
  linkLabel,
  severity,
  icon: Icon,
}: {
  label: string;
  value: number | string | null;
  suffix?: string;
  trend?: 'up' | 'down' | 'flat';
  description: string;
  link: string;
  linkLabel: string;
  severity: 'CRITICAL' | 'WARN' | 'OK';
  icon: typeof Activity;
}) {
  const colorBorder =
    severity === 'CRITICAL'
      ? 'border-red-500/30 hover:border-red-500/50'
      : severity === 'WARN'
        ? 'border-amber-500/30 hover:border-amber-500/50'
        : 'border-emerald-500/20 hover:border-emerald-500/40';
  const bgGlow =
    severity === 'CRITICAL'
      ? 'from-red-950/30 via-slate-900/80 to-slate-900/40'
      : severity === 'WARN'
        ? 'from-amber-950/20 via-slate-900/80 to-slate-900/40'
        : 'from-slate-900/80 to-slate-900/40';

  return (
    <div
      className={`group relative rounded-2xl border ${colorBorder} bg-gradient-to-br ${bgGlow} p-5 shadow-xl transition-all duration-300 overflow-hidden`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-slate-800/60 border border-white/5">
            <Icon className={`w-4 h-4 ${colorFromSeverity(severity)}`} />
          </div>
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
            {label}
          </span>
        </div>
        {trend && (
          <span className="text-[9px] font-bold text-slate-500">
            {trend === 'up' ? (
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            ) : trend === 'down' ? (
              <TrendingDown className="w-3.5 h-3.5 text-red-400" />
            ) : (
              <span className="w-3.5 h-3.5 inline-block" />
            )}
          </span>
        )}
      </div>

      <div className={`text-3xl font-black ${colorFromSeverity(severity)} tabular-nums leading-none`}>
        {value === null ? <span className="text-slate-600">—</span> : value}
        {suffix && value !== null && (
          <span className="text-base font-medium text-slate-400 ml-0.5">{suffix}</span>
        )}
      </div>

      <p className="mt-2 text-[11px] text-slate-500 leading-relaxed min-h-[28px]">
        {description}
      </p>

      <Link
        to={link}
        className="mt-3 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
      >
        {linkLabel}
        <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}

function HotZoneRow({ zone, idx }: { zone: HotZone; idx: number }) {
  const severityColor =
    zone.severity === 'CRITICAL'
      ? 'border-red-500/40 bg-red-950/20'
      : zone.severity === 'WARN'
        ? 'border-amber-500/30 bg-amber-950/15'
        : 'border-emerald-500/20 bg-emerald-950/10';

  return (
    <Link
      to="/dashboard/traffic/corridor-intelligence"
      className={`flex items-center gap-3 p-3 rounded-xl border ${severityColor} hover:translate-x-1 transition-all`}
    >
      <span className="text-xs font-black text-slate-600 w-5">#{idx + 1}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-white">
            L{zone.ownLine}
            <span className="text-slate-500 ml-1 text-[10px] font-medium">{zone.ownSentido}</span>
          </span>
          <span className="text-slate-600 text-[10px]">vs</span>
          <span className="text-sm font-bold text-slate-300">
            {zone.rivalAgency} L{zone.rivalLine}
            <span className="text-slate-500 ml-1 text-[10px] font-medium">{zone.rivalSentido}</span>
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
          <span>
            <span className={`font-black ${colorFromSeverity(zone.severity)}`}>
              {zone.pctOverlap.toFixed(1)}%
            </span>{' '}
            DRO
          </span>
          <span>•</span>
          <span>{zone.sharedKm.toFixed(1)} km compartidos</span>
        </div>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-slate-600 group-hover:text-white" />
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function CEODashboardV7() {
  // ── State ────────────────────────────────────────────────
  const { empresaPropia, setEmpresaPropia } = useEmpresaPropia();
  const [periodo, setPeriodo] = useState<Periodo>('today');
  /** Serie histórica diaria (sólo cuando periodo !== 'today'). */
  const [otpHistoric, setOtpHistoric] = useState<Array<{ date: string; value: number | null; meta?: { total: number; enTiempo: number } }> | null>(null);
  const [bunchingHistoric, setBunchingHistoric] = useState<Array<{ date: string; value: number; meta?: { criticos: number } }> | null>(null);
  const [historicLoading, setHistoricLoading] = useState(false);
  const [historicError, setHistoricError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(formatHoraSegundosMvd(new Date()));

  const [overlaps, setOverlaps] = useState<OverlapDoc[]>([]);
  const [shapes, setShapes] = useState<ShapeMeta[]>([]);
  const [bunching24h, setBunching24h] = useState(0);
  const [bunching24hLoaded, setBunching24hLoaded] = useState(false);
  const [incidenciasLoaded, setIncidenciasLoaded] = useState(false);
  const [estadoServicios, setEstadoServicios] = useState<{
    total: number;
    activos: number;
    puntuales: number;
    conAtraso: number;
  }>({ total: 0, activos: 0, puntuales: 0, conAtraso: 0 });
  const [flotaTotal, setFlotaTotal] = useState(0);
  const [flotaTaller, setFlotaTaller] = useState(0);
  const [flotaLiveProp, setFlotaLiveProp] = useState(0);
  const [positions, setPositions] = useState<PositionBus[]>([]);
  const [incidenciasAlta, setIncidenciasAlta] = useState(0);
  const [personalSinAsignar, setPersonalSinAsignar] = useState(0);

  // ── Derived ──────────────────────────────────────────────
  const empresaCfg = useMemo(
    () => EMPRESAS_OPCIONES.find((e) => e.codigo === empresaPropia) ?? EMPRESAS_OPCIONES[0],
    [empresaPropia],
  );

  // ── Data Fetch ───────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    const today = todayStr();

    try {
      // Paralelo: matriz DRO + shapes + alertas 24h + estados + GPS + incidencias + flota
      const sinceTs = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);

      const [overlapsSnap, shapesSnap, alertsSnap, estados, posRes, vehicles, incidenciasSnap] =
        await Promise.all([
          // Cada query con .catch independiente: una falla no rompe las demás.
          getDocs(query(collection(db, 'corridor_overlap'), limit(5000))).catch((err) => {
            console.warn('[CEODashboardV7] corridor_overlap query failed:', err?.code ?? err);
            return null;
          }),
          getDocs(query(collection(db, 'shapes_cross_operator'), limit(500))).catch((err) => {
            console.warn('[CEODashboardV7] shapes_cross_operator query failed:', err?.code ?? err);
            return null;
          }),
          getDocs(
            query(
              collection(db, 'alertas_regulacion'),
              where('timestamp', '>=', sinceTs),
              limit(5000),
            ),
          ).catch((err) => {
            console.warn('[CEODashboardV7] alertas_regulacion query failed:', err?.code ?? err);
            return null;
          }),
          ServicioEstadoService.getByDate(today).catch((err) => {
            console.warn('[CEODashboardV7] ServicioEstadoService failed:', err);
            return [] as Awaited<ReturnType<typeof ServicioEstadoService.getByDate>>;
          }),
          fetch('/api/positions')
            .then((r) => (r.ok ? (r.json() as Promise<PositionsResponse>) : null))
            .catch(() => null),
          FleetService.getVehicles().catch(() => []),
          getDocs(
            query(
              collection(db, 'incidencias'),
              where('status', 'in', ['abierta', 'en_proceso']),
              limit(500),
            ),
          ).catch((err) => {
            console.warn('[CEODashboardV7] incidencias query failed:', err?.code ?? err);
            return null;
          }),
        ]);

      // ── Overlaps + Shapes ──
      const ovs: OverlapDoc[] = overlapsSnap
        ? overlapsSnap.docs.map((d) => d.data() as OverlapDoc)
        : [];
      const shps: ShapeMeta[] = shapesSnap
        ? shapesSnap.docs.map((d) => {
            const x = d.data() as Record<string, unknown>;
            return {
              key: String(x.key ?? ''),
              agencyId: String(x.agencyId ?? ''),
              empresa: String(x.empresa ?? ''),
              linea: String(x.linea ?? ''),
              sentido: (x.sentido as 'IDA' | 'VUELTA') ?? 'IDA',
              lengthMeters: Number(x.lengthMeters ?? 0),
            };
          })
        : [];
      setOverlaps(ovs);
      setShapes(shps);

      // ── Bunching 24h ──
      if (alertsSnap) {
        setBunching24h(alertsSnap.size);
        setBunching24hLoaded(true);
      } else {
        setBunching24h(0);
        setBunching24hLoaded(false);
      }

      // ── Estado servicios ──
      const total = estados.length;
      const activos = estados.filter((e) => e.status === 'activo').length;
      const conAtraso = estados.filter((e) => e.atrasoMinutos != null).length;
      const puntuales = estados.filter(
        (e) => e.atrasoMinutos != null && (e.atrasoMinutos ?? 0) <= 3,
      ).length;
      setEstadoServicios({ total, activos, puntuales, conAtraso });

      // ── Personal sin asignar (próximos 60 min) ──
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      const ventana = nowMin + 60;
      const sinChofer = estados.filter((e) => {
        const h = e.horaInicio;
        if (!h) return false;
        const [hh, mm] = h.split(':').map(Number);
        const min = (hh ?? 0) * 60 + (mm ?? 0);
        if (min < nowMin || min > ventana) return false;
        return !e.choferActual || e.choferActual.trim() === '';
      }).length;
      setPersonalSinAsignar(sinChofer);

      // ── GPS positions ──
      // Shape: { ok: true, buses: [{ empresaId, linea, lat, lng, ... }] }
      const buses = posRes?.buses ?? [];
      setPositions(buses);
      const livePropia = buses.filter((b) => b.empresaId === empresaPropia).length;
      setFlotaLiveProp(livePropia);

      // ── Flota ──
      setFlotaTotal(vehicles.length);
      const taller = vehicles.filter((v) =>
        /mantenimiento|taller|paralizado|baja/i.test(String(v.status ?? '')),
      ).length;
      setFlotaTaller(taller);

      // ── Incidencias ──
      if (incidenciasSnap) {
        const alta = incidenciasSnap.docs.filter((d) => {
          const data = d.data() as Record<string, unknown>;
          const p = String(data.priority ?? data.prioridad ?? '').toUpperCase();
          return p === 'ALTA' || p === 'HIGH' || p === 'CRITICA' || p === 'CRITICAL';
        }).length;
        setIncidenciasAlta(alta);
        setIncidenciasLoaded(true);
      } else {
        setIncidenciasAlta(0);
        setIncidenciasLoaded(false);
      }
    } catch (err) {
      console.error('[CEODashboardV7] Error loading data:', err);
    } finally {
      setLoading(false);
      setLastRefresh(formatHoraSegundosMvd(new Date()));
    }
  }, [empresaPropia]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── Carga de histórico (solo cuando periodo != 'today') ────────────────
  // Llama a las Cloud Functions historicOtp/historicBunching que agregan
  // por día. Se rehace cuando cambia el operador o la ventana temporal.
  useEffect(() => {
    if (periodo === 'today') {
      setOtpHistoric(null);
      setBunchingHistoric(null);
      setHistoricError(null);
      return;
    }
    const days = periodo === '7d' ? 7 : 30;
    const agencyId = String(empresaPropia);
    let cancelled = false;
    setHistoricLoading(true);
    setHistoricError(null);

    Promise.all([
      fetch(`/historicOtp?days=${days}&agencyId=${agencyId}`).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
      ),
      fetch(`/historicBunching?days=${days}&agencyId=${agencyId}`).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
      ),
    ])
      .then(([otpResp, bunchResp]) => {
        if (cancelled) return;
        setOtpHistoric(Array.isArray(otpResp?.series) ? otpResp.series : []);
        setBunchingHistoric(Array.isArray(bunchResp?.series) ? bunchResp.series : []);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[CEODashboardV7] histórico falló:', msg);
        setHistoricError(msg);
        setOtpHistoric([]);
        setBunchingHistoric([]);
      })
      .finally(() => {
        if (!cancelled) setHistoricLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [periodo, empresaPropia]);

  /** Combina las dos series para el LineChart de Recharts. */
  const historicChartData = useMemo(() => {
    if (!otpHistoric || !bunchingHistoric) return [];
    const map = new Map<string, { date: string; otp: number | null; bunching: number | null }>();
    for (const p of otpHistoric) {
      // p.value puede ser null (días sin muestras) — Recharts respeta null con
      // connectNulls=false, no dibuja un dot falso en cero.
      map.set(p.date, { date: p.date, otp: p.value, bunching: null });
    }
    for (const p of bunchingHistoric) {
      const e = map.get(p.date) ?? { date: p.date, otp: null, bunching: null };
      e.bunching = p.value;
      map.set(p.date, e);
    }
    return [...map.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ ...d, dateShort: d.date.slice(5) }));
  }, [otpHistoric, bunchingHistoric]);

  // ── Derived: Salud de la Red ─────────────────────────────
  // Cada componente puede ser null = "sin datos" → no se penaliza el score.
  const networkHealth: NetworkHealth = useMemo(() => {
    const otpPct =
      estadoServicios.conAtraso > 0
        ? (estadoServicios.puntuales / estadoServicios.conAtraso) * 100
        : null;

    // Cobertura: sólo si tenemos GPS live o flota Firestore
    const flotaTotalEstimada = flotaLiveProp > 0 ? flotaLiveProp : Math.max(flotaTotal, 0);
    const flotaActiva = flotaLiveProp > 0 ? flotaLiveProp : flotaTotal - flotaTaller;
    const flotaActivaPct =
      flotaTotalEstimada > 0 ? (flotaActiva / flotaTotalEstimada) * 100 : null;

    // Bunching: si bunching24hLoaded === false significa que el query falló.
    // Si bunching24h llegó al límite del query (2000), el conteo subestima.
    const bunchingValue = bunching24hLoaded ? bunching24h : null;
    const bunchingIsCapped = bunching24h >= 2000 && bunching24hLoaded;

    // Incidencias: null si no se pudo leer
    const incidenciasValue = incidenciasLoaded ? incidenciasAlta : null;

    const { score, components, componentsAvailable, bunchingCapped } =
      computeNetworkHealthScore({
        otpPct,
        bunchingEvents24h: bunchingValue,
        bunchingCapped: bunchingIsCapped,
        flotaActivaPct,
        incidenciasAbiertasAlta: incidenciasValue,
      });

    return {
      score,
      components,
      componentsAvailable,
      bunchingCapped,
      meta: {
        serviciosTotales: estadoServicios.total,
        serviciosPuntuales: estadoServicios.puntuales,
        bunchingEvents24h: bunchingValue,
        flotaActiva,
        flotaTotal: flotaTotalEstimada,
        incidenciasAbiertas: incidenciasValue,
        otpAvailable: otpPct != null,
        coverageAvailable: flotaActivaPct != null,
      },
    };
  }, [
    estadoServicios,
    bunching24h,
    bunching24hLoaded,
    flotaLiveProp,
    flotaTotal,
    flotaTaller,
    incidenciasAlta,
    incidenciasLoaded,
  ]);

  // ── Derived: Hot Zones ───────────────────────────────────
  // Usa campos denormalizados de corridor_overlap (agencyA/lineaA/sentidoA/...).
  // No requiere JOIN con shapes_cross_operator. El operador propio puede
  // aparecer como A o B en el doc; tomamos el lado correcto.
  const hotZones: HotZone[] = useMemo(() => {
    if (overlaps.length === 0) return [];
    const myAgency = empresaCfg.agencyId;
    const candidates: HotZone[] = [];

    for (const o of overlaps) {
      if (o.sameEmpresa) continue;
      let mine: 'A' | 'B' | null = null;
      if (o.agencyA === myAgency) mine = 'A';
      else if (o.agencyB === myAgency) mine = 'B';
      if (!mine) continue;

      const ownLinea = mine === 'A' ? o.lineaA : o.lineaB;
      const ownSentido = mine === 'A' ? o.sentidoA : o.sentidoB;
      const ownAgency = mine === 'A' ? o.agencyA : o.agencyB;
      const rivalLinea = mine === 'A' ? o.lineaB : o.lineaA;
      const rivalSentido = mine === 'A' ? o.sentidoB : o.sentidoA;
      const rivalAgency = mine === 'A' ? o.empresaB : o.empresaA;
      const pct = o.pctAInB;
      const severity = severityFromScore(100 - pct);

      candidates.push({
        ownLine: ownLinea,
        ownSentido,
        ownAgency,
        rivalAgency,
        rivalLine: rivalLinea,
        rivalSentido,
        pctOverlap: pct,
        sharedKm: o.sharedKm,
        severity,
      });
    }

    return candidates
      .sort((x, y) => y.pctOverlap * y.sharedKm - x.pctOverlap * x.sharedKm)
      .slice(0, 5);
  }, [overlaps, empresaCfg.agencyId]);

  // ── Derived: Market Share por línea ─────────────────────
  // Devuelve dos arrays separados:
  //   conPresencia: líneas donde el operador propio TIENE buses operando.
  //                 Métrica relevante: cuota de mercado en duelo activo.
  //   sinPresencia: líneas donde el operador propio NO opera pero rivales sí.
  //                 Métrica relevante: oportunidad de entrar a una línea
  //                 que está siendo capturada al 100% por la competencia.
  const marketShare: { conPresencia: MarketShareRow[]; sinPresencia: MarketShareRow[] } = useMemo(() => {
    if (positions.length === 0) return { conPresencia: [], sinPresencia: [] };

    const byLine: Map<
      string,
      { propia: number; rivales: Record<string, number> }
    > = new Map();

    for (const b of positions) {
      const linea = (b.linea ?? b.sublinea ?? '').toString().trim();
      if (!linea) continue;
      const ce = b.empresaId;
      if (ce == null) continue;
      const cleanLinea = linea.replace(/[ab]$/i, '');

      if (!byLine.has(cleanLinea)) {
        byLine.set(cleanLinea, { propia: 0, rivales: {} });
      }
      const entry = byLine.get(cleanLinea)!;
      if (ce === empresaPropia) {
        entry.propia += 1;
      } else {
        const rivalCfg = EMPRESAS_OPCIONES.find((e) => e.codigo === ce);
        const rivalLabel = rivalCfg?.label ?? `EMP_${ce}`;
        entry.rivales[rivalLabel] = (entry.rivales[rivalLabel] ?? 0) + 1;
      }
    }

    const conPresencia: MarketShareRow[] = [];
    const sinPresencia: MarketShareRow[] = [];
    for (const [linea, agg] of byLine) {
      const rivalesTotal = Object.values(agg.rivales).reduce((a, b) => a + b, 0);
      const totalBuses = agg.propia + rivalesTotal;
      if (totalBuses === 0) continue;
      if (rivalesTotal === 0) continue; // sin competencia, no es interesante
      const row: MarketShareRow = {
        linea,
        busesPropia: agg.propia,
        busesRivales: rivalesTotal,
        totalBuses,
        sharePct: (agg.propia / totalBuses) * 100,
        rivales: agg.rivales,
      };
      if (agg.propia > 0) conPresencia.push(row);
      else sinPresencia.push(row);
    }

    return {
      conPresencia: conPresencia.sort((a, b) => b.totalBuses - a.totalBuses).slice(0, 8),
      sinPresencia: sinPresencia.sort((a, b) => b.busesRivales - a.busesRivales).slice(0, 5),
    };
  }, [positions, empresaPropia]);

  // ── Derived: Riesgos ─────────────────────────────────────
  const risks: RiskItem[] = useMemo(() => {
    const items: RiskItem[] = [];
    if (personalSinAsignar > 0) {
      items.push({
        type: 'personnel',
        count: personalSinAsignar,
        severity: personalSinAsignar > 3 ? 'high' : 'medium',
        link: '/dashboard/traffic/digital-agents',
        label: 'Servicios sin chofer (próx. 60 min)',
        icon: Users,
      });
    }
    if (flotaTaller > 0) {
      items.push({
        type: 'fleet',
        count: flotaTaller,
        severity: flotaTaller > 10 ? 'high' : 'medium',
        link: '/dashboard/admin/maintenance',
        label: 'Vehículos en taller',
        icon: Wrench,
      });
    }
    if (incidenciasAlta > 0) {
      items.push({
        type: 'incident',
        count: incidenciasAlta,
        severity: 'high',
        link: '/dashboard/traffic/incident-command',
        label: 'Incidencias críticas abiertas',
        icon: AlertTriangle,
      });
    }
    return items;
  }, [personalSinAsignar, flotaTaller, incidenciasAlta]);

  // ── Severity de cada KPI ─────────────────────────────────
  const otpSeverity = severityFromScore(networkHealth.components.otp);
  const bunchingSeverity = severityFromScore(networkHealth.components.bunching);
  const coverageSeverity = severityFromScore(networkHealth.components.coverage);
  const riskSeverity = severityFromScore(networkHealth.components.risk);

  /* ═════════════════════════════════════════════════════════
     RENDER
     ═════════════════════════════════════════════════════════ */

  return (
    <div className="animate-fade-in space-y-5 p-3 md:p-5 pb-24 min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900">
      {/* ─────────────── HEADER ─────────────── */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/30 to-cyan-500/10 flex items-center justify-center border border-blue-500/30 shadow-lg shadow-blue-500/10">
              <Shield className="w-5 h-5 text-blue-400" />
            </div>
            <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-950 animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-black text-white tracking-tight flex items-center gap-2">
              Centro de Mando de Red
              <span className="text-slate-500 font-medium">v7</span>
              <span className="text-[9px] font-black text-blue-400 bg-blue-500/15 px-1.5 py-0.5 rounded border border-blue-500/30">
                CROSS-OPERADOR
              </span>
            </h1>
            <div className="flex items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1">
                <Globe className="w-3 h-3" />
                Sistema Metropolitano de Montevideo
              </span>
              <span className="flex items-center gap-1 text-slate-600">
                <Clock className="w-3 h-3" />
                Actualizado: {lastRefresh}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Selector operador */}
          <label className="flex items-center gap-2">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
              Operador
            </span>
            <select
              value={empresaPropia}
              onChange={(e) => setEmpresaPropia(Number(e.target.value))}
              className="bg-slate-950 border border-blue-500/60 rounded-lg px-3 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-blue-400 transition-all"
              aria-label="Empresa propia"
            >
              {EMPRESAS_OPCIONES.map((e) => (
                <option key={e.codigo} value={e.codigo}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>

          {/* Selector período */}
          <div className="flex items-center gap-1 bg-slate-900/60 rounded-lg border border-white/5 p-1">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriodo(p.id)}
                className={`px-3 py-1.5 rounded-md text-[10px] font-black tracking-widest uppercase transition-all ${
                  periodo === p.id
                    ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title={
                  p.id === 'today'
                    ? 'Snapshot del día actual'
                    : p.id === '7d'
                    ? 'Tendencia de los últimos 7 días — datos agregados de vehicle_events + alertas_regulacion'
                    : 'Tendencia de los últimos 30 días — datos agregados de vehicle_events + alertas_regulacion'
                }
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold bg-slate-800/60 text-slate-300 hover:bg-slate-700 border border-white/5 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </header>

      {loading && estadoServicios.total === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
          <p className="text-sm text-slate-500 animate-pulse">
            Cargando red {empresaCfg.label} + competidores...
          </p>
        </div>
      ) : (
        <>
          {/* ─────────────── HEALTH SCORE + KPIs ─────────────── */}
          <section
            className="grid grid-cols-1 lg:grid-cols-5 gap-4"
            aria-label="Network Health Score y KPIs principales"
          >
            {/* Network Health Score */}
            <div className="lg:col-span-1 rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-950/30 via-slate-900/80 to-slate-900/40 p-5 shadow-xl flex flex-col items-center justify-between">
              <div className="text-center">
                <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-0.5">
                  Salud de la Red
                </p>
                <p className="text-[10px] text-slate-500 mb-3">{empresaCfg.label}</p>
              </div>
              <HealthGauge score={networkHealth.score} />
              {networkHealth.componentsAvailable < 4 && (
                <p className="mt-2 text-[9px] font-bold text-amber-400 text-center bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
                  Calculado sobre {networkHealth.componentsAvailable} de 4
                  componentes (datos parciales)
                </p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2 w-full text-[9px]">
                <div className="bg-slate-800/40 rounded-lg p-1.5 border border-white/5">
                  <span className="text-slate-500 block">OTP</span>
                  <span
                    className={`font-black ${networkHealth.meta.otpAvailable ? colorFromSeverity(otpSeverity) : 'text-slate-600'}`}
                  >
                    {networkHealth.meta.otpAvailable
                      ? networkHealth.components.otp.toFixed(0)
                      : '—'}
                  </span>
                </div>
                <div className="bg-slate-800/40 rounded-lg p-1.5 border border-white/5">
                  <span className="text-slate-500 block">
                    Aglom
                    {networkHealth.bunchingCapped && (
                      <span title="Conteo limitado a 5000; valor real puede ser mayor">
                        {' '}
                        ⚠
                      </span>
                    )}
                  </span>
                  <span
                    className={`font-black ${networkHealth.meta.bunchingEvents24h != null ? colorFromSeverity(bunchingSeverity) : 'text-slate-600'}`}
                  >
                    {networkHealth.meta.bunchingEvents24h != null
                      ? networkHealth.components.bunching.toFixed(0)
                      : '—'}
                  </span>
                </div>
                <div className="bg-slate-800/40 rounded-lg p-1.5 border border-white/5">
                  <span className="text-slate-500 block">Cober</span>
                  <span
                    className={`font-black ${networkHealth.meta.coverageAvailable ? colorFromSeverity(coverageSeverity) : 'text-slate-600'}`}
                  >
                    {networkHealth.meta.coverageAvailable
                      ? networkHealth.components.coverage.toFixed(0)
                      : '—'}
                  </span>
                </div>
                <div className="bg-slate-800/40 rounded-lg p-1.5 border border-white/5">
                  <span className="text-slate-500 block">Riesgo</span>
                  <span
                    className={`font-black ${networkHealth.meta.incidenciasAbiertas != null ? colorFromSeverity(riskSeverity) : 'text-slate-600'}`}
                  >
                    {networkHealth.meta.incidenciasAbiertas != null
                      ? networkHealth.components.risk.toFixed(0)
                      : '—'}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-[8px] text-slate-600 text-center leading-tight">
                40% OTP · 25% Aglomeración · 20% Cobertura · 15% Riesgo
                <br />
                <span className="text-slate-700">
                  Si un componente no tiene datos, su peso se redistribuye.
                </span>
              </p>
            </div>

            {/* 4 KPIs lg:col-span-4 (split en 2x2) */}
            <div className="lg:col-span-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <KPICard
                label="Puntualidad (OTP)"
                value={
                  estadoServicios.conAtraso > 0
                    ? networkHealth.components.otp.toFixed(1)
                    : null
                }
                suffix="%"
                description={`${estadoServicios.puntuales} de ${estadoServicios.conAtraso} servicios con desvío ≤3 min hoy. Métrica estándar UITP.`}
                link="/dashboard/traffic/otp"
                linkLabel="Ver detalle de puntualidad"
                severity={otpSeverity}
                icon={Gauge}
              />
              <KPICard
                label="Índice de Aglomeración (24h)"
                value={bunching24h}
                description={`Eventos de aglomeración registrados en 24h entre operadores. Inspirado en “Bunching Index” de NYC MTA.`}
                link="/dashboard/traffic/shadow-analytics"
                linkLabel="Ver Analítica de Sombra"
                severity={bunchingSeverity}
                icon={Activity}
              />
              <KPICard
                label="Cumplimiento de Servicio"
                value={
                  estadoServicios.total > 0
                    ? Math.round((estadoServicios.activos / estadoServicios.total) * 100)
                    : null
                }
                suffix="%"
                description={`${estadoServicios.activos} de ${estadoServicios.total} servicios planificados ejecutándose. Equivalente a “Service Delivery” en TfL/Swiftly.`}
                link="/dashboard/traffic/auto-stats"
                linkLabel="Ver Cumplimiento"
                severity={coverageSeverity}
                icon={Bus}
              />
              <KPICard
                label="Riesgo Operativo"
                value={incidenciasAlta + personalSinAsignar}
                description={`${incidenciasAlta} incidencias críticas + ${personalSinAsignar} servicios sin chofer próx. 60 min.`}
                link="/dashboard/traffic/incident-command"
                linkLabel="Ver Centro de Incidencias"
                severity={riskSeverity}
                icon={Zap}
              />
            </div>
          </section>

          {/* ─────────────── TENDENCIAS HISTÓRICAS (7D / 30D) ─────────────── */}
          {periodo !== 'today' && (
            <section className="rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900/80 to-slate-900/30 p-5 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-black text-white tracking-tight flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-cyan-400" />
                    Tendencias — últimos {periodo === '7d' ? '7' : '30'} días
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Puntualidad (OTP) y Aglomeración por día. Datos agregados de{' '}
                    <code className="text-slate-400">vehicle_events</code> y{' '}
                    <code className="text-slate-400">alertas_regulacion</code>. Cache 10 min.
                  </p>
                </div>
                {historicLoading && (
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando histórico…
                  </div>
                )}
              </div>

              {historicError ? (
                <div className="rounded-xl border border-red-500/20 bg-red-950/20 p-4 text-xs text-red-300">
                  No se pudo cargar el histórico: {historicError}. Reintentá con "Actualizar".
                </div>
              ) : historicChartData.length === 0 && !historicLoading ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4 text-xs text-amber-300">
                  Sin datos en la ventana solicitada. Probá ampliar el rango o cambiar de operador.
                </div>
              ) : (
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart data={historicChartData} margin={{ top: 5, right: 12, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis
                        dataKey="dateShort"
                        stroke="#64748b"
                        fontSize={11}
                        interval={periodo === '30d' ? 4 : 0}
                      />
                      <YAxis
                        yAxisId="left"
                        stroke="#22d3ee"
                        fontSize={10}
                        domain={[0, 100]}
                        label={{ value: 'OTP %', angle: -90, position: 'insideLeft', fill: '#22d3ee', fontSize: 10 }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#f59e0b"
                        fontSize={10}
                        label={{ value: 'Aglom. eventos', angle: 90, position: 'insideRight', fill: '#f59e0b', fontSize: 10 }}
                      />
                      <ReTooltip
                        contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, fontSize: 11 }}
                        labelStyle={{ color: '#e2e8f0' }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="otp"
                        name="Puntualidad (OTP %)"
                        stroke="#22d3ee"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#22d3ee' }}
                        connectNulls={false}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="bunching"
                        name="Aglomeración (eventos)"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#f59e0b' }}
                        connectNulls={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
          )}

          {/* ─────────────── HOT ZONES + RIESGOS ─────────────── */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Hot Zones (col-span-2) */}
            <div className="lg:col-span-2 rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900/80 to-slate-900/30 p-5 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-black text-white tracking-tight flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-red-400" />
                    Zonas Críticas — Corredores en Disputa
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Top 5 corredores donde {empresaCfg.label} comparte recorrido con competidores (matriz DRO).
                  </p>
                </div>
                <Link
                  to="/dashboard/traffic/corridor-intelligence"
                  className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white flex items-center gap-1"
                >
                  Ver matriz completa
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              {hotZones.length > 0 ? (
                <div className="space-y-2">
                  {hotZones.map((zone, i) => (
                    <HotZoneRow key={`${zone.ownLine}-${zone.rivalLine}-${i}`} zone={zone} idx={i} />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/30 p-6 text-center">
                  <BarChart3 className="w-10 h-10 text-slate-600 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-bold text-slate-400">
                    Sin pares cruzados para {empresaCfg.label}
                  </p>
                  <p className="text-[11px] text-slate-600 mt-1">
                    Esto puede significar: (a) la matriz DRO aún no se generó para este operador, (b)
                    no hay solapamiento medible con competidores. Verificá{' '}
                    <Link
                      to="/dashboard/traffic/corridor-intelligence"
                      className="text-blue-400 hover:underline"
                    >
                      Inteligencia de Corredores
                    </Link>
                    .
                  </p>
                </div>
              )}
            </div>

            {/* Riesgos (col-span-1) */}
            <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900/80 to-slate-900/30 p-5 shadow-xl">
              <h3 className="text-sm font-black text-white tracking-tight flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Riesgos Activos
              </h3>

              {risks.length > 0 ? (
                <div className="space-y-2">
                  {risks.map((r) => (
                    <Link
                      key={r.type}
                      to={r.link}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all hover:translate-x-1 ${
                        r.severity === 'high'
                          ? 'border-red-500/30 bg-red-950/20'
                          : 'border-amber-500/20 bg-amber-950/10'
                      }`}
                    >
                      <div
                        className={`p-2 rounded-lg ${
                          r.severity === 'high' ? 'bg-red-500/20' : 'bg-amber-500/20'
                        }`}
                      >
                        <r.icon
                          className={`w-4 h-4 ${
                            r.severity === 'high' ? 'text-red-400' : 'text-amber-400'
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-2xl font-black tabular-nums ${
                            r.severity === 'high' ? 'text-red-400' : 'text-amber-400'
                          }`}
                        >
                          {r.count}
                        </p>
                        <p className="text-[10px] text-slate-400 leading-tight">{r.label}</p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-emerald-500/20 bg-emerald-950/10 p-5 text-center">
                  <Shield className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-bold text-emerald-400">Sin riesgos críticos</p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    No hay incidencias de alta prioridad ni servicios sin chofer en la ventana próxima.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* ─────────────── MARKET SHARE ─────────────── */}
          <section className="rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900/80 to-slate-900/30 p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-black text-white tracking-tight flex items-center gap-2">
                  <Globe className="w-4 h-4 text-cyan-400" />
                  Cuota de Mercado — Buses en Vivo por Línea Compartida
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Participación de {empresaCfg.label} medida en buses GPS activos por línea (sólo
                  líneas con presencia de competidores).
                </p>
              </div>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                {marketShare.conPresencia.length + marketShare.sinPresencia.length} líneas en disputa
              </span>
            </div>

            {marketShare.conPresencia.length + marketShare.sinPresencia.length > 0 ? (
              <div className="space-y-4">
                {/* TABLA 1: Líneas donde el operador propio compite (con presencia) */}
                {marketShare.conPresencia.length > 0 && (
                  <div>
                    <div className="text-[10px] font-black text-cyan-400/80 uppercase tracking-widest mb-2 flex items-center gap-2">
                      <span>● Líneas con presencia propia</span>
                      <span className="text-slate-600">({marketShare.conPresencia.length})</span>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-slate-700/40">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-800/60 text-slate-400 uppercase font-black tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Línea</th>
                      <th className="px-4 py-3">{empresaCfg.label} (propios)</th>
                      <th className="px-4 py-3">Competidores (en vivo)</th>
                      <th className="px-4 py-3">Cuota %</th>
                      <th className="px-4 py-3">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {marketShare.conPresencia.map((row) => {
                      const sharePct = Math.round(row.sharePct);
                      const dominante = sharePct >= 60;
                      const empate = sharePct >= 40 && sharePct < 60;
                      return (
                        <tr
                          key={row.linea}
                          className="hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="px-4 py-3 font-bold text-white">L{row.linea}</td>
                          <td className="px-4 py-3 font-mono text-cyan-300">
                            {row.busesPropia}
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-300">
                            {row.busesRivales}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-slate-700/50 rounded-full overflow-hidden max-w-[100px]">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    dominante
                                      ? 'bg-emerald-500'
                                      : empate
                                        ? 'bg-amber-500'
                                        : 'bg-red-500'
                                  }`}
                                  style={{ width: `${sharePct}%` }}
                                />
                              </div>
                              <span
                                className={`font-black tabular-nums ${
                                  dominante
                                    ? 'text-emerald-400'
                                    : empate
                                      ? 'text-amber-400'
                                      : 'text-red-400'
                                }`}
                              >
                                {sharePct}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[10px] text-slate-500">
                            {Object.entries(row.rivales)
                              .map(([k, v]) => `${k}:${v}`)
                              .join(' · ')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                    </div>
                  </div>
                )}

                {/* TABLA 2: Líneas SIN presencia propia capturadas por rivales — oportunidad de entrar */}
                {marketShare.sinPresencia.length > 0 && (
                  <div>
                    <div className="text-[10px] font-black text-amber-400/80 uppercase tracking-widest mb-2 flex items-center gap-2">
                      <span>● Líneas ajenas dominadas por competencia (oportunidad)</span>
                      <span className="text-slate-600">({marketShare.sinPresencia.length})</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">
                      Líneas donde {empresaCfg.label} no tiene buses operando ahora pero los
                      competidores sí. Información accionable: o bien {empresaCfg.label} cedió
                      esta línea, o no cuenta con permiso, o tiene oportunidad de entrar.
                    </p>
                    <div className="overflow-hidden rounded-xl border border-amber-700/30">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-amber-900/20 text-amber-400 uppercase font-black tracking-wider">
                          <tr>
                            <th className="px-4 py-3">Línea</th>
                            <th className="px-4 py-3">Competidores activos</th>
                            <th className="px-4 py-3">Empresas operando</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-700/20">
                          {marketShare.sinPresencia.map((row) => (
                            <tr key={row.linea} className="hover:bg-amber-900/10 transition-colors">
                              <td className="px-4 py-3 font-bold text-amber-300">L{row.linea}</td>
                              <td className="px-4 py-3 font-mono text-amber-200">{row.busesRivales}</td>
                              <td className="px-4 py-3 text-[10px] text-slate-400">
                                {Object.entries(row.rivales)
                                  .map(([k, v]) => `${k}:${v}`)
                                  .join(' · ')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/30 p-6 text-center">
                <Globe className="w-10 h-10 text-slate-600 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-bold text-slate-400">
                  Sin datos GPS live cross-operador
                </p>
                <p className="text-[11px] text-slate-600 mt-1 max-w-md mx-auto">
                  El endpoint <code className="bg-slate-900 px-1 rounded">/api/positions</code>{' '}
                  no devolvió features con <code className="bg-slate-900 px-1 rounded">codigoEmpresa</code>{' '}
                  visible. Verificá la ingesta IMM (
                  <code className="bg-slate-900 px-1 rounded">stm-online</code>).
                </p>
              </div>
            )}
          </section>

          {/* ─────────────── FOOTER — LINKS A MÓDULOS ─────────────── */}
          <section className="rounded-2xl border border-white/5 bg-slate-900/40 p-4 shadow-xl">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">
              Acceso directo a módulos especializados
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {[
                { to: '/dashboard/traffic/shadow-radar', label: 'Radar Sombra', icon: Radio },
                { to: '/dashboard/traffic/shadow-analytics', label: 'Shadow Analytics', icon: BarChart3 },
                { to: '/dashboard/traffic/corridor-intelligence', label: 'Corredores', icon: Network },
                { to: '/dashboard/traffic/corridor-map', label: 'Mapa Corredores', icon: Map },
                { to: '/dashboard/traffic/otp', label: 'OTP', icon: Activity },
                { to: '/dashboard/traffic/autostats', label: 'Cumplimiento', icon: BarChart3 },
                { to: '/dashboard/traffic/projections', label: 'Proyecciones', icon: TrendingUp },
                { to: '/dashboard/traffic/incidents', label: 'Incidencias', icon: AlertTriangle },
              ].map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/40 hover:bg-slate-800 border border-slate-700/30 hover:border-cyan-500/40 transition-all group"
                >
                  <link.icon className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                  <span className="text-[11px] font-bold text-slate-400 group-hover:text-white transition-colors">
                    {link.label}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
