/**
 * TacticalRouteMap — Mapa Leaflet táctico con recorridos REALES.
 * v3 — Usa EXACTAMENTE la misma cadena de datos que el Navegador UCOT:
 *   1. Firestore `lineas_ucot` (incluye desvíos editados en el navegador)
 *   2. Cartones (hitos teóricos)
 *   3. lineTemplates (datos manuales)
 *   4. ALL_UCOT_ROUTES (GPS oficiales del GeoServer IMM)
 *   + enrichWithOfficialGeoData (sobreescribe con GPS real al final)
 *
 * Colores tácticos: UCOT=Azul sólido | Rivales=Rojo punteado
 */
import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  CircleMarker,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Shield, Navigation, Loader2, Satellite } from 'lucide-react';
import { getLineaData, getLineVariants } from '../services/ucotLinesService';
import type { LineaUCOT } from '../types/lineasUcot';

// ─── Types ──────────────────────────────────────────────────────────────────
interface LiveBus {
  id: string;
  linea: string;
  lat: number;
  lng: number;
  heading: number;
  empresa: string | number;
}

interface TacticalRouteMapProps {
  liveBuses: LiveBus[];
  selectedLineId?: string;
  corridorLabel?: string;
  corridorTerminals?: string;
  corridorRivals?: string[];
  threatLevel?: 'CRITICAL' | 'WARN' | 'SAFE';
  recommendation?: string;
  scheduleInfo?: {
    ucotNextDep: string | null;
    rivalNextDep: string | null;
    ventajaMin: number;
    descripcion: string;
    enHoraPico: boolean;
  } | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────
const MONTEVIDEO_CENTER: [number, number] = [-34.88, -56.16];
const DEFAULT_ZOOM = 12;
const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

// ─── Bus Icons ──────────────────────────────────────────────────────────────
const ucotBusIcon = L.divIcon({
  html: '<span style="background:#2563eb;color:white;padding:2px 6px;border-radius:6px;font-size:11px;font-weight:bold;box-shadow:0 0 8px rgba(37,99,235,0.7);display:inline-flex;align-items:center;gap:2px">🚌 UCOT</span>',
  className: 'tactical-marker',
  iconSize: [48, 24],
  iconAnchor: [24, 12],
});

const rivalBusIcon = L.divIcon({
  html: '<span style="background:#dc2626;color:white;padding:2px 6px;border-radius:6px;font-size:11px;font-weight:bold;box-shadow:0 0 8px rgba(220,38,38,0.7);display:inline-flex;align-items:center;gap:2px">🚌 RIVAL</span>',
  className: 'tactical-marker',
  iconSize: [56, 24],
  iconAnchor: [28, 12],
});

const stopIcon = L.divIcon({
  html: '<span style="background:#fff;width:6px;height:6px;border-radius:50%;display:block;border:2px solid #3b82f6;box-shadow:0 0 4px rgba(59,130,246,0.5)"></span>',
  className: 'stop-marker',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

// ─── Auto-fit map to route bounds ───────────────────────────────────────────
function FitBounds({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) {
      const bounds = L.latLngBounds(points.map((p) => L.latLng(p[0], p[1])));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [points, map]);
  return null;
}

// ─── Helper: LineaUCOT → [lat, lng][] (filtrando coords nulas) ──────────────
function toLeafletPoints(linea: LineaUCOT | null): Array<[number, number]> {
  if (!linea?.recorrido) return [];
  return linea.recorrido
    .filter((p) => p.lat !== 0 && p.lng !== 0 && Math.abs(p.lat) > 1 && Math.abs(p.lng) > 1)
    .map((p) => [p.lat, p.lng]);
}

// ─── Component ──────────────────────────────────────────────────────────────
const TacticalRouteMap: React.FC<TacticalRouteMapProps> = ({
  liveBuses,
  selectedLineId,
  corridorLabel,
  corridorTerminals,
  corridorRivals,
  threatLevel = 'SAFE',
  recommendation,
  scheduleInfo,
}) => {
  // UCOT: IDA + VUELTA (datos reales del navegador)
  const [idaData, setIdaData] = useState<LineaUCOT | null>(null);
  const [vueltaData, setVueltaData] = useState<LineaUCOT | null>(null);
  // Rivales: un recorrido por línea rival
  const [rivalData, setRivalData] = useState<LineaUCOT[]>([]);
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<string>('');
  const loadRef = useRef<string>('');

  // ═══ Cargar rutas UCOT usando la misma cadena que el Navegador ═══
  useEffect(() => {
    if (!selectedLineId) {
      setIdaData(null);
      setVueltaData(null);
      setRivalData([]);
      setDataSource('');
      return;
    }

    const loadKey = selectedLineId;
    loadRef.current = loadKey;
    setLoading(true);

    async function loadUCOTRoute() {
      try {
        const baseLine = selectedLineId!.replace(/[ab]$/i, '');

        // Misma función que usa el navegador UCOT
        const { ida, vuelta } = await getLineVariants(baseLine);

        if (loadRef.current !== loadKey) return; // cancelado

        setIdaData(ida);
        setVueltaData(vuelta);

        // Determinar fuente de datos para el HUD
        if (ida?.recorrido && ida.recorrido.length > 0) {
          setDataSource(`GeoServer IMM — ${ida.recorrido.length} pts (IDA)`);
        } else {
          setDataSource('Sin datos de recorrido');
        }
      } catch (err) {
        console.error('[TacticalRouteMap] Error cargando ruta UCOT:', err);
        if (loadRef.current === loadKey) {
          setIdaData(null);
          setVueltaData(null);
        }
      } finally {
        if (loadRef.current === loadKey) setLoading(false);
      }
    }

    loadUCOTRoute();
  }, [selectedLineId]);

  // ═══ Cargar rutas RIVALES usando la misma cadena que el Navegador ═══
  useEffect(() => {
    if (!corridorRivals || corridorRivals.length === 0) {
      setRivalData([]);
      return;
    }

    async function loadRivalRoutes() {
      const results = await Promise.allSettled(
        corridorRivals!.map((rivalId) => getLineaData(rivalId)),
      );
      const loaded: LineaUCOT[] = results
        .map((r) => (r.status === 'fulfilled' ? r.value : null))
        .filter((r): r is LineaUCOT => r !== null && (r.recorrido?.length ?? 0) > 2);
      setRivalData(loaded);
    }

    loadRivalRoutes();
  }, [corridorRivals]);

  // Convertir a formato Leaflet
  const idaPoints = useMemo(() => toLeafletPoints(idaData), [idaData]);
  const vueltaPoints = useMemo(() => toLeafletPoints(vueltaData), [vueltaData]);
  const allRoutePoints = useMemo(() => [...idaPoints, ...vueltaPoints], [idaPoints, vueltaPoints]);

  const stops = idaData?.paradas?.filter((s) => s.lat !== 0 && s.lng !== 0) ?? [];

  // Separar buses UCOT vs rival
  const { ucotBuses, rivalBuses } = useMemo(() => {
    const ucot: LiveBus[] = [];
    const rival: LiveBus[] = [];
    liveBuses.forEach((bus) => {
      if (bus.lat === 0 && bus.lng === 0) return;
      const isUCOT = bus.empresa === 'UCOT' || bus.empresa === 2 || bus.id?.includes('sim-ucot');
      if (isUCOT) ucot.push(bus);
      else rival.push(bus);
    });
    return { ucotBuses: ucot, rivalBuses: rival };
  }, [liveBuses]);

  // Clases de amenaza
  const threatBgClass =
    threatLevel === 'CRITICAL'
      ? 'bg-red-500/10'
      : threatLevel === 'WARN'
        ? 'bg-amber-500/10'
        : 'bg-green-500/10';
  const threatBorderClass =
    threatLevel === 'CRITICAL'
      ? 'border-red-500/25'
      : threatLevel === 'WARN'
        ? 'border-amber-500/25'
        : 'border-green-500/25';
  const threatTextClass =
    threatLevel === 'CRITICAL'
      ? 'text-red-500'
      : threatLevel === 'WARN'
        ? 'text-amber-500'
        : 'text-green-500';

  const threatLabel =
    threatLevel === 'CRITICAL'
      ? '🔴 AMENAZA CRÍTICA'
      : threatLevel === 'WARN'
        ? '🟡 ALERTA ACTIVA'
        : '🟢 CORREDOR SEGURO';

  const cleanLineId = selectedLineId?.replace(/[ab]$/i, '') || '';

  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="relative flex-1 min-h-[300px]">
        <MapContainer
          center={MONTEVIDEO_CENTER}
          zoom={DEFAULT_ZOOM}
          className="h-full w-full min-h-[300px] bg-slate-900"
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url={DARK_TILES}
          />

          {/* Auto-fit al recorrido completo */}
          {allRoutePoints.length > 1 && <FitBounds points={allRoutePoints} />}

          {/* ═══ RIVAL ROUTES — rojo punteado ═══ */}
          {rivalData.map((rival) => {
            const positions = toLeafletPoints(rival);
            if (positions.length < 2) return null;
            return (
              <React.Fragment key={`rival-${rival.codigo}`}>
                {/* Halo rojo semitransparente */}
                <Polyline
                  positions={positions}
                  pathOptions={{
                    color: '#ef4444',
                    weight: 10,
                    opacity: 0.12,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
                {/* Trazo punteado rojo */}
                <Polyline
                  positions={positions}
                  pathOptions={{
                    color: '#ef4444',
                    weight: 3.5,
                    opacity: 0.85,
                    dashArray: '12, 8',
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
                {/* Terminal origen rival */}
                {positions.length > 0 && (
                  <CircleMarker
                    center={positions[0]}
                    radius={6}
                    pathOptions={{ color: '#fff', fillColor: '#ef4444', fillOpacity: 0.9, weight: 2 }}
                  >
                    <Popup>
                      <strong>🔴 Rival {rival.codigo} — Origen</strong>
                      <br />
                      {rival.origen || 'Terminal origen'}
                    </Popup>
                  </CircleMarker>
                )}
                {/* Terminal destino rival */}
                {positions.length > 1 && (
                  <CircleMarker
                    center={positions[positions.length - 1]}
                    radius={6}
                    pathOptions={{ color: '#fff', fillColor: '#ef4444', fillOpacity: 0.9, weight: 2 }}
                  >
                    <Popup>
                      <strong>🔴 Rival {rival.codigo} — Destino</strong>
                      <br />
                      {rival.destino || 'Terminal destino'}
                    </Popup>
                  </CircleMarker>
                )}
              </React.Fragment>
            );
          })}

          {/* ═══ UCOT ROUTE IDA — azul sólido con glow ═══ */}
          {idaPoints.length > 1 && (
            <>
              {/* Halo exterior azul */}
              <Polyline
                positions={idaPoints}
                pathOptions={{
                  color: '#3b82f6',
                  weight: 16,
                  opacity: 0.18,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
              {/* Cuerpo sólido azul */}
              <Polyline
                positions={idaPoints}
                pathOptions={{
                  color: '#1d4ed8',
                  weight: 7,
                  opacity: 0.9,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
              {/* Línea central brillante */}
              <Polyline
                positions={idaPoints}
                pathOptions={{
                  color: '#60a5fa',
                  weight: 3,
                  opacity: 1,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />

              {/* Terminal origen IDA (verde) */}
              <CircleMarker
                center={idaPoints[0]}
                radius={9}
                pathOptions={{ color: '#fff', fillColor: '#22c55e', fillOpacity: 1, weight: 3 }}
              >
                <Popup>
                  <strong>🟢 Origen IDA</strong>
                  <br />
                  {idaData?.origen || 'Terminal Inicio'}
                </Popup>
              </CircleMarker>

              {/* Terminal destino IDA (naranja) */}
              <CircleMarker
                center={idaPoints[idaPoints.length - 1]}
                radius={9}
                pathOptions={{ color: '#fff', fillColor: '#f59e0b', fillOpacity: 1, weight: 3 }}
              >
                <Popup>
                  <strong>🟠 Destino IDA</strong>
                  <br />
                  {idaData?.destino || 'Terminal Fin'}
                </Popup>
              </CircleMarker>
            </>
          )}

          {/* ═══ UCOT ROUTE VUELTA — azul más claro/semitransparente ═══ */}
          {vueltaPoints.length > 1 && (
            <>
              {/* Halo vuelta */}
              <Polyline
                positions={vueltaPoints}
                pathOptions={{
                  color: '#3b82f6',
                  weight: 14,
                  opacity: 0.12,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
              {/* Cuerpo vuelta — azul con dashArray largo */}
              <Polyline
                positions={vueltaPoints}
                pathOptions={{
                  color: '#2563eb',
                  weight: 5,
                  opacity: 0.7,
                  dashArray: '20, 5',
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
              <Polyline
                positions={vueltaPoints}
                pathOptions={{
                  color: '#93c5fd',
                  weight: 2,
                  opacity: 0.9,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />

              {/* Terminal inicio vuelta */}
              <CircleMarker
                center={vueltaPoints[0]}
                radius={7}
                pathOptions={{ color: '#fff', fillColor: '#f59e0b', fillOpacity: 1, weight: 2 }}
              >
                <Popup>
                  <strong>🟠 Inicio Vuelta</strong>
                  <br />
                  {vueltaData?.origen || 'Terminal Vuelta'}
                </Popup>
              </CircleMarker>

              {/* Terminal fin vuelta */}
              <CircleMarker
                center={vueltaPoints[vueltaPoints.length - 1]}
                radius={9}
                pathOptions={{ color: '#fff', fillColor: '#22c55e', fillOpacity: 1, weight: 3 }}
              >
                <Popup>
                  <strong>🟢 Fin Vuelta</strong>
                  <br />
                  {vueltaData?.destino || 'Terminal Regreso'}
                </Popup>
              </CircleMarker>
            </>
          )}

          {/* ═══ PARADAS (puntos intermedios) ═══ */}
          {stops.map((stop, i) =>
            i === 0 || i === stops.length - 1 ? null : (
              <Marker key={`stop-${i}`} position={[stop.lat, stop.lng]} icon={stopIcon}>
                <Popup>
                  <strong>🚏 {stop.nombre}</strong>
                  <br />
                  <span className="text-[10px] text-slate-400">
                    Parada {stop.orden} de {stops.length}
                  </span>
                </Popup>
              </Marker>
            ),
          )}

          {/* ═══ BUS MARKERS ═══ */}
          {ucotBuses.map((bus) => (
            <Marker key={bus.id} position={[bus.lat, bus.lng]} icon={ucotBusIcon}>
              <Popup>
                <div className="min-w-[140px]">
                  <div className="font-bold text-cyan-600">🚌 UCOT – Línea {bus.linea}</div>
                </div>
              </Popup>
            </Marker>
          ))}
          {rivalBuses.map((bus) => (
            <Marker key={bus.id} position={[bus.lat, bus.lng]} icon={rivalBusIcon}>
              <Popup>
                <div className="min-w-[140px]">
                  <div className="font-bold text-red-500">🚩 Rival – Línea {bus.linea}</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* ═══ LOADING OVERLAY ═══ */}
        {loading && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
            <div className="flex items-center gap-3 rounded-xl bg-slate-900/90 px-5 py-3 border border-cyan-500/30">
              <Loader2 className="h-5 w-5 text-cyan-400 animate-spin" />
              <span className="text-sm font-bold text-cyan-400">
                Cargando recorrido real Línea {cleanLineId}...
              </span>
            </div>
          </div>
        )}

        {/* ═══ HUD OVERLAY ═══ */}
        <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-2 pointer-events-none">
          {selectedLineId && (
            <div className="pointer-events-auto rounded-lg bg-slate-950/90 backdrop-blur border border-cyan-500/30 px-3 py-2 shadow-lg">
              <div className="flex items-center gap-2">
                <Navigation className="h-4 w-4 text-cyan-400" />
                <span className="text-xs font-black text-cyan-400 tracking-widest uppercase">
                  Línea {cleanLineId}
                  {corridorLabel ? ` — ${corridorLabel}` : ''}
                </span>
              </div>
              {corridorTerminals && (
                <div className="text-[10px] text-slate-400 mt-1 ml-6">{corridorTerminals}</div>
              )}
              {corridorRivals && corridorRivals.length > 0 && (
                <div className="text-[10px] text-red-400 mt-0.5 ml-6">
                  Rivales: {corridorRivals.join(', ')}
                </div>
              )}
              {/* Leyenda de colores */}
              <div className="flex items-center gap-3 mt-2 ml-1">
                <div className="flex items-center gap-1">
                  <div className="w-6 h-1.5 rounded-full bg-blue-500" />
                  <span className="text-[8px] text-blue-400 font-bold">UCOT</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-6 h-0 border-t-2 border-dashed border-red-500" />
                  <span className="text-[8px] text-red-400 font-bold">RIVAL</span>
                </div>
              </div>
              {/* Fuente de datos GPS */}
              {dataSource && (
                <div className="text-[9px] text-emerald-400/80 mt-1 ml-1 flex items-center gap-1">
                  <Satellite className="h-3 w-3" />
                  {dataSource}
                </div>
              )}
              {!idaData && !loading && (
                <div className="text-[9px] text-amber-400/80 mt-1 ml-6">
                  ⚠️ Sin datos de recorrido disponibles
                </div>
              )}
            </div>
          )}

          <div
            className={`pointer-events-auto rounded-lg backdrop-blur border px-3 py-2 shadow-lg ${threatBgClass} ${threatBorderClass}`}
          >
            <div className="flex items-center gap-2">
              <Shield className={`h-3 w-3 ${threatTextClass}`} />
              <span
                className={`text-[10px] font-black tracking-widest uppercase ${threatTextClass}`}
              >
                {threatLabel}
              </span>
            </div>
            {recommendation && (
              <div className="text-[9px] text-slate-300 mt-1 max-w-[220px] leading-tight">
                💡 {recommendation}
              </div>
            )}
          </div>

          {scheduleInfo && (
            <div className="pointer-events-auto rounded-lg bg-slate-950/90 backdrop-blur border border-amber-500/20 px-3 py-2 shadow-lg">
              <div className="text-[9px] text-amber-400 font-black uppercase tracking-widest mb-1">
                ⏰ Horario
              </div>
              <div className="text-[10px] text-slate-300">{scheduleInfo.descripcion}</div>
              {scheduleInfo.ventajaMin !== 0 && (
                <div
                  className={`text-[10px] font-bold mt-0.5 ${
                    scheduleInfo.ventajaMin > 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {scheduleInfo.ventajaMin > 0 ? '✅' : '⚠️'} Ventaja:{' '}
                  {scheduleInfo.ventajaMin > 0 ? '+' : ''}
                  {scheduleInfo.ventajaMin} min
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bus count badges */}
        <div className="absolute bottom-3 right-3 z-[1000] flex gap-2 pointer-events-none">
          <div className="pointer-events-auto rounded-lg bg-slate-950/90 backdrop-blur border border-blue-500/30 px-3 py-1.5 flex items-center gap-1.5">
            <div className="w-3 h-1 rounded-full bg-blue-500" />
            <span className="text-[10px] font-black text-blue-400">
              UCOT {ucotBuses.length > 0 ? `· ${ucotBuses.length} buses` : ''}
            </span>
          </div>
          <div className="pointer-events-auto rounded-lg bg-slate-950/90 backdrop-blur border border-red-500/30 px-3 py-1.5 flex items-center gap-1.5">
            <div className="w-3 h-0 border-t-2 border-dashed border-red-500" />
            <span className="text-[10px] font-black text-red-400">
              RIVAL {rivalBuses.length > 0 ? `· ${rivalBuses.length} buses` : ''}
            </span>
          </div>
          {rivalData.length > 0 && (
            <div className="pointer-events-auto rounded-lg bg-slate-950/90 backdrop-blur border border-red-500/20 px-3 py-1.5">
              <span className="text-[10px] font-black text-red-400/70">
                {rivalData.length} ruta{rivalData.length !== 1 ? 's' : ''} rival{rivalData.length !== 1 ? 'es' : ''}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TacticalRouteMap;
