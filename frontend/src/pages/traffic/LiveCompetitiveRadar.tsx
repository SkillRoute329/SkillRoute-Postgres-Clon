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
import { Activity, Crosshair, Sliders, DollarSign, ChevronLeft } from 'lucide-react';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import { useLiveOperations, type ServicioActivo } from '../../hooks/useLiveOperations';
import { getNavigationLineaData } from '../../features/navigation/services/navigationDataService';
import api from '../../services/api';

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

function MapCenterController({ center, zoom }: { center: [number, number] | null; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, zoom, { animate: true, duration: 1.5 });
    }
  }, [center, zoom, map]);
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
  
  // Lista Blanca Oficial de Competidores (BI API)
  const [officialCompetitors, setOfficialCompetitors] = useState<Array<any>>([]);
  const [loadingCompetitors, setLoadingCompetitors] = useState(false);

  // Carga de ruta propia al seleccionar una línea
  useEffect(() => {
    if (!selectedLinea) {
      setBaseRouteCoords([]);
      setCompRouteCoords([]);
      setSelectedCompetitor(null);
      return;
    }
    const loadBaseRoute = async () => {
      try {
        const data = await getNavigationLineaData(empresaPropia, selectedLinea);
        if (data && data.recorrido) {
          setBaseRouteCoords(data.recorrido.map((c: any) => [c.lat, c.lng]));
        } else {
          setBaseRouteCoords([]);
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
        
        // Deduplicar por si un competidor aparece idéntico en ambos (aunque intelligenceController usa keys)
        const unique = Array.from(new Map(combined.map(c => [`${c.competitor_route_id}_${c.competitor_direction_id}`, c])).values());

        setOfficialCompetitors(unique);
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
      return (bus.destino || '').trim().toUpperCase() === destinoIdaFallback;
    };
    
    const isVueltaFn = (bus: ServicioActivo) => {
      if (variantDirections[bus.variante] !== undefined) {
        return variantDirections[bus.variante] === 1;
      }
      return (bus.destino || '').trim().toUpperCase() === destinoVueltaFallback;
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

  // Lógica de filtrado de Rivales (MACRO vs MICRO)
  const rivalesVisibles = useMemo(() => {
    if (!selectedLinea) return []; // Si no hay línea, no dibujamos rivales para no saturar
    
    // Nivel Micro: Filtrado de Radar sobre un coche específico
    if (selectedBusId) {
      const p = serviciosPropios.find(b => b.id === selectedBusId);
      if (!p) return [];

      const matches: CompetitorInfo[] = [];
      for (const r of serviciosRivales) {
        const dist = haversineMetros(p.lat, p.lng, r.lat, r.lng);
        if (dist > searchRadius) continue;

        const baseRivalLine = r.linea.replace(/[ab]$/i, '');
        const officialComp = officialCompetitors.find(c => String(c.competitor_route_id) === baseRivalLine);
        
        const sharedStops = officialComp ? (officialComp.shared_stops_count || 0) : 0;
        if (sharedStops < minOverlap) continue;
        if (strategyMode === 'corredor' && !officialComp) continue;

        let threatScore = sharedStops * 2; 
        if (officialComp) threatScore += 50; 
        if (dist < 400) threatScore += 30;

        matches.push({
          id: r.id,
          codigoBus: r.codigoBus,
          empresa: r.empresa,
          linea: r.linea,
          destino: r.destino,
          distanciaM: Math.round(dist),
          overlapPct: sharedStops,
          comparteSentido: !!officialComp,
          threatScore,
          lat: r.lat,
          lng: r.lng,
          velocidad: r.velocidad,
          codigoEmpresa: r.empresaId,
        });
      }
      matches.sort((a, b) => a.distanciaM - b.distanciaM);
      return matches;
    } 
    
    // Nivel Macro: Filtrado a nivel corredor (Toda la línea)
    const macroMatches: CompetitorInfo[] = [];

    for (const r of serviciosRivales) {
      const baseRivalLine = r.linea.replace(/[ab]$/i, '');
      const officialComp = officialCompetitors.find(c => String(c.competitor_short_name || c.competitor_route_id) === baseRivalLine);
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
      
      // Asignar al mapa correcto basado en proximidad física a nuestra flota
      // Si está más cerca de un coche de Ida, va al mapa de Ida, sino al de Vuelta.
      let assignedDestino = minIdaDist <= minVueltaDist ? destinoIda : destinoVuelta;
      
      // Si no pudimos determinarlo por cercanía (ej: no hay coches propios activos), usamos el sentido base de la competencia oficial si existe
      if (minIdaDist === Infinity && minVueltaDist === Infinity && officialComp && officialComp.base_direction_id !== undefined) {
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
      });
    }
    return macroMatches;
  }, [selectedLinea, selectedBusId, serviciosPropios, serviciosRivales, searchRadius, minOverlap, strategyMode, officialCompetitors, busesDeLineaSeleccionada, isIda, destinoIda, destinoVuelta]);

  const maxScore = rivalesVisibles.length > 0 ? rivalesVisibles[0].threatScore : 0;
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

function MapCenterController({ center, zoom, isActive }: { center: [number, number], zoom: number, isActive: boolean }) {
  const map = useMap();
  
  // Solución a "Baldosas Grises" de Leaflet: Forzar el recálculo del tamaño del mapa cuando se monta o cambia el contenedor
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    return () => clearTimeout(timer);
  }, [map]);

  useEffect(() => {
    if (isActive) {
      map.setView(center, zoom, { animate: true });
    }
  }, [center, zoom, map, isActive]);
  
  return null;
}

// ... (El resto del componente, desde los imports hasta antes del return, se mantiene)


  // Helper para renderizar paneles laterales
  const renderSidebar = (buses: ServicioActivo[], destinoName: string, isIdaSidebar: boolean) => {
    const isSelectedSide = selectedBusId && buses.some(b => b.id === selectedBusId);
    
    return (
      <div className={`w-72 flex-none bg-[#111827]/95 flex flex-col z-[1001] shadow-2xl overflow-y-auto custom-scrollbar ${isIdaSidebar ? 'border-r border-slate-800' : 'border-l border-slate-800'}`}>
         {/* Cabecera del panel de sentido */}
         <div className={`p-3 text-center border-b shadow-inner ${isIdaSidebar ? 'border-emerald-500/30 bg-emerald-900/20' : 'border-blue-500/30 bg-blue-900/20'}`}>
           <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center justify-center gap-2">
             <div className={`w-2 h-2 rounded-full animate-pulse ${isIdaSidebar ? 'bg-emerald-500' : 'bg-blue-500'}`}></div>
             SENTIDO HACIA
           </div>
           <div className={`text-sm font-black truncate ${isIdaSidebar ? 'text-emerald-400' : 'text-blue-400'}`}>{destinoName}</div>
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
                 {rivalesVisibles.length > 0 ? (
                   rivalesVisibles.map(r => (
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
           {selectedCompetitor && isSelectedSide && compRouteCoords.length > 0 && <Polyline positions={compRouteCoords} pathOptions={{ color: EMPRESA_COLOR[String(selectedCompetitor.codigoEmpresa)] ?? '#f97316', weight: 4, opacity: 0.9, dashArray: '10, 10' }} />}

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
             rivalesVisibles.map(r => (
               <Marker key={r.id} position={[r.lat, r.lng]} icon={makeBusDivIcon(EMPRESA_COLOR[String(r.codigoEmpresa)] ?? '#94a3b8', r.linea, r.codigoBus, r.velocidad, r.destino)} zIndexOffset={1000}>
                 <Popup><div className="text-xs font-sans p-1">Línea {r.linea} (Rival)</div></Popup>
               </Marker>
             ))
           ) : !selectedBusId ? (
             // MACRO: Mostrar rivales estrictamente filtrados por destino
             rivalesVisibles.map(r => {
               const rDest = (r.destino || '').trim().toUpperCase();
               if (rDest !== (destinoName || '').toUpperCase()) return null;
               return (
                 <Marker key={r.id} position={[r.lat, r.lng]} icon={makeBusDivIcon(EMPRESA_COLOR[String(r.codigoEmpresa)] ?? '#94a3b8', r.linea, r.codigoBus, r.velocidad, r.destino)} zIndexOffset={700}>
                   <Popup><div className="text-xs font-sans p-1">Línea {r.linea} (Rival)</div></Popup>
                 </Marker>
               )
             })
           ) : null}
         </MapContainer>
      </div>
    )
  };

  return (
    <div className="flex flex-col h-screen bg-[#0b0f19] text-slate-200 overflow-hidden font-sans">
      
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

      {/* ── ÁREA PRINCIPAL ── */}
      <div className="flex-1 flex overflow-hidden">
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

        {/* Modo 2: Línea Seleccionada (4 Columnas Simétricas) */}
        {selectedLinea && (
          <>
             {/* COLUMNA 1: Coches Ida */}
             {renderSidebar(busesIda, destinoIda, true)}
             
             {/* COLUMNA 2: Mapa Ida */}
             {renderMap(busesIda, destinoIda, true)}
             
             {/* COLUMNA 3: Mapa Vuelta */}
             {renderMap(busesVuelta, destinoVuelta, false)}
             
             {/* COLUMNA 4: Coches Vuelta */}
             {renderSidebar(busesVuelta, destinoVuelta, false)}
          </>
        )}
      </div>
    </div>
  );
}
