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
import { collection, getDocs, query, limit, addDoc } from '../../config/firestoreShim';
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
  Zap,
  Target,
  Send,
  Shield,
} from 'lucide-react';
import { haversineMetros } from '../../utils/geomath';
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
  const [demandPoints, setDemandPoints] = useState<[number, number, number][]>([]);
  const [loadingStatic, setLoadingStatic] = useState(true);

  // Tab lateral: 'alertas' | 'flota' | 'bunching' | 'dro'
  const [sidebarTab, setSidebarTab] = useState<'alertas' | 'flota' | 'bunching' | 'dro'>('flota');

  // Filtros
  const [operatorFilter, setOperatorFilter] = useState<string>(String(empresaPropia));
  const [lineFilter, setLineFilter] = useState<string>(selectedLine ?? 'todas');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShape, setSelectedShape] = useState<ShapeDoc | null>(null);

  // Radar Táctico State
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [manualCocheId, setManualCocheId] = useState('');
  const [manualMensaje, setManualMensaje] = useState('🚨 REGULACIÓN: Coche rival pisando turno a 200m. Modere velocidad.');
  const [sendingManual, setSendingManual] = useState(false);


  // Mapa viewport focus
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [mapZoom, setMapZoom] = useState(13);
  const markersRef = useRef<Record<string, L.Marker>>({});


  // ─── Lógica de Radar Táctico ────────────────────────────────────────────────
  const activeDisputas = useMemo(() => {
    if (!selectedBusId || sidebarTab !== 'flota') return null;
    const p = serviciosPropios.find(b => b.id === selectedBusId);
    if (!p) return null;

    const matches: Array<{
      codigoBus: string;
      empresa: string;
      linea: string;
      destino: string;
      distanciaM: number;
      overlapPct: number;
      comparteSentido: boolean;
      threatScore: number;
      lat: number;
      lng: number;
      codigoEmpresa: number;
      id: string;
    }> = [];

    for (const r of serviciosRivales) {
      const dist = haversineMetros(p.lat, p.lng, r.lat, r.lng);
      if (dist > 1500) continue;

      const overlap = overlaps.find(
        (o) =>
          (String(o.agencyA) === String(empresaPropia) && String(o.lineaA).trim() === String(p.linea).trim() && String(o.agencyB) === String(r.empresaId) && String(o.lineaB).trim() === String(r.linea).trim()) ||
          (String(o.agencyB) === String(empresaPropia) && String(o.lineaB).trim() === String(p.linea).trim() && String(o.agencyA) === String(r.empresaId) && String(o.lineaA).trim() === String(r.linea).trim())
      );
      const overlapPct = overlap ? overlap.pctAInB : 0;

      // ¡FILTRO CRÍTICO! Solo considerar competidores reales (con solapamiento de ruta)
      if (overlapPct < 15) continue;

      const destPropio = (p.destino || '').toLowerCase();
      const destRival = (r.destino || '').toLowerCase();
      let comparteSentido = false;
      const kwPropio = destPropio.split(/[\s,\-\/]+/).filter((w) => w.length > 3);
      if (kwPropio.length > 0) {
        comparteSentido = kwPropio.some((kw) => destRival.includes(kw));
      }
      if (destPropio === destRival && destPropio.length > 1) comparteSentido = true;

      let threatScore = Math.round(overlapPct);
      if (comparteSentido) threatScore += 50;
      if (dist < 400) threatScore += 30;

      matches.push({
        id: r.id,
        codigoBus: r.codigoBus,
        empresa: r.empresa,
        linea: r.linea,
        destino: r.destino,
        distanciaM: Math.round(dist),
        overlapPct: Math.round(overlapPct),
        comparteSentido,
        threatScore,
        lat: r.lat,
        lng: r.lng,
        codigoEmpresa: r.empresaId,
      });
    }

    matches.sort((a, b) => b.threatScore - a.threatScore);
    const maxScore = matches.length > 0 ? matches[0].threatScore : 0;
    const nivelAmenaza = maxScore >= 80 ? 'CRÍTICA' : maxScore >= 45 ? 'MODERADA' : 'BAJA';
    
    return {
      busPropio: p,
      rivales: matches,
      nivelAmenaza
    };
  }, [selectedBusId, sidebarTab, serviciosPropios, serviciosRivales, overlaps, empresaPropia]);

  const handleSendManualAlert = async () => {
    if (!manualCocheId) {
      toast.error('Ingrese el ID del coche de destino.');
      return;
    }
    setSendingManual(true);
    try {
      await addDoc(collection(db, 'alertas_regulacion'), {
        tipo: 'DISPARO_TACTICO',
        coche_id: manualCocheId,
        empresa_id: empresaPropia,
        instruccion: 'REGULACION_MARCHA',
        mensaje_chofer: manualMensaje,
        timestamp: new Date().toISOString(),
        leido: false,
      });
      toast.success(`Alerta de regulación enviada al chofer del Coche #${manualCocheId}`);
    } catch (err) {
      console.error(err);
      toast.error('Error al emitir directiva manual.');
    } finally {
      setSendingManual(false);
    }
  };

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

  // Carga bajo demanda del Heatmap (Lazy load con datos reales de stm_validaciones_mensual)
  useEffect(() => {
    if (!layers.demanda || demandPoints.length > 0) return;
    const token = localStorage.getItem('tf_token');
    fetch('/api/stm-demanda/mapa-global?top=1000', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.items)) {
          // Normalize the total validations to a 0.2-1.0 intensity scale
          const maxVal = Math.max(...data.items.map((i: any) => i.total), 1);
          const points = data.items
            .filter((i: any) => i.lat && i.lon)
            .map((i: any): [number, number, number] => [
              i.lat, 
              i.lon, 
              Math.max(0.2, i.total / maxVal)
            ]);
          setDemandPoints(points);
        }
      })
      .catch((err) => console.warn('[MapHub] Error cargando demanda:', err));
  }, [layers.demanda, demandPoints]);

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
    
    if (selectedBusId === bus.id) {
       setSelectedBusId(null);
       setLineFilter('todas');
    } else {
       setSelectedBusId(bus.id);
       setManualCocheId(bus.codigoBus);
       setLineFilter(bus.linea);
    }

    setTimeout(() => {
      const marker = markersRef.current[bus.id];
      if (marker) {
        marker.openPopup();
      }
    }, 150);
  };

  // Enfocar pares de Bunching en el mapa
  const focusBunching = (b: import('../../hooks/useLiveOperations').AlertaBunching) => {
    const midLat = (b.bus1Coords[0] + b.bus2Coords[0]) / 2;
    const midLng = (b.bus1Coords[1] + b.bus2Coords[1]) / 2;
    setMapCenter([midLat, midLng]);
    setMapZoom(15);
    // Optionally set line filter to easily see both
    setLineFilter(b.linea);
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

          {/* Capa 1.5: Rutas en Disputa (Radar Táctico) */}
          {activeDisputas && activeDisputas.busPropio && layers.vehicles && (
            <>
              {/* Ruta base del coche propio */}
              {(() => {
                const baseShape = shapes.find(s => String(s.linea).trim() === String(activeDisputas.busPropio!.linea).trim() && String(s.agencyId) === String(empresaPropia));
                if (!baseShape) return null;
                return (
                  <Polyline
                    positions={baseShape.points.map((p) => [p.lat, p.lon]) as [number, number][]}
                    pathOptions={{ color: '#6366f1', weight: 6, opacity: 0.9 }}
                  />
                );
              })()}
              
              {/* Rutas de los rivales acechando */}
              {activeDisputas.rivales.map(rival => {
                const rivalShape = shapes.find(s => String(s.linea).trim() === String(rival.linea).trim() && String(s.agencyId) === String(rival.codigoEmpresa));
                if (!rivalShape) return null;
                return (
                  <Polyline
                    key={`rival-shape-${rival.id}`}
                    positions={rivalShape.points.map((p) => [p.lat, p.lon]) as [number, number][]}
                    pathOptions={{ 
                      color: rival.threatScore >= 80 ? '#e11d48' : '#d97706', 
                      weight: 4, 
                      opacity: 0.8, 
                      dashArray: '10, 10' 
                    }}
                  >
                    <LeafletTooltip sticky>
                      <div className="text-xs font-semibold p-1">
                        <span className="font-bold text-white uppercase">{rival.empresa} - L{rival.linea}</span>
                        <p className="text-amber-400 text-[10px] font-bold mt-1">DRO: {rival.overlapPct}%</p>
                      </div>
                    </LeafletTooltip>
                  </Polyline>
                );
              })}
            </>
          )}

          {/* Capa 2: Heatmap de Demanda */}
          {layers.demanda && <HeatmapLayer points={demandPoints} />}

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

          {/* Capa 6: Radar Táctico Rivales */}
          {layers.vehicles && activeDisputas?.rivales.map((r) => {
            let markerColor = EMPRESA_COLOR[String(r.codigoEmpresa)] ?? '#94a3b8';
            return (
              <Marker
                key={`rival-${r.id}`}
                position={[r.lat, r.lng]}
                icon={makeBusDivIcon(markerColor, r.linea, false, false)}
                zIndexOffset={1000} // Keep competitors on top
              >
                <Popup>
                  <div className="text-xs min-w-[220px] font-sans text-slate-900 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                      <span className="font-black text-sm text-slate-800">Línea {r.linea}</span>
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {r.empresa}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-600">
                      <div><strong>Interno:</strong> #{r.codigoBus}</div>
                      <div><strong>Distancia:</strong> {r.distanciaM}m</div>
                      <div className="col-span-2 truncate"><strong>Destino:</strong> {r.destino}</div>
                    </div>

                    <div className={`p-2 rounded-lg text-[10px] font-bold mt-2 border ${r.threatScore >= 80 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                      <span className="flex items-center gap-1">⚠️ Amenaza {r.threatScore >= 80 ? 'CRÍTICA' : 'MODERADA'}</span>
                      <p className="mt-1 font-normal">Threat Score: {r.threatScore} | DRO: {r.overlapPct}%</p>
                    </div>
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
                      className={`rounded-xl border bg-slate-900/30 hover:bg-slate-900/60 transition ${isOwn ? 'border-amber-500/20 hover:border-amber-500/40' : 'border-slate-800'}`}
                    >
                      <div onClick={() => focusBus(b)} className="cursor-pointer p-3 flex items-center justify-between">

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

                      {/* Radar Táctico (Acordeón) */}
                      {selectedBusId === b.id && activeDisputas && (
                         <div className="mt-3 border-t border-slate-800 pt-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-between items-center mb-2">
                               <span className="text-[10px] font-bold uppercase text-slate-500">Radar Táctico (1.5km)</span>
                               <span className={`text-[9px] px-1.5 py-0.5 rounded font-black border uppercase ${
                                  activeDisputas.nivelAmenaza === 'CRÍTICA'
                                    ? 'bg-red-500/10 text-red-400 border-red-500/30 animate-pulse'
                                    : activeDisputas.nivelAmenaza === 'MODERADA'
                                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                      : 'bg-slate-800 text-slate-400 border-slate-700'
                                }`}>
                                  Amenaza {activeDisputas.nivelAmenaza}
                                </span>
                            </div>

                            {activeDisputas.rivales.length === 0 ? (
                               <div className="bg-slate-950/50 p-4 rounded-lg text-center text-[10px] text-slate-500">
                                 Sin rivales directos en el perímetro.
                               </div>
                            ) : (
                               <div className="space-y-2">
                                  {activeDisputas.rivales.map(r => (
                                      <div key={r.id} className="bg-slate-950/80 border border-slate-800 rounded-lg p-2 flex items-center justify-between text-[11px]">
                                        <div>
                                          <div className="flex items-center gap-1.5">
                                            <span className="font-extrabold text-amber-400">L{r.linea}</span>
                                            <span className="text-[9px] text-slate-400">({r.empresa} #{r.codigoBus})</span>
                                          </div>
                                          <div className="flex gap-1 mt-1">
                                            {r.comparteSentido && <span className="text-[8px] bg-red-500/10 text-red-400 border border-red-500/20 px-1 rounded font-bold">MISMO SENTIDO</span>}
                                            {r.overlapPct > 0 && <span className="text-[8px] bg-slate-900 text-amber-400/80 border border-slate-800 px-1 rounded">{r.overlapPct}% DRO</span>}
                                          </div>
                                        </div>
                                        <div className="text-right">
                                           <span className="font-mono font-bold text-white block">{r.distanciaM}m</span>
                                           <span className="text-[9px] text-slate-500 font-mono">Score: {r.threatScore}</span>
                                        </div>
                                      </div>
                                  ))}
                               </div>
                            )}

                            {/* Disparo de Regulación */}
                            <div className="mt-3 pt-3 border-t border-slate-800 flex gap-2">
                                <input
                                  type="text"
                                  placeholder="Coche"
                                  value={manualCocheId}
                                  onChange={(e) => setManualCocheId(e.target.value)}
                                  className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[10px] text-white w-16 focus:border-indigo-500 focus:outline-none"
                                />
                                <input
                                  type="text"
                                  value={manualMensaje}
                                  onChange={(e) => setManualMensaje(e.target.value)}
                                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[10px] text-white focus:border-indigo-500 focus:outline-none"
                                />
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleSendManualAlert(); }}
                                  disabled={sendingManual}
                                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-2 py-1 flex items-center justify-center disabled:opacity-50"
                                >
                                  <Send className="w-3 h-3" />
                                </button>
                            </div>
                         </div>
                      )}

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
                  <div 
                    key={idx} 
                    onClick={() => focusBunching(b)}
                    className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 flex justify-between items-center text-xs cursor-pointer hover:bg-amber-500/20 transition-colors"
                  >
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
