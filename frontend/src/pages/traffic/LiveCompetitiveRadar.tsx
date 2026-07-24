import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Activity, Crosshair, Sliders, DollarSign, ChevronLeft, X } from 'lucide-react';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import { useLiveOperations, type ServicioActivo } from '../../hooks/useLiveOperations';
import { getNavigationLineaData } from '../../features/navigation/services/navigationDataService';
import api from '../../services/api';
import { TrendCharts } from './components/NetworkEditor/TrendCharts';
import { HotspotInterleaving } from './components/NetworkEditor/HotspotInterleaving';
import type { TrendData, HotspotOptimizationData } from './components/NetworkEditor/types';
import { calculateTotalDistance, calculateSharedDistance, getSharedCoordinates } from '../../utils/geoUtils';

// -- Tipos --
interface ShapeDoc {
  key: string;
  agencyId: string;
  empresa: string;
  linea: string;
  sentido: string;
  points: { lat: number; lon: number }[];
  lengthMeters: number;
}
interface CompetitorInfo {
  id: string;
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
  velocidad: number;
  codigoEmpresa: number;
  officialRouteId?: number;
  officialDirectionId?: number;
}

const EMPRESA_COLOR: Record<string, string> = {
  '10': '#ef4444', // COETC (Rojo)
  '20': '#10b981', // COME (Verde)
  '50': '#3b82f6', // CUTCSA (Azul)
  '70': '#eab308', // UCOT (Amarillo)
};

function makeBusDivIcon(color: string, linea: string, codigoBus: string, velocidad: number, destino: string) {
  const isZero = velocidad === 0 || !velocidad;
  const safeDestino = destino ? destino.substring(0, 10) : 'S/D';
  return L.divIcon({
    html: `
      <div style="
        background: ${color};
        color: #fff;
        padding: 4px;
        border-radius: 6px;
        font-family: sans-serif;
        text-align: center;
        border: 2px solid rgba(255,255,255,0.3);
        box-shadow: 0 4px 6px rgba(0,0,0,0.5);
        line-height: 1.1;
      ">
        <div style="font-weight: 900; font-size: 11px;">L${linea}</div>
        <div style="font-size: 9px; font-weight: 700; opacity: 0.9;">#${codigoBus}</div>
        <div style="font-size: 8px; font-weight: 600; color: ${isZero ? '#fca5a5' : '#86efac'}; margin-top: 1px;">
          ${Math.round(velocidad || 0)}km/h
        </div>
        <div style="font-size: 7px; font-weight: 900; margin-top: 1px; color: #f8fafc; text-transform: uppercase; letter-spacing: -0.2px;">
          ${safeDestino}
        </div>
      </div>
    `,
    className: '',
    iconSize: [50, 56],
    iconAnchor: [25, 28],
    popupAnchor: [0, -28],
  });
}

const haversineMetros = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

function MapCenterController({ center, zoom, isActive }: { center: [number, number] | null; zoom: number, isActive: boolean }) {
  const map = useMap();
  
  // Solución a "Baldosas Grises" de Leaflet
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    return () => clearTimeout(timer);
  }, [map]);

  useEffect(() => {
    if (isActive && center) {
      map.setView(center, zoom, { animate: true });
    }
  }, [center, zoom, map, isActive]);
  
  return null;
}

export default function LiveCompetitiveRadar() {
  const { empresaPropia } = useEmpresaPropia();
  const {
    serviciosPropios,
    serviciosRivales,
    loading: loadingLive,
  } = useLiveOperations();

  // Estados de Trazados de Ruta (Dinámicos)
  const [baseRouteCoords, setBaseRouteCoords] = useState<[number, number][]>([]);
  const [compRouteCoords, setCompRouteCoords] = useState<[number, number][]>([]);
  const [selectedCompetitor, setSelectedCompetitor] = useState<CompetitorInfo | null>(null);

  const [sharedSegments, setSharedSegments] = useState<[number, number][][]>([]);
  const [baseDistance, setBaseDistance] = useState<number>(0);
  const [compDistance, setCompDistance] = useState<number>(0);
  const [sharedDistance, setSharedDistance] = useState<number>(0);

  // Estados UI y Jerarquía
  const [selectedLinea, setSelectedLinea] = useState<string | null>(null);
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);

  // Filtros
  const [searchRadius, setSearchRadius] = useState<number>(1500);
  const [minOverlap, setMinOverlap] = useState<number>(0);
  const [strategyMode, setStrategyMode] = useState<'corredor' | 'barrio'>('barrio');
  
  // Mapa
  const [mapCenter, setMapCenter] = useState<[number, number] | null>([-34.8833, -56.1667]);
  const [mapZoom, setMapZoom] = useState(13);

  // Direcciones Oficiales de Variantes (GTFS)
  const [variantDirections, setVariantDirections] = useState<Record<number, number>>({});
  const [competitorVariantMaps, setCompetitorVariantMaps] = useState<Record<string, Record<string, number>>>({});
  
  // Lista Blanca Oficial de Competidores (BI API)
  const [officialCompetitors, setOfficialCompetitors] = useState<Array<any>>([]);
  const [loadingCompetitors, setLoadingCompetitors] = useState(false);

  // Estados del Bottom Drawer (Análisis Táctico)
  const [isTacticalPanelOpen, setIsTacticalPanelOpen] = useState(false);
  const [isTacticalDrawerExpanded, setIsTacticalDrawerExpanded] = useState(true);
  const [tacticalTab, setTacticalTab] = useState<'trends' | 'bunching'>('trends');
  const [selectedRivalForAnalysis, setSelectedRivalForAnalysis] = useState<CompetitorInfo | null>(null);
  const [tacticalLoading, setTacticalLoading] = useState(false);
  const [trendsData, setTrendsData] = useState<{ida: TrendData | null, vuelta: TrendData | null}>({ida: null, vuelta: null});
  const [hotspotData, setHotspotData] = useState<{ida: HotspotOptimizationData | null, vuelta: HotspotOptimizationData | null}>({ida: null, vuelta: null});

  const [baseRouteStops, setBaseRouteStops] = useState<any[]>([]);

  // Carga de ruta propia al seleccionar una línea
  useEffect(() => {
    if (!selectedLinea) {
      setBaseRouteCoords([]);
      setBaseRouteStops([]);
      setCompRouteCoords([]);
      setSelectedCompetitor(null);
      return;
    }
    const loadBaseRoute = async () => {
      try {
        const data = await getNavigationLineaData(empresaPropia, selectedLinea);
        if (data && data.recorrido) {
          setBaseRouteCoords(data.recorrido.map((c: any) => [c.lat, c.lng]));
          setBaseRouteStops(data.paradas || []);
        } else {
          setBaseRouteCoords([]);
          setBaseRouteStops([]);
        }
      } catch (err) {
        console.warn('Error loading base route', err);
      }
    };
    loadBaseRoute();
  }, [selectedLinea, empresaPropia]);

  // Carga de ruta ajena al focalizar un competidor
  useEffect(() => {
    if (!selectedCompetitor) {
      setCompRouteCoords([]);
      return;
    }
    const loadCompRoute = async () => {
      try {
        const data = await getNavigationLineaData(selectedCompetitor.codigoEmpresa, selectedCompetitor.linea.toLowerCase());
        if (data && data.recorrido) {
          setCompRouteCoords(data.recorrido.map((c: any) => [c.lat, c.lng]));
        } else {
          setCompRouteCoords([]);
        }
      } catch (err) {
        console.warn('Error loading competitor route', err);
      }
    };
    loadCompRoute();
  }, [selectedCompetitor]);

  // Calcular distancias y segmentos compartidos para los gráficos
  useEffect(() => {
    if (baseRouteCoords.length > 0) {
      setBaseDistance(calculateTotalDistance(baseRouteCoords));
    } else {
      setBaseDistance(0);
    }
    
    if (baseRouteCoords.length > 0 && compRouteCoords.length > 0) {
      setCompDistance(calculateTotalDistance(compRouteCoords));
      setSharedDistance(calculateSharedDistance(baseRouteCoords, compRouteCoords, 0.05));
      setSharedSegments(getSharedCoordinates(baseRouteCoords, compRouteCoords, 0.05));
    } else {
      setCompDistance(0);
      setSharedDistance(0);
      setSharedSegments([]);
    }
  }, [baseRouteCoords, compRouteCoords]);

  // Carga topológica oficial desde API basada en la LÍNEA seleccionada (MACRO)
  useEffect(() => {
    if (!selectedLinea) {
      setOfficialCompetitors([]);
      return;
    }
    
    let isActive = true;
    
      const fetchOfficialCompetitors = async () => {
      setLoadingCompetitors(true);
      try {
        const baseRouteId = selectedLinea.replace(/[ab]$/i, '');
        
        const [resIda, resVuelta, resVariants] = await Promise.all([
          api.get(`/intelligence/competitors?route_id=${baseRouteId}&direction_id=0`),
          api.get(`/intelligence/competitors?route_id=${baseRouteId}&direction_id=1`),
          api.get(`/intelligence/variants/${baseRouteId}`)
        ]);
        
        if (!isActive) return;
        
        // Guardar mapeo de variantes
        if (resVariants.data?.mapping) {
          setVariantDirections(resVariants.data.mapping);
        }

        // Combinamos ambas respuestas para tener la topología de la línea entera en ambos sentidos
        const combined = [...(resIda.data || []), ...(resVuelta.data || [])];
        
        // Deduplicar para que cada línea competidora y su sentido aparezca (clave compuesta)
        const unique = Array.from(new Map(combined.map(c => [`${c.competitor_route_id}_${c.competitor_direction_id}`, c])).values());

        setOfficialCompetitors(unique);

        // AUTO-SELECT EL PRIMER COMPETIDOR PARA QUE EL DRAWER MUESTRE INFO INMEDIATAMENTE
        if (unique.length > 0) {
           const first = unique[0];
           const rivalInfo = {
             id: '', codigoBus: '', empresa: first.competitor_short_name || '', linea: first.competitor_route_id, destino: '', distanciaM: 0, overlapPct: first.shared_stops_count, comparteSentido: true, threatScore: 0, lat: 0, lng: 0, velocidad: 0, codigoEmpresa: first.competitor_route_id,
             officialDirectionId: first.competitor_direction_id
           };
           setSelectedRivalForAnalysis(rivalInfo);
           setSelectedCompetitor(rivalInfo);
        }

        // Pre-cargar los mappings de variantes de TODOS los competidores para resolver su sentido real
        const uniqueCompIds = Array.from(new Set(unique.map(c => c.competitor_route_id)));
        const compVariantPromises = uniqueCompIds.map(compId => api.get(`/intelligence/variants/${compId}`).catch(() => null));
        const compVariantResults = await Promise.all(compVariantPromises);
        
        const newCompVarMaps: Record<string, Record<string, number>> = {};
        compVariantResults.forEach(res => {
          if (res && res.data && res.data.ok && res.data.route) {
            newCompVarMaps[res.data.route] = res.data.mapping;
          }
        });
        if (isActive) {
           setCompetitorVariantMaps(newCompVarMaps);
        }

      } catch (err) {
        if (!isActive) return;
        console.error('Error fetching official competitors from API:', err);
        setOfficialCompetitors([]);
      } finally {
        if (isActive) {
          setLoadingCompetitors(false);
        }
      }
    };
    
    fetchOfficialCompetitors();
    return () => { isActive = false; };
  }, [selectedLinea]);

  // Carga de Datos Analíticos Tácticos (TrendCharts + HotspotInterleaving)
  useEffect(() => {
    if (!selectedLinea || !selectedRivalForAnalysis || !isTacticalPanelOpen) {
      setTrendsData({ ida: null, vuelta: null });
      setHotspotData({ ida: null, vuelta: null });
      return;
    }

    let isActive = true;
    const fetchAnalytics = async () => {
      setTacticalLoading(true);
      try {
        const baseRouteId = selectedLinea.replace(/[ab]$/i, '');
        const compRouteId = selectedRivalForAnalysis.linea;

        // Buscar en officialCompetitors el registro que corresponde a este compRouteId para Ida y Vuelta
        const compForIda = officialCompetitors.find(c => String(c.competitor_short_name || c.competitor_route_id) === compRouteId && c.base_direction_id === 0);
        const compForVuelta = officialCompetitors.find(c => String(c.competitor_short_name || c.competitor_route_id) === compRouteId && c.base_direction_id === 1);
        
        const compDirForIda = compForIda ? compForIda.competitor_direction_id : 0;
        const compDirForVuelta = compForVuelta ? compForVuelta.competitor_direction_id : 1;

        const [trendIda, trendVuelta] = await Promise.allSettled([
          api.get(`/intelligence/trends?base_route=${baseRouteId}&comp_route=${compRouteId}&direction=0`),
          api.get(`/intelligence/trends?base_route=${baseRouteId}&comp_route=${compRouteId}&direction=1`)
        ]);

        if (isActive) {
          setTrendsData({
            ida: trendIda.status === 'fulfilled' ? trendIda.value.data : null,
            vuelta: trendVuelta.status === 'fulfilled' ? trendVuelta.value.data : null
          });
          setHotspotData({
            ida: null,
            vuelta: null
          });
        }
      } catch (err) {
        console.error('Error fetching tactical analytics:', err);
      } finally {
        if (isActive) {
          setTacticalLoading(false);
        }
      }
    };
    
    fetchAnalytics();
    
    return () => { isActive = false; };
  }, [selectedLinea, selectedRivalForAnalysis, isTacticalPanelOpen]);

  const globalTrendData = useMemo(() => {
    if (!trendsData.ida && !trendsData.vuelta) return null;
    const base = trendsData.ida || trendsData.vuelta;
    if (!base) return null;
    
    // For competitor line, sum Ida and Vuelta trends
    const compTrendsMap = new Map<string, any>();
    
    if (trendsData.ida?.competitor_line?.trend) {
      trendsData.ida.competitor_line.trend.forEach(t => {
        compTrendsMap.set(t.month, { ...t });
      });
    }
    
    if (trendsData.vuelta?.competitor_line?.trend) {
      trendsData.vuelta.competitor_line.trend.forEach(t => {
        if (compTrendsMap.has(t.month)) {
          compTrendsMap.get(t.month).boarding += t.boarding;
        } else {
          compTrendsMap.set(t.month, { ...t });
        }
      });
    }

    const globalCompTrend = Array.from(compTrendsMap.values()).sort((a, b) => a.month.localeCompare(b.month));

    return {
      ...base,
      competitor_line: base.competitor_line ? {
        ...base.competitor_line,
        trend: globalCompTrend
      } : undefined
    };
  }, [trendsData]);

  // Derivados para UI
  const lineasActivas = useMemo(() => {
    const lineas = new Set<string>();
    serviciosPropios.forEach(b => lineas.add(b.linea));
    return Array.from(lineas).sort();
  }, [serviciosPropios]);

  const busesDeLineaSeleccionada = useMemo(() => {
    if (!selectedLinea) return [];
    return serviciosPropios.filter(b => b.linea === selectedLinea);
  }, [selectedLinea, serviciosPropios]);

  // Protección contra "Coche Fantasma": si el bus seleccionado desaparece de la flota (ej. fin de turno), deseleccionarlo
  useEffect(() => {
    if (selectedBusId) {
      const exists = busesDeLineaSeleccionada.some(b => b.id === selectedBusId);
      if (!exists) {
        setSelectedBusId(null);
        setMapZoom(13); // Volver al zoom macro
      }
    }
  }, [selectedBusId, busesDeLineaSeleccionada]);

  // ── LÓGICA DE DESTINOS (IDA/VUELTA) CON DIRECCIONES GTFS ──
  const { busesIda, busesVuelta, destinoIda, destinoVuelta, isIda, isVuelta } = useMemo(() => {
    const isIdaFn = (bus: ServicioActivo) => {
      if (variantDirections[bus.variante] !== undefined) {
        return variantDirections[bus.variante] === 0;
      }
      const d = (bus.destino || '').trim().toUpperCase();
      if (d === destinoIdaFallback) return true;
      if (d === destinoVueltaFallback) return false;
      return true; // Fallback contra coches fantasma (forzar visualización en Ida)
    };
    
    const isVueltaFn = (bus: ServicioActivo) => {
      if (variantDirections[bus.variante] !== undefined) {
        return variantDirections[bus.variante] === 1;
      }
      const d = (bus.destino || '').trim().toUpperCase();
      if (d === destinoVueltaFallback) return true;
      if (d === destinoIdaFallback) return false;
      return false; // Fallback contra coches fantasma (no duplicar en Vuelta)
    };

    const destCounts: Record<string, number> = {};
    busesDeLineaSeleccionada.forEach(b => {
      const d = (b.destino || '').trim().toUpperCase();
      if (d) destCounts[d] = (destCounts[d] || 0) + 1;
    });
    const sortedDests = Object.entries(destCounts).sort((a, b) => b[1] - a[1]).map(e => e[0]);
    const destinoIdaFallback = sortedDests[0] || 'IDA';
    const destinoVueltaFallback = sortedDests.length > 1 ? sortedDests[1] : 'VUELTA';

    const ida = busesDeLineaSeleccionada.filter(isIdaFn);
    const vuelta = busesDeLineaSeleccionada.filter(isVueltaFn);

    const getMostCommonDest = (buses: ServicioActivo[], fallback: string) => {
      const counts: Record<string, number> = {};
      buses.forEach(b => {
        const d = (b.destino || '').trim().toUpperCase();
        if (d) counts[d] = (counts[d] || 0) + 1;
      });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(e => e[0]);
      return sorted[0] || fallback;
    };

    return {
      busesIda: ida,
      busesVuelta: vuelta,
      destinoIda: getMostCommonDest(ida, destinoIdaFallback),
      destinoVuelta: getMostCommonDest(vuelta, destinoVueltaFallback),
      isIda: isIdaFn,
      isVuelta: isVueltaFn
    };
  }, [busesDeLineaSeleccionada, variantDirections]);

  // Lógica de filtrado de Rivales (MICRO)
  const microMatchesVisible = useMemo(() => {
    if (!selectedLinea || !selectedBusId) return [];
    
    // Nivel Micro: Filtrado de Radar sobre un coche específico
    const p = serviciosPropios.find(b => b.id === selectedBusId);
    if (!p) return [];

    const matches: CompetitorInfo[] = [];
      for (const r of serviciosRivales) {
        const dist = haversineMetros(p.lat, p.lng, r.lat, r.lng);
        if (dist > searchRadius) continue;

        const baseRivalLine = r.linea.replace(/[ab]$/i, '');
        
        // Intentar descubrir el direction_id real de este coche usando GTFS
        const rivalVariantMap = competitorVariantMaps[baseRivalLine];
        let rivalActualDirId = -1;
        if (rivalVariantMap && r.variante !== undefined && rivalVariantMap[r.variante] !== undefined) {
           rivalActualDirId = rivalVariantMap[r.variante];
        }

        // Buscar el officialComp exacto que empareja este sentido rival
        let officialComp = undefined;
        if (rivalActualDirId !== -1) {
           officialComp = officialCompetitors.find(c => String(c.competitor_short_name || c.competitor_route_id) === baseRivalLine && c.competitor_direction_id === rivalActualDirId);
        }
        
        if (!officialComp) {
           // Fallback si no pudimos resolver la variante
           officialComp = officialCompetitors.find(c => String(c.competitor_short_name || c.competitor_route_id) === baseRivalLine);
        }
        
        const sharedStops = officialComp ? (officialComp.shared_stops_count || 0) : 0;
        if (sharedStops < minOverlap) continue;
        if (strategyMode === 'corredor' && !officialComp) continue;

        // FILTRO DE SENTIDO: Determinar destino asignado por GTFS
        const pDestino = isIda(p) ? destinoIda : destinoVuelta;
        let assignedDestino = undefined;
        
        if (rivalActualDirId !== -1 && officialComp) {
           assignedDestino = officialComp.base_direction_id === 0 ? destinoIda : destinoVuelta;
        } else if (officialComp && officialComp.base_direction_id !== undefined) {
           assignedDestino = officialComp.base_direction_id === 0 ? destinoIda : destinoVuelta;
        } else {
           // Fallback proximidad
           let minIdaDist = Infinity;
           let minVueltaDist = Infinity;
           for (const miBus of busesDeLineaSeleccionada) {
             const d2 = haversineMetros(miBus.lat, miBus.lng, r.lat, r.lng);
             if (isIda(miBus)) { if (d2 < minIdaDist) minIdaDist = d2; }
             else { if (d2 < minVueltaDist) minVueltaDist = d2; }
           }
           assignedDestino = minIdaDist <= minVueltaDist ? destinoIda : destinoVuelta;
        }

        // Si el bus rival no va en el mismo sentido que nuestro coche seleccionado, lo ignoramos.
        if (assignedDestino !== pDestino) {
           continue;
        }

        let threatScore = sharedStops * 2; 
        if (officialComp) threatScore += 50; 
        if (dist < 400) threatScore += 30;

        matches.push({
          id: r.id,
          codigoBus: r.codigoBus,
          empresa: r.empresa,
          linea: r.linea,
          destino: assignedDestino,
          distanciaM: Math.round(dist),
          overlapPct: sharedStops,
          comparteSentido: !!officialComp,
          threatScore,
          lat: r.lat,
          lng: r.lng,
          velocidad: r.velocidad,
          codigoEmpresa: r.empresaId,
          officialRouteId: officialComp?.competitor_route_id,
          officialDirectionId: officialComp?.competitor_direction_id,
        });
      }
      matches.sort((a, b) => a.distanciaM - b.distanciaM);
      
      if (isTacticalPanelOpen && selectedRivalForAnalysis) {
        return matches.filter(m => String(m.codigoEmpresa) === String(selectedRivalForAnalysis.codigoEmpresa) || String(m.linea) === String(selectedRivalForAnalysis.linea));
      }
      
      return matches;
  }, [selectedLinea, selectedBusId, serviciosPropios, serviciosRivales, searchRadius, minOverlap, strategyMode, officialCompetitors, competitorVariantMaps, isTacticalPanelOpen, selectedRivalForAnalysis, busesDeLineaSeleccionada, isIda, destinoIda, destinoVuelta]);

  // Lógica de filtrado de Rivales (MACRO)
  const macroMatchesVisible = useMemo(() => {
    if (!selectedLinea) return []; // Si no hay línea, no dibujamos rivales para no saturar
    
    // Nivel Macro: Filtrado a nivel corredor (Toda la línea)
    const macroMatches: CompetitorInfo[] = [];

    for (const r of serviciosRivales) {
      const baseRivalLine = r.linea.replace(/[ab]$/i, '');
      
      // Intentar descubrir el direction_id real de este coche usando GTFS
      const rivalVariantMap = competitorVariantMaps[baseRivalLine];
      let rivalActualDirId = -1;
      if (rivalVariantMap && r.variante !== undefined && rivalVariantMap[r.variante] !== undefined) {
         rivalActualDirId = rivalVariantMap[r.variante];
      }

      // Buscar el officialComp exacto que empareja este sentido rival
      let officialComp = undefined;
      if (rivalActualDirId !== -1) {
         officialComp = officialCompetitors.find(c => String(c.competitor_short_name || c.competitor_route_id) === baseRivalLine && c.competitor_direction_id === rivalActualDirId);
      }
      
      if (!officialComp) {
         // Fallback si no pudimos resolver la variante
         officialComp = officialCompetitors.find(c => String(c.competitor_short_name || c.competitor_route_id) === baseRivalLine);
      }
      const sharedStops = officialComp ? (officialComp.shared_stops_count || 0) : 0;
      
      // Filtro de Solapamiento
      if (sharedStops < minOverlap) continue;
      
      // Filtro de Estrategia
      if (strategyMode === 'corredor' && !officialComp) continue;
      
      let minDistance = Infinity;
      let minIdaDist = Infinity;
      let minVueltaDist = Infinity;

      for (const miBus of busesDeLineaSeleccionada) {
        const d = haversineMetros(miBus.lat, miBus.lng, r.lat, r.lng);
        if (d < minDistance) minDistance = d;
        if (isIda(miBus)) {
          if (d < minIdaDist) minIdaDist = d;
        } else {
          if (d < minVueltaDist) minVueltaDist = d;
        }
      }

      // Si no es un competidor oficial (o sea, es invasión de barrio), solo lo mostramos
      // si está físicamente dentro del radar de al menos uno de nuestros coches activos
      if (!officialComp && minDistance > searchRadius) {
        continue;
      }
      
      // Asignar al mapa correcto basado en proximidad física a nuestra flota como fallback... 
      // pero idealmente usamos GTFS!
      let assignedDestino = minIdaDist <= minVueltaDist ? destinoIda : destinoVuelta;
      
      if (rivalActualDirId !== -1 && officialComp) {
         // RESOLUCIÓN PERFECTA GTFS: Sabemos en qué sentido va el rival y a cuál de nuestros sentidos corresponde.
         assignedDestino = officialComp.base_direction_id === 0 ? destinoIda : destinoVuelta;
      } else if (minIdaDist === Infinity && minVueltaDist === Infinity && officialComp && officialComp.base_direction_id !== undefined) {
        assignedDestino = officialComp.base_direction_id === 0 ? destinoIda : destinoVuelta;
      }
      
      macroMatches.push({
        id: r.id,
        codigoBus: r.codigoBus,
        empresa: r.empresa,
        linea: r.linea,
        destino: assignedDestino, // Sobreescribimos el destino crudo para que encaje perfecto en el split
        distanciaM: minDistance !== Infinity ? Math.round(minDistance) : 0,
        overlapPct: sharedStops,
        comparteSentido: !!officialComp,
        threatScore: officialComp ? 50 + sharedStops * 2 : 30, // Puntuación base macro
        lat: r.lat,
        lng: r.lng,
        velocidad: r.velocidad,
        codigoEmpresa: r.empresaId,
        officialRouteId: officialComp?.competitor_route_id,
        officialDirectionId: officialComp?.competitor_direction_id,
      });
    }
    
    if (isTacticalPanelOpen && selectedRivalForAnalysis) {
      return macroMatches.filter(m => String(m.codigoEmpresa) === String(selectedRivalForAnalysis.codigoEmpresa) || String(m.linea) === String(selectedRivalForAnalysis.linea));
    }
    
    return macroMatches;
  }, [selectedLinea, serviciosPropios, serviciosRivales, searchRadius, minOverlap, strategyMode, officialCompetitors, competitorVariantMaps, busesDeLineaSeleccionada, isIda, destinoIda, destinoVuelta, isTacticalPanelOpen, selectedRivalForAnalysis]);

  const currentMatches = selectedBusId ? microMatchesVisible : macroMatchesVisible;
  const maxScore = currentMatches.length > 0 ? currentMatches[0].threatScore : 0;
  const nivelAmenaza = maxScore >= 80 ? 'CRÍTICA' : maxScore >= 45 ? 'MODERADA' : 'BAJA';

  const focusLinea = (linea: string) => {
    setSelectedLinea(linea);
    setSelectedBusId(null);
    setMapZoom(13);
  };

  const focusBus = (bus: ServicioActivo) => {
    setMapCenter([bus.lat, bus.lng]);
    setMapZoom(15);
    setSelectedBusId(bus.id);
  };

  const volverAMacro = () => {
    setSelectedBusId(null);
    setMapZoom(13);
  };

  const volverAFlota = () => {
    setSelectedLinea(null);
    setSelectedBusId(null);
  };

  const locateCompetitor = (r: CompetitorInfo) => {
    setSelectedCompetitor(r);
    setMapCenter([r.lat, r.lng]);
    setMapZoom(16);
  };



// ... (El resto del componente, desde los imports hasta antes del return, se mantiene)


  // Helper para renderizar paneles laterales (AHORA COMO OVERLAYS)
  const renderSidebar = (buses: ServicioActivo[], destinoName: string, isIdaSidebar: boolean) => {
    const isSelectedSide = selectedBusId && buses.some(b => b.id === selectedBusId);
    
    // Determine which list of matches to show for this specific sidebar
    const sideMatches = isSelectedSide ? microMatchesVisible : macroMatchesVisible.filter(r => {
      const rDest = (r.destino || '').trim().toUpperCase();
      return rDest === (destinoName || '').toUpperCase();
    });
    
    return (
      <div className={`absolute top-4 bottom-4 w-64 flex-none bg-[#111827]/90 backdrop-blur-md flex flex-col z-[1001] shadow-2xl overflow-y-auto custom-scrollbar rounded-xl border border-slate-700/50 ${isIdaSidebar ? 'left-4' : 'right-4'}`}>
         {/* Cabecera del panel de sentido */}
         <div className={`p-3 text-center border-b shadow-inner ${isIdaSidebar ? 'border-emerald-500/30 bg-emerald-900/20 rounded-t-xl' : 'border-blue-500/30 bg-blue-900/20 rounded-t-xl'}`}>
           <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center justify-center gap-2">
             <div className={`w-2 h-2 rounded-full animate-pulse ${isIdaSidebar ? 'bg-emerald-500' : 'bg-blue-500'}`}></div>
             SENTIDO HACIA
           </div>
           <div className={`text-sm font-black truncate ${isIdaSidebar ? 'text-emerald-400' : 'blue-400'}`}>{destinoName}</div>
         </div>

         {/* Contenido Dinámico: Micro (Radar) vs Macro (Lista) */}
         {isSelectedSide ? (
           <div className="flex-1 flex flex-col">
              <div className="p-3 bg-slate-800/30 border-b border-slate-700/50">
                <button onClick={volverAMacro} className="text-slate-400 hover:text-white flex items-center gap-1 text-[10px] font-bold mb-3 transition-colors">
                  <ChevronLeft className="w-3 h-3" /> Volver a Flota {destinoName}
                </button>
                <div className="flex items-center justify-between p-2 bg-slate-800 rounded-lg border border-slate-700 shadow-sm">
                   <div className="flex items-center gap-2">
                     <span className="bg-rose-500/20 text-rose-400 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider animate-pulse">Radar Activo</span>
                   </div>
                   <span className="font-bold text-white text-sm">Coche #{serviciosPropios.find(b => b.id === selectedBusId)?.codigoBus}</span>
                </div>
              </div>

              <div className="p-2 border-b border-slate-800 bg-slate-900/50">
                <div className="flex items-center justify-between px-2">
                  <span className="text-[10px] uppercase text-slate-500 font-bold">Rivales en Perímetro</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${nivelAmenaza === 'CRÍTICA' ? 'bg-rose-500/20 text-rose-400' : nivelAmenaza === 'MODERADA' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                    Nivel: {nivelAmenaza}
                  </span>
                </div>
              </div>
              
              <div className="p-2 space-y-2 flex-1 overflow-y-auto custom-scrollbar">
                 {sideMatches.length > 0 ? (
                   sideMatches.map(r => (
                     <div key={r.id} className="bg-slate-800/80 border border-slate-700/50 rounded-lg p-3 relative overflow-hidden group hover:border-indigo-500/50 transition-colors">
                       <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: r.threatScore >= 80 ? '#ef4444' : r.threatScore >= 45 ? '#f59e0b' : '#10b981' }}></div>
                       
                       <div className="flex justify-between items-start mb-2 pl-2">
                         <div>
                           <div className="flex items-center gap-1.5">
                             <h4 className="font-bold text-white text-md leading-none">L{r.linea}</h4>
                             <span className="text-[9px] uppercase font-bold text-slate-400 leading-none">({r.empresa} #{r.codigoBus})</span>
                           </div>
                           <div className="mt-1">
                             <span className={`text-[8px] uppercase font-bold px-1.5 py-0.5 rounded inline-block ${r.comparteSentido ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700 text-slate-300'}`}>
                               {r.comparteSentido ? 'Ruta Oficial' : 'Incursión Barrio'}
                             </span>
                           </div>
                         </div>
                         <div className="text-right flex flex-col items-end">
                           <div className="text-xs font-black font-mono text-white bg-slate-900 px-1.5 py-0.5 rounded">{r.distanciaM}m</div>
                           <div className="text-[9px] text-slate-500 uppercase font-bold mt-1">Score: {r.threatScore}</div>
                         </div>
                       </div>
                       
                       <div className="pl-2 pt-2 border-t border-slate-700/50 flex items-center justify-between">
                         <div className="text-[10px] text-slate-400 flex items-center gap-1">
                           <Activity className="w-3 h-3" /> Solape: <span className="font-bold text-emerald-400">{r.overlapPct}</span>
                         </div>
                         <button onClick={() => locateCompetitor(r)} className="text-indigo-400 hover:text-indigo-300 transition-colors">
                           <Crosshair className="w-4 h-4" />
                         </button>
                       </div>
                     </div>
                   ))
                 ) : (
                   <div className="text-center p-6 text-slate-500">
                     <Activity className="w-6 h-6 mx-auto mb-2 opacity-30" />
                     <p className="text-xs">No hay competidores acechando a este coche.</p>
                   </div>
                 )}
              </div>
           </div>
         ) : (
           <div className="p-3 space-y-2">
             <div className="text-[10px] uppercase text-slate-500 font-bold px-2 mb-2">Coches Activos ({buses.length})</div>
             {buses.length > 0 ? (
               buses.map(bus => (
                 <button
                    key={bus.id}
                    onClick={() => focusBus(bus)}
                    className="w-full text-left bg-slate-800/40 hover:bg-slate-700/80 border border-slate-700/50 rounded-lg p-2.5 transition-all group flex justify-between items-center shadow-sm hover:shadow"
                 >
                    <div>
                      <span className="font-bold text-slate-200 text-sm group-hover:text-white transition-colors">Coche #{bus.codigoBus}</span>
                      <div className="text-[9px] text-slate-500 truncate mt-0.5 max-w-[150px]">{bus.destino}</div>
                    </div>
                    <div className="bg-slate-900 p-1.5 rounded-md group-hover:bg-indigo-500/20 transition-colors">
                      <Crosshair className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                    </div>
                 </button>
               ))
             ) : (
               <div className="text-center p-4 text-slate-600 text-xs italic">
                 No hay coches circulando hacia este destino en este momento.
               </div>
             )}
           </div>
         )}
      </div>
    )
  };

  // Helper para renderizar los mapas simétricos
  const renderMap = (buses: ServicioActivo[], destinoName: string, isIdaMap: boolean) => {
    const isSelectedSide = selectedBusId && buses.some(b => b.id === selectedBusId);
    const mapKey = isIdaMap ? 'map-ida' : 'map-vuelta';
    
    return (
      <div className={`flex-1 relative bg-[#0e131f] ${isIdaMap ? 'border-r border-slate-700' : ''}`}>
         <MapContainer key={mapKey} center={[-34.8833, -56.1667]} zoom={13} style={{ height: '100%', width: '100%', background: '#0e131f' }} zoomControl={false}>
           <TileLayer attribution='&copy; CARTO' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png" />
           
           <MapCenterController center={mapCenter} zoom={mapZoom} isActive={!selectedBusId || !!isSelectedSide} />
           
           {baseRouteCoords.length > 0 && <Polyline positions={baseRouteCoords} pathOptions={{ color: EMPRESA_COLOR[String(empresaPropia)] ?? '#3b82f6', weight: 5, opacity: 0.8 }} />}
           
           {( (selectedCompetitor && isSelectedSide) || (isTacticalPanelOpen && selectedRivalForAnalysis) ) && compRouteCoords.length > 0 && (
             <Polyline positions={compRouteCoords} pathOptions={{ color: EMPRESA_COLOR[String(selectedCompetitor?.codigoEmpresa || selectedRivalForAnalysis?.codigoEmpresa)] ?? '#f97316', weight: 4, opacity: 0.9, dashArray: '10, 10' }} />
           )}

           {( (selectedCompetitor && isSelectedSide) || (isTacticalPanelOpen && selectedRivalForAnalysis) ) && sharedSegments.length > 0 && sharedSegments.map((segment, idx) => (
              <Polyline
                key={`shared-${idx}`}
                positions={segment}
                pathOptions={{
                  color: '#10b981', // emerald-500
                  weight: 8,
                  opacity: 0.6,
                }}
              />
           ))}

           {(() => {
              const hsData = isIda ? hotspotData?.ida : hotspotData?.vuelta;
              if (isTacticalPanelOpen && hsData && hsData.hotspot) {
                let hotspotCoords: [number, number] | null = null;
                
                // 1. Try to use direct coordinates if valid
                if (typeof hsData.hotspot.lat === 'number' && typeof hsData.hotspot.lon === 'number' && !isNaN(hsData.hotspot.lat) && !isNaN(hsData.hotspot.lon)) {
                  hotspotCoords = [hsData.hotspot.lat, hsData.hotspot.lon];
                } 
                // 2. Fallback to finding in baseRouteStops
                else if (baseRouteStops.length > 0) {
                  const foundStop = baseRouteStops.find(s => s.id === hsData.hotspot?.stop_id || s.nombre === hsData.hotspot?.stop_name);
                  if (foundStop && typeof foundStop.lat === 'number' && typeof foundStop.lng === 'number') {
                    hotspotCoords = [foundStop.lat, foundStop.lng];
                  }
                }

                if (hotspotCoords) {
                  return (
                    <Marker
                      position={hotspotCoords}
                      icon={L.divIcon({
                        html: `
                          <div class="relative flex items-center justify-center w-8 h-8">
                            <div class="absolute inset-0 bg-rose-500 rounded-full animate-ping opacity-75"></div>
                            <div class="relative bg-rose-600 border-2 border-white rounded-full w-4 h-4 shadow-lg"></div>
                          </div>
                        `,
                        className: 'custom-div-icon',
                        iconSize: [32, 32],
                        iconAnchor: [16, 16],
                      })}
                    >
                      <Popup className="custom-popup">
                        <div className="p-2 min-w-[200px]">
                          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 mb-2">
                            <Activity className="w-4 h-4 text-rose-600" />
                            Punto Caliente (${isIda ? 'Ida' : 'Vuelta'})
                          </h3>
                          <div className="text-xs text-slate-600 space-y-1">
                            <p><span className="font-semibold text-slate-500">Parada:</span> {hsData.hotspot.stop_name}</p>
                            <p><span className="font-semibold text-slate-500">Volumen:</span> {hsData.hotspot.total_boardings.toLocaleString()} ascensos</p>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                }
              }
              return null;
           })()}

           {/* Coches Propios */}
           {buses.map(b => {
              let markerColor = EMPRESA_COLOR[String(b.empresaId)] ?? '#3b82f6';
              if (selectedBusId && b.id !== selectedBusId) markerColor = '#475569'; // Dim non-selected
              return (
                <Marker key={b.id} position={[b.lat, b.lng]} icon={makeBusDivIcon(markerColor, b.linea, b.codigoBus, b.velocidad, b.destino)} zIndexOffset={b.id === selectedBusId ? 1000 : 500}>
                  <Popup><div className="text-xs font-sans p-1">Línea {b.linea} - #{b.codigoBus}</div></Popup>
                </Marker>
              )
           })}

           {/* Rivales */}
           {isSelectedSide ? (
             // MICRO: Mostrar todos los rivales del radar de este coche
             microMatchesVisible.map(r => (
               <Marker key={`micro-${r.id}`} position={[r.lat, r.lng]} icon={makeBusDivIcon(EMPRESA_COLOR[String(r.codigoEmpresa)] ?? '#94a3b8', r.linea, r.codigoBus, r.velocidad, r.destino)} zIndexOffset={1000}>
                 <Popup><div className="text-xs font-sans p-1">Línea {r.linea} (Rival)<br/><span className="text-[9px] text-slate-500 font-bold block mt-1 pt-1 border-t border-slate-200">🛡️ Sentido GTFS Resuelto: {r.officialDirectionId !== undefined ? (r.officialDirectionId === 0 ? '0 (Ida Rival)' : '1 (Vuelta Rival)') : 'No verificado'}</span></div></Popup>
               </Marker>
             ))
           ) : (
             // MACRO: Mostrar rivales estrictamente filtrados por destino
             macroMatchesVisible.map(r => {
               const rDest = (r.destino || '').trim().toUpperCase();
               if (rDest !== (destinoName || '').toUpperCase()) return null;
               return (
                 <Marker key={`macro-${r.id}`} position={[r.lat, r.lng]} icon={makeBusDivIcon(EMPRESA_COLOR[String(r.codigoEmpresa)] ?? '#94a3b8', r.linea, r.codigoBus, r.velocidad, r.destino)} zIndexOffset={700}>
                   <Popup><div className="text-xs font-sans p-1">Línea {r.linea} (Rival)<br/><span className="text-[9px] text-slate-500 font-bold block mt-1 pt-1 border-t border-slate-200">🛡️ Sentido GTFS Resuelto: {r.officialDirectionId !== undefined ? (r.officialDirectionId === 0 ? '0 (Ida Rival)' : '1 (Vuelta Rival)') : 'No verificado'}</span></div></Popup>
                 </Marker>
               )
             })
           )}
         </MapContainer>
      </div>
    )
  };


  return (
    <div className="flex flex-col h-full w-full bg-[#0b0f19] text-slate-200 overflow-hidden font-sans">
      
      {/* ── BARRA SUPERIOR (HEADER TÁCTICO) ── */}
      <div className="h-20 bg-[#111827]/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-6 shrink-0 shadow-lg z-[1002]">
        
        {/* Izquierda: Branding y Selector de Corredor */}
        <div className="flex items-center h-full">
          <div className="flex items-center gap-3 pr-6 border-r border-slate-700/50 h-full">
            <div className="p-2 bg-indigo-500/20 rounded-lg shadow-inner">
              <Crosshair className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white tracking-tight leading-none">Radar Disputas</h1>
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1 block">Nivel Macro / Micro</span>
            </div>
          </div>
          
          <div className="flex items-center pl-6 h-full">
            <span className="text-[10px] uppercase text-slate-500 font-bold mr-4">Corredor:</span>
            <div className="flex gap-2 max-w-[500px] overflow-x-auto custom-scrollbar items-center py-2">
              {lineasActivas.map(linea => (
                <button
                  key={linea}
                  onClick={() => focusLinea(linea)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all shadow-sm ${selectedLinea === linea ? 'bg-indigo-600 text-white shadow-indigo-500/20 scale-105' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700/50'}`}
                >
                  Línea {linea}
                  {selectedLinea !== linea && <span className="ml-2 text-[9px] bg-slate-900 px-1.5 py-0.5 rounded-full opacity-70">{serviciosPropios.filter(b => b.linea === linea).length}</span>}
                </button>
              ))}
            </div>
            {selectedLinea && (
              <button onClick={volverAFlota} className="ml-4 p-1.5 rounded-full bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors border border-slate-700/50" title="Limpiar selección">
                <Activity className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Derecha: Filtros Tácticos (Siempre visibles) */}
        <div className="flex items-center gap-6 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/50 shadow-inner">
          
          <div className="flex flex-col border-r border-slate-700/50 pr-6">
             <span className="text-[9px] uppercase text-slate-500 font-bold mb-1">Estrategia</span>
             <div className="flex bg-slate-800 rounded-md p-0.5 border border-slate-700/50">
               <button
                 onClick={() => setStrategyMode('corredor')}
                 className={`px-3 py-1 text-[10px] font-bold rounded transition-all ${strategyMode === 'corredor' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
               >
                 Corredor
               </button>
               <button
                 onClick={() => setStrategyMode('barrio')}
                 className={`px-3 py-1 text-[10px] font-bold rounded transition-all ${strategyMode === 'barrio' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
               >
                 Barrio
               </button>
             </div>
          </div>
          
          <div className="flex flex-col w-36 border-r border-slate-700/50 pr-6">
            <div className="flex justify-between text-[9px] text-slate-400 font-bold mb-1.5">
              <span>RADAR ACTIVO</span>
              <span className="text-indigo-400 bg-indigo-500/10 px-1 rounded">{searchRadius}m</span>
            </div>
            <input type="range" min="100" max="3000" step="100" value={searchRadius} onChange={(e) => setSearchRadius(Number(e.target.value))} className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer" />
          </div>
          
          <div className="flex flex-col w-36">
            <div className="flex justify-between text-[9px] text-slate-400 font-bold mb-1.5">
              <span>TOLERANCIA (PARADAS)</span>
              <span className="text-indigo-400 bg-indigo-500/10 px-1 rounded">≥ {minOverlap}</span>
            </div>
            <input type="range" min="0" max="40" step="1" value={minOverlap} onChange={(e) => setMinOverlap(Number(e.target.value))} className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer" />
          </div>
          
        </div>
      </div>

      {/* ── ÁREA PRINCIPAL Y DRAWER TÁCTICO ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* MAPAS EN VIVO */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Modo 1: Sin línea seleccionada (Mapa Único Fullscreen) */}
          {!selectedLinea && (
             <div className="flex-1 relative">
               <MapContainer center={[-34.8833, -56.1667]} zoom={13} style={{ height: '100%', width: '100%', background: '#0e131f' }} zoomControl={false}>
                 <TileLayer attribution='&copy; CARTO' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png" />
                 <MapCenterController center={mapCenter} zoom={mapZoom} isActive={true} />
                 {serviciosPropios.map((b) => (
                   <Marker key={b.id} position={[b.lat, b.lng]} icon={makeBusDivIcon(EMPRESA_COLOR[String(b.empresaId)] ?? '#3b82f6', b.linea, b.codigoBus, b.velocidad, b.destino)} zIndexOffset={500}>
                     <Popup><div className="text-xs font-sans p-1">Línea {b.linea} - #{b.codigoBus}</div></Popup>
                   </Marker>
                 ))}
               </MapContainer>
               <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="bg-slate-900/80 backdrop-blur-md px-6 py-4 rounded-2xl border border-slate-700 shadow-2xl flex flex-col items-center">
                     <Crosshair className="w-12 h-12 text-indigo-500 mb-3 opacity-80" />
                     <h2 className="text-xl font-bold text-white">Seleccione un Corredor</h2>
                     <p className="text-sm text-slate-400 mt-1">Utilice la barra superior para desplegar el panel táctico.</p>
                  </div>
               </div>
             </div>
          )}

          {/* Modo 2: Línea Seleccionada (Mapas Divididos + Overlays) */}
          {selectedLinea && (
            <>
               {/* Mapa Ida */}
               {renderMap(busesIda, destinoIda, true)}
               
               {/* Mapa Vuelta */}
               {renderMap(busesVuelta, destinoVuelta, false)}

               {/* Overlays Laterales */}
               {renderSidebar(busesIda, destinoIda, true)}
               {renderSidebar(busesVuelta, destinoVuelta, false)}
            </>
          )}

          {/* Botón Flotante para abrir Drawer */}
          {selectedLinea && !isTacticalPanelOpen && (
            <button
              onClick={() => {
                setIsTacticalPanelOpen(true);
                setIsTacticalDrawerExpanded(true);
                setTimeout(() => window.dispatchEvent(new Event('resize')), 300); // Trigger Leaflet redraw
              }}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-800/90 hover:bg-slate-700 text-white backdrop-blur px-6 py-2 rounded-full font-bold text-xs shadow-xl border border-slate-600/50 transition-all z-[2000] flex items-center gap-2"
            >
              <Sliders className="w-4 h-4" />
              Desplegar Análisis Táctico
            </button>
          )}
        </div>

        {/* DRAWER TÁCTICO (BOTTOM SHEET) - AHORA COMO OVERLAY PARA NO DEFORMAR EL MAPA */}
        <div className={`absolute bottom-0 left-0 right-0 transition-all duration-300 ease-in-out bg-[#0f172a]/95 backdrop-blur-xl border-t border-slate-700 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col z-[2000] ${!isTacticalPanelOpen ? 'h-0 border-transparent' : isTacticalDrawerExpanded ? 'h-[65%] sm:h-[60%]' : 'h-14'}`}>
          {/* Drawer Header */}
          <div className="h-14 bg-slate-900/95 flex items-center justify-between px-4 shrink-0 shadow-md border-b border-slate-700/50 z-[2001] w-full">
            <div className="flex items-center gap-4 flex-1 min-w-0 mr-4">
              <span className="text-sm font-bold text-white whitespace-nowrap hidden sm:block">Análisis Táctico</span>
              {/* Selector de Competidor Integrado */}
              <div className="flex items-center gap-2 bg-slate-800/80 rounded-md p-1 border border-slate-700/50 overflow-x-auto custom-scrollbar flex-1">
                {(() => {
                  const uniqueTacticalCompetitors = Array.from(
                    officialCompetitors.reduce((map, comp) => {
                      const existing = map.get(comp.competitor_route_id);
                      if (!existing || comp.shared_stops_count > existing.shared_stops_count) {
                        map.set(comp.competitor_route_id, comp);
                      }
                      return map;
                    }, new Map()).values()
                  ) as typeof officialCompetitors;

                  const filteredCompetitors = uniqueTacticalCompetitors.filter(c => c.shared_stops_count >= minOverlap);

                  if (filteredCompetitors.length === 0) {
                    return <span className="text-xs text-slate-500 px-2 italic whitespace-nowrap">Sin rivales</span>;
                  }

                  return filteredCompetitors.map(c => {
                    const isSel = selectedRivalForAnalysis?.codigoEmpresa === c.competitor_route_id;
                    return (
                      <button
                        key={c.competitor_route_id}
                        onClick={() => {
                          const rivalInfo = {
                            id: '', codigoBus: '', empresa: c.competitor_short_name || '', linea: c.competitor_route_id, destino: '', distanciaM: 0, overlapPct: c.shared_stops_count, comparteSentido: true, threatScore: 0, lat: 0, lng: 0, velocidad: 0, codigoEmpresa: c.competitor_route_id
                          };
                          setSelectedRivalForAnalysis(rivalInfo);
                          setSelectedCompetitor(rivalInfo);
                        }}
                        className={`px-3 py-1.5 text-xs font-bold rounded transition-all flex-shrink-0 whitespace-nowrap ${isSel ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                      >
                        Línea {c.competitor_route_id}
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-shrink-0">
               {/* Pestañas de Análisis */}
               {selectedRivalForAnalysis && (
                 <div className="flex bg-slate-800/80 rounded-lg p-1 border border-slate-700/50 mr-2">
                   <button onClick={() => setTacticalTab('trends')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${tacticalTab === 'trends' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
                     <DollarSign className="w-3.5 h-3.5 hidden sm:block" /> Rentabilidad
                   </button>
                   <button onClick={() => setTacticalTab('bunching')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${tacticalTab === 'bunching' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
                     <Activity className="w-3.5 h-3.5 hidden sm:block" /> Anti-Bunching
                   </button>
                 </div>
               )}
               <button
                 onClick={() => {
                   setIsTacticalDrawerExpanded(!isTacticalDrawerExpanded);
                   setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
                 }}
                 title={isTacticalDrawerExpanded ? "Minimizar panel (ver mapa)" : "Expandir panel (ver gráficas)"}
                 className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-indigo-500 transition-colors border border-slate-700 shadow-md flex-shrink-0"
               >
                 {isTacticalDrawerExpanded ? (
                   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                 ) : (
                   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
                 )}
               </button>
               <button
                 onClick={() => {
                   setIsTacticalPanelOpen(false);
                 }}
                 title="Cerrar análisis (limpiar mapa)"
                 className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-rose-500 transition-colors border border-slate-700 shadow-md flex-shrink-0"
               >
                 <X className="w-5 h-5" />
               </button>
            </div>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-gradient-to-b from-transparent to-slate-900/50">
            {!selectedRivalForAnalysis ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm p-6 text-center">
                <Activity className="w-12 h-12 mb-4 opacity-20" />
                {officialCompetitors.length === 0 ? (
                  <>
                    <p className="text-lg text-slate-400 font-bold mb-1">Sin rivales directos mapeados</p>
                    <p>No se han detectado rutas de empresas competidoras superpuestas a este corredor en la base de datos de inteligencia.</p>
                  </>
                ) : (
                  "Seleccione un competidor en la barra superior del panel para analizar."
                )}
              </div>
            ) : tacticalLoading ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                Cargando métricas de Inteligencia Competitiva...
              </div>
            ) : (
              <div className="flex flex-col lg:flex-row gap-2 min-h-full w-full">
                {/* Columna IDA */}
                <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-slate-900/50 rounded-xl border border-slate-700/50 p-2">
                  <h3 className="text-sm uppercase tracking-wider font-bold text-indigo-400 mb-2 border-b border-slate-700/50 pb-2 px-1">Sentido Ida</h3>
                  <div className="flex-1 overflow-hidden">
                    {tacticalTab === 'trends' && trendsData.ida ? (
                      <TrendCharts 
                        trends={trendsData.ida} 
                        baseDistance={baseDistance}
                        compDistance={compDistance}
                        sharedDistance={sharedDistance}
                        direction="ida"
                      />
                    ) : tacticalTab === 'bunching' ? (
                      <HotspotInterleaving 
                        baseRouteId={selectedLinea ? selectedLinea.replace(/[ab]$/i, '') : ''}
                        baseDir={0}
                        compRouteId={selectedRivalForAnalysis?.linea || ''}
                        compDir={officialCompetitors.find(c => String(c.competitor_short_name || c.competitor_route_id) === selectedRivalForAnalysis?.linea && c.base_direction_id === 0)?.competitor_direction_id ?? 0}
                      />
                    ) : (
                      <div className="text-center text-slate-500 mt-10 text-sm">No hay datos suficientes para Ida.</div>
                    )}
                  </div>
                </div>

                {/* Columna GLOBAL (CENTRO) - Solo visible para Trends */}
                {tacticalTab === 'trends' && globalTrendData && (
                  <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-slate-800/40 rounded-xl border border-slate-700/50 p-2">
                    <h3 className="text-sm uppercase tracking-wider font-bold text-slate-400 mb-2 border-b border-slate-700/50 pb-2 px-1">Consolidado Global</h3>
                    <div className="flex-1 overflow-hidden">
                      <TrendCharts 
                        trends={globalTrendData} 
                        baseDistance={baseDistance}
                        compDistance={compDistance}
                        sharedDistance={sharedDistance}
                        direction="global"
                      />
                    </div>
                  </div>
                )}

                {/* Columna VUELTA */}
                <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-slate-900/50 rounded-xl border border-slate-700/50 p-2">
                  <h3 className="text-sm uppercase tracking-wider font-bold text-teal-400 mb-2 border-b border-slate-700/50 pb-2 px-1">Sentido Vuelta</h3>
                  <div className="flex-1 overflow-hidden">
                    {tacticalTab === 'trends' && trendsData.vuelta ? (
                      <TrendCharts 
                        trends={trendsData.vuelta} 
                        baseDistance={baseDistance}
                        compDistance={compDistance}
                        sharedDistance={sharedDistance}
                        direction="vuelta"
                      />
                    ) : tacticalTab === 'bunching' ? (
                      <HotspotInterleaving 
                        baseRouteId={selectedLinea ? selectedLinea.replace(/[ab]$/i, '') : ''}
                        baseDir={1}
                        compRouteId={selectedRivalForAnalysis?.linea || ''}
                        compDir={officialCompetitors.find(c => String(c.competitor_short_name || c.competitor_route_id) === selectedRivalForAnalysis?.linea && c.base_direction_id === 1)?.competitor_direction_id ?? 1}
                      />
                    ) : (
                      <div className="text-center text-slate-500 mt-10 text-sm">No hay datos suficientes para Vuelta.</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
