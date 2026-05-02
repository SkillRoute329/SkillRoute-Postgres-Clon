/**
 * CorridorMap.tsx — Mapa visual de corredores cross-operador
 * ============================================================
 * DIRECTRIZ 2026-04-24: nivel internacional. Referencia visual: TfL Bus
 * Density Map, DTPM Santiago Red Viva, NYC MTA BusTime corridor overlay.
 *
 * Muestra:
 *   - Shapes reconstruidas de TODO el sistema metropolitano (shapes_cross_operator).
 *     Color por operador (UCOT ambar, CUTCSA azul, COME verde, COETC rojo).
 *   - Buses en vivo del STM (API IMM) como marcadores animados.
 *   - Corredores con DRO alto resaltados (grosor + glow).
 *   - Click en shape → panel con detalle + rivales top.
 *
 * Controles: toggle por operador, slider DRO minimo, toggle buses en vivo.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip,
  LayersControl,
  LayerGroup,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  collection,
  getDocs,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useLiveData } from '../../context/LiveDataContext';
import { fetchSTMPosiciones } from '../../services/stmLiveService';
import type { BusSTM } from '../../services/stmLiveService';
import {
  MapPin,
  Bus,
  Loader2,
  AlertTriangle,
  Layers,
  RefreshCw,
} from 'lucide-react';

// ─── Constantes visuales ───────────────────────────────────────────────────

const MONTEVIDEO_CENTER: [number, number] = [-34.8941, -56.1880];
const EMPRESA_COLOR: Record<string, string> = {
  '70': '#eab308', // UCOT — ámbar
  '50': '#3b82f6', // CUTCSA — azul
  '20': '#22c55e', // COME — verde
  '10': '#ef4444', // COETC — rojo
};
const EMPRESA_NAME: Record<string, string> = {
  '70': 'UCOT',
  '50': 'CUTCSA',
  '20': 'COME',
  '10': 'COETC',
};

// ─── Tipos ─────────────────────────────────────────────────────────────────

type Sentido = 'IDA' | 'VUELTA';

interface ShapeDoc {
  key: string;
  agencyId: string;
  empresa: string;
  linea: string;
  sentido: Sentido;
  points: Array<{ lat: number; lon: number }>;
  lengthMeters: number;
}

interface OverlapDoc {
  key: string;
  shapeAKey: string;
  shapeBKey: string;
  agencyA: string;
  empresaA: string;
  lineaA: string;
  sentidoA: Sentido;
  agencyB: string;
  empresaB: string;
  lineaB: string;
  sentidoB: Sentido;
  pctAInB: number;
  sharedKm: number;
  sameEmpresa: boolean;
}

interface Filters {
  operators: Set<string>;
  minDroPct: number;
  showBuses: boolean;
  showOnlyCompetitive: boolean;
}

// ─── Componente principal ──────────────────────────────────────────────────

export default function CorridorMapPage() {
  const { setSelectedLine } = useLiveData();
  const [shapes, setShapes] = useState<ShapeDoc[]>([]);
  const [overlaps, setOverlaps] = useState<OverlapDoc[]>([]);
  const [buses, setBuses] = useState<BusSTM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedShape, setSelectedShape] = useState<ShapeDoc | null>(null);
  const [lastBusRefresh, setLastBusRefresh] = useState<Date | null>(null);

  const [filters, setFilters] = useState<Filters>({
    operators: new Set(['70', '50', '20', '10']),
    minDroPct: 0,
    showBuses: true,
    showOnlyCompetitive: false,
  });

  // ── Load data inicial ──────────────────────────────────────────────────

  const loadStaticData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Query separada por operador para evitar que limit(N) corte operadores
      // con docIds que caen tarde en el orden natural de Firestore.
      // La colección tiene ~1167 docs; un limit único dejaba fuera a UCOT.
      const [s70, s50, s20, s10, oSnap] = await Promise.all([
        getDocs(query(collection(db, 'shapes_cross_operator'), where('agencyId', '==', '70'), limit(400))),
        getDocs(query(collection(db, 'shapes_cross_operator'), where('agencyId', '==', '50'), limit(400))),
        getDocs(query(collection(db, 'shapes_cross_operator'), where('agencyId', '==', '20'), limit(400))),
        getDocs(query(collection(db, 'shapes_cross_operator'), where('agencyId', '==', '10'), limit(400))),
        getDocs(query(collection(db, 'corridor_overlap'), limit(5000))),
      ]);
      const sSnap = { docs: [...s70.docs, ...s50.docs, ...s20.docs, ...s10.docs] };
      const s: ShapeDoc[] = [];
      for (const doc of sSnap.docs) {
        const d = doc.data();
        if (!Array.isArray(d.points) || d.points.length < 2) continue;
        s.push({
          key: String(d.key),
          agencyId: String(d.agencyId),
          empresa: String(d.empresa),
          linea: String(d.linea),
          sentido: d.sentido as Sentido,
          points: d.points as Array<{ lat: number; lon: number }>,
          lengthMeters: Number(d.lengthMeters ?? 0),
        });
      }
      const o: OverlapDoc[] = [];
      for (const doc of oSnap.docs) o.push(doc.data() as OverlapDoc);
      setShapes(s);
      setOverlaps(o);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStaticData();
  }, [loadStaticData]);

  // ── Buses en vivo — refresca cada 15s ────────────────────────────────────

  const loadBuses = useCallback(async () => {
    if (!filters.showBuses) return;
    try {
      const list = await fetchSTMPosiciones({ empresa: -1 });
      setBuses(list);
      setLastBusRefresh(new Date());
    } catch (err) {
      console.warn('[CorridorMap] fetch buses fallo:', err);
    }
  }, [filters.showBuses]);

  useEffect(() => {
    if (!filters.showBuses) {
      setBuses([]);
      return;
    }
    loadBuses();
    const id = setInterval(loadBuses, 15000);
    return () => clearInterval(id);
  }, [filters.showBuses, loadBuses]);

  // ── Shapes con flag de "en corredor competitivo" para resaltar ──────────

  const shapesWithFlags = useMemo(() => {
    // Un shape está en corredor competitivo si aparece como shapeAKey o shapeBKey
    // en algún overlap con pctAInB >= minDroPct.
    const hot = new Set<string>();
    for (const o of overlaps) {
      if (o.pctAInB < filters.minDroPct) continue;
      hot.add(o.shapeAKey);
      hot.add(o.shapeBKey);
    }
    return shapes.map((s) => ({ ...s, isCompetitive: hot.has(s.key) }));
  }, [shapes, overlaps, filters.minDroPct]);

  const visibleShapes = useMemo(() => {
    return shapesWithFlags.filter((s) => {
      if (!filters.operators.has(s.agencyId)) return false;
      if (filters.showOnlyCompetitive && !s.isCompetitive) return false;
      return true;
    });
  }, [shapesWithFlags, filters.operators, filters.showOnlyCompetitive]);

  const visibleBuses = useMemo(() => {
    return buses.filter((b) => filters.operators.has(String(b.codigoEmpresa)));
  }, [buses, filters.operators]);

  // ── Para el panel lateral del shape seleccionado: top rivales ───────────

  const selectedShapeRivals = useMemo(() => {
    if (!selectedShape) return [];
    return overlaps
      .filter((o) => o.shapeAKey === selectedShape.key)
      .sort((a, b) => b.pctAInB - a.pctAInB)
      .slice(0, 10);
  }, [selectedShape, overlaps]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const toggleOperator = (agencyId: string) => {
    setFilters((f) => {
      const op = new Set(f.operators);
      if (op.has(agencyId)) op.delete(agencyId);
      else op.add(agencyId);
      return { ...f, operators: op };
    });
  };

  // ── Estados de carga / error ───────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Cargando corredores del sistema metropolitano…</span>
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
            <div className="font-bold text-red-300">Error al cargar el mapa</div>
            <div className="text-red-400/80 text-sm mt-1">{error}</div>
            <button
              onClick={loadStaticData}
              className="mt-3 px-3 py-1.5 bg-red-800/40 hover:bg-red-800/60 text-red-200 rounded text-xs"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (shapes.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 p-6">
        <div className="max-w-xl mx-auto bg-amber-950/30 border border-amber-700/50 rounded-xl p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-amber-300">Sin shapes reconstruidas</div>
            <div className="text-amber-400/80 text-sm mt-1">
              La colección <code className="bg-slate-900 px-1 rounded">shapes_cross_operator</code>{' '}
              está vacía. Ejecutá <code className="bg-slate-900 px-1 rounded">reconstructShapesNow</code>{' '}
              para generar los trazados.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const coveredOps = new Set(shapes.map((s) => s.agencyId));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 relative">
      {/* Header flotante */}
      <div className="absolute top-4 left-4 z-[1000] bg-slate-900/95 border border-slate-800 rounded-xl p-4 shadow-2xl max-w-xs backdrop-blur">
        <h1 className="text-lg font-bold flex items-center gap-2 text-cyan-400">
          <MapPin className="w-5 h-5" />
          Mapa de Corredores
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          {visibleShapes.length} de {shapes.length} shapes · {visibleBuses.length} buses en vivo
        </p>
        {lastBusRefresh && (
          <p className="text-[10px] text-slate-600 mt-0.5">
            GPS: {lastBusRefresh.toLocaleTimeString('es-UY')}
          </p>
        )}
      </div>

      {/* Panel de controles flotante (derecha) */}
      <div className="absolute top-4 right-4 z-[1000] bg-slate-900/95 border border-slate-800 rounded-xl p-4 shadow-2xl w-64 backdrop-blur space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-300 flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            Capas
          </h2>
          <button
            onClick={loadBuses}
            className="text-slate-500 hover:text-white"
            title="Refrescar buses"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Operadores */}
        <div>
          <div className="text-[10px] text-slate-500 uppercase font-bold mb-1.5">Operadores</div>
          <div className="space-y-1">
            {(['70', '50', '20', '10'] as const).map((agencyId) => {
              const active = filters.operators.has(agencyId);
              const covered = coveredOps.has(agencyId);
              return (
                <button
                  key={agencyId}
                  onClick={() => toggleOperator(agencyId)}
                  className={`w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded border ${
                    active
                      ? 'border-slate-600 bg-slate-800/60'
                      : 'border-slate-800 bg-slate-900/40 text-slate-600 opacity-60'
                  }`}
                  disabled={!covered}
                  title={covered ? '' : 'Sin shapes reconstruidas'}
                >
                  <span
                    className="w-3 h-3 rounded"
                    style={{ background: EMPRESA_COLOR[agencyId] }}
                  />
                  <span className="font-semibold">{EMPRESA_NAME[agencyId]}</span>
                  <span
                    className="text-slate-500 ml-auto"
                    title={shapes.filter((s) => s.agencyId === agencyId).length === 0
                      ? 'Shapes geográficos pendientes — requiere integración con feed GTFS del operador'
                      : undefined}
                  >
                    {shapes.filter((s) => s.agencyId === agencyId).length === 0
                      ? '— pendiente'
                      : `${shapes.filter((s) => s.agencyId === agencyId).length} sh.`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* DRO slider */}
        <div>
          <div className="text-[10px] text-slate-500 uppercase font-bold mb-1.5">
            DRO mínimo para resaltar: <span className="text-white">{filters.minDroPct}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={filters.minDroPct}
            onChange={(e) =>
              setFilters((f) => ({ ...f, minDroPct: Number(e.target.value) }))
            }
            className="w-full"
          />
        </div>

        {/* Toggles */}
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={filters.showOnlyCompetitive}
            onChange={(e) =>
              setFilters((f) => ({ ...f, showOnlyCompetitive: e.target.checked }))
            }
            className="accent-cyan-500"
          />
          <span>Solo corredores competitivos</span>
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={filters.showBuses}
            onChange={(e) => setFilters((f) => ({ ...f, showBuses: e.target.checked }))}
            className="accent-cyan-500"
          />
          <span>Buses en vivo</span>
        </label>

        {/* Leyenda */}
        <div className="border-t border-slate-800 pt-2">
          <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Leyenda</div>
          <div className="space-y-1 text-[11px] text-slate-400">
            <div className="flex items-center gap-2">
              <div className="w-5 h-0.5 bg-slate-400" />
              <span>Shape normal</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-1 bg-red-400" />
              <span>En corredor competitivo (DRO ≥ {filters.minDroPct}%)</span>
            </div>
            <div className="flex items-center gap-2">
              <Bus className="w-3.5 h-3.5 text-slate-400" />
              <span>Bus en vivo (STM)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Panel de detalle del shape seleccionado */}
      {selectedShape && (
        <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/95 border border-slate-800 rounded-xl p-4 shadow-2xl w-80 max-h-[50vh] overflow-y-auto backdrop-blur">
          <div className="flex justify-between items-start mb-3">
            <div>
              <div
                className="font-bold text-lg"
                style={{ color: EMPRESA_COLOR[selectedShape.agencyId] }}
              >
                {selectedShape.empresa} — Línea {selectedShape.linea}
              </div>
              <div className="text-xs text-slate-500">
                Sentido {selectedShape.sentido} · {(selectedShape.lengthMeters / 1000).toFixed(1)} km
              </div>
            </div>
            <button
              onClick={() => setSelectedShape(null)}
              className="text-slate-500 hover:text-white text-xl leading-none"
            >
              ×
            </button>
          </div>

          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            Top rivales por DRO
          </div>
          {selectedShapeRivals.length === 0 ? (
            <div className="text-xs text-slate-500 italic">
              Sin pares registrados en corridor_overlap (esta línea no compite o no tiene matriz)
            </div>
          ) : (
            <div className="space-y-1.5">
              {selectedShapeRivals.map((r) => (
                <div
                  key={r.key}
                  className="flex justify-between items-center text-xs bg-slate-800/60 rounded px-2 py-1.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: EMPRESA_COLOR[r.agencyB] }}
                    />
                    <span className="truncate">
                      <span className="font-semibold">{r.empresaB}</span> L{r.lineaB} ({r.sentidoB})
                    </span>
                    {r.sameEmpresa && (
                      <span className="text-[9px] px-1 bg-amber-900/60 text-amber-300 rounded shrink-0">
                        INTRA
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 font-mono">
                    <span className="text-red-400 font-bold">{r.pctAInB.toFixed(0)}%</span>
                    <span className="text-emerald-400">{r.sharedKm.toFixed(1)} km</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mapa */}
      <MapContainer
        center={MONTEVIDEO_CENTER}
        zoom={12}
        style={{ height: '100vh', width: '100%', background: '#0f172a' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        <LayersControl position="topright">
          <LayersControl.Overlay checked name="Shapes">
            <LayerGroup>
              {visibleShapes.map((s) => (
                <Polyline
                  key={s.key}
                  positions={s.points.filter((p) => p.lat && p.lon).map((p) => [p.lat, p.lon]) as [number, number][]}
                  pathOptions={{
                    color: EMPRESA_COLOR[s.agencyId] ?? '#94a3b8',
                    weight: s.isCompetitive ? 5 : 2.5,
                    opacity: s.isCompetitive ? 0.9 : 0.55,
                  }}
                  eventHandlers={{
                    click: () => { setSelectedShape(s); setSelectedLine(s.linea); },
                  }}
                >
                  <Tooltip sticky>
                    <div className="text-xs">
                      <div className="font-bold">
                        {s.empresa} L{s.linea} ({s.sentido})
                      </div>
                      <div>{(s.lengthMeters / 1000).toFixed(1)} km</div>
                      {s.isCompetitive && (
                        <div className="text-red-400">en corredor competitivo</div>
                      )}
                      <div className="text-slate-500 italic mt-0.5">click para detalle</div>
                    </div>
                  </Tooltip>
                </Polyline>
              ))}
            </LayerGroup>
          </LayersControl.Overlay>

          {filters.showBuses && visibleBuses.length > 0 && (
            <LayersControl.Overlay checked name="Buses en vivo">
              <LayerGroup>
                {visibleBuses.map((b) => (
                  <CircleMarker
                    key={b.id}
                    center={[b.lat, b.lng]}
                    radius={4}
                    pathOptions={{
                      color: EMPRESA_COLOR[String(b.codigoEmpresa)] ?? '#fff',
                      fillColor: EMPRESA_COLOR[String(b.codigoEmpresa)] ?? '#fff',
                      fillOpacity: 0.9,
                      weight: 1,
                    }}
                  >
                    <Tooltip>
                      <div className="text-xs">
                        <div className="font-bold">
                          {b.empresa} #{b.codigoBus}
                        </div>
                        <div>
                          L{b.linea} {b.destinoDesc && `→ ${b.destinoDesc}`}
                        </div>
                        <div className="text-slate-500">{b.velocidad} km/h</div>
                      </div>
                    </Tooltip>
                  </CircleMarker>
                ))}
              </LayerGroup>
            </LayersControl.Overlay>
          )}
        </LayersControl>

        <FitToShapes shapes={visibleShapes.slice(0, 30)} />
      </MapContainer>
    </div>
  );
}

// ─── Hook utilitario: centrar el mapa en las shapes visibles al montar ────

function FitToShapes({ shapes }: { shapes: ShapeDoc[] }) {
  const map = useMap();
  useEffect(() => {
    if (shapes.length === 0) return;
    const bounds: [number, number][] = [];
    for (const s of shapes) {
      for (const p of s.points) if (p.lat && p.lon) bounds.push([p.lat, p.lon]);
    }
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapes.length]);
  return null;
}
