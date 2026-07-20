/**
 * MapHub.tsx
 * ==============================================================================
 * Consola Unificada de Mapas y Control de Operaciones (Map Hub)
 * Fusiona: LiveMapPage.tsx, FleetMonitorModule.tsx y CorridorMap.tsx.
 * 
 * Ley de Diseño: Premium, estética dark de alta densidad, interactividad fluida
 * y visualización GIS avanzada de capas conmutables.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  CircleMarker,
  Tooltip as LeafletTooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import { useLiveData } from '../../context/LiveDataContext';
import { useLiveOperations, type ServicioActivo, type DesvioReportado, type IncidenciaReportada } from '../../hooks/useLiveOperations';
import { collection, getDocs, query, limit } from '../../config/firestoreShim';
import { db } from '../../config/firebase';
import {
  Map as MapIcon,
  Layers,
  Activity,
  AlertTriangle,
  Siren,
  Bus,
  RefreshCw,
  Search,
  Wifi,
  Filter,
  Building2,
  X,
  MapPin,
  Clock,
  Eye,
  Download,
  Info,
  Sliders,
  DollarSign,
  User,
  Heart,
  TrendingUp,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip } from 'recharts';
import toast from 'react-hot-toast';

// ─── Constantes Visuales del Mapa ──────────────────────────────────────────
const MONTEVIDEO_CENTER: [number, number] = [-34.8941, -56.1880];
const EMPRESA_COLOR: Record<string, string> = {
  '70': '#f59e0b', // UCOT — Ámbar
  '50': '#3b82f6', // CUTCSA — Azul
  '20': '#10b981', // COME — Esmeralda
  '10': '#a855f7', // COETC — Violeta
};
const EMPRESA_NAME: Record<string, string> = {
  '70': 'UCOT',
  '50': 'CUTCSA',
  '20': 'COME',
  '10': 'COETC',
};

// ─── Definición de Tipos Locales ───────────────────────────────────────────
interface ShapeDoc {
  key: string;
  agencyId: string;
  empresa: string;
  linea: string;
  sentido: string;
  points: Array<{ lat: number; lon: number }>;
  lengthMeters: number;
}

interface OverlapDoc {
  key: string;
  shapeAKey: string;
  shapeBKey: string;
  pctAInB: number;
  sharedKm: number;
}

interface GTFSStop {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  stop_code?: string;
}

// ─── Fix Leaflet default icons broken by Vite ────────────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// DivIcon Generator for live buses
function makeBusDivIcon(color: string, label: string, isOwn = false, hasAlert = false) {
  const border = hasAlert 
    ? 'border: 3px solid #ef4444; box-shadow: 0 0 12px #ef4444;' 
    : isOwn 
      ? 'border: 2px solid #ffffff; box-shadow: 0 0 8px rgba(245, 158, 11, 0.4);' 
      : 'border: 1.5px solid rgba(255,255,255,0.6); box-shadow: 0 2px 4px rgba(0,0,0,0.5);';

  const animate = hasAlert ? 'animate-pulse' : '';

  return L.divIcon({
    html: `
      <div class="${animate}" style="
        background: ${color};
        color: #000;
        padding: 3px 6px;
        border-radius: 6px;
        font-size: 10px;
        font-weight: 900;
        white-space: nowrap;
        font-family: sans-serif;
        text-align: center;
        ${border}
      ">
        ${label}
      </div>
    `,
    className: '',
    iconSize: [44, 22],
    iconAnchor: [22, 11],
    popupAnchor: [0, -12],
  });
}

export default function MapHub() {
  const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
  const { selectedLine, setSelectedLine } = useLiveData();

  // Hook central de telemetría y alertas
  const {
    serviciosPropios,
    serviciosRivales,
    desvios,
    incidencias,
    bunching,
    kpis,
    loading: loadingLive,
    error: errorLive,
    lastUpdate,
    refrescar,
  } = useLiveOperations();

  // Capas toggles
  const [layers, setLayers] = useState({
    vehicles: true,
    demanda: false,
    alertas: true,
    fmsHealth: false,
    droCorridors: false,
    paradas: false,
  });

  // Data States
  const [shapes, setShapes] = useState<ShapeDoc[]>([]);
  const [overlaps, setOverlaps] = useState<OverlapDoc[]>([]);
  const [stops, setStops] = useState<GTFSStop[]>([]);
  const [loadingStatic, setLoadingStatic] = useState(true);

  // Tab lateral: 'alertas' | 'flota' | 'bunching' | 'dro'
  const [sidebarTab, setSidebarTab] = useState<'alertas' | 'flota' | 'bunching' | 'dro'>('flota');

  // Filtros
  const [operatorFilter, setOperatorFilter] = useState<string>(String(empresaPropia));
  const [lineFilter, setLineFilter] = useState<string>(selectedLine ?? 'todas');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShape, setSelectedShape] = useState<ShapeDoc | null>(null);

  // Mapa viewport focus
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [mapZoom, setMapZoom] = useState(13);
  const markersRef = useRef<Record<string, L.Marker>>({});

  // Sincronizar filtro global
  useEffect(() => {
    if (selectedLine) setLineFilter(selectedLine);
  }, [selectedLine]);

  // Carga de catálogo estático de shapes y overlaps
  const loadStatic = useCallback(async () => {
    setLoadingStatic(true);
    try {
      const [s70, s50, s20, s10, oSnap] = await Promise.all([
        getDocs(query(collection(db, 'shapes_cross_operator'), limit(250))),
        getDocs(query(collection(db, 'shapes_cross_operator'), limit(250))),
        getDocs(query(collection(db, 'shapes_cross_operator'), limit(250))),
        getDocs(query(collection(db, 'shapes_cross_operator'), limit(250))),
        getDocs(query(collection(db, 'corridor_overlap'), limit(500))),
      ]);

      const loadedShapes: ShapeDoc[] = [];
      const rawDocs = [...s70.docs, ...s50.docs, ...s20.docs, ...s10.docs];
      for (const d of rawDocs) {
        const data = d.data();
        if (Array.isArray(data.points) && data.points.length > 1) {
          loadedShapes.push({
            key: String(data.key),
            agencyId: String(data.agencyId),
            empresa: String(data.empresa),
            linea: String(data.linea),
            sentido: String(data.sentido || 'IDA'),
            points: data.points as Array<{ lat: number; lon: number }>,
            lengthMeters: Number(data.lengthMeters ?? 0),
          });
        }
      }

      const loadedOverlaps: OverlapDoc[] = oSnap.docs.map((doc) => doc.data() as OverlapDoc);

      setShapes(loadedShapes);
      setOverlaps(loadedOverlaps);
    } catch (err) {
      console.warn('[MapHub] Error al precargar shapes/overlaps:', err);
    } finally {
      setLoadingStatic(false);
    }
  }, []);

  // Carga bajo demanda de paradas GTFS (Lazy load)
  useEffect(() => {
    if (!layers.paradas || stops.length > 0) return;
    const token = localStorage.getItem('tf_token');
    fetch('/api/gtfs/stops', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setStops(data.data);
        }
      })
      .catch((err) => console.warn('[MapHub] Error cargando paradas:', err));
  }, [layers.paradas, stops]);

  useEffect(() => {
    loadStatic();
  }, [loadStatic]);

  // Heatmap estático de demanda histórica de Montevideo
  const demandHeatmapPoints = useMemo<[number, number, number][]>(() => {
    return [
      [-34.896, -56.166, 1.0], // Tres Cruces
      [-34.895, -56.164, 0.9],
      [-34.893, -56.16, 0.8],
      [-34.888, -56.151, 0.9], // 8 de Octubre y Garibaldi
      [-34.885, -56.142, 0.8],
      [-34.881, -56.134, 1.0], // 8 de Octubre y Propios
      [-34.877, -56.125, 0.7],
      [-34.873, -56.115, 0.9], // 8 de Octubre y Pan de Azucar
      [-34.869, -56.108, 0.8],
      [-34.862, -56.096, 0.7], // Curva de Maroñas
      [-34.905, -56.195, 0.8], // 18 de Julio y Ejido
      [-34.905, -56.185, 0.9], // 18 de Julio y Minas
      [-34.901, -56.175, 0.7], // 18 y Bvar Artigas
      [-34.884, -56.082, 0.6], // Portones
      [-34.885, -56.08, 0.8],
      [-34.832, -56.162, 0.7], // Casavalle
    ];
  }, []);

  // Filtrado de Buses
  const allBusesCombined = useMemo(() => {
    return [...serviciosPropios, ...serviciosRivales];
  }, [serviciosPropios, serviciosRivales]);

  const visibleBuses = useMemo(() => {
    return allBusesCombined.filter((bus) => {
      // Filtro de operador
      if (operatorFilter !== 'todos' && String(bus.empresaId) !== operatorFilter) return false;
      // Filtro de línea
      if (lineFilter !== 'todas' && bus.linea !== lineFilter) return false;
      // Filtro de búsqueda textual
      if (searchQuery) {
        const queryLower = searchQuery.toLowerCase();
        const matchCoche = bus.codigoBus.toLowerCase().includes(queryLower);
        const matchConductor = bus.choferNombre?.toLowerCase().includes(queryLower);
        if (!matchCoche && !matchConductor) return false;
      }
      return true;
    }).sort((a, b) => {
      // 1. Group by Linea
      const lineaCmp = String(a.linea).localeCompare(String(b.linea), undefined, { numeric: true });
      if (lineaCmp !== 0) return lineaCmp;
      // 2. Group by Empresa
      const empCmp = a.empresaId - b.empresaId;
      if (empCmp !== 0) return empCmp;
      // 3. Sort by Bus Number
      return Number(a.codigoBus) - Number(b.codigoBus);
    });
  }, [allBusesCombined, operatorFilter, lineFilter, searchQuery]);

  // Líneas únicas basadas en el operador seleccionado
  const availableLines = useMemo(() => {
    const list = allBusesCombined
      .filter(b => operatorFilter === 'todos' || String(b.empresaId) === operatorFilter)
      .map((b) => b.linea)
      .filter(Boolean);
    return [...new Set(list)].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  }, [allBusesCombined, operatorFilter]);

  // Enfocar un bus en el mapa y abrir su popup
  const focusBus = (bus: ServicioActivo) => {
    setMapCenter([bus.lat, bus.lng]);
    setMapZoom(15);
    setTimeout(() => {
      const marker = markersRef.current[bus.id];
      if (marker) {
        marker.openPopup();
      }
    }, 150);
  };

  // Switch de capa individual
  const toggleLayer = (layerName: keyof typeof layers) => {
    setLayers((prev) => ({ ...prev, [layerName]: !prev[layerName] }));
  };

  // DRO Corredores con DRO >= 20%
  const activeDROOverlays = useMemo(() => {
    return overlaps.filter((o) => o.pctAInB >= 20);
  }, [overlaps]);

  // Distribución de Velocidades para Gráfico
  const speedDistributionData = useMemo(() => {
    const intervals = { '0-20 km/h': 0, '20-40 km/h': 0, '40-60 km/h': 0, '60+ km/h': 0 };
    visibleBuses.forEach((b) => {
      if (b.velocidad < 20) intervals['0-20 km/h']++;
      else if (b.velocidad < 40) intervals['20-40 km/h']++;
      else if (b.velocidad < 60) intervals['40-60 km/h']++;
      else intervals['60+ km/h']++;
    });
    return Object.entries(intervals).map(([range, count]) => ({ range, count }));
  }, [visibleBuses]);

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-64px)] w-full bg-[#0A0D14] text-slate-100 overflow-hidden font-sans">
      
      {/* ================= LADO IZQUIERDO: MAPA LEAFLET ================= */}
      <div className="w-full lg:w-[65%] h-[50vh] lg:h-full relative border-r border-slate-800">
        
        {loadingLive && allBusesCombined.length === 0 && (
          <div className="absolute inset-0 bg-[#0e131f]/80 backdrop-blur-md z-[1000] flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-10 h-10 animate-spin text-indigo-400" />
            <p className="text-sm font-semibold text-slate-300">Conectando con el oráculo de tránsito STM...</p>
          </div>
        )}

        <MapContainer
          center={MONTEVIDEO_CENTER}
          zoom={mapZoom}
          style={{ height: '100%', width: '100%', background: '#0e131f' }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
          />

          {/* Recenter Component */}
          <MapCenterController center={mapCenter} zoom={mapZoom} />

          {/* Capa 1: Corredores DRO */}
          {layers.droCorridors && shapes.map((s) => {
            const hasDro = activeDROOverlays.some((o) => o.shapeAKey === s.key || o.shapeBKey === s.key);
            const isSelected = selectedShape?.key === s.key;
            return (
              <Polyline
                key={s.key}
                positions={s.points.map((p) => [p.lat, p.lon]) as [number, number][]}
                pathOptions={{
                  color: EMPRESA_COLOR[s.agencyId] ?? '#64748b',
                  weight: isSelected ? 6 : hasDro ? 4.5 : 2,
                  opacity: isSelected ? 1.0 : hasDro ? 0.8 : 0.35,
                  dashArray: hasDro && !isSelected ? '5,5' : undefined,
                }}
                eventHandlers={{
                  click: () => {
                    setSelectedShape(s);
                    setSelectedLine(s.linea);
                  },
                }}
              >
                <LeafletTooltip sticky>
                  <div className="text-xs font-semibold p-1">
                    <span className="font-bold text-white uppercase">{s.empresa} - L{s.linea}</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">{(s.lengthMeters / 1000).toFixed(1)} km</p>
                    {hasDro && <p className="text-amber-400 text-[10px] font-bold mt-1">⚠️ Solapamiento DRO Crítico</p>}
                  </div>
                </LeafletTooltip>
              </Polyline>
            );
          })}

          {/* Capa 2: Heatmap de Demanda */}
          {layers.demanda && <HeatmapLayer points={demandHeatmapPoints} />}

          {/* Capa 3: Paradas GTFS */}
          {layers.paradas && stops.map((stop) => (
            <CircleMarker
              key={stop.stop_id}
              center={[stop.stop_lat, stop.stop_lon]}
              radius={4}
              pathOptions={{
                color: '#4f46e5',
                fillColor: '#818cf8',
                fillOpacity: 0.9,
                weight: 1.5,
              }}
            >
              <Popup>
                <StopPopupContent stopId={stop.stop_id} stopName={stop.stop_name} stopCode={stop.stop_code} />
              </Popup>
            </CircleMarker>
          ))}

          {/* Capa 4: Alertas (Desvíos e Incidencias) */}
          {layers.alertas && visibleBuses.filter((b) => b.desvio || b.incidencia).map((b) => (
            <Marker
              key={`alert-${b.id}`}
              position={[b.lat, b.lng]}
              icon={L.divIcon({
                html: `
                  <div class="animate-bounce flex items-center justify-center bg-red-600 text-white rounded-full border-2 border-white" style="width: 28px; height: 28px; box-shadow: 0 0 10px rgba(239, 68, 68, 0.7)">
                    <span class="text-xs font-bold">⚠️</span>
                  </div>
                `,
                className: '',
                iconSize: [28, 28],
                iconAnchor: [14, 28],
              })}
            >
              <Popup>
                <div className="text-xs p-1 text-slate-900 space-y-1 font-sans">
                  <div className="font-bold text-red-600">Alerta Activa - Coche {b.codigoBus}</div>
                  {b.desvio && <p><strong>Desvío:</strong> Fuera de ruta ({b.desvio.metros_fuera}m)</p>}
                  {b.incidencia && <p><strong>Incidencia:</strong> {b.incidencia.titulo}</p>}
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Capa 5: Vehículos (Buses en Vivo) */}
          {layers.vehicles && visibleBuses.map((b) => {
            const isOwn = b.empresaId === empresaPropia;
            const hasAlert = !!(b.desvio || b.incidencia);
            
            // FMS Health color overlay
            let markerColor = EMPRESA_COLOR[String(b.empresaId)] ?? '#94a3b8';
            if (layers.fmsHealth) {
              markerColor = hasAlert ? '#ef4444' : '#10b981'; // Rojo con alerta, verde saludable
            }

            return (
              <Marker
                key={b.id}
                position={[b.lat, b.lng]}
                icon={makeBusDivIcon(markerColor, b.linea, isOwn, hasAlert)}
                ref={(ref) => {
                  if (ref) markersRef.current[b.id] = ref;
                  else delete markersRef.current[b.id];
                }}
              >
                <Popup>
                  <div className="text-xs min-w-[220px] font-sans text-slate-900 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                      <span className="font-black text-sm text-slate-800">Línea {b.linea}</span>
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {b.empresa}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-600">
                      <div><strong>Interno:</strong> #{b.codigoBus}</div>
                      <div><strong>Velocidad:</strong> {b.velocidad} km/h</div>
                      {b.choferNombre && <div className="col-span-2"><strong>Chofer:</strong> {b.choferNombre}</div>}
                      <div className="col-span-2 truncate"><strong>Destino:</strong> {b.destino}</div>
                    </div>

                    {b.desvio && (
                      <div className="bg-red-50 border border-red-200 text-red-700 p-2 rounded-lg text-[10px]">
                        <span className="font-bold flex items-center gap-1">⚠️ Alerta Desvío</span>
                        <p>{b.desvio.tipo === 'FUERA_DE_RUTA' ? 'Fuera de ruta oficial' : 'Fuera de desvío oficial'} ({b.desvio.metros_fuera}m)</p>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Flotante: Conmutador de Capas (Layers Panel) */}
        <div className="absolute top-4 left-4 z-[1000] bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded-2xl p-4 shadow-2xl max-w-xs space-y-3">
          <div className="flex items-center gap-2 text-indigo-400 font-black text-xs uppercase tracking-wider">
            <Layers className="w-4 h-4" />
            <span>Capas Map Hub</span>
          </div>
          <div className="space-y-2">
            {[
              { id: 'vehicles', label: 'Buses en Tiempo Real', icon: Bus },
              { id: 'demanda', label: 'Heatmap de Demanda', icon: Activity },
              { id: 'alertas', label: 'Incidencias y Desvíos', icon: AlertTriangle },
              { id: 'fmsHealth', label: 'FMS / Telemetría Health', icon: Wifi },
              { id: 'droCorridors', label: 'Superposiciones DRO', icon: MapIcon },
              { id: 'paradas', label: 'Paradas GTFS', icon: MapPin },
            ].map((ly) => {
              const Icon = ly.icon;
              const active = layers[ly.id as keyof typeof layers];
              return (
                <button
                  key={ly.id}
                  onClick={() => toggleLayer(ly.id as keyof typeof layers)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                    active
                      ? 'bg-indigo-600/10 border-indigo-500/40 text-indigo-400'
                      : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5" />
                    <span>{ly.label}</span>
                  </div>
                  <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-indigo-400' : 'bg-slate-700'}`} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ================= LADO DERECHO: PANEL DE DETALLES Y ALERTAS ================= */}
      <div className="w-full lg:w-[35%] h-[50vh] lg:h-full flex flex-col bg-[#0f131f] overflow-hidden">
        
        {/* Cabecera / Status */}
        <div className="px-5 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/20">
          <div>
            <h1 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
              <MapIcon className="w-5 h-5 text-indigo-400" />
              <span>Map Hub Unificado</span>
            </h1>
            <p className="text-[10px] text-slate-500">Supervisión e Integridad de Corredores Metropolitanos</p>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-2.5 py-1 font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              SISTEMA VIVO
            </span>
            <button
              onClick={() => { refrescar(); loadStatic(); }}
              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-800 transition"
              title="Refrescar feeds"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* KPIs Flotantes */}
        <div className="grid grid-cols-4 border-b border-slate-800 bg-slate-950/40 text-center py-2 px-1 gap-1">
          {[
            { label: 'Propios', val: kpis.totalPropios, color: 'text-amber-400' },
            { label: 'Rivales', val: kpis.totalRivales, color: 'text-indigo-400' },
            { label: 'Desvíos', val: kpis.desviosAbiertos, color: kpis.desviosAbiertos > 0 ? 'text-red-400' : 'text-slate-500' },
            { label: 'Bunching', val: kpis.bunchingPares, color: kpis.bunchingPares > 0 ? 'text-amber-500' : 'text-slate-500' },
          ].map((kp) => (
            <div key={kp.label} className="bg-slate-900/40 border border-slate-800/50 rounded-lg py-1.5 px-1 flex flex-col justify-center">
              <span className={`text-sm font-black ${kp.color}`}>{kp.val}</span>
              <span className="text-[8px] text-slate-500 uppercase tracking-widest font-extrabold mt-0.5">{kp.label}</span>
            </div>
          ))}
        </div>

        {/* Barra de Filtros y Búsqueda */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-900/30 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Buscar coche o chofer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500"
            />
          </div>

          {/* Filtro Operador */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 shrink-0">
            <Building2 className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={operatorFilter}
              onChange={(e) => {
                setOperatorFilter(e.target.value);
                setLineFilter('todas'); // Reset línea al cambiar operador
              }}
              className="bg-transparent text-xs font-bold text-white outline-none border-none pr-1"
            >
              <option value="todos" className="bg-slate-900 text-white">Todos los Operadores</option>
              {Object.entries(EMPRESA_NAME).map(([id, nombre]) => (
                <option key={id} value={id} className="bg-slate-900 text-white">
                  {nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Línea */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 shrink-0">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={lineFilter}
              onChange={(e) => setLineFilter(e.target.value)}
              className="bg-transparent text-xs text-white outline-none border-none pr-1"
            >
              <option value="todas" className="bg-slate-900 text-white">Todas las líneas</option>
              {availableLines.map((l) => (
                <option key={l} value={l} className="bg-slate-900 text-white">L{l}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tab Selector Lateral */}
        <div className="flex border-b border-slate-800 bg-slate-950/20 p-1 gap-1">
          {[
            { id: 'flota', label: 'Flota' },
            { id: 'alertas', label: 'Desvíos & Alertas' },
            { id: 'bunching', label: 'Bunching' },
            { id: 'dro', label: 'Superposición DRO' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSidebarTab(tab.id as typeof sidebarTab)}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                sidebarTab === tab.id
                  ? 'bg-slate-800 text-white border-b border-indigo-500'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Panel Content Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          
          {/* ================= TAB 1: LISTADO DE FLOTA ================= */}
          {sidebarTab === 'flota' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 pb-1 border-b border-slate-800">
                <span>Visualizando {visibleBuses.length} coches</span>
                <span>STM Live</span>
              </div>
              
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {visibleBuses.map((b) => {
                  const isOwn = b.empresaId === empresaPropia;
                  return (
                    <div
                      key={b.id}
                      onClick={() => focusBus(b)}
                      className={`p-3 rounded-xl border bg-slate-900/30 hover:bg-slate-900/60 cursor-pointer transition flex items-center justify-between ${
                        isOwn ? 'border-amber-500/20 hover:border-amber-500/40' : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-2 h-8 rounded"
                          style={{ backgroundColor: EMPRESA_COLOR[String(b.empresaId)] }}
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-sm text-slate-200">L{b.linea}</span>
                            <span className="text-[10px] text-slate-500 font-mono">(Coche {b.codigoBus})</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[200px]">
                            {b.choferNombre || 'Sin chofer asignado'}
                          </p>
                        </div>
                      </div>
                      
                      <div className="text-right shrink-0">
                        <span className="text-xs font-bold text-white block">{b.velocidad} km/h</span>
                        <span className="text-[9px] text-slate-500 font-mono">STM GPS</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Speed histogram */}
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 h-[180px]">
                <span className="text-[10px] font-bold text-slate-400 block mb-2 uppercase tracking-widest">
                  Distribución de Velocidad
                </span>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={speedDistributionData}>
                    <XAxis dataKey="range" stroke="#475569" fontSize={8} />
                    <YAxis stroke="#475569" fontSize={8} />
                    <Bar dataKey="count" fill="#4f46e5" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ================= TAB 2: ALERTAS Y DESVÍOS ================= */}
          {sidebarTab === 'alertas' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">Alertas de Desvío</span>
                {desvios.filter((d) => !d.resuelto).length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-4 text-center">No hay alertas de desvíos pendientes.</p>
                ) : (
                  desvios.filter((d) => !d.resuelto).map((d) => {
                    const assoc = allBusesCombined.find((p) => p.codigoBus === String(d.coche_id) && p.linea === String(d.linea_id));
                    return (
                      <div key={d.id} className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex flex-col gap-2">
                        <div className="flex justify-between items-start">
                          <span className="text-xs font-bold text-white">Coche {d.coche_id} · Línea {d.linea_id}</span>
                          <span className="text-[9px] font-black uppercase bg-red-500 text-black px-1.5 py-0.5 rounded">Desvío</span>
                        </div>
                        <p className="text-[10px] text-slate-400">Fuera de ruta oficial por {d.metros_fuera}m</p>
                        {assoc && (
                          <button
                            onClick={() => focusBus(assoc)}
                            className="bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-lg py-1 text-[10px] text-slate-300 font-bold"
                          >
                            Centrar en Mapa
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="space-y-2">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">Incidencias Críticas</span>
                {incidencias.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-4 text-center">Operación normal, sin incidencias.</p>
                ) : (
                  incidencias.map((i) => (
                    <div key={i.id} className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 space-y-1">
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-bold text-slate-200">{i.titulo}</span>
                        <span className="text-[9px] font-black uppercase bg-amber-500 text-black px-1.5 py-0.5 rounded">Prioridad {i.prioridad}</span>
                      </div>
                      {i.coche_id && <p className="text-[10px] text-slate-400">Coche afectado: #{i.coche_id}</p>}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ================= TAB 3: BUNCHING ================= */}
          {sidebarTab === 'bunching' && (
            <div className="space-y-3">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">
                Saturación de Frecuencia (Bunching)
              </span>
              
              {bunching.length === 0 ? (
                <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-500">
                  <span className="block text-2xl mb-2">🟢</span>
                  Frecuencias ordenadas. Sin eventos de solapamiento de turno.
                </div>
              ) : (
                bunching.map((b, idx) => (
                  <div key={idx} className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 flex justify-between items-center text-xs">
                    <div>
                      <span className="font-bold text-white block">Línea {b.linea}</span>
                      <span className="text-[10px] text-slate-400">Pares: Coche {b.bus1} ↔ Coche {b.bus2}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-amber-400 font-black block">Atraso Crítico</span>
                      <span className="text-[10px] text-slate-500 font-mono">{(b.distanciaKm * 1000).toFixed(0)}m de dist</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ================= TAB 4: DRO SUPERPOSICIÓN ================= */}
          {sidebarTab === 'dro' && (
            <div className="space-y-3">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">
                Cruces de Superposición Críticos
              </span>
              
              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                {activeDROOverlays.slice(0, 20).map((o, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-900/30 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-200">Shapes Compartidas</span>
                      <p className="text-[10px] text-slate-500 mt-0.5">Metros compartidos en corredor</p>
                    </div>
                    <div className="text-right">
                      <span className="text-amber-400 font-bold block">{o.pctAInB}% DRO</span>
                      <span className="text-[10px] text-slate-500 font-mono">{o.sharedKm.toFixed(1)} km</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Componente de Manejo del Viewport del Mapa ─────────────────────────────
function MapCenterController({ center, zoom }: { center: [number, number] | null; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, zoom, { animate: true });
    }
  }, [center, zoom, map]);
  return null;
}

// ─── Componente Auxiliar para Capa de Calor de Leaflet ──────────────────────
function HeatmapLayer({ points }: { points: [number, number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const layer = (L as any)
      .heatLayer(points, {
        radius: 25,
        blur: 15,
        maxZoom: 14,
        max: 1.0,
        gradient: { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red' },
      })
      .addTo(map);

    return () => {
      map.removeLayer(layer);
    };
  }, [map, points]);
  return null;
}

// ─── Oráculo de Horarios (Paradas Popups) ──────────────────────────────────
interface StopDeparture {
  arrivalTime: string;
  route: string;
  destination: string;
}

function StopPopupContent({ stopId, stopName, stopCode }: { stopId: string; stopName: string; stopCode?: string }) {
  const [deps, setDeps] = useState<StopDeparture[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const token = localStorage.getItem('tf_token');
    fetch(`/api/gtfs/stops/${stopId}/departures`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((res) => {
        if (isMounted && res.success) {
          setDeps(res.data);
        }
      })
      .catch((err) => console.warn(err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => { isMounted = false; };
  }, [stopId]);

  return (
    <div className="min-w-[195px] text-slate-900 font-sans text-xs">
      <div className="font-bold text-sm text-slate-800 leading-tight">{stopName}</div>
      <div className="text-[10px] text-slate-500 mb-2 font-medium">Parada ID: {stopId} {stopCode ? `(${stopCode})` : ''}</div>
      
      <div className="border-t border-slate-100 pt-2">
        <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest block mb-1.5">Próximos Horarios</span>
        {loading ? (
          <p className="text-[10px] text-slate-400 italic">Consultando oráculo de horarios...</p>
        ) : deps.length === 0 ? (
          <p className="text-[10px] text-slate-400 italic">Sin salidas registradas.</p>
        ) : (
          <div className="max-h-[140px] overflow-y-auto space-y-1">
            {deps.slice(0, 5).map((d, idx) => (
              <div key={idx} className="flex justify-between items-center bg-slate-50 p-1.5 rounded border border-slate-100">
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <span className="bg-slate-800 text-white font-extrabold px-1 py-0.5 rounded text-[9px] shrink-0">{d.route}</span>
                  <span className="text-[9px] text-slate-600 truncate font-semibold">{d.destination}</span>
                </div>
                <span className="font-bold text-indigo-600 text-[10px]">{d.arrivalTime.substring(0, 5)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
