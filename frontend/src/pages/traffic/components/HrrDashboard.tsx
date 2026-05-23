/**
 * HrrDashboard — Panel HRR (Headway-to-Rival Ratio) en tiempo real.
 *
 * Muestra para cada par (línea propia, línea rival) el HRR calculado
 * por el motor backend (hrrEngine.ts), coloreado por estado:
 *   RIESGO   (HRR < 0.8) → rojo   — el rival llega antes, riesgo de robo de parada
 *   NEUTRO   (0.8–1.2)   → ámbar  — diferencia marginal
 *   VENTAJA  (HRR > 1.2) → verde  — pasamos antes que el rival
 *   SIN_DATOS            → gris   — sin GPS suficiente
 */

import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, where } from '../../../config/firestoreShim';
import { db } from '../../../config/firebase';
import {
  LineChart, Line, ResponsiveContainer, ReferenceLine, Tooltip,
} from 'recharts';
import {
  AlertTriangle, TrendingUp, Minus, Clock, RefreshCw,
  ChevronUp, ChevronDown, Info,
} from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// ─── Tipos ─────────────────────────────────────────────────────────────────────

type HrrEstado = 'VENTAJA' | 'NEUTRO' | 'RIESGO' | 'SIN_DATOS';

interface HistEntry { ts: number; hrrValue: number | null; estado: HrrEstado }

interface HrrDoc {
  id: string;
  agencyId: string;
  linea: string;
  rivalAgencyId: string;
  rivalLinea: string;
  empresaPropia: string;
  empresaRival: string;
  hrrValue: number | null;
  estado: HrrEstado;
  headwayPropioMin: number | null;
  tiempoARivalMin: number | null;
  busIdPropio: string | null;
  busIdRival: string | null;
  tramoLat: number | null;
  tramoLng: number | null;
  pctOverlap: number;
  sharedKm: number;
  historial: HistEntry[];
  updatedAt: { seconds: number } | null;
}

// ─── Helpers visuales ─────────────────────────────────────────────────────────

const ESTADO_CONFIG: Record<HrrEstado, { color: string; bg: string; border: string; label: string; icon: React.ReactNode }> = {
  RIESGO:    { color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     label: 'Riesgo',    icon: <AlertTriangle className="w-3 h-3" /> },
  NEUTRO:    { color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   label: 'Neutro',    icon: <Minus className="w-3 h-3" /> },
  VENTAJA:   { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: 'Ventaja',   icon: <TrendingUp className="w-3 h-3" /> },
  SIN_DATOS: { color: 'text-slate-500',   bg: 'bg-slate-800/40',   border: 'border-slate-700/30',   label: 'Sin datos', icon: <Clock className="w-3 h-3" /> },
};

const EMPRESA_COLOR: Record<string, string> = {
  UCOT:   '#eab308',
  CUTCSA: '#3b82f6',
  COME:   '#10b981',
  COETC:  '#8b5cf6',
};

function fmtMin(v: number | null): string {
  if (v === null || v < 0) return '—';
  if (v < 1)   return `${Math.round(v * 60)}s`;
  return `${v.toFixed(1)} min`;
}

function fmtHrr(v: number | null): string {
  if (v === null) return '—';
  return v.toFixed(2);
}

function timeSince(doc: HrrDoc): string {
  if (!doc.updatedAt) return '';
  const diffS = Math.floor(Date.now() / 1000) - doc.updatedAt.seconds;
  if (diffS < 60)  return `hace ${diffS}s`;
  if (diffS < 3600) return `hace ${Math.floor(diffS / 60)} min`;
  return `hace ${Math.floor(diffS / 3600)}h`;
}

// ─── Sparkline HRR ────────────────────────────────────────────────────────────

function SparklineHrr({ historial, estado }: { historial: HistEntry[]; estado: HrrEstado }) {
  const data = historial.map((h, i) => ({ i, v: h.hrrValue ?? 0 }));
  const color = estado === 'RIESGO' ? '#f87171' : estado === 'VENTAJA' ? '#34d399' : '#fbbf24';
  if (data.length < 2) return <div className="w-20 h-7 flex items-center justify-center text-slate-600 text-xs">—</div>;
  return (
    <ResponsiveContainer width={80} height={28}>
      <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <ReferenceLine y={1} stroke="#475569" strokeDasharray="2 2" strokeWidth={1} />
        <Line type="monotone" dataKey="v" stroke={color} dot={false} strokeWidth={1.5} isAnimationActive={false} />
        <Tooltip
          content={({ payload }) => {
            if (!payload?.length) return null;
            const v = payload[0].value as number;
            return (
              <div className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white">
                HRR {v.toFixed(2)}
              </div>
            );
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Mini Mapa del tramo ──────────────────────────────────────────────────────

function TramoMap({ doc }: { doc: HrrDoc }) {
  if (!doc.tramoLat || !doc.tramoLng) {
    return (
      <div className="h-44 flex items-center justify-center bg-slate-800/50 rounded-xl border border-slate-700/50 text-slate-500 text-sm">
        Sin coordenadas de tramo
      </div>
    );
  }
  const center: [number, number] = [doc.tramoLat, doc.tramoLng];
  const colorA = EMPRESA_COLOR[doc.empresaPropia] ?? '#94a3b8';
  const colorB = EMPRESA_COLOR[doc.empresaRival]  ?? '#94a3b8';
  return (
    <div className="h-44 rounded-xl overflow-hidden border border-slate-700/50">
      <MapContainer center={center} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl={false}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <CircleMarker center={center} radius={8} pathOptions={{ color: colorA, fillColor: colorA, fillOpacity: 0.9 }}>
          <Popup>Bus {doc.empresaPropia} · línea {doc.linea}</Popup>
        </CircleMarker>
        {doc.tramoLat && doc.tramoLng && (
          <Polyline
            positions={[[doc.tramoLat - 0.003, doc.tramoLng - 0.003], [doc.tramoLat + 0.003, doc.tramoLng + 0.003]]}
            pathOptions={{ color: doc.estado === 'RIESGO' ? '#ef4444' : '#f59e0b', weight: 4, opacity: 0.8 }}
          />
        )}
        <CircleMarker center={[doc.tramoLat + 0.001, doc.tramoLng + 0.001]} radius={6} pathOptions={{ color: colorB, fillColor: colorB, fillOpacity: 0.9 }}>
          <Popup>Bus rival {doc.empresaRival} · línea {doc.rivalLinea}</Popup>
        </CircleMarker>
      </MapContainer>
    </div>
  );
}

// ─── Fila de la tabla ─────────────────────────────────────────────────────────

function HrrRow({
  doc, isSelected, onSelect,
}: { doc: HrrDoc; isSelected: boolean; onSelect: () => void }) {
  const cfg = ESTADO_CONFIG[doc.estado];
  return (
    <tr
      onClick={onSelect}
      className={`border-b border-white/5 cursor-pointer transition-all ${isSelected ? 'bg-indigo-500/10' : 'hover:bg-white/[0.03]'}`}
    >
      {/* Línea propia */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: EMPRESA_COLOR[doc.empresaPropia] ?? '#94a3b8' }}
          />
          <span className="text-white font-bold text-sm">{doc.linea}</span>
          <span className="text-slate-500 text-xs">{doc.empresaPropia}</span>
        </div>
      </td>
      {/* Rival */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: EMPRESA_COLOR[doc.empresaRival] ?? '#94a3b8' }}
          />
          <span className="text-white font-semibold text-sm">{doc.rivalLinea}</span>
          <span className="text-slate-500 text-xs">{doc.empresaRival}</span>
        </div>
      </td>
      {/* HRR value */}
      <td className="px-4 py-3 text-center">
        <span className={`font-black text-lg ${cfg.color}`}>
          {fmtHrr(doc.hrrValue)}
        </span>
      </td>
      {/* Estado badge */}
      <td className="px-4 py-3 text-center">
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
          {cfg.icon}
          {cfg.label}
        </span>
      </td>
      {/* Headway propio */}
      <td className="px-4 py-3 text-right text-slate-300 text-xs font-mono">
        {fmtMin(doc.headwayPropioMin)}
      </td>
      {/* Tiempo rival */}
      <td className="px-4 py-3 text-right text-slate-300 text-xs font-mono">
        {fmtMin(doc.tiempoARivalMin)}
      </td>
      {/* Overlap % */}
      <td className="px-4 py-3 text-right text-slate-400 text-xs">
        {doc.pctOverlap.toFixed(0)}% · {doc.sharedKm.toFixed(1)} km
      </td>
      {/* Sparkline */}
      <td className="px-2 py-2">
        <SparklineHrr historial={doc.historial ?? []} estado={doc.estado} />
      </td>
    </tr>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  agencyId: string;
}

type SortKey = 'estado' | 'hrrValue' | 'pctOverlap';

export default function HrrDashboard({ agencyId }: Props) {
  const [docs, setDocs]               = useState<HrrDoc[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [sortKey, setSortKey]         = useState<SortKey>('estado');
  const [sortAsc, setSortAsc]         = useState(true);
  const [showSinDatos, setShowSinDatos] = useState(false);

  // ── Suscripción Firestore en tiempo real ────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, 'hrr_live'),
      where('agencyId', '==', agencyId),
    );
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as HrrDoc));
      setDocs(data);
      setLoading(false);
    }, err => {
      console.error('[HRR] onSnapshot error:', err);
      setLoading(false);
    });
    return unsub;
  }, [agencyId]);

  // ── Ordenamiento y filtro ───────────────────────────────────────────────────
  const ESTADO_ORDER: Record<HrrEstado, number> = { RIESGO: 0, NEUTRO: 1, VENTAJA: 2, SIN_DATOS: 3 };

  const sorted = useMemo(() => {
    let list = showSinDatos ? docs : docs.filter(d => d.estado !== 'SIN_DATOS');
    list = [...list].sort((a, b) => {
      let diff = 0;
      if (sortKey === 'estado')     diff = ESTADO_ORDER[a.estado] - ESTADO_ORDER[b.estado];
      else if (sortKey === 'hrrValue')  diff = (a.hrrValue ?? -1) - (b.hrrValue ?? -1);
      else if (sortKey === 'pctOverlap') diff = a.pctOverlap - b.pctOverlap;
      return sortAsc ? diff : -diff;
    });
    return list;
  }, [docs, sortKey, sortAsc, showSinDatos]); // eslint-disable-line

  const selectedDoc = docs.find(d => d.id === selectedId) ?? null;

  // ── Resumen estadístico ─────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:    docs.length,
    riesgo:   docs.filter(d => d.estado === 'RIESGO').length,
    neutro:   docs.filter(d => d.estado === 'NEUTRO').length,
    ventaja:  docs.filter(d => d.estado === 'VENTAJA').length,
    sinDatos: docs.filter(d => d.estado === 'SIN_DATOS').length,
    avgHrr:   (() => {
      const vals = docs.filter(d => d.hrrValue !== null).map(d => d.hrrValue as number);
      return vals.length ? (vals.reduce((s, v) => s + v, 0) / vals.length) : null;
    })(),
  }), [docs]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => sortKey === k
    ? (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
    : <ChevronUp className="w-3 h-3 opacity-20" />;

  // ── Estado vacío / carga ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
        <span className="ml-3 text-slate-400 text-sm">Cargando datos HRR…</span>
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center p-8">
        <Clock className="w-12 h-12 text-slate-600" />
        <div>
          <p className="text-slate-300 font-semibold">Sin datos HRR todavía</p>
          <p className="text-slate-500 text-sm mt-1">
            El motor calcula el HRR cada 10 minutos cuando hay buses GPS activos.<br />
            Durante la noche o días de paro los datos pueden estar vacíos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-full overflow-hidden">
      {/* ── Tabla principal ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* KPI bar */}
        <div className="flex-none flex items-center gap-6 px-6 py-4 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
            <span className="text-slate-400 text-xs">Riesgo</span>
            <span className="text-red-400 font-black text-lg">{stats.riesgo}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-500 flex-shrink-0" />
            <span className="text-slate-400 text-xs">Neutro</span>
            <span className="text-amber-400 font-black text-lg">{stats.neutro}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 flex-shrink-0" />
            <span className="text-slate-400 text-xs">Ventaja</span>
            <span className="text-emerald-400 font-black text-lg">{stats.ventaja}</span>
          </div>
          {stats.avgHrr !== null && (
            <div className="ml-auto flex items-center gap-2 bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-1.5">
              <span className="text-slate-500 text-xs">HRR promedio</span>
              <span className="text-white font-bold text-sm">{stats.avgHrr.toFixed(2)}</span>
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer ml-2">
            <input
              type="checkbox"
              checked={showSinDatos}
              onChange={e => setShowSinDatos(e.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-indigo-500"
            />
            <span className="text-slate-500 text-xs">Mostrar sin datos</span>
          </label>
        </div>

        {/* Tabla */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-900/95 backdrop-blur border-b border-white/5 z-10">
              <tr className="text-xs text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Línea propia</th>
                <th className="px-4 py-3 text-left">Rival</th>
                <th
                  className="px-4 py-3 text-center cursor-pointer hover:text-slate-300 select-none"
                  onClick={() => toggleSort('hrrValue')}
                >
                  <span className="flex items-center justify-center gap-1">HRR <SortIcon k="hrrValue" /></span>
                </th>
                <th
                  className="px-4 py-3 text-center cursor-pointer hover:text-slate-300 select-none"
                  onClick={() => toggleSort('estado')}
                >
                  <span className="flex items-center justify-center gap-1">Estado <SortIcon k="estado" /></span>
                </th>
                <th className="px-4 py-3 text-right">Headway propio</th>
                <th className="px-4 py-3 text-right">Tiempo rival</th>
                <th
                  className="px-4 py-3 text-right cursor-pointer hover:text-slate-300 select-none"
                  onClick={() => toggleSort('pctOverlap')}
                >
                  <span className="flex items-center justify-end gap-1">Tramo <SortIcon k="pctOverlap" /></span>
                </th>
                <th className="px-4 py-3 text-center">Tendencia</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(doc => (
                <HrrRow
                  key={doc.id}
                  doc={doc}
                  isSelected={selectedId === doc.id}
                  onSelect={() => setSelectedId(selectedId === doc.id ? null : doc.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Panel detalle (se abre al seleccionar una fila) ──────────────────── */}
      {selectedDoc && (
        <div className="w-72 flex-none flex flex-col gap-4 p-4 border-l border-white/5 bg-white/[0.02] overflow-y-auto">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold text-sm">
              {selectedDoc.linea} vs {selectedDoc.rivalLinea}
            </h3>
            <button onClick={() => setSelectedId(null)} className="text-slate-500 hover:text-white transition-colors">
              ✕
            </button>
          </div>

          {/* HRR grande */}
          <div className={`rounded-xl p-4 text-center ${ESTADO_CONFIG[selectedDoc.estado].bg} border ${ESTADO_CONFIG[selectedDoc.estado].border}`}>
            <div className={`text-4xl font-black ${ESTADO_CONFIG[selectedDoc.estado].color}`}>
              {fmtHrr(selectedDoc.hrrValue)}
            </div>
            <div className={`text-xs font-semibold mt-1 ${ESTADO_CONFIG[selectedDoc.estado].color}`}>
              {ESTADO_CONFIG[selectedDoc.estado].label.toUpperCase()}
            </div>
            <div className="text-slate-500 text-xs mt-2">
              headway / tiempo al rival
            </div>
          </div>

          {/* Desglose */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Headway propio</span>
              <span className="text-white font-mono">{fmtMin(selectedDoc.headwayPropioMin)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Tiempo al rival</span>
              <span className="text-white font-mono">{fmtMin(selectedDoc.tiempoARivalMin)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Solapamiento</span>
              <span className="text-white font-mono">{selectedDoc.pctOverlap.toFixed(0)}% · {selectedDoc.sharedKm.toFixed(1)} km</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Actualizado</span>
              <span className="text-slate-400">{timeSince(selectedDoc)}</span>
            </div>
          </div>

          {/* Interpretación */}
          <div className="bg-slate-900/60 border border-slate-700/30 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Info className="w-3 h-3 text-slate-400" />
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Interpretación</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {selectedDoc.estado === 'RIESGO' && `El rival (${selectedDoc.rivalLinea} ${selectedDoc.empresaRival}) llega al tramo compartido antes que tu bus. Riesgo de robo de pasajeros en las próximas paradas.`}
              {selectedDoc.estado === 'NEUTRO' && `Tu bus y el rival (${selectedDoc.rivalLinea}) están llegando al tramo compartido con diferencia mínima. Monitorear.`}
              {selectedDoc.estado === 'VENTAJA' && `Tu bus pasa el tramo compartido antes que el rival (${selectedDoc.rivalLinea}). Los pasajeros te ven primero.`}
              {selectedDoc.estado === 'SIN_DATOS' && 'Sin buses GPS activos en este par de líneas. Puede ser horario nocturno o baja frecuencia.'}
            </p>
          </div>

          {/* Sparkline grande */}
          {(selectedDoc.historial ?? []).length >= 2 && (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider">Últimas 6 lecturas</p>
              <ResponsiveContainer width="100%" height={60}>
                <LineChart data={(selectedDoc.historial ?? []).map((h, i) => ({ i, v: h.hrrValue ?? 0 }))}>
                  <ReferenceLine y={1.2} stroke="#10b981" strokeDasharray="3 3" strokeWidth={1} />
                  <ReferenceLine y={0.8} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} />
                  <ReferenceLine y={1}   stroke="#64748b" strokeDasharray="2 2" strokeWidth={1} />
                  <Line type="monotone" dataKey="v" stroke="#818cf8" dot={{ r: 3, fill: '#818cf8' }} strokeWidth={2} isAnimationActive={false} />
                  <Tooltip
                    content={({ payload }) => {
                      if (!payload?.length) return null;
                      const v = payload[0].value as number;
                      const idx = payload[0].payload.i as number;
                      const h = selectedDoc.historial?.[idx];
                      const cfg = h ? ESTADO_CONFIG[h.estado] : null;
                      return (
                        <div className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white">
                          <div>HRR {v.toFixed(2)}</div>
                          {cfg && <div className={cfg.color}>{cfg.label}</div>}
                        </div>
                      );
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Mini mapa del tramo */}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Tramo compartido</p>
            <TramoMap doc={selectedDoc} />
          </div>
        </div>
      )}
    </div>
  );
}
