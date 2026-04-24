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

/* ═══════════════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════════════ */

interface OperadorConfig {
  codigo: number;
  label: string;
  agencyId: string; // valor en shapes_cross_operator.agencyId
}

const EMPRESAS_OPCIONES: ReadonlyArray<OperadorConfig> = [
  { codigo: 70, label: 'UCOT', agencyId: 'UCOT' },
  { codigo: 50, label: 'CUTCSA', agencyId: 'CUTCSA' },
  { codigo: 20, label: 'COME', agencyId: 'COME' },
  { codigo: 10, label: 'COETC', agencyId: 'COETC' },
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
  score: number; // 0-100
  components: {
    otp: number; // 0-100
    bunching: number; // 0-100 (mayor = mejor)
    coverage: number; // 0-100
    risk: number; // 0-100 (mayor = mejor, menos incidencias)
  };
  meta: {
    serviciosTotales: number;
    serviciosPuntuales: number;
    bunchingEvents24h: number;
    flotaActiva: number;
    flotaTotal: number;
    incidenciasAbiertas: number;
  };
}

interface OverlapDoc {
  shapeAKey: string;
  shapeBKey: string;
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

interface PositionFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    codigoEmpresa?: number;
    linea?: string;
    sublinea?: string;
    variante?: string;
    destinoDesc?: string;
  };
}

interface PositionsResponse {
  type: 'FeatureCollection';
  features: PositionFeature[];
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
 * Network Health Score 0-100 — combinación ponderada UITP-style.
 * Pesos: 40% OTP / 25% Bunching / 20% Coverage / 15% Risk.
 */
function computeNetworkHealthScore(input: {
  otpPct: number | null;
  bunchingEvents24h: number;
  flotaActivaPct: number | null;
  incidenciasAbiertasAlta: number;
  bunchingThreshold?: number;
  incidentThreshold?: number;
}): { score: number; components: NetworkHealth['components'] } {
  const otp = input.otpPct ?? 0;
  const bunchingThreshold = input.bunchingThreshold ?? 100;
  const incidentThreshold = input.incidentThreshold ?? 10;

  const bunchingScore = Math.max(
    0,
    100 - (input.bunchingEvents24h / bunchingThreshold) * 100,
  );
  const coverage = input.flotaActivaPct ?? 0;
  const riskScore = Math.max(
    0,
    100 - (input.incidenciasAbiertasAlta / incidentThreshold) * 100,
  );

  const total = otp * 0.4 + bunchingScore * 0.25 + coverage * 0.2 + riskScore * 0.15;
  return {
    score: Math.round(total * 10) / 10,
    components: {
      otp: Math.round(otp * 10) / 10,
      bunching: Math.round(bunchingScore * 10) / 10,
      coverage: Math.round(coverage * 10) / 10,
      risk: Math.round(riskScore * 10) / 10,
    },
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
  const [empresaPropia, setEmpresaPropia] = useState<number>(70);
  const [periodo, setPeriodo] = useState<Periodo>('today');
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(formatHoraSegundosMvd(new Date()));

  const [overlaps, setOverlaps] = useState<OverlapDoc[]>([]);
  const [shapes, setShapes] = useState<ShapeMeta[]>([]);
  const [bunching24h, setBunching24h] = useState(0);
  const [estadoServicios, setEstadoServicios] = useState<{
    total: number;
    activos: number;
    puntuales: number;
    conAtraso: number;
  }>({ total: 0, activos: 0, puntuales: 0, conAtraso: 0 });
  const [flotaTotal, setFlotaTotal] = useState(0);
  const [flotaTaller, setFlotaTaller] = useState(0);
  const [flotaLiveProp, setFlotaLiveProp] = useState(0);
  const [positions, setPositions] = useState<PositionFeature[]>([]);
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
          getDocs(query(collection(db, 'corridor_overlap'), limit(5000))),
          getDocs(query(collection(db, 'shapes_cross_operator'), limit(500))),
          getDocs(
            query(
              collection(db, 'alertas_regulacion'),
              where('timestamp', '>=', sinceTs),
              limit(2000),
            ),
          ),
          ServicioEstadoService.getByDate(today),
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
          ).catch(() => null),
        ]);

      // ── Overlaps + Shapes ──
      const ovs: OverlapDoc[] = overlapsSnap.docs.map((d) => d.data() as OverlapDoc);
      const shps: ShapeMeta[] = shapesSnap.docs.map((d) => {
        const x = d.data() as Record<string, unknown>;
        return {
          key: String(x.key ?? ''),
          agencyId: String(x.agencyId ?? ''),
          empresa: String(x.empresa ?? ''),
          linea: String(x.linea ?? ''),
          sentido: (x.sentido as 'IDA' | 'VUELTA') ?? 'IDA',
          lengthMeters: Number(x.lengthMeters ?? 0),
        };
      });
      setOverlaps(ovs);
      setShapes(shps);

      // ── Bunching 24h ──
      setBunching24h(alertsSnap.size);

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
      const features = posRes?.features ?? [];
      setPositions(features);
      const livePropia = features.filter(
        (f) => f.properties?.codigoEmpresa === empresaPropia,
      ).length;
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

  // ── Derived: Network Health ──────────────────────────────
  const networkHealth: NetworkHealth = useMemo(() => {
    const otpPct =
      estadoServicios.conAtraso > 0
        ? (estadoServicios.puntuales / estadoServicios.conAtraso) * 100
        : null;
    const flotaTotalEstimada = flotaLiveProp > 0 ? flotaLiveProp : Math.max(flotaTotal, 0);
    const flotaActiva = flotaLiveProp > 0 ? flotaLiveProp : flotaTotal - flotaTaller;
    const flotaActivaPct =
      flotaTotalEstimada > 0 ? (flotaActiva / flotaTotalEstimada) * 100 : null;

    const { score, components } = computeNetworkHealthScore({
      otpPct,
      bunchingEvents24h: bunching24h,
      flotaActivaPct,
      incidenciasAbiertasAlta: incidenciasAlta,
    });

    return {
      score,
      components,
      meta: {
        serviciosTotales: estadoServicios.total,
        serviciosPuntuales: estadoServicios.puntuales,
        bunchingEvents24h: bunching24h,
        flotaActiva,
        flotaTotal: flotaTotalEstimada,
        incidenciasAbiertas: incidenciasAlta,
      },
    };
  }, [estadoServicios, bunching24h, flotaLiveProp, flotaTotal, flotaTaller, incidenciasAlta]);

  // ── Derived: Hot Zones ───────────────────────────────────
  const hotZones: HotZone[] = useMemo(() => {
    const propiaShapes = shapes.filter((s) => s.agencyId === empresaCfg.agencyId);
    if (propiaShapes.length === 0 || overlaps.length === 0) return [];

    const propiaKeys = new Set(propiaShapes.map((s) => s.key));
    const shapesByKey = new Map(shapes.map((s) => [s.key, s]));

    const candidates = overlaps.filter(
      (o) =>
        !o.sameEmpresa &&
        propiaKeys.has(o.shapeAKey) &&
        shapesByKey.has(o.shapeBKey),
    );

    const ranked = candidates
      .map((o) => {
        const a = shapesByKey.get(o.shapeAKey)!;
        const b = shapesByKey.get(o.shapeBKey)!;
        const severityScore = 100 - o.pctAInB; // mayor pct = menor score
        const severity = severityFromScore(severityScore);
        return {
          ownLine: a.linea,
          ownSentido: a.sentido,
          ownAgency: a.agencyId,
          rivalAgency: b.agencyId,
          rivalLine: b.linea,
          rivalSentido: b.sentido,
          pctOverlap: o.pctAInB,
          sharedKm: o.sharedKm,
          severity,
        } satisfies HotZone;
      })
      .sort((x, y) => y.pctOverlap * y.sharedKm - x.pctOverlap * x.sharedKm) // peso = % * km
      .slice(0, 5);

    return ranked;
  }, [overlaps, shapes, empresaCfg.agencyId]);

  // ── Derived: Market Share por línea ─────────────────────
  const marketShare: MarketShareRow[] = useMemo(() => {
    if (positions.length === 0) return [];

    const byLine: Map<
      string,
      { propia: number; rivales: Record<string, number> }
    > = new Map();

    for (const f of positions) {
      const linea = (f.properties?.linea ?? f.properties?.sublinea ?? '').toString().trim();
      if (!linea) continue;
      const ce = f.properties?.codigoEmpresa;
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

    const rows: MarketShareRow[] = [];
    for (const [linea, agg] of byLine) {
      const rivalesTotal = Object.values(agg.rivales).reduce((a, b) => a + b, 0);
      const totalBuses = agg.propia + rivalesTotal;
      if (totalBuses === 0) continue;
      // Sólo mostrar líneas donde hay competencia REAL (al menos 1 rival)
      if (rivalesTotal === 0) continue;
      rows.push({
        linea,
        busesPropia: agg.propia,
        busesRivales: rivalesTotal,
        totalBuses,
        sharePct: (agg.propia / totalBuses) * 100,
        rivales: agg.rivales,
      });
    }

    return rows
      .sort((a, b) => b.totalBuses - a.totalBuses)
      .slice(0, 8);
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
              Network Command
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
                title={p.id !== 'today' ? 'Próximamente — backend de históricos en construcción' : ''}
                disabled={p.id !== 'today'}
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
                  Network Health
                </p>
                <p className="text-[10px] text-slate-500 mb-3">{empresaCfg.label}</p>
              </div>
              <HealthGauge score={networkHealth.score} />
              <div className="mt-3 grid grid-cols-2 gap-2 w-full text-[9px]">
                <div className="bg-slate-800/40 rounded-lg p-1.5 border border-white/5">
                  <span className="text-slate-500 block">OTP</span>
                  <span className={`font-black ${colorFromSeverity(otpSeverity)}`}>
                    {networkHealth.components.otp.toFixed(0)}
                  </span>
                </div>
                <div className="bg-slate-800/40 rounded-lg p-1.5 border border-white/5">
                  <span className="text-slate-500 block">Bunch</span>
                  <span className={`font-black ${colorFromSeverity(bunchingSeverity)}`}>
                    {networkHealth.components.bunching.toFixed(0)}
                  </span>
                </div>
                <div className="bg-slate-800/40 rounded-lg p-1.5 border border-white/5">
                  <span className="text-slate-500 block">Cover</span>
                  <span className={`font-black ${colorFromSeverity(coverageSeverity)}`}>
                    {networkHealth.components.coverage.toFixed(0)}
                  </span>
                </div>
                <div className="bg-slate-800/40 rounded-lg p-1.5 border border-white/5">
                  <span className="text-slate-500 block">Risk</span>
                  <span className={`font-black ${colorFromSeverity(riskSeverity)}`}>
                    {networkHealth.components.risk.toFixed(0)}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-[8px] text-slate-600 text-center leading-tight">
                40% OTP · 25% Bunching · 20% Cobertura · 15% Riesgo
              </p>
            </div>

            {/* 4 KPIs lg:col-span-4 (split en 2x2) */}
            <div className="lg:col-span-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <KPICard
                label="Service Reliability (OTP)"
                value={
                  estadoServicios.conAtraso > 0
                    ? networkHealth.components.otp.toFixed(1)
                    : null
                }
                suffix="%"
                description={`${estadoServicios.puntuales} de ${estadoServicios.conAtraso} servicios con desvío ≤3 min hoy. Estándar UITP.`}
                link="/dashboard/traffic/otp"
                linkLabel="Ver OTP detallado"
                severity={otpSeverity}
                icon={Gauge}
              />
              <KPICard
                label="Bunching Index (24h)"
                value={bunching24h}
                description={`Eventos shadow registrados en 24h cross-operador. Inspirado en NYC MTA Bunching Index.`}
                link="/dashboard/traffic/shadow-analytics"
                linkLabel="Ver Shadow Analytics"
                severity={bunchingSeverity}
                icon={Activity}
              />
              <KPICard
                label="Service Delivery"
                value={
                  estadoServicios.total > 0
                    ? Math.round((estadoServicios.activos / estadoServicios.total) * 100)
                    : null
                }
                suffix="%"
                description={`${estadoServicios.activos} de ${estadoServicios.total} servicios planificados ejecutándose. Métrica TfL/Swiftly.`}
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
                linkLabel="Ver Incident Center"
                severity={riskSeverity}
                icon={Zap}
              />
            </div>
          </section>

          {/* ─────────────── HOT ZONES + RIESGOS ─────────────── */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Hot Zones (col-span-2) */}
            <div className="lg:col-span-2 rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900/80 to-slate-900/30 p-5 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-black text-white tracking-tight flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-red-400" />
                    Hot Zones — Corredores en Disputa
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Top 5 corredores donde {empresaCfg.label} comparte recorrido con rivales (matriz DRO).
                  </p>
                </div>
                <Link
                  to="/dashboard/traffic/corridor-intelligence"
                  className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white flex items-center gap-1"
                >
                  Ver matriz
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
                    Sin pares cross-operador para {empresaCfg.label}
                  </p>
                  <p className="text-[11px] text-slate-600 mt-1">
                    Esto puede significar: (a) la matriz DRO aún no se generó para este operador, (b)
                    no hay solapamiento medible con rivales. Verificá{' '}
                    <Link
                      to="/dashboard/traffic/corridor-intelligence"
                      className="text-blue-400 hover:underline"
                    >
                      Corridor Intelligence
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
                  Market Share — Buses Live por Línea Compartida
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Participación de {empresaCfg.label} medida en buses GPS activos por línea (sólo
                  líneas con presencia rival).
                </p>
              </div>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                {marketShare.length} líneas en disputa
              </span>
            </div>

            {marketShare.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-slate-700/40">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-800/60 text-slate-400 uppercase font-black tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Línea</th>
                      <th className="px-4 py-3">{empresaCfg.label} (propios)</th>
                      <th className="px-4 py-3">Rivales (live)</th>
                      <th className="px-4 py-3">Share %</th>
                      <th className="px-4 py-3">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {marketShare.map((row) => {
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
              Módulos Especializados
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { to: '/dashboard/traffic/shadow-radar', label: 'Shadow Radar (live)' },
                { to: '/dashboard/traffic/shadow-analytics', label: 'Shadow Analytics' },
                { to: '/dashboard/traffic/corridor-intelligence', label: 'Corridor Intelligence' },
                { to: '/dashboard/traffic/corridor-map', label: 'Corridor Map' },
                { to: '/dashboard/traffic/otp', label: 'OTP Dashboard' },
                { to: '/dashboard/traffic/auto-stats', label: 'Cumplimiento Horario' },
                { to: '/dashboard/traffic/economic-projections', label: 'Proyecciones Económicas' },
                { to: '/dashboard/traffic/digital-agents', label: 'Agentes Digitales' },
                { to: '/dashboard/traffic/incident-command', label: 'Incident Center' },
              ].map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-slate-800/60 text-slate-300 hover:bg-slate-700 hover:text-white border border-white/5 transition-all"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
