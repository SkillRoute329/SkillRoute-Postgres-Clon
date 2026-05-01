/**
 * CompetitorIntelligencePage — Dashboard de Inteligencia Competitiva en Tiempo Real
 * Fuente exclusiva: Bridge Server (localhost:3099) → STM Montevideo
 * CERO datos hardcodeados / simulados.
 */

import { useState, useEffect, useCallback } from 'react';
import HrrDashboard from './components/HrrDashboard';
import {
  AlertTriangle,
  RefreshCw,
  Bus,
  Zap,
  Shield,
  TrendingUp,
  Clock,
  ChevronRight,
  Wifi,
  WifiOff,
  X,
  Target,
  Globe2,
} from 'lucide-react';
import { GtfsSchedulePanel } from '../../components/competition/GtfsSchedulePanel';
import { collection, getDocs, query, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';

interface OverlapRecord {
  agencyA: string; lineaA: string; empresaA: string;
  agencyB: string; lineaB: string; empresaB: string;
  pctAInB: number; sharedKm: number; sameEmpresa: boolean;
}

const EMPRESAS_STM = [
  { codigo: 70, nombre: 'UCOT',   color: 'amber'   },
  { codigo: 50, nombre: 'CUTCSA', color: 'blue'    },
  { codigo: 20, nombre: 'COME',   color: 'emerald' },
  { codigo: 10, nombre: 'COETC',  color: 'violet'  },
] as const;

interface LineaCompetidor {
  id: string; numeroLineaTexto: string;
  activa: boolean; busesActivosUltimoSnapshot: number;
  sublineas: string[]; destinos: string[];
}

const BRIDGE_PRIMARY = import.meta.env.PROD
  ? ''
  : (import.meta.env.VITE_BRIDGE_URL || 'http://localhost:3099');

/**
 * Fix #5 (2026-04-23): URL de fallback cuando el Bridge local no responde.
 * Apunta a la Cloud Function intelligenceApi en Firebase (misma API contract).
 * Si se setea VITE_BRIDGE_FALLBACK_URL en .env se puede sobreescribir.
 */
const BRIDGE_FALLBACK =
  import.meta.env.VITE_BRIDGE_FALLBACK_URL ||
  'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/intelligenceApi';

// ─── Tipos ─────────────────────────────────────────────────────────────────
interface BusInfo {
  codigoBus: string | null;
  linea: string | null;
  sublinea: string | null;
  destino: string | null;
  velocidad: number;
  lat: number;
  lng: number;
}

interface CompetidorCercano {
  codigoBus: string | null;
  empresa: number | string;
  linea: string | null;
  sublinea: string | null;
  destino: string | null;
  distanciaKm: number;
  lat: number;
  lng: number;
}

interface Alerta {
  busUcot: BusInfo;
  competidoresCercanos: CompetidorCercano[];
  maxAmenaza: CompetidorCercano;
}

interface Resumen {
  totalBusesUcot: number;
  busesConCompetenciaDirecta: number;
  pctFlotaEnDisputa: number;
  nivelAlerta: string;
  empresasDetectadas: string[];
}

interface AnalysisData {
  ok: boolean;
  linea: string;
  resumen: Resumen;
  alertas: Alerta[];
  timestamp: string;
  mensaje?: string;
}

interface LineaData {
  linea: string;
  sublinea: string | null;
  cantidad: number;
  buses: BusInfo[];
}

interface LineasData {
  ok: boolean;
  totalLineas: number;
  totalBuses: number;
  timestamp: string;
  lineas: LineaData[];
}

// ─── Utilidades de UI ──────────────────────────────────────────────────────
function nivelColor(nivel: string) {
  if (nivel?.includes('ALTA'))
    return {
      bg: 'bg-red-500/20',
      border: 'border-red-500/40',
      text: 'text-red-400',
      bar: 'bg-red-500',
    };
  if (nivel?.includes('MEDIA'))
    return {
      bg: 'bg-amber-500/20',
      border: 'border-amber-500/40',
      text: 'text-amber-400',
      bar: 'bg-amber-500',
    };
  return {
    bg: 'bg-emerald-500/20',
    border: 'border-emerald-500/40',
    text: 'text-emerald-400',
    bar: 'bg-emerald-500',
  };
}

function pctColor(pct: number) {
  if (pct >= 50) return 'bg-red-500';
  if (pct >= 20) return 'bg-amber-500';
  return 'bg-emerald-500';
}

// ─── Componente: Tarjeta de línea ──────────────────────────────────────────
function LineCard({
  linea,
  sublinea,
  cantidad,
  analysis,
  onClick,
  isSelected,
  isLoadingAnalysis,
}: {
  linea: string;
  sublinea: string | null;
  cantidad: number;
  analysis: AnalysisData | null;
  onClick: () => void;
  isSelected: boolean;
  isLoadingAnalysis: boolean;
}) {
  const pct = analysis?.resumen?.pctFlotaEnDisputa ?? null;
  const nivel = analysis?.resumen?.nivelAlerta ?? null;
  const colors = nivel ? nivelColor(nivel) : null;

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left rounded-xl border p-4 transition-all duration-200
        hover:scale-[1.02] hover:shadow-lg cursor-pointer
        ${
          isSelected
            ? 'border-indigo-500/60 bg-indigo-500/10 shadow-md shadow-indigo-500/10'
            : colors
              ? `${colors.border} ${colors.bg}`
              : 'border-slate-700/50 bg-slate-800/60'
        }
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-2xl font-extrabold text-white tracking-tight">Línea {linea}</span>
          {sublinea && (
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[140px]">{sublinea}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs bg-slate-700/60 text-slate-300 px-2 py-0.5 rounded-full">
            {cantidad} bus{cantidad !== 1 ? 'es' : ''}
          </span>
          {nivel && <span className={`text-[10px] font-semibold ${colors?.text}`}>{nivel}</span>}
        </div>
      </div>

      {/* Barra de progreso */}
      {isLoadingAnalysis ? (
        <div className="h-2 rounded-full bg-slate-700 animate-pulse" />
      ) : pct !== null ? (
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-slate-700/80 overflow-hidden">
            <style>{`#prog-c-${linea} { width: ${Math.min(pct, 100)}%; }`}</style>
            <div
              id={`prog-c-${linea}`}
              className={`h-full rounded-full transition-all duration-700 ${pctColor(pct)}`}
            />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-slate-500">Flota en disputa</span>
            <span className={`text-xs font-bold ${colors?.text ?? 'text-slate-400'}`}>{pct}%</span>
          </div>
        </div>
      ) : (
        <div className="h-2 rounded-full bg-slate-700/50" />
      )}

      {isSelected && (
        <div className="flex items-center gap-1 mt-3 text-indigo-400 text-xs font-medium">
          <ChevronRight className="w-3 h-3" />
          <span>Ver detalle</span>
        </div>
      )}
    </button>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────
export default function CompetitorIntelligencePage() {
  const [bridgeOk, setBridgeOk] = useState<boolean | null>(null);
  /**
   * Fix #5 (2026-04-23): activeBridge es el base URL que está respondiendo.
   * Arranca en BRIDGE_PRIMARY y, si falla health, intenta BRIDGE_FALLBACK.
   * Solo si ambos fallan dejamos bridgeOk = false.
   */
  const [activeBridge, setActiveBridge] = useState<string>(BRIDGE_PRIMARY);
  const [usingFallback, setUsingFallback] = useState<boolean>(false);
  const [lineas, setLineas] = useState<LineaData[]>([]);
  const [totalBuses, setTotalBuses] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [loadingLineas, setLoadingLineas] = useState(true);
  const [empresaSel, setEmpresaSel] = useState<number>(70);
  const empresaNombre = EMPRESAS_STM.find(e => e.codigo === empresaSel)?.nombre ?? 'propia';
  const [activeTab, setActiveTab] = useState<'intelligence' | 'hrr'>('intelligence');
  const [lineasComp, setLineasComp] = useState<LineaCompetidor[]>([]);
  const [loadingComp, setLoadingComp] = useState(false);
  const [totalBusesComp, setTotalBusesComp] = useState(0);
  const [selectedCompLinea, setSelectedCompLinea] = useState<LineaCompetidor | null>(null);
  const [compOverlaps, setCompOverlaps] = useState<OverlapRecord[]>([]);
  const [loadingOverlaps, setLoadingOverlaps] = useState(false);

  // Análisis por línea
  const [analysisMap, setAnalysisMap] = useState<Record<string, AnalysisData>>({});
  const [loadingAnalysis, setLoadingAnalysis] = useState<Record<string, boolean>>({});
  const [selectedLinea, setSelectedLinea] = useState<string | null>(null);

  // Panel deslizante de detalle
  const [detailData, setDetailData] = useState<AnalysisData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // ─── Cargar líneas UCOT ──────────────────────────────────────────────────
  const cargarLineas = useCallback(async () => {
    setLoadingLineas(true);

    // Fix #5: intentar primario y, si falla, fallback Cloud Function
    const tryHealth = async (base: string): Promise<boolean> => {
      try {
        const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(3000) });
        if (health.ok) return true;
        // Bridge local usa /health (sin prefix) — probamos compatibilidad
        const healthLegacy = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
        return healthLegacy.ok;
      } catch {
        return false;
      }
    };

    let base = BRIDGE_PRIMARY;
    let ok = await tryHealth(BRIDGE_PRIMARY);
    if (!ok && BRIDGE_FALLBACK) {
      console.warn('[CompetitorIntelligence] Bridge primario caído, usando fallback Cloud Function');
      ok = await tryHealth(BRIDGE_FALLBACK);
      if (ok) {
        base = BRIDGE_FALLBACK;
        setUsingFallback(true);
      }
    }
    if (!ok) {
      setBridgeOk(false);
      setLoadingLineas(false);
      return;
    }
    setActiveBridge(base);
    setBridgeOk(true);

    try {
      const res = await fetch(`${base}/api/lines/ucot`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
      const data: LineasData = await res.json();

      if (!data.ok) throw new Error('STM no disponible');

      setLineas(data.lineas);
      setTotalBuses(data.totalBuses);
      setLastUpdate(data.timestamp);

      // Cargar análisis concurrente para todas las líneas (en lotes de 5)
      const lotes = [];
      for (let i = 0; i < data.lineas.length; i += 5) {
        lotes.push(data.lineas.slice(i, i + 5));
      }

      for (const lote of lotes) {
        const loading: Record<string, boolean> = {};
        for (const l of lote) loading[l.linea] = true;
        setLoadingAnalysis((prev) => ({ ...prev, ...loading }));

        await Promise.allSettled(
          lote.map(async (l) => {
            try {
              const r = await fetch(`${base}/api/analysis/${l.linea}`, {
                signal: AbortSignal.timeout(15000),
              });
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              const a: AnalysisData = await r.json();
              setAnalysisMap((prev) => ({ ...prev, [l.linea]: a }));
            } catch {
              // silencioso
            } finally {
              setLoadingAnalysis((prev) => ({ ...prev, [l.linea]: false }));
            }
          }),
        );
      }
    } catch (err) {
      console.error('Error cargando líneas STM:', err);
    } finally {
      setLoadingLineas(false);
    }
  }, []);

  useEffect(() => {
    cargarLineas();
  }, [cargarLineas]);

  // ─── Cargar detalle de línea ─────────────────────────────────────────────
  const cargarDetalle = useCallback(async (linea: string) => {
    setSelectedLinea(linea);
    setLoadingDetail(true);
    setDetailData(null);

    try {
      // Fix #5: usar activeBridge (primario o fallback) en lugar del literal
      const res = await fetch(`${activeBridge}/api/analysis/${linea}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AnalysisData = await res.json();
      setDetailData(data);
      setAnalysisMap((prev) => ({ ...prev, [linea]: data }));
      // Cargar solapamiento DRO real en paralelo (reemplaza análisis de proximidad como fuente primaria)
      void cargarOverlaps('70', linea);
    } catch (err) {
      console.error('Error cargando análisis:', err);
    } finally {
      setLoadingDetail(false);
    }
  }, [activeBridge]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Cargar líneas de empresa competidora (Firestore) ──────────
  const cargarLineasCompetidor = async (codigo: number) => {
    setLoadingComp(true);
    setLineasComp([]);
    try {
      const snap = await getDoc(doc(db, 'competidores', `emp-${codigo}`));
      if (!snap.exists()) { setLoadingComp(false); return; }
      const data = snap.data();
      const arr = (data.lineas ?? []) as LineaCompetidor[];
      const activas = arr
        .filter((l) => l.activa || l.busesActivosUltimoSnapshot > 0)
        .sort((a, b) => b.busesActivosUltimoSnapshot - a.busesActivosUltimoSnapshot);
      setLineasComp(activas);
      setTotalBusesComp(activas.reduce((s, l) => s + (l.busesActivosUltimoSnapshot ?? 0), 0));
    } catch (err) {
      console.error('Error cargando competidor:', err);
    } finally {
      setLoadingComp(false);
    }
  };

  useEffect(() => {
    if (empresaSel !== 70) void cargarLineasCompetidor(empresaSel);
  }, [empresaSel]); // eslint-disable-line

  // ─── Solapamiento DRO para línea seleccionada ──────────────────
  const cargarOverlaps = async (agencyId: string, linea: string) => {
    setLoadingOverlaps(true);
    setCompOverlaps([]);
    try {
      const snap = await getDocs(query(collection(db, 'corridor_overlap'), limit(3000)));
      const relevant = snap.docs
        .map((d) => d.data() as OverlapRecord)
        .filter(
          (d) =>
            !d.sameEmpresa &&
            ((d.agencyA === agencyId && d.lineaA === linea) ||
             (d.agencyB === agencyId && d.lineaB === linea)),
        )
        .sort((a, b) => b.sharedKm - a.sharedKm);
      setCompOverlaps(relevant);
    } catch (err) {
      console.error('Error cargando solapamiento:', err);
    } finally {
      setLoadingOverlaps(false);
    }
  };

  // ─── Estadísticas globales rápidas ──────────────────────────────────────
  const statsGlobales = (() => {
    const analyses = Object.values(analysisMap);
    if (!analyses.length) return null;
    const alta = analyses.filter((a) => a.resumen?.nivelAlerta?.includes('ALTA')).length;
    const media = analyses.filter((a) => a.resumen?.nivelAlerta?.includes('MEDIA')).length;
    const baja = analyses.filter((a) => a.resumen?.nivelAlerta?.includes('BAJA')).length;
    return { alta, media, baja, total: analyses.length };
  })();

  // ─── Bridge no disponible ────────────────────────────────────────────────
  if (bridgeOk === false) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh] p-8">
        <div className="text-center max-w-lg bg-slate-800/60 border border-red-500/30 rounded-2xl p-10 shadow-2xl">
          <WifiOff className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Bridge Server no disponible</h2>
          <p className="text-slate-400 mb-6 text-sm">
            El servidor proxy hacia la API STM no está corriendo.
          </p>
          <div className="bg-slate-900/80 rounded-xl p-4 text-left mb-6 border border-slate-700">
            <p className="text-xs text-slate-500 mb-1 font-mono uppercase tracking-wider">
              Ejecutá en una terminal:
            </p>
            <code className="text-emerald-400 font-mono text-sm block">
              cd backend &amp;&amp; npm run bridge
            </code>
            <p className="text-xs text-slate-500 mt-2 font-mono uppercase tracking-wider">
              O con npm:
            </p>
            <code className="text-emerald-400 font-mono text-sm block">npm run bridge</code>
          </div>
          <button
            onClick={cargarLineas}
            className="flex items-center gap-2 mx-auto bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Reintentar conexión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden bg-[#0A0D14] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(99,102,241,0.15),rgba(255,255,255,0))]">
      {/* ── Panel izquierdo: grid de líneas ─────────────────────────────── */}
      <div
        className={`flex-1 flex flex-col overflow-hidden transition-all duration-500 ease-out ${selectedLinea ? 'max-w-[55%]' : 'max-w-full'}`}
      >
        {/* Header */}
        <div className="flex-none px-8 py-6 border-b border-white/5 bg-white/[0.02] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-100 to-indigo-400 flex items-center gap-3 tracking-tight">
                <Target className="w-6 h-6 text-indigo-400" />
                Centro de Inteligencia Competitiva
              </h1>
              <p className="text-xs text-indigo-200/50 mt-1 font-medium tracking-wide uppercase">Fuente: Radar STM Global — Tiempo real</p>
            </div>
            <div className="flex items-center gap-3">
              {bridgeOk === true && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1.5 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                  <Wifi className="w-3.5 h-3.5 animate-pulse" />
                  <span className="font-semibold tracking-wide">ENLACE ACTIVO</span>
                </span>
              )}
              {/* Tabs */}
              <div className="flex items-center gap-1 bg-slate-800/60 border border-slate-700/50 rounded-xl p-1">
                <button
                  onClick={() => setActiveTab('intelligence')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === 'intelligence' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                >
                  Inteligencia
                </button>
                <button
                  onClick={() => setActiveTab('hrr')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === 'hrr' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                >
                  HRR en vivo
                </button>
              </div>
              <button
                onClick={cargarLineas}
                disabled={loadingLineas}
                className="flex items-center gap-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-100 border border-indigo-500/30 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-300 disabled:opacity-50 shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/20"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingLineas ? 'animate-spin' : ''}`} />
                Actualizar
              </button>
            </div>
          </div>

          {/* Stats bar */}
          {statsGlobales && (
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <Bus className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs text-slate-400">
                  <span className="text-white font-bold">
                    {empresaSel === 70 ? totalBuses : totalBusesComp}
                  </span> buses {EMPRESAS_STM.find((e) => e.codigo === empresaSel)?.nombre} activos
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs text-slate-400">
                  <span className="text-white font-bold">
                    {empresaSel === 70 ? lineas.length : lineasComp.length}
                  </span> líneas
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-red-400 font-semibold">{statsGlobales.alta}🔴</span>
                <span className="text-xs text-slate-600">·</span>
                <span className="text-xs text-amber-400 font-semibold">
                  {statsGlobales.media}🟡
                </span>
                <span className="text-xs text-slate-600">·</span>
                <span className="text-xs text-emerald-400 font-semibold">
                  {statsGlobales.baja}🟢
                </span>
              </div>
              {lastUpdate && (
                <div className="ml-auto flex items-center gap-1 text-[10px] text-slate-600">
                  <Clock className="w-3 h-3" />
                  {new Date(lastUpdate).toLocaleTimeString('es-UY')}
                </div>
              )}
            </div>
          )}

          {/* Selector de empresa */}
          <div className="flex flex-wrap gap-1 mt-3 pt-2 border-t border-slate-800/40">
            {EMPRESAS_STM.map((emp) => {
              const active = empresaSel === emp.codigo;
              const colorClass: Record<string, string> = {
                amber:   'border-amber-500/60 text-amber-300 bg-amber-500/10',
                blue:    'border-blue-500/60 text-blue-300 bg-blue-500/10',
                emerald: 'border-emerald-500/60 text-emerald-300 bg-emerald-500/10',
                violet:  'border-violet-500/60 text-violet-300 bg-violet-500/10',
              };
              return (
                <button key={emp.codigo}
                  onClick={() => { setEmpresaSel(emp.codigo); setSelectedLinea(null); setDetailData(null); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    active
                      ? (colorClass[emp.color] ?? 'border-indigo-500/60 text-white bg-indigo-500/10')
                      : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <Bus className="w-3 h-3" />
                  {emp.nombre}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tab HRR en vivo ──────────────────────────────────────────────── */}
        {activeTab === 'hrr' && (
          <div className="flex-1 overflow-hidden">
            <HrrDashboard agencyId={String(empresaSel)} />
          </div>
        )}

        {/* ── Tab Inteligencia (contenido original) ────────────────────────── */}
        <div className={activeTab === 'hrr' ? 'hidden' : 'flex-1 overflow-y-auto p-4'}>
          {empresaSel !== 70 ? (
            /* ── Líneas de empresa competidora (Firestore) ── */
            loadingComp ? (
              <div className="grid grid-cols-2 gap-3">
                {[1,2,3,4,5,6].map((i) => (
                  <div key={i} className="h-24 rounded-xl bg-slate-800/50 animate-pulse" />
                ))}
              </div>
            ) : lineasComp.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Globe2 className="w-10 h-10 text-slate-600 mb-3" />
                <p className="text-slate-500 text-sm">
                  Sin datos para {EMPRESAS_STM.find((e) => e.codigo === empresaSel)?.nombre}
                </p>
                <button
                  onClick={() => void cargarLineasCompetidor(empresaSel)}
                  className="mt-3 text-xs text-indigo-400 hover:text-indigo-300"
                >
                  Reintentar
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {lineasComp.map((l) => {
                  const colorMap: Record<number, { a: string; b: string; bg: string }> = {
                    50: { a: 'text-blue-400',    b: 'border-blue-500/20',    bg: 'bg-blue-500/5'    },
                    20: { a: 'text-emerald-400', b: 'border-emerald-500/20', bg: 'bg-emerald-500/5' },
                    10: { a: 'text-violet-400',  b: 'border-violet-500/20',  bg: 'bg-violet-500/5'  },
                  };
                  const c = colorMap[empresaSel] ?? { a: 'text-slate-400', b: 'border-slate-700/50', bg: 'bg-slate-800/30' };
                  return (
                    <div
                      key={l.id}
                      onClick={() => {
                        setSelectedCompLinea(l);
                        setSelectedLinea(l.numeroLineaTexto);
                        void cargarOverlaps(String(empresaSel), l.numeroLineaTexto);
                      }}
                      className={`rounded-xl border ${c.b} ${c.bg} p-3 flex flex-col gap-2 cursor-pointer hover:brightness-125 transition-all ${selectedLinea === l.numeroLineaTexto ? 'ring-1 ring-white/20' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-lg font-black ${c.a}`}>Línea {l.numeroLineaTexto}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          l.busesActivosUltimoSnapshot > 0
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-slate-800 text-slate-600'
                        }`}>
                          {l.busesActivosUltimoSnapshot} buses
                        </span>
                      </div>
                      {(l.destinos?.[0] || l.destinos?.[1]) && (
                        <p className="text-[11px] text-slate-400 truncate leading-tight">
                          {l.destinos[0]}{l.destinos[1] ? ` — ${l.destinos[1]}` : ''}
                        </p>
                      )}
                      {l.sublineas?.length > 0 && (
                        <p className="text-[10px] text-slate-600">
                          Variantes: {l.sublineas.slice(0, 4).join(', ')}
                        </p>
                      )}
                      <div className={`text-[10px] font-semibold ${l.activa ? 'text-emerald-500' : 'text-slate-700'}`}>
                        {l.activa ? '● En servicio' : '○ Sin actividad'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : loadingLineas ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 rounded-xl bg-slate-800/50 border border-slate-700/40 animate-pulse"
                />
              ))}
            </div>
          ) : lineas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <AlertTriangle className="w-12 h-12 text-amber-400 mb-4" />
              <p className="text-slate-400 text-sm">No hay buses {empresaNombre} activos en este momento.</p>
              <p className="text-slate-600 text-xs mt-1">
                La API STM puede no tener datos en este horario.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {lineas.map((l) => (
                <LineCard
                  key={l.linea}
                  linea={l.linea}
                  sublinea={l.sublinea}
                  cantidad={l.cantidad}
                  analysis={analysisMap[l.linea] ?? null}
                  isSelected={selectedLinea === l.linea}
                  isLoadingAnalysis={loadingAnalysis[l.linea] ?? false}
                  onClick={() => {
                    if (selectedLinea === l.linea) {
                      setSelectedLinea(null);
                      setDetailData(null);
                    } else {
                      cargarDetalle(l.linea);
                    }
                  }}
                />
              ))}
            </div>
          )}

          {/* ── Horarios GTFS por empresa ─────────────────────────────────── */}
          <div className="mt-6 pt-4 border-t border-slate-800/60">
            <GtfsSchedulePanel />
          </div>
        </div>
      </div>

      {/* ── Panel derecho: detalle de línea ─────────────────────────────── */}
      {selectedLinea && (
        <div className="w-[45%] flex-none border-l border-slate-800/60 flex flex-col overflow-hidden bg-slate-900/40 transition-all duration-300">
          {/* Header detalle */}
          <div className="flex-none px-5 py-4 border-b border-slate-800/60 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-white text-lg">
                {empresaSel !== 70
                  ? `${EMPRESAS_STM.find((e) => e.codigo === empresaSel)?.nombre} — Línea ${selectedLinea}`
                  : `Análisis — Línea ${selectedLinea}`}
              </h2>
              {empresaSel !== 70 && selectedCompLinea && (
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {selectedCompLinea.busesActivosUltimoSnapshot} buses ·{' '}
                  {selectedCompLinea.activa ? 'En servicio' : 'Sin actividad'}
                </p>
              )}
              {empresaSel === 70 && detailData?.timestamp && (
                <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  {new Date(detailData.timestamp).toLocaleTimeString('es-UY')}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (empresaSel !== 70 && selectedCompLinea)
                    void cargarOverlaps(String(empresaSel), selectedCompLinea.numeroLineaTexto);
                  else if (selectedLinea)
                    void cargarDetalle(selectedLinea);
                }}
                disabled={loadingDetail || loadingOverlaps}
                className="text-slate-400 hover:text-white transition-colors"
                title="Actualizar análisis"
              >
                <RefreshCw className={`w-4 h-4 ${(loadingDetail || loadingOverlaps) ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => {
                  setSelectedLinea(null);
                  setDetailData(null);
                  setSelectedCompLinea(null);
                  setCompOverlaps([]);
                }}
                className="text-slate-500 hover:text-slate-300 transition-colors"
                title="Cerrar detalle"
                aria-label="Cerrar detalle"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {empresaSel !== 70 ? (
              /* ── Panel análisis corredor para empresa competidora ── */
              loadingOverlaps ? (
                <div className="space-y-3">
                  {[1,2,3,4].map((i) => <div key={i} className="h-14 rounded-xl bg-slate-800/60 animate-pulse" />)}
                </div>
              ) : selectedCompLinea ? (
                <>
                  {/* Info básica de la línea */}
                  <div className="rounded-xl border border-slate-700/40 bg-slate-800/30 p-4 space-y-1.5">
                    {selectedCompLinea.destinos?.length > 0 && (
                      <p className="text-sm text-slate-300 leading-snug">
                        {selectedCompLinea.destinos.join(' — ')}
                      </p>
                    )}
                    {selectedCompLinea.sublineas?.length > 0 && (
                      <p className="text-xs text-slate-500">
                        Variantes: {selectedCompLinea.sublineas.join(', ')}
                      </p>
                    )}
                  </div>

                  {/* Solapamiento DRO con empresa propia */}
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">
                      Corredores compartidos con {empresaNombre}
                    </p>
                    {compOverlaps.filter((o) => o.agencyA === '70' || o.agencyB === '70').length === 0 ? (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                        <Shield className="w-7 h-7 text-emerald-500 mx-auto mb-1.5" />
                        <p className="text-emerald-300 text-sm font-medium">Sin solapamiento con {empresaNombre}</p>
                        <p className="text-slate-500 text-xs mt-0.5">No comparte corredor con ninguna línea {empresaNombre}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {compOverlaps
                          .filter((o) => o.agencyA === '70' || o.agencyB === '70')
                          .slice(0, 12)
                          .map((o, i) => {
                            const isA = o.agencyA === String(empresaSel);
                            const ucotLinea = isA ? o.lineaB : o.lineaA;
                            const tier =
                              o.pctAInB >= 20
                                ? { label: 'T1', cls: 'bg-red-900/50 text-red-300 border-red-500/30' }
                                : o.pctAInB >= 10
                                ? { label: 'T2', cls: 'bg-amber-900/50 text-amber-300 border-amber-500/30' }
                                : { label: 'T3', cls: 'bg-slate-800 text-slate-400 border-slate-600' };
                            return (
                              <div key={i} className="flex items-center gap-3 bg-slate-800/40 rounded-lg px-3 py-2.5">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-bold text-amber-400">L{ucotLinea}</span>
                                    <span className="text-[10px] text-slate-500">{empresaNombre}</span>
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${tier.cls}`}>
                                      {tier.label}
                                    </span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
                                      style={{ width: `${Math.min(o.pctAInB, 100)}%` }}
                                    />
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-xs font-bold text-white">{Math.round(o.pctAInB)}%</p>
                                  <p className="text-[10px] text-slate-600">{o.sharedKm?.toFixed(1)} km</p>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-700 text-center">
                    DRO sobre shapes GTFS-RT STM 2026 · T1 ≥20% · T2 ≥10% · T3 &lt;10%
                  </p>
                </>
              ) : (
                <p className="text-slate-600 text-sm text-center py-12">Seleccioná una línea para ver el análisis</p>
              )
            ) : loadingDetail ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-20 rounded-xl bg-slate-800/60 animate-pulse" />
                ))}
              </div>
            ) : detailData ? (
              <>
                {/* Resumen */}
                {detailData.mensaje ? (
                  <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-center">
                    <p className="text-slate-400 text-sm">{detailData.mensaje}</p>
                  </div>
                ) : (
                  <div
                    className={`rounded-xl border p-4 ${nivelColor(detailData.resumen.nivelAlerta).bg} ${nivelColor(detailData.resumen.nivelAlerta).border}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                        Nivel de amenaza
                      </span>
                      <span
                        className={`text-sm font-bold ${nivelColor(detailData.resumen.nivelAlerta).text}`}
                      >
                        {detailData.resumen.nivelAlerta}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-900/40 rounded-lg p-3 text-center">
                        <p className="text-2xl font-black text-white">
                          {detailData.resumen.totalBusesUcot}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Buses {empresaNombre}</p>
                      </div>
                      <div className="bg-slate-900/40 rounded-lg p-3 text-center">
                        <p className="text-2xl font-black text-white">
                          {detailData.resumen.busesConCompetenciaDirecta}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">En disputa</p>
                      </div>
                      <div className="bg-slate-900/40 rounded-lg p-3 text-center col-span-2">
                        <div className="h-2.5 rounded-full bg-slate-700 overflow-hidden mb-2">
                          <style>{`#prog-detail { width: ${Math.min(detailData.resumen.pctFlotaEnDisputa, 100)}%; }`}</style>
                          <div
                            id="prog-detail"
                            className={`h-full rounded-full ${pctColor(detailData.resumen.pctFlotaEnDisputa)}`}
                          />
                        </div>
                        <p
                          className={`text-lg font-black ${nivelColor(detailData.resumen.nivelAlerta).text}`}
                        >
                          {detailData.resumen.pctFlotaEnDisputa}%
                          <span className="text-xs text-slate-500 font-normal ml-1">
                            de la flota en disputa
                          </span>
                        </p>
                      </div>
                    </div>
                    {detailData.resumen.empresasDetectadas.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-700/40">
                        <p className="text-[10px] text-slate-500 mb-1.5">
                          Empresas rivales detectadas
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {detailData.resumen.empresasDetectadas.map((emp) => (
                            <span
                              key={emp}
                              className="text-xs bg-slate-800/80 border border-slate-700/50 text-slate-300 px-2 py-0.5 rounded-full"
                            >
                              Emp. {emp}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Solapamiento de corredor DRO (fuente: shapes GTFS-RT) ── */}
                {(loadingOverlaps || compOverlaps.length > 0) && (
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2 flex items-center gap-1.5">
                      <TrendingUp className="w-3 h-3" /> Solapamiento real de corredor
                    </p>
                    {loadingOverlaps ? (
                      <div className="space-y-1.5">
                        {[1,2,3].map((i) => <div key={i} className="h-10 rounded-lg bg-slate-800/60 animate-pulse" />)}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {compOverlaps.slice(0, 8).map((o, i) => {
                          const isA = o.agencyA === '70';
                          const rivalAgency = isA ? o.agencyB : o.agencyA;
                          const rivalLinea  = isA ? o.lineaB  : o.lineaA;
                          const rivalEmp    = isA ? o.empresaB : o.empresaA;
                          const tier = o.pctAInB >= 20
                            ? { label: 'T1', cls: 'bg-red-900/50 text-red-300 border-red-500/30' }
                            : o.pctAInB >= 10
                            ? { label: 'T2', cls: 'bg-amber-900/50 text-amber-300 border-amber-500/30' }
                            : { label: 'T3', cls: 'bg-slate-800 text-slate-400 border-slate-600' };
                          return (
                            <div key={i} className="flex items-center gap-3 bg-slate-800/40 rounded-lg px-3 py-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="text-xs font-bold text-white">L{rivalLinea}</span>
                                  <span className="text-[10px] text-slate-500">{rivalEmp ?? `Emp${rivalAgency}`}</span>
                                  <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${tier.cls}`}>{tier.label}</span>
                                </div>
                                <div className="h-1 rounded-full bg-slate-700 overflow-hidden">
                                  <div className="h-full rounded-full bg-gradient-to-r from-red-500 to-amber-400"
                                    style={{ width: `${Math.min(o.pctAInB, 100)}%` }} />
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xs font-bold text-white">{Math.round(o.pctAInB)}%</p>
                                <p className="text-[10px] text-slate-600">{o.sharedKm?.toFixed(1)} km</p>
                              </div>
                            </div>
                          );
                        })}
                        <p className="text-[10px] text-slate-700 pt-1">
                          Basado en shapes reales — solo rivales que comparten corredor
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Lista de alertas GPS en vivo (proximidad 300m) */}
                {detailData.alertas?.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" />
                      Confrontaciones activas ({detailData.alertas.length})
                    </h3>
                    {detailData.alertas.map((alerta, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-3 space-y-2"
                      >
                        {/* Bus propio */}
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-indigo-500 flex-none" />
                          <span className="text-xs text-slate-400">Bus {empresaNombre}</span>
                          <span className="text-xs font-bold text-white ml-auto">
                            #{alerta.busUcot.codigoBus}
                          </span>
                        </div>
                        {alerta.busUcot.destino && (
                          <p className="text-[10px] text-slate-500 pl-4 -mt-1">
                            → {alerta.busUcot.destino}
                            {alerta.busUcot.velocidad > 0 && ` · ${alerta.busUcot.velocidad} km/h`}
                          </p>
                        )}

                        {/* Competidores cercanos */}
                        <div className="border-t border-slate-700/30 pt-2 space-y-1.5">
                          {alerta.competidoresCercanos.map((rival, rIdx) => (
                            <div key={rIdx} className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-red-500 flex-none" />
                              <div className="flex-1 min-w-0">
                                <span className="text-xs text-slate-300">
                                  Emp. {rival.empresa}
                                  {rival.linea && ` · Línea ${rival.linea}`}
                                </span>
                                {rival.destino && (
                                  <span className="text-[10px] text-slate-500 block truncate">
                                    {rival.destino}
                                  </span>
                                )}
                              </div>
                              <span
                                className={`text-xs font-bold flex-none ${rival.distanciaKm < 0.5 ? 'text-red-400' : rival.distanciaKm < 1 ? 'text-amber-400' : 'text-slate-400'}`}
                              >
                                {rival.distanciaKm} km
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {detailData.alertas?.length === 0 && !detailData.mensaje && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
                    <Shield className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                    <p className="text-emerald-300 text-sm font-medium">Sin competencia directa</p>
                    <p className="text-slate-500 text-xs mt-0.5">
                      Ningún rival dentro del radio de 1.5 km
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-slate-500 text-sm">
                Error cargando análisis. Intenta nuevamente.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
