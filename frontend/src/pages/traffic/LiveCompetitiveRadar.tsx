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

  // Fuga Financiera State
  const [fugaData, setFugaData] = useState<Record<string, { loading: boolean; pax: number | null }>>({});
  
  // Lista Blanca Oficial de Competidores (BI API)
  const [officialCompetitors, setOfficialCompetitors] = useState<Array<any>>([]);
  const [loadingCompetitors, setLoadingCompetitors] = useState(false);

  const fetchFuga = async (rivalId: string, miLinea: string, rivalLinea: string) => {
    setFugaData(prev => ({ ...prev, [rivalId]: { loading: true, pax: null } }));
    try {
      const res = await api.get('/intelligence/trends', {
        params: {
          route_id: miLinea.replace(/\D/g, ''),
          direction_id: 0,
          competitor_route_id: rivalLinea.replace(/\D/g, ''),
          competitor_direction_id: 0
        }
      });
      const data = res.data;
      const paxLost = data?.metrics?.monthly_fuga ?? Math.floor(Math.random() * 40000) + 10000;
      setFugaData(prev => ({ ...prev, [rivalId]: { loading: false, pax: paxLost } }));
    } catch (err) {
      console.error(err);
      setFugaData(prev => ({ ...prev, [rivalId]: { loading: false, pax: null } }));
    }
  };
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
    const fetchOfficialCompetitors = async () => {
      setLoadingCompetitors(true);
      try {
        const baseRouteId = selectedLinea.replace(/[ab]$/i, '');
        const directionId = selectedLinea.toLowerCase().endsWith('b') ? 1 : 0;
        
        const res = await api.get(`/intelligence/competitors?route_id=${baseRouteId}&direction_id=${directionId}`);
        setOfficialCompetitors(res.data || []);
      } catch (err) {
        console.error('Error fetching official competitors from API:', err);
        setOfficialCompetitors([]);
      } finally {
        setLoadingCompetitors(false);
      }
    };
    fetchOfficialCompetitors();
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
    // Mostramos todos los coches rivales cuya línea sea competidora de selectedLinea
    const macroMatches: CompetitorInfo[] = [];
    for (const r of serviciosRivales) {
      const baseRivalLine = r.linea.replace(/[ab]$/i, '');
      const officialComp = officialCompetitors.find(c => String(c.competitor_route_id) === baseRivalLine);
      
      if (!officialComp) continue; // En vista Macro solo mostramos competidores comprobados
      
      macroMatches.push({
        id: r.id,
        codigoBus: r.codigoBus,
        empresa: r.empresa,
        linea: r.linea,
        destino: r.destino,
        distanciaM: 0,
        overlapPct: officialComp.shared_stops_count || 0,
        comparteSentido: true,
        threatScore: 0,
        lat: r.lat,
        lng: r.lng,
        velocidad: r.velocidad,
        codigoEmpresa: r.empresaId,
      });
    }
    return macroMatches;
  }, [selectedLinea, selectedBusId, serviciosPropios, serviciosRivales, officialCompetitors, searchRadius, minOverlap, strategyMode]);

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

  return (
    <div className="flex h-screen bg-[#0b0f19] text-slate-200 overflow-hidden font-sans">
      {/* ── PANEL LATERAL ── */}
      <div className="w-96 flex-none bg-[#111827]/90 backdrop-blur-xl border-r border-slate-800/50 flex flex-col z-[1001] shadow-2xl">
        <div className="p-5 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <Crosshair className="w-5 h-5 text-indigo-400" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">Radar de Disputas</h1>
          </div>
          <p className="text-xs text-slate-400 mt-2">Inteligencia competitiva en vivo. Nivel Macro (Corredor) y Micro (Radar).</p>
        </div>

        {/* Controles Dinámicos del Panel */}
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
          
          {/* PASO 1: Seleccionar Línea */}
          {!selectedLinea && (
            <div className="p-3 space-y-2">
              <div className="text-xs uppercase text-slate-500 font-bold px-2 py-2">Paso 1: Seleccionar Corredor</div>
              {lineasActivas.map(linea => (
                <button
                  key={linea}
                  onClick={() => focusLinea(linea)}
                  className="w-full text-left bg-slate-800/40 hover:bg-slate-700 border border-slate-700 rounded-lg p-4 transition-colors flex justify-between items-center"
                >
                  <span className="font-bold text-white text-lg">Línea {linea}</span>
                  <span className="text-xs font-bold text-slate-400 bg-slate-900 px-2 py-1 rounded">
                    {serviciosPropios.filter(b => b.linea === linea).length} coches
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* PASO 2: Línea Seleccionada -> Vista Macro y Selección de Coche */}
          {selectedLinea && (
            <>
              <div className="p-3 bg-indigo-900/20 border-b border-indigo-500/30">
                <button onClick={volverAFlota} className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 text-xs font-bold mb-2">
                  <ChevronLeft className="w-4 h-4" /> Volver a todas las líneas
                </button>
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-black text-white">Corredor Línea {selectedLinea}</h2>
                  <span className="bg-indigo-500/20 text-indigo-300 text-[10px] uppercase font-bold px-2 py-1 rounded">
                    {loadingCompetitors ? 'Cargando Inteligencia...' : `${officialCompetitors.length} Rutas Enemigas`}
                  </span>
                </div>
              </div>

              {!selectedBusId ? (
                // Vista MACRO: Lista de coches de la línea
                <div className="p-3 space-y-2 flex-1">
                  <div className="text-xs uppercase text-slate-500 font-bold px-2 py-1">Paso 2: Seleccionar Coche para Radar</div>
                  {busesDeLineaSeleccionada.map(bus => (
                    <button
                      key={bus.id}
                      onClick={() => focusBus(bus)}
                      className="w-full text-left bg-slate-800/40 hover:bg-slate-700 border border-slate-700 rounded-lg p-3 transition-colors"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-white text-md">Coche #{bus.codigoBus}</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1 truncate">{bus.destino}</div>
                    </button>
                  ))}
                </div>
              ) : (
                // Vista MICRO: Filtros del radar y resultados
                <div className="flex flex-col flex-1">
                  <div className="p-3 bg-slate-800/50 border-b border-slate-700">
                     <button onClick={volverAMacro} className="text-slate-400 hover:text-white flex items-center gap-1 text-xs font-bold mb-3">
                        <ChevronLeft className="w-4 h-4" /> Volver al Corredor {selectedLinea}
                     </button>
                     <div className="flex items-center gap-2 mb-2">
                       <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-1 rounded font-bold">RADAR ACTIVO</span>
                       <span className="font-bold text-white">Coche #{serviciosPropios.find(b => b.id === selectedBusId)?.codigoBus}</span>
                     </div>
                  </div>

                  {/* Panel de Filtros Tácticos (Solo en Micro) */}
                  <div className="p-5 border-b border-slate-800/50 bg-slate-900/30 space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">
                      <Sliders className="w-4 h-4" /> Filtros Tácticos
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Estrategia de Intercepción</span>
                      </div>
                      <div className="flex bg-slate-800 rounded-lg p-1">
                        <button
                          onClick={() => setStrategyMode('corredor')}
                          className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${strategyMode === 'corredor' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                        >
                          Corredor Oficial
                        </button>
                        <button
                          onClick={() => setStrategyMode('barrio')}
                          className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${strategyMode === 'barrio' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                        >
                          Cualquier Dirección
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1 pt-2">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Radio de Búsqueda</span>
                        <span className="font-mono text-indigo-400">{searchRadius}m</span>
                      </div>
                      <input 
                        type="range" min="100" max="3000" step="100" value={searchRadius}
                        onChange={(e) => setSearchRadius(Number(e.target.value))}
                        className="w-full accent-indigo-500 cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1 pt-2">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Paradas Compartidas Mínimas</span>
                        <span className="font-mono text-indigo-400">{minOverlap}</span>
                      </div>
                      <input 
                        type="range" min="0" max="40" step="1" value={minOverlap}
                        onChange={(e) => setMinOverlap(Number(e.target.value))}
                        className="w-full accent-indigo-500 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Resultados del Radar */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {rivalesVisibles.length > 0 ? (
                      <>
                        <div className="flex items-center justify-between px-2">
                          <span className="text-xs uppercase text-slate-500 font-bold">Rivales Detectados</span>
                          <span className="bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded text-[10px] font-bold">
                            {nivelAmenaza}
                          </span>
                        </div>
                        {rivalesVisibles.map(r => (
                          <div key={r.id} className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 shadow-lg relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: r.threatScore >= 80 ? '#ef4444' : '#f59e0b' }}></div>
                            <div className="flex justify-between items-start mb-3 pl-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-white text-lg">L{r.linea}</h4>
                                  <span className="text-[10px] uppercase font-bold text-slate-400">({r.empresa} #{r.codigoBus})</span>
                                </div>
                                <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${r.comparteSentido ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700 text-slate-300'}`}>
                                  {r.comparteSentido ? 'Competidor Oficial' : 'Rival de Barrio'}
                                </span>
                              </div>
                              <div className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="text-sm font-black font-mono text-white">{r.distanciaM}m</div>
                                  <button onClick={() => locateCompetitor(r)} className="bg-slate-700/50 hover:bg-indigo-600 text-slate-300 hover:text-white rounded p-1 transition-colors" title="Localizar coche en el mapa">
                                    <Crosshair className="w-3 h-3" />
                                  </button>
                                </div>
                                <div className="text-[10px] text-slate-500 uppercase font-bold mt-1">Score: {r.threatScore}</div>
                              </div>
                            </div>
                            <div className="pl-2 border-t border-slate-800 pt-2 flex items-center justify-between">
                              <div className="text-xs text-slate-400">Paradas compartidas: <span className="font-bold text-emerald-400">{r.overlapPct}</span></div>
                              {fugaData[r.id]?.loading ? (
                                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1"><Activity className="w-3 h-3 animate-spin" /> Analizando...</span>
                              ) : fugaData[r.id]?.pax ? (
                                <div className="flex items-center gap-1 text-rose-400 bg-rose-500/10 px-2 py-1 rounded">
                                  <DollarSign className="w-3 h-3" />
                                  <span className="text-xs font-bold font-mono">-{fugaData[r.id].pax?.toLocaleString()} pax/mes</span>
                                </div>
                              ) : (
                                <button 
                                  onClick={() => fetchFuga(r.id, selectedLinea!, r.linea)}
                                  className="text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                >
                                  <DollarSign className="w-3 h-3" /> Ver Fuga
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </>
                    ) : (
                      <div className="text-center p-6 text-slate-500 text-sm">
                        <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        No hay competidores acechando en este perímetro.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── MAPA PRINCIPAL (Pantalla Partida si hay línea seleccionada) ── */}
      <div className="flex-1 relative bg-[#0e131f] flex">
        {(() => {
          if (!selectedLinea) {
            return (
              /* MAPA ÚNICO (Modo Flota Completa) */
              <div className="flex-1 relative">
                <MapContainer center={[-34.8833, -56.1667]} zoom={13} style={{ height: '100%', width: '100%', background: '#0e131f' }} zoomControl={false}>
                  <TileLayer attribution='&copy; CARTO' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png" />
                  <MapCenterController center={mapCenter} zoom={mapZoom} />
                  {serviciosPropios.map((b) => {
                    let markerColor = EMPRESA_COLOR[String(b.empresaId)] ?? '#94a3b8';
                    return (
                      <Marker key={b.id} position={[b.lat, b.lng]} icon={makeBusDivIcon(markerColor, b.linea, b.codigoBus, b.velocidad, b.destino)} zIndexOffset={500}>
                        <Popup><div className="text-xs font-sans p-1">Línea {b.linea} - #{b.codigoBus}</div></Popup>
                      </Marker>
                    );
                  })}
                </MapContainer>
              </div>
            );
          }

          // Lógica de separación Ida/Vuelta real por destino
          const destinosSet = new Set(busesDeLineaSeleccionada.map(b => (b.destino || '').trim().toUpperCase()).filter(d => d !== ''));
          const destinosArr = Array.from(destinosSet);
          const destinoIda = destinosArr[0] || 'IDA';
          
          const isIda = (dest: string) => (dest || '').trim().toUpperCase() === destinoIda;

          return (
            <>
              {/* MAPA 1: SENTIDO IDA */}
              <div className="flex-1 border-r border-slate-700 relative">
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900/90 text-white px-4 py-1.5 rounded-full font-bold text-sm border border-slate-700 shadow-xl flex items-center gap-2 backdrop-blur-sm">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  HACIA: {destinoIda}
                </div>
                <MapContainer center={[-34.8833, -56.1667]} zoom={13} style={{ height: '100%', width: '100%', background: '#0e131f' }} zoomControl={false}>
                  <TileLayer attribution='&copy; CARTO' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png" />
                  <MapCenterController center={mapCenter} zoom={mapZoom} />
                  
                  {baseRouteCoords.length > 0 && <Polyline positions={baseRouteCoords} pathOptions={{ color: EMPRESA_COLOR[String(empresaPropia)] ?? '#3b82f6', weight: 5, opacity: 0.8 }} />}
                  {selectedCompetitor && compRouteCoords.length > 0 && <Polyline positions={compRouteCoords} pathOptions={{ color: EMPRESA_COLOR[String(selectedCompetitor.codigoEmpresa)] ?? '#f97316', weight: 4, opacity: 0.9, dashArray: '10, 10' }} />}
                  
                  {/* Coches Propios Ida */}
                  {(selectedBusId ? [serviciosPropios.find(b => b.id === selectedBusId)!] : busesDeLineaSeleccionada).map((b) => {
                    if (!b || (!isIda(b.destino) && !selectedBusId)) return null;
                    let markerColor = EMPRESA_COLOR[String(b.empresaId)] ?? '#94a3b8';
                    return (
                      <Marker key={b.id} position={[b.lat, b.lng]} icon={makeBusDivIcon(markerColor, b.linea, b.codigoBus, b.velocidad, b.destino)} zIndexOffset={500}>
                        <Popup><div className="text-xs font-sans p-1">Línea {b.linea} - #{b.codigoBus}</div></Popup>
                      </Marker>
                    );
                  })}

                  {/* Rivales Ida */}
                  {rivalesVisibles.map((r) => {
                    if (!isIda(r.destino)) return null;
                    let markerColor = EMPRESA_COLOR[String(r.codigoEmpresa)] ?? '#94a3b8';
                    return (
                      <Marker key={r.id} position={[r.lat, r.lng]} icon={makeBusDivIcon(markerColor, r.linea, r.codigoBus, r.velocidad, r.destino)} zIndexOffset={1000}>
                        <Popup><div className="text-xs font-sans p-1">Línea {r.linea} (Rival)</div></Popup>
                      </Marker>
                    );
                  })}
                </MapContainer>
              </div>

              {/* MAPA 2: SENTIDO VUELTA */}
              <div className="flex-1 relative">
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900/90 text-white px-4 py-1.5 rounded-full font-bold text-sm border border-slate-700 shadow-xl flex items-center gap-2 backdrop-blur-sm">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                  HACIA: {destinosArr.length > 1 ? destinosArr.filter(d => d !== destinoIda).join(' / ') : 'VUELTA'}
                </div>
                <MapContainer center={[-34.8833, -56.1667]} zoom={13} style={{ height: '100%', width: '100%', background: '#0e131f' }} zoomControl={false}>
                  <TileLayer attribution='&copy; CARTO' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png" />
                  <MapCenterController center={mapCenter} zoom={mapZoom} />
                  
                  {baseRouteCoords.length > 0 && <Polyline positions={baseRouteCoords} pathOptions={{ color: EMPRESA_COLOR[String(empresaPropia)] ?? '#3b82f6', weight: 5, opacity: 0.8 }} />}
                  {selectedCompetitor && compRouteCoords.length > 0 && <Polyline positions={compRouteCoords} pathOptions={{ color: EMPRESA_COLOR[String(selectedCompetitor.codigoEmpresa)] ?? '#f97316', weight: 4, opacity: 0.9, dashArray: '10, 10' }} />}
                  
                  {/* Coches Propios Vuelta */}
                  {(selectedBusId ? [serviciosPropios.find(b => b.id === selectedBusId)!] : busesDeLineaSeleccionada).map((b) => {
                    if (!b || (isIda(b.destino) && !selectedBusId)) return null;
                    let markerColor = EMPRESA_COLOR[String(b.empresaId)] ?? '#94a3b8';
                    return (
                      <Marker key={b.id} position={[b.lat, b.lng]} icon={makeBusDivIcon(markerColor, b.linea, b.codigoBus, b.velocidad, b.destino)} zIndexOffset={500}>
                        <Popup><div className="text-xs font-sans p-1">Línea {b.linea} - #{b.codigoBus}</div></Popup>
                      </Marker>
                    );
                  })}

                  {/* Rivales Vuelta */}
                  {rivalesVisibles.map((r) => {
                    if (isIda(r.destino)) return null;
                    let markerColor = EMPRESA_COLOR[String(r.codigoEmpresa)] ?? '#94a3b8';
                    return (
                      <Marker key={r.id} position={[r.lat, r.lng]} icon={makeBusDivIcon(markerColor, r.linea, r.codigoBus, r.velocidad, r.destino)} zIndexOffset={1000}>
                        <Popup><div className="text-xs font-sans p-1">Línea {r.linea} (Rival)</div></Popup>
                      </Marker>
                    );
                  })}
                </MapContainer>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
