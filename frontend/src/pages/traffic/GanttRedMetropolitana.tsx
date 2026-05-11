/**
 * GanttRedMetropolitana.tsx — Análisis de Solapamiento de Rutas (DRO)
 * ====================================================================
 * Calcula el porcentaje de recorrido compartido entre líneas de diferentes
 * operadores usando comparación geográfica (DRO — Directional Route Overlap).
 * No usa números de línea: compara los puntos GPS de cada ruta para detectar
 * qué porcentaje del recorrido físico coincide, separado por IDA / VUELTA.
 *
 * Fuente de datos: shapes_cross_operator (Firestore)
 * Operadores: UCOT (70) · CUTCSA (50) · COME (20) · COETC (10)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import {
  Lock, RefreshCw, AlertTriangle, TrendingUp, X,
  ChevronDown, ChevronUp, Info, Clock, MapPin,
} from 'lucide-react';
import api from '../../services/api';

// ── Constantes ───────────────────────────────────────────────────────────────

const EMPRESA_CONFIG: Record<string, {
  label: string; color: string; bg: string; border: string; text: string; hex: string;
}> = {
  '70': { label: 'UCOT',   color: '#3b82f6', hex: '#3b82f6', bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400'   },
  '50': { label: 'CUTCSA', color: '#a855f7', hex: '#a855f7', bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
  '20': { label: 'COME',   color: '#10b981', hex: '#10b981', bg: 'bg-emerald-500/10',border: 'border-emerald-500/30',text: 'text-emerald-400'},
  '10': { label: 'COETC',  color: '#f97316', hex: '#f97316', bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400' },
};

const EMPRESAS = ['70', '50', '20', '10'] as const;
const DRO_THRESHOLD_M = 120;   // metros — distancia máxima para considerar punto compartido
const SUBSAMPLE = 5;           // tomar 1 de cada N puntos para cálculo rápido

// ── Tipos ────────────────────────────────────────────────────────────────────

interface Punto { lat: number; lng: number; }

interface ShapeDoc {
  id: string;
  agencyId: string;
  linea: string;
  sentido: 'IDA' | 'VUELTA';
  points: Punto[];
  paradasCount: number;
}

interface ParDRO {
  shapeA: ShapeDoc;
  shapeB: ShapeDoc;
  droAenB: number;
  droBenA: number;
  droSimetrico: number;
  categoria: 'critica' | 'alta' | 'media' | 'baja';
  puntosCompartidos: Punto[];
}

// ── Geometría ─────────────────────────────────────────────────────────────────

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildGrid(points: Punto[], cellDeg = 0.008): Map<string, Punto[]> {
  const grid = new Map<string, Punto[]>();
  for (const p of points) {
    const key = `${Math.floor(p.lat / cellDeg)},${Math.floor(p.lng / cellDeg)}`;
    const cell = grid.get(key) ?? [];
    cell.push(p);
    grid.set(key, cell);
  }
  return grid;
}

function nearbyFromGrid(grid: Map<string, Punto[]>, p: Punto, cellDeg = 0.008): Punto[] {
  const cx = Math.floor(p.lat / cellDeg);
  const cy = Math.floor(p.lng / cellDeg);
  const result: Punto[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const cell = grid.get(`${cx + dx},${cy + dy}`);
      if (cell) result.push(...cell);
    }
  }
  return result;
}

function calcDRO(
  pointsA: Punto[],
  pointsB: Punto[],
  thresholdM = DRO_THRESHOLD_M,
  subsample = SUBSAMPLE,
): { dro: number; shared: Punto[] } {
  if (pointsA.length === 0 || pointsB.length === 0) return { dro: 0, shared: [] };
  const subsA = pointsA.filter((_, i) => i % subsample === 0);
  const subsB = pointsB.filter((_, i) => i % subsample === 0);
  const grid = buildGrid(subsB);
  let hits = 0;
  const shared: Punto[] = [];
  for (const p of subsA) {
    const nearby = nearbyFromGrid(grid, p);
    let isHit = false;
    for (const q of nearby) {
      if (haversineM(p.lat, p.lng, q.lat, q.lng) <= thresholdM) { isHit = true; break; }
    }
    if (isHit) { hits++; shared.push(p); }
  }
  return { dro: subsA.length > 0 ? (hits / subsA.length) * 100 : 0, shared };
}

function categorizar(dro: number): ParDRO['categoria'] {
  if (dro >= 70) return 'critica';
  if (dro >= 40) return 'alta';
  if (dro >= 15) return 'media';
  return 'baja';
}

// ── Mini-mapa SVG ─────────────────────────────────────────────────────────────

function MiniMapaSVG({
  shapeA, shapeB, shared, width = 220, height = 130,
}: { shapeA: ShapeDoc; shapeB: ShapeDoc; shared: Punto[]; width?: number; height?: number }) {
  const allPts = [...shapeA.points, ...shapeB.points];
  if (allPts.length === 0) return null;
  const minLat = Math.min(...allPts.map(p => p.lat));
  const maxLat = Math.max(...allPts.map(p => p.lat));
  const minLng = Math.min(...allPts.map(p => p.lng));
  const maxLng = Math.max(...allPts.map(p => p.lng));
  const pad = 4;
  const ranLat = maxLat - minLat || 0.001;
  const ranLng = maxLng - minLng || 0.001;
  const toSVG = (p: Punto) => ({
    x: ((p.lng - minLng) / ranLng) * (width - pad * 2) + pad,
    y: height - ((p.lat - minLat) / ranLat) * (height - pad * 2) - pad,
  });
  const pathFor = (pts: Punto[]) =>
    pts.filter((_, i) => i % 3 === 0).map((p, i) => {
      const { x, y } = toSVG(p);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  const cfgA = EMPRESA_CONFIG[shapeA.agencyId] ?? EMPRESA_CONFIG['70'];
  const cfgB = EMPRESA_CONFIG[shapeB.agencyId] ?? EMPRESA_CONFIG['50'];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      className="bg-slate-800/80 rounded-lg border border-slate-700/50">
      <path d={pathFor(shapeB.points)} fill="none" stroke={cfgB.hex} strokeWidth="1.5" opacity="0.5" />
      <path d={pathFor(shapeA.points)} fill="none" stroke={cfgA.hex} strokeWidth="1.5" opacity="0.8" />
      {shared.map((p, i) => {
        const { x, y } = toSVG(p);
        return <circle key={i} cx={x} cy={y} r="3.5" fill="#facc15" opacity="0.9" />;
      })}
    </svg>
  );
}

// ── Badges ────────────────────────────────────────────────────────────────────

function EmpresaBadge({ id }: { id: string }) {
  const cfg = EMPRESA_CONFIG[id];
  if (!cfg) return <span className="text-slate-400 text-xs">{id}</span>;
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-bold"
      style={{ backgroundColor: cfg.hex + '22', color: cfg.hex, border: `1px solid ${cfg.hex}55` }}>
      {cfg.label}
    </span>
  );
}

function SentidoBadge({ sentido }: { sentido: 'IDA' | 'VUELTA' }) {
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
      sentido === 'IDA'
        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
        : 'bg-orange-500/10 text-orange-400 border border-orange-500/30'
    }`}>
      {sentido === 'IDA' ? '→' : '←'} {sentido}
    </span>
  );
}

function CategoriaBadge({ cat }: { cat: ParDRO['categoria'] }) {
  const styles = {
    critica: 'bg-red-500/20 text-red-400 border-red-500/30',
    alta:    'bg-orange-500/20 text-orange-400 border-orange-500/30',
    media:   'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    baja:    'bg-slate-700/60 text-slate-400 border-slate-600/30',
  };
  const labels = { critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja' };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${styles[cat]}`}>
      {labels[cat]}
    </span>
  );
}

function BarraDRO({ valor, color = '#ef4444' }: { valor: number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(valor, 100)}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-bold text-white w-10 text-right">{valor.toFixed(0)}%</span>
    </div>
  );
}

// ── Helpers de horarios ───────────────────────────────────────────────────────

function minToHH(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Geocodificación inversa con OpenStreetMap Nominatim.
// Toma puntos GPS del tramo compartido y devuelve nombres reales de calles.
async function geocodificarCorredorCompartido(
  pts: Punto[],
  cancelRef: { v: boolean },
): Promise<string[]> {
  if (pts.length === 0) return [];
  // Muestrear hasta 6 puntos distribuidos uniformemente en el tramo compartido
  const step = Math.max(1, Math.floor(pts.length / 6));
  const samples = pts.filter((_, i) => i % step === 0).slice(0, 6);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const p of samples) {
    if (cancelRef.v) break;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${p.lat}&lon=${p.lng}&format=json&accept-language=es`,
        { headers: { 'User-Agent': 'SkillRoute/1.0 (contact@skillroute.uy)' } },
      );
      if (res.ok) {
        const data = await res.json();
        const road: string | undefined = data.address?.road ?? data.address?.street ?? data.address?.pedestrian;
        if (road) {
          // Normalizar: quitar prefijos de tipo de vía que ya están implícitos
          const clean = road
            .replace(/^(Avenida|Bulevar|Boulevard|Rambla|Camino|Calle|Autopista)\s+/i, '')
            .trim();
          if (clean.length > 3 && !seen.has(clean.toLowerCase())) {
            seen.add(clean.toLowerCase());
            result.push(clean);
          }
        }
      }
    } catch { /* skip si Nominatim no responde */ }
    if (!cancelRef.v) await new Promise(r => setTimeout(r, 200)); // ~1 req/seg Nominatim
  }
  return result;
}

// ── Horarios inline al expandir una fila ─────────────────────────────────────

function HorarioInline({ shapeA, shapeB }: { shapeA: ShapeDoc; shapeB: ShapeDoc }) {
  const [horarioA, setHorarioA] = useState<any>(null);
  const [horarioB, setHorarioB] = useState<any>(null);
  const [loading, setLoading]   = useState(true);

  const cfgA = EMPRESA_CONFIG[shapeA.agencyId];
  const cfgB = EMPRESA_CONFIG[shapeB.agencyId];

  useEffect(() => {
    let cancelled = false;
    async function cargar() {
      const dow = new Date().getDay();
      const svcType = dow === 0 ? 'DOMINGO' : dow === 6 ? 'SABADO' : 'HABIL';
      const dirA = shapeA.sentido === 'IDA' ? '0' : '1';
      const dirB = shapeB.sentido === 'IDA' ? '0' : '1';
      try {
        const [ttA, ttB] = await Promise.all([
          api.get(`/gtfs/timetable/single?agencyId=${shapeA.agencyId}&linea=${shapeA.linea}&directionId=${dirA}&serviceType=${svcType}`),
          api.get(`/gtfs/timetable/single?agencyId=${shapeB.agencyId}&linea=${shapeB.linea}&directionId=${dirB}&serviceType=${svcType}`)
        ]);
        if (cancelled) return;
        const proc = (res: any) => {
          const data = res?.data?.data;
          if (!data) return null;
          const salidas: string[] = (data.viajes ?? []).map((v: any) => v.s).filter(Boolean);
          const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
          const mins = salidas.map(toMin);
          const gaps: number[] = [];
          for (let i = 1; i < mins.length; i++) {
            const g = mins[i] - mins[i - 1];
            if (g > 0 && g < 120) gaps.push(g);
          }
          const frecuencia = gaps.length > 0 ? Math.round(gaps.reduce((a, b) => a + b) / gaps.length) : 0;
          return { salidas, primerSalida: salidas[0] ?? '—', ultimaSalida: salidas.at(-1) ?? '—', totalViajes: salidas.length, frecuencia };
        };
        setHorarioA(proc(ttA));
        setHorarioB(proc(ttB));
      } catch { /* sin datos */ }
      finally { if (!cancelled) setLoading(false); }
    }
    cargar();
    return () => { cancelled = true; };
  }, [shapeA.id, shapeB.id]);

  if (loading) return (
    <div className="flex items-center gap-1.5 text-slate-600 text-[11px] mt-3 pt-3 border-t border-slate-700/40">
      <RefreshCw className="w-3 h-3 animate-spin" /> Cargando horarios...
    </div>
  );

  if (!horarioA && !horarioB) return null;

  const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const vStart = Math.max(0, nowMin - 30);
  const vEnd   = Math.min(1439, nowMin + 60);

  const proximasA = (horarioA?.salidas ?? []).filter((s: string) => { const m = toMin(s); return m >= vStart && m <= vEnd; });
  const proximasB = (horarioB?.salidas ?? []).filter((s: string) => { const m = toMin(s); return m >= vStart && m <= vEnd; });

  const simultaneas: { a: string; b: string }[] = proximasA.flatMap((sa: string) =>
    (proximasB as string[])
      .filter(sb => Math.abs(toMin(sa) - toMin(sb)) <= 8)
      .map(sb => ({ a: sa, b: sb }))
  );

  return (
    <div className="mt-3 pt-3 border-t border-slate-700/40 space-y-2">
      <p className="text-[10px] text-slate-500 uppercase tracking-widest flex items-center gap-1">
        <Clock className="w-3 h-3" /> Horarios de solapamiento
      </p>
      <div className="grid grid-cols-2 gap-2">
        {[
          { cfg: cfgA, linea: shapeA.linea, h: horarioA },
          { cfg: cfgB, linea: shapeB.linea, h: horarioB },
        ].map(({ cfg, linea, h }) => (
          <div key={linea} className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-700/40">
            <p className="text-[11px] font-bold mb-1.5" style={{ color: cfg?.hex }}>
              {cfg?.label} L.{linea}
            </p>
            {h ? (
              <div className="space-y-0.5 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Frecuencia</span>
                  <span className="text-white font-bold">{h.frecuencia > 0 ? `${h.frecuencia} min` : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">1ª / Última</span>
                  <span className="text-slate-300">{h.primerSalida} – {h.ultimaSalida}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Viajes/día</span>
                  <span className="text-slate-300">{h.totalViajes}</span>
                </div>
              </div>
            ) : (
              <p className="text-slate-600 text-[10px]">Sin datos de horario</p>
            )}
          </div>
        ))}
      </div>
      {simultaneas.length > 0 && (
        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-[10px] text-red-400 font-bold mb-1">
            {simultaneas.length} salida{simultaneas.length > 1 ? 's' : ''} simultánea{simultaneas.length > 1 ? 's' : ''} en la próxima hora
          </p>
          <div className="flex flex-wrap gap-1">
            {simultaneas.slice(0, 6).map((c, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-mono">
                {c.a} / {c.b}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Panel de detalle ──────────────────────────────────────────────────────────

function PanelDetalle({ par, onClose }: { par: ParDRO; onClose: () => void }) {
  const cfgA = EMPRESA_CONFIG[par.shapeA.agencyId];
  const cfgB = EMPRESA_CONFIG[par.shapeB.agencyId];

  const [calles, setCalles]             = useState<string[]>([]);
  const [horarioA, setHorarioA]         = useState<any>(null);
  const [horarioB, setHorarioB]         = useState<any>(null);
  const [loadingExtra, setLoadingExtra] = useState(true);
  const [servicioInfo, setServicioInfo] = useState<{
    tipo: string; diaLabel: string; ventanaStart: number; ventanaEnd: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cancelRef = { v: false }; // compartido con geocodificarCorredorCompartido

    // Detectar día de la semana y tipo de servicio
    const ahora = new Date();
    const dow = ahora.getDay(); // 0=Dom, 6=Sab, 1-5=Hábil
    const serviceType = dow === 0 ? 'DOMINGO' : dow === 6 ? 'SABADO' : 'HABIL';
    const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const diaLabel = DIAS[dow];
    // Ventana dinámica: ±1.5h alrededor del momento actual
    const nowMin = ahora.getHours() * 60 + ahora.getMinutes();
    const ventanaStart = Math.max(0, nowMin - 60);
    const ventanaEnd   = Math.min(1439, nowMin + 90);

    // Helper: procesa viajes del gtfs_timetable y devuelve estructura de horario
    function procesarViajes(res: any) {
      const data = res?.data?.data;
      if (!data) return null;
      const viajes: { s: string }[] = data.viajes ?? [];
      if (viajes.length === 0) return null;
      const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
      const salidas = viajes.map(v => v.s).filter(Boolean);
      const mins = salidas.map(toMin);
      // Frecuencia: promedio de gaps consecutivos (descartando pausas nocturnas >120 min)
      const gaps: number[] = [];
      for (let i = 1; i < mins.length; i++) {
        const g = mins[i] - mins[i - 1];
        if (g > 0 && g < 120) gaps.push(g);
      }
      const frecuenciaPromMin = gaps.length > 0
        ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)
        : 0;
      return {
        salidas,
        primerSalida: salidas[0] ?? '—',
        ultimaSalida: salidas[salidas.length - 1] ?? '—',
        totalViajes: salidas.length,
        frecuenciaPromMin,
      };
    }

    async function cargar() {
      setLoadingExtra(true);
      setServicioInfo({ tipo: serviceType, diaLabel, ventanaStart, ventanaEnd });
      try {
        const dirA = par.shapeA.sentido === 'IDA' ? '0' : '1';
        const dirB = par.shapeB.sentido === 'IDA' ? '0' : '1';
        // Horarios y geocodificación en paralelo
        const [ttA, ttB, callesGeo] = await Promise.all([
          api.get(`/gtfs/timetable/single?agencyId=${par.shapeA.agencyId}&linea=${par.shapeA.linea}&directionId=${dirA}&serviceType=${serviceType}`),
          api.get(`/gtfs/timetable/single?agencyId=${par.shapeB.agencyId}&linea=${par.shapeB.linea}&directionId=${dirB}&serviceType=${serviceType}`),
          geocodificarCorredorCompartido(par.puntosCompartidos, cancelRef),
        ]);
        if (cancelled) return;
        setCalles(callesGeo);
        setHorarioA(procesarViajes(ttA));
        setHorarioB(procesarViajes(ttB));
      } catch { /* sin datos extra */ }
      finally {
        cancelRef.v = true;
        if (!cancelled) setLoadingExtra(false);
      }
    }

    cargar();
    return () => { cancelled = true; cancelRef.v = true; };
  }, [par.shapeA.id, par.shapeB.id]);

  // Salidas en la ventana temporal actual (dinámica) para ambas líneas
  const pico = useMemo(() => {
    if (!servicioInfo) return [];
    type Salida = { t: string; empresa: string; hex: string; near: boolean };
    const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
    const { ventanaStart, ventanaEnd } = servicioInfo;
    const rango = (sal: string[] | undefined, emp: string, hex: string) =>
      (sal ?? [])
        .filter(s => { const m = toMin(s); return m >= ventanaStart && m <= ventanaEnd; })
        .map(s => ({ t: s, empresa: emp, hex, near: false }));
    const lista = [
      ...rango(horarioA?.salidas, cfgA?.label ?? '', cfgA?.hex ?? '#fff'),
      ...rango(horarioB?.salidas, cfgB?.label ?? '', cfgB?.hex ?? '#fff'),
    ].sort((a, b) => toMin(a.t) - toMin(b.t));
    return lista.map((s, i): Salida => {
      const sm = toMin(s.t);
      const near = lista.some((o, j) => j !== i && o.empresa !== s.empresa && Math.abs(toMin(o.t) - sm) <= 8);
      return { ...s, near };
    });
  }, [horarioA, horarioB, cfgA, cfgB, servicioInfo]);

  return (
    <div className="fixed right-0 top-0 h-full w-[420px] bg-slate-900 border-l border-slate-700 z-50 overflow-y-auto shadow-2xl">
      <div className="sticky top-0 bg-slate-900 border-b border-slate-700/50 px-5 py-4 flex items-center justify-between">
        <span className="font-bold text-white text-sm">Análisis de Solapamiento</span>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Cabecera de líneas */}
        <div className="space-y-2">
          {[{ label: 'Línea A', shape: par.shapeA }, { label: 'Línea B', shape: par.shapeB }].map(({ label, shape }) => (
            <div key={shape.id} className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1.5">{label}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <EmpresaBadge id={shape.agencyId} />
                <span className="font-bold text-white">Línea {shape.linea}</span>
                <SentidoBadge sentido={shape.sentido} />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">{shape.paradasCount} paradas · {shape.points.length} puntos GPS</p>
            </div>
          ))}
        </div>

        {/* DRO */}
        <div className="space-y-2">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">Solapamiento geográfico</p>
          <div>
            <p className="text-[11px] text-slate-400 mb-1">
              % de <span style={{ color: cfgA?.hex }}>{cfgA?.label} L.{par.shapeA.linea}</span> cubierto por {cfgB?.label}
            </p>
            <BarraDRO valor={par.droAenB} color={cfgA?.hex} />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 mb-1">
              % de <span style={{ color: cfgB?.hex }}>{cfgB?.label} L.{par.shapeB.linea}</span> cubierto por {cfgA?.label}
            </p>
            <BarraDRO valor={par.droBenA} color={cfgB?.hex} />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
            <span className="text-xs text-slate-400">Solapamiento simétrico</span>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-white">{par.droSimetrico.toFixed(1)}%</span>
              <CategoriaBadge cat={par.categoria} />
            </div>
          </div>
        </div>

        {/* Mapa */}
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Mapa del recorrido</p>
          <MiniMapaSVG shapeA={par.shapeA} shapeB={par.shapeB} shared={par.puntosCompartidos} width={370} height={200} />
          <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500">
            <div className="flex items-center gap-1"><div className="w-3 h-0.5 rounded" style={{ backgroundColor: cfgA?.hex }} />{cfgA?.label} L.{par.shapeA.linea}</div>
            <div className="flex items-center gap-1"><div className="w-3 h-0.5 rounded" style={{ backgroundColor: cfgB?.hex }} />{cfgB?.label} L.{par.shapeB.linea}</div>
            <div className="flex items-center gap-1"><div className="w-3 h-0.5 rounded bg-yellow-400" />Zona compartida</div>
          </div>
        </div>

        {/* Corredor — calles */}
        {loadingExtra ? (
          <div className="flex items-center gap-2 text-slate-600 text-xs">
            <RefreshCw className="w-3 h-3 animate-spin" /> Cargando corredor y horarios...
          </div>
        ) : (
          <>
            {calles.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />Corredor compartido
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {calles.map(c => (
                    <span key={c} className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 font-medium">
                      {c}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-slate-600 mt-1.5">Vías donde ambas líneas circulan en el mismo sentido</p>
              </div>
            )}

            {/* Comparativa de servicio */}
            {(horarioA || horarioB) && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1">
                  <Clock className="w-3 h-3" />Comparativa de servicio
                </p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[
                    { cfg: cfgA, linea: par.shapeA.linea, h: horarioA },
                    { cfg: cfgB, linea: par.shapeB.linea, h: horarioB },
                  ].map(({ cfg, linea, h }) => (
                    <div key={linea} className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
                      <p className="text-[11px] font-bold mb-2" style={{ color: cfg?.hex }}>
                        {cfg?.label} L.{linea}
                      </p>
                      {h ? (
                        <div className="space-y-1 text-[11px]">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Frecuencia</span>
                            <span className="font-bold text-white">{h.frecuenciaPromMin} min</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">1ª salida</span>
                            <span className="text-slate-300">{h.primerSalida}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Última</span>
                            <span className="text-slate-300">{h.ultimaSalida}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Viajes/día</span>
                            <span className="text-slate-300">{h.totalViajes}</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-slate-600 text-[11px]">Sin datos</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Análisis de frecuencia */}
                {horarioA && horarioB && (() => {
                  const fa = horarioA.frecuenciaPromMin as number;
                  const fb = horarioB.frecuenciaPromMin as number;
                  if (fa <= 0 || fb <= 0) return null;
                  const combinado = Math.round((fa * fb) / (fa + fb));
                  const diff = Math.abs(fa - fb);
                  let msg = '';
                  let color = 'text-slate-400';
                  if (diff <= 3) {
                    msg = `Frecuencias similares — en el corredor hay un bus combinado cada ~${combinado} min.`;
                    color = 'text-yellow-400';
                  } else if (fa > fb) {
                    msg = `${cfgB?.label} pasa ${(fa / fb).toFixed(1)}× más seguido. Ventaja de frecuencia para la competencia en este corredor.`;
                    color = 'text-red-400';
                  } else {
                    msg = `${cfgA?.label} pasa ${(fb / fa).toFixed(1)}× más seguido. Ventaja de frecuencia propia en este corredor.`;
                    color = 'text-emerald-400';
                  }
                  return (
                    <div className={`p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40 text-[11px] ${color} leading-relaxed`}>
                      {msg}
                    </div>
                  );
                })()}

                {/* Pico mañana interleaved */}
                {pico.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">
                      Salidas · {servicioInfo?.diaLabel} · {minToHH(servicioInfo?.ventanaStart ?? 0)}–{minToHH(servicioInfo?.ventanaEnd ?? 1439)}
                      {servicioInfo && <span className="ml-1 normal-case text-slate-600">({servicioInfo.tipo})</span>}
                    </p>
                    <div className="space-y-0.5 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
                      {pico.map((s, i) => (
                        <div key={i} className={`flex items-center gap-2 px-2 py-1 rounded text-[11px] ${
                          s.near ? 'bg-red-500/10 border border-red-500/20' : 'bg-slate-800/30'
                        }`}>
                          <span className="font-mono font-bold text-slate-200 w-10">{s.t}</span>
                          <span className="font-medium" style={{ color: s.hex }}>{s.empresa}</span>
                          {s.near && (
                            <span className="ml-auto text-[10px] text-red-400 font-bold">≤8 min rival</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-600 mt-1">Rojo = bus propio y rival con ≤8 min de diferencia en corredor</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Interpretación */}
        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mb-1.5">
            <Info className="inline w-3 h-3 mr-1" />Interpretación operativa
          </p>
          <p className="text-xs text-slate-300 leading-relaxed">
            {par.categoria === 'critica' && `Competencia directa crítica: ${par.droSimetrico.toFixed(0)}% del recorrido es compartido. Ambos operadores captan pasajeros en los mismos tramos. Evaluar diferenciación por frecuencia o tarifa.`}
            {par.categoria === 'alta' && `Competencia alta: ${par.droSimetrico.toFixed(0)}% de superposición. Zonas significativas en común — los pasajeros en esos tramos tienen dos opciones de servicio.`}
            {par.categoria === 'media' && `Competencia media: ${par.droSimetrico.toFixed(0)}% de rutas compartidas. Cobertura parcialmente coincidente, especialmente en corredores principales.`}
            {par.categoria === 'baja' && `Solapamiento bajo (${par.droSimetrico.toFixed(0)}%): los recorridos son mayormente complementarios. La coincidencia se limita a tramos cortos o puntos de paso.`}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function GanttRedMetropolitana() {
  const { user } = useAuth();

  const [shapes, setShapes]         = useState<ShapeDoc[]>([]);
  const [loading, setLoading]       = useState(true);
  const [computing, setComputing]   = useState(false);
  const [droResults, setDroResults] = useState<ParDRO[]>([]);
  const [selectedPar, setSelectedPar] = useState<ParDRO | null>(null);
  const [lastFetch, setLastFetch]   = useState<Date | null>(null);

  const [filtroEmpresaA, setFiltroEmpresaA] = useState<string>('70');
  const [filtroEmpresaB, setFiltroEmpresaB] = useState<string>('all');
  const [filtroSentido, setFiltroSentido]   = useState<'all' | 'IDA' | 'VUELTA'>('all');
  const [filtroMinDRO, setFiltroMinDRO]     = useState<number>(15);
  const [filtroLinea, setFiltroLinea]       = useState<string>('');
  const [expandedRows, setExpandedRows]     = useState<Set<string>>(new Set());

  if ((user?.role ?? '').toUpperCase() !== 'SUPERADMIN') {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Lock className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Acceso restringido a SUPERADMIN</p>
        </div>
      </div>
    );
  }

  const cargarShapes = useCallback(async () => {
    setLoading(true);
    setDroResults([]);
    try {
      const snap = await getDocs(collection(db, 'shapes_cross_operator'));
      const docs: ShapeDoc[] = snap.docs
        .map(d => {
          const data = d.data();
          if (!data.agencyId || !EMPRESA_CONFIG[data.agencyId]) return null;
          return {
            id: d.id,
            agencyId: String(data.agencyId),
            linea: String(data.linea ?? '?'),
            sentido: (data.sentido === 'VUELTA' ? 'VUELTA' : 'IDA') as 'IDA' | 'VUELTA',
            points: Array.isArray(data.points) ? (data.points as Punto[]) : [],
            paradasCount: data.paradasCount ?? 0,
          } satisfies ShapeDoc;
        })
        .filter(Boolean) as ShapeDoc[];
      setShapes(docs);
      setLastFetch(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargarShapes(); }, [cargarShapes]);

  useEffect(() => {
    if (shapes.length === 0) return;
    setComputing(true);
    const timeout = setTimeout(() => {
      const selfComp = filtroEmpresaB === filtroEmpresaA;
      const shapesA = shapes.filter(s =>
        s.agencyId === filtroEmpresaA &&
        (filtroSentido === 'all' || s.sentido === filtroSentido) &&
        s.points.length > 10
      );
      // "all" = todos los demás operadores; misma empresa = comparación interna
      const shapesB = shapes.filter(s =>
        (filtroEmpresaB === 'all' ? s.agencyId !== filtroEmpresaA : s.agencyId === filtroEmpresaB) &&
        (filtroSentido === 'all' || s.sentido === filtroSentido) &&
        s.points.length > 10
      );
      const results: ParDRO[] = [];
      for (let iA = 0; iA < shapesA.length; iA++) {
        const sA = shapesA[iA];
        for (let iB = 0; iB < shapesB.length; iB++) {
          const sB = shapesB[iB];
          // Regla 1: nunca comparar una línea contra sí misma
          if (sA.id === sB.id) continue;
          // Regla 2: en comparación interna evitar duplicados A-B/B-A y misma línea en sentido opuesto
          if (selfComp && iA >= iB) continue;
          if (selfComp && sA.linea === sB.linea) continue;
          // Regla 3: nunca comparar IDA vs VUELTA — no es competencia real (sentidos contrarios)
          if (sA.sentido !== sB.sentido) continue;
          const { dro: droAenB, shared } = calcDRO(sA.points, sB.points);
          if (droAenB < filtroMinDRO) continue;
          const { dro: droBenA } = calcDRO(sB.points, sA.points);
          const droSimetrico = (droAenB + droBenA) / 2;
          if (droSimetrico < filtroMinDRO) continue;
          results.push({
            shapeA: sA, shapeB: sB,
            droAenB, droBenA, droSimetrico,
            categoria: categorizar(droSimetrico),
            puntosCompartidos: shared,
          });
        }
      }
      results.sort((a, b) => b.droSimetrico - a.droSimetrico);
      setDroResults(results);
      setComputing(false);
    }, 50);
    return () => clearTimeout(timeout);
  }, [shapes, filtroEmpresaA, filtroEmpresaB, filtroSentido, filtroMinDRO]);

  const kpis = useMemo(() => ({
    totalPares:    droResults.length,
    paresCriticos: droResults.filter(r => r.categoria === 'critica').length,
    droMaximo:     droResults.length > 0 ? droResults[0].droSimetrico : 0,
    shapesPropia:  shapes.filter(s => s.agencyId === filtroEmpresaA).length,
  }), [droResults, shapes, filtroEmpresaA]);

  const resultadosFiltrados = useMemo(() => {
    if (!filtroLinea.trim()) return droResults;
    const q = filtroLinea.trim().toLowerCase();
    return droResults.filter(p =>
      p.shapeA.linea.toLowerCase().includes(q) ||
      p.shapeB.linea.toLowerCase().includes(q)
    );
  }, [droResults, filtroLinea]);

  const empACfg = EMPRESA_CONFIG[filtroEmpresaA];

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-6 relative">
      <div className="fixed top-20 left-1/2 -translate-x-1/2 w-[600px] h-[200px] bg-blue-700/6 rounded-full blur-[160px] pointer-events-none" />

      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-200 mb-1">
              Solapamiento de Rutas — Red Metropolitana
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
              Detecta qué porcentaje del recorrido físico comparte cada línea con las de otros
              operadores, diferenciando por sentido <strong className="text-slate-300">IDA / VUELTA</strong>.
              La comparación es geográfica — dos líneas se solapan cuando sus rutas pasan
              a menos de {DRO_THRESHOLD_M}m, sin importar el número de línea.
            </p>
          </div>
          <button onClick={cargarShapes} disabled={loading}
            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {lastFetch && (
          <p className="text-[11px] text-slate-600 mt-1">
            {shapes.length} rutas cargadas · Actualizado {lastFetch.toLocaleTimeString('es-UY')}
          </p>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 mb-5 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[140px]">
          <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1.5">Operador a analizar</label>
          <select value={filtroEmpresaA} onChange={e => setFiltroEmpresaA(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none">
            {EMPRESAS.map(id => <option key={id} value={id}>{EMPRESA_CONFIG[id].label}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1.5">Comparar contra</label>
          <select value={filtroEmpresaB} onChange={e => setFiltroEmpresaB(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none">
            <option value="all">Toda la competencia</option>
            {EMPRESAS.map(id => (
              <option key={id} value={id}>
                {EMPRESA_CONFIG[id].label}{id === filtroEmpresaA ? ' (propia)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[130px]">
          <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1.5">Sentido</label>
          <div className="flex bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
            {(['all', 'IDA', 'VUELTA'] as const).map(s => (
              <button key={s} onClick={() => setFiltroSentido(s)}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${filtroSentido === s ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {s === 'all' ? 'Ambos' : s === 'IDA' ? '→ IDA' : '← VUELTA'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1.5">
            Solapamiento mínimo: <span className="text-white font-bold">{filtroMinDRO}%</span>
          </label>
          <input type="range" min={5} max={80} step={5} value={filtroMinDRO}
            onChange={e => setFiltroMinDRO(Number(e.target.value))}
            className="w-full accent-blue-500" />
        </div>
        <div className="flex-1 min-w-[130px]">
          <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1.5">Buscar línea</label>
          <div className="relative">
            <input
              type="text"
              placeholder="Ej: 300, 106..."
              value={filtroLinea}
              onChange={e => setFiltroLinea(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-blue-500 outline-none pr-7"
            />
            {filtroLinea && (
              <button onClick={() => setFiltroLinea('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: `Líneas de ${empACfg?.label ?? ''}`, value: kpis.shapesPropia, color: 'text-blue-400', sub: 'con recorridos cargados' },
          { label: 'Pares con solapamiento', value: kpis.totalPares, color: kpis.totalPares > 0 ? 'text-orange-400' : 'text-slate-500', sub: `> ${filtroMinDRO}% de ruta compartida` },
          { label: 'Competencia crítica', value: kpis.paresCriticos, color: kpis.paresCriticos > 0 ? 'text-red-400' : 'text-slate-500', sub: '> 70% de ruta compartida' },
          { label: 'Mayor solapamiento', value: kpis.droMaximo > 0 ? `${kpis.droMaximo.toFixed(0)}%` : '—', color: kpis.droMaximo >= 70 ? 'text-red-400' : kpis.droMaximo >= 40 ? 'text-orange-400' : 'text-slate-400', sub: 'par con mayor DRO' },
        ].map(({ label, value, color, sub }) => (
          <div key={label} className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">{label}</p>
            <p className={`text-2xl font-black ${color}`}>{value}</p>
            <p className="text-[10px] text-slate-600 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-200">Líneas con Recorrido Compartido</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {loading ? 'Cargando rutas...' : computing ? 'Calculando solapamiento geográfico...' :
                filtroLinea
                  ? `${resultadosFiltrados.length} de ${droResults.length} pares · filtro L.${filtroLinea}`
                  : `${droResults.length} pares encontrados`}
            </p>
          </div>
          {(loading || computing) && <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40 gap-3">
            <RefreshCw className="w-5 h-5 text-slate-600 animate-spin" />
            <span className="text-slate-500 text-sm">Cargando rutas desde Firestore...</span>
          </div>
        ) : computing ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
            <span className="text-slate-400 text-sm">
              {filtroEmpresaB === filtroEmpresaA
                ? `Comparando ${kpis.shapesPropia} líneas de ${empACfg?.label} entre sí...`
                : `Comparando ${kpis.shapesPropia} rutas propias contra ${shapes.filter(s => filtroEmpresaB === 'all' ? s.agencyId !== filtroEmpresaA : s.agencyId === filtroEmpresaB).length} de la competencia...`}
            </span>
          </div>
        ) : droResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-center px-8">
            <AlertTriangle className="w-8 h-8 text-slate-600" />
            <p className="text-slate-400 text-sm font-medium">Sin solapamientos con los filtros actuales</p>
            <p className="text-slate-600 text-xs">Reducí el umbral mínimo o cambiá el operador.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {/* Encabezado */}
            <div className="hidden md:grid grid-cols-[1fr_1fr_150px_90px_44px] gap-3 px-4 py-2 text-[10px] text-slate-500 uppercase tracking-widest">
              <span>{filtroEmpresaB === filtroEmpresaA ? 'Línea A' : 'Línea propia'}</span>
              <span>{filtroEmpresaB === filtroEmpresaA ? 'Línea B (misma empresa)' : 'Línea competencia'}</span>
              <span>Solapamiento DRO</span>
              <span>Nivel</span>
              <span></span>
            </div>

            {resultadosFiltrados.map((par) => {
              const rowId = `${par.shapeA.id}-${par.shapeB.id}`;
              const isExpanded = expandedRows.has(rowId);
              const cfgA = EMPRESA_CONFIG[par.shapeA.agencyId];
              const cfgB = EMPRESA_CONFIG[par.shapeB.agencyId];
              const barColor = par.categoria === 'critica' ? '#ef4444' : par.categoria === 'alta' ? '#f97316' : '#eab308';

              return (
                <div key={rowId}>
                  <div
                    className="grid grid-cols-[1fr_1fr_150px_90px_44px] gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors cursor-pointer items-center"
                    onClick={() => toggleRow(rowId)}
                  >
                    {/* Línea A */}
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <EmpresaBadge id={par.shapeA.agencyId} />
                      <span className="font-bold text-white text-sm">L.{par.shapeA.linea}</span>
                      <SentidoBadge sentido={par.shapeA.sentido} />
                    </div>
                    {/* Línea B */}
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <EmpresaBadge id={par.shapeB.agencyId} />
                      <span className="font-bold text-white text-sm">L.{par.shapeB.linea}</span>
                      <SentidoBadge sentido={par.shapeB.sentido} />
                    </div>
                    {/* DRO */}
                    <div>
                      <BarraDRO valor={par.droSimetrico} color={barColor} />
                      <p className="text-[10px] text-slate-600 mt-0.5">
                        {cfgA?.label}: {par.droAenB.toFixed(0)}% · {cfgB?.label}: {par.droBenA.toFixed(0)}%
                      </p>
                    </div>
                    {/* Categoría */}
                    <CategoriaBadge cat={par.categoria} />
                    {/* Chevron */}
                    <div className="flex justify-center">
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 bg-slate-800/20 border-t border-slate-800/60">
                      <div className="flex flex-wrap gap-4 pt-4 items-start">
                        <MiniMapaSVG shapeA={par.shapeA} shapeB={par.shapeB} shared={par.puntosCompartidos} />
                        <div className="flex-1 min-w-[200px] space-y-3">
                          <p className="text-xs text-slate-300 leading-relaxed">
                            <span style={{ color: cfgA?.hex }} className="font-bold">{cfgA?.label} L.{par.shapeA.linea} {par.shapeA.sentido}</span>
                            {' '}comparte el{' '}
                            <strong className="text-white">{par.droAenB.toFixed(0)}%</strong>
                            {' '}de su recorrido con{' '}
                            <span style={{ color: cfgB?.hex }} className="font-bold">{cfgB?.label} L.{par.shapeB.linea} {par.shapeB.sentido}</span>.
                            {' '}El tramo amarillo en el mapa es la zona de competencia directa.
                          </p>
                          <HorarioInline shapeA={par.shapeA} shapeB={par.shapeB} />
                          <button
                            onClick={e => { e.stopPropagation(); setSelectedPar(par); }}
                            className="px-3 py-2 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 text-xs font-bold hover:bg-blue-600/30 transition-colors"
                          >
                            Ver análisis completo →
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Nota metodológica */}
      <div className="mt-4 p-3 rounded-lg bg-slate-900/50 border border-slate-700/30 flex gap-3">
        <TrendingUp className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-500 leading-relaxed">
          <strong className="text-slate-400">Metodología DRO</strong> — Para cada punto GPS del recorrido A se busca el punto más cercano del recorrido B.
          Si la distancia es ≤ {DRO_THRESHOLD_M}m, el punto se considera en zona compartida.
          El porcentaje indica qué fracción del recorrido circula por zonas también servidas por la otra empresa.
          El análisis es independiente por sentido (IDA / VUELTA). El tramo compartido se muestra en amarillo en el mapa.
        </p>
      </div>

      {selectedPar && <PanelDetalle par={selectedPar} onClose={() => setSelectedPar(null)} />}
    </div>
  );
}
