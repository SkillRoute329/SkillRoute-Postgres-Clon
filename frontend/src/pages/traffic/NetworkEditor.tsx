import React, { useState, useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, MapPin, Activity, Search, Check, Route, Network, TrendingUp, TrendingDown } from 'lucide-react';
import api from '../../services/api';
import { getNavigationLineas, getNavigationLineaData } from '../../features/navigation/services/navigationDataService';
import { calculateTotalDistance, calculateSharedDistance } from '../../utils/geoUtils';
import toast from 'react-hot-toast';

// ─── COMPONENTE SECUNDARIO ──────────────────────────────────────────────────

function MapBoundsFitter({ bounds }: { bounds: [number, number][] | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds as any, { padding: [50, 50] });
    }
  }, [bounds, map]);
  return null;
}

// ─── INTERFACES ───────────────────────────────────────────────────────────────

interface CompetitorInfo {
  base_route_id: string;
  base_direction_id: number;
  competitor_route_id: string;
  competitor_direction_id: number;
  shared_stops_count: number;
  overlap_score: number | null;
}

interface MonthlyTrend {
  month: string;
  boarding: number;
}

interface TrendData {
  base_line: {
    route_id: string;
    selected_direction: number;
    trend_ida: MonthlyTrend[];
    trend_vuelta: MonthlyTrend[];
    trend_total: MonthlyTrend[];
  };
  competitor_line: {
    route_id: string;
    direction_id: number;
    trend: MonthlyTrend[];
  } | null;
  message: string;
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

const renderEvolution = (trendList: MonthlyTrend[]) => {
  if (!trendList || trendList.length < 2) return null;
  const last = trendList[trendList.length - 1].boarding;
  const prev = trendList[trendList.length - 2].boarding;
  const diff = last - prev;
  if (prev === 0) return null;
  const pct = (diff / prev) * 100;
  const isPos = diff > 0;
  
  return (
    <div className="flex-1 pl-4">
      <div className="text-xs uppercase text-slate-500 font-semibold mb-1">Evolución Mes a Mes</div>
      <div className={`text-lg font-bold font-mono flex items-center gap-2 ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
        {isPos ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
        <span>{isPos ? '+' : ''}{diff.toLocaleString()} ({isPos ? '+' : ''}{pct.toFixed(2)}%)</span>
      </div>
    </div>
  );
};

const formatMonthName = (yyyyMm: string) => {
  if (!yyyyMm) return '';
  const [year, month] = yyyyMm.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  const monthName = date.toLocaleString('es-UY', { month: 'long' });
  return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`;
};

const CompetitiveAnalysis: React.FC = () => {
  const [allLineas, setAllLineas] = useState<any[]>([]);
  const [ucotLineas, setUcotLineas] = useState<any[]>([]);
  const [selectedLinea, setSelectedLinea] = useState<string>('');

  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);
  const [competitorCoordinates, setCompetitorCoordinates] = useState<[number, number][]>([]);
  
  const [routeStops, setRouteStops] = useState<any[]>([]);
  const [competitorStops, setCompetitorStops] = useState<any[]>([]);
  
  const [competitors, setCompetitors] = useState<CompetitorInfo[]>([]);
  const [selectedCompetitor, setSelectedCompetitor] = useState<CompetitorInfo | null>(null);
  
  const [trends, setTrends] = useState<TrendData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [minOverlap, setMinOverlap] = useState<number>(10);
  const [maxOverlap, setMaxOverlap] = useState<number>(50);

  const [baseDistance, setBaseDistance] = useState<number>(0);
  const [compDistance, setCompDistance] = useState<number>(0);
  const [sharedDistance, setSharedDistance] = useState<number>(0);

  useEffect(() => {
    const fetchLineas = async () => {
      try {
        const [coetc, come, cutcsa, ucot] = await Promise.all([
          getNavigationLineas(10),
          getNavigationLineas(20),
          getNavigationLineas(50),
          getNavigationLineas(70)
        ]);
        
        const combinadas = [...coetc, ...come, ...cutcsa, ...ucot];
        setAllLineas(combinadas);
        setUcotLineas(ucot);
      } catch (err) {
        toast.error('Error al cargar catálogo de líneas');
      }
    };
    fetchLineas();
  }, []);

  useEffect(() => {
    if (!selectedLinea) {
      setRouteCoordinates([]);
      setRouteStops([]);
      setCompetitors([]);
      setSelectedCompetitor(null);
      setTrends(null);
      return;
    }

    const loadData = async () => {
      setIsLoading(true);
      try {
        const isVuelta = selectedLinea.toLowerCase().endsWith('b');
        const directionId = isVuelta ? 1 : 0;
        const baseRouteId = selectedLinea.replace(/[ab]$/i, '');

        const lineData = await getNavigationLineaData(70, selectedLinea);
        if (lineData && lineData.recorrido) {
           const coords = lineData.recorrido.map((c: any) => [c.lat, c.lng]);
           setRouteCoordinates(coords);
           setRouteStops(lineData.paradas || []);
           setBaseDistance(calculateTotalDistance(coords));
        } else {
          setRouteCoordinates([]);
          setRouteStops([]);
          setBaseDistance(0);
        }

        const compRes = await api.get(`/intelligence/competitors?route_id=${baseRouteId}&direction_id=${directionId}`);
        setCompetitors(compRes.data);
        
        if (compRes.data.length > 0) {
          const maxStops = Math.max(...compRes.data.map((c: any) => c.shared_stops_count));
          setMaxOverlap(maxStops);
          const validComps = compRes.data.filter((c: any) => c.shared_stops_count >= minOverlap);
          if (validComps.length > 0) {
            setSelectedCompetitor(validComps[0]);
          } else {
            setSelectedCompetitor(null);
            setTrends(null);
          }
        } else {
          setMaxOverlap(50);
          setSelectedCompetitor(null);
          setTrends(null);
        }

      } catch (err) {
        console.error(err);
        toast.error('Error al cargar inteligencia competitiva');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [selectedLinea, allLineas]);

  useEffect(() => {
    if (!selectedCompetitor) return;
    if (selectedCompetitor.shared_stops_count < minOverlap) {
      const validComps = competitors.filter(c => c.shared_stops_count >= minOverlap);
      if (validComps.length > 0) {
        setSelectedCompetitor(validComps[0]);
      } else {
        setSelectedCompetitor(null);
        setTrends(null);
      }
    }
  }, [minOverlap, competitors, selectedCompetitor]);

  useEffect(() => {
    if (!selectedLinea || !selectedCompetitor) {
      setCompetitorCoordinates([]);
      setCompetitorStops([]);
      return;
    }

    const loadCompetitorDetails = async () => {
      try {
        const isVuelta = selectedLinea.toLowerCase().endsWith('b');
        const directionId = isVuelta ? 1 : 0;
        const baseRouteId = selectedLinea.replace(/[ab]$/i, '');

        const trendRes = await api.get(
          `/intelligence/trends?route_id=${baseRouteId}&direction_id=${directionId}&competitor_route_id=${selectedCompetitor.competitor_route_id}&competitor_direction_id=${selectedCompetitor.competitor_direction_id}`
        );
        setTrends(trendRes.data);

        const compId = selectedCompetitor.competitor_route_id + (selectedCompetitor.competitor_direction_id === 1 ? 'b' : 'a');
        const compInfo = allLineas.find(l => l.codigo.toLowerCase() === compId.toLowerCase());
        
        const mapAgency: Record<string, number> = { 'COETC': 10, 'COME': 20, 'CUTCSA': 50, 'UCOT': 70 };
        const compAgencyId = mapAgency[compInfo?.empresa || ''] || 50;

        const compLineData = await getNavigationLineaData(compAgencyId, compId);
        if (compLineData && compLineData.recorrido) {
          const compCoords = compLineData.recorrido.map((c: any) => [c.lat, c.lng]);
          setCompetitorCoordinates(compCoords);
          setCompetitorStops(compLineData.paradas || []);
          
          setCompDistance(calculateTotalDistance(compCoords));
          setSharedDistance(calculateSharedDistance(routeCoordinates, compCoords, 0.05));
        } else {
          setCompetitorCoordinates([]);
          setCompetitorStops([]);
          setCompDistance(0);
          setSharedDistance(0);
        }
      } catch (err) {
        toast.error('Error cargando detalles del competidor');
      }
    };

    loadCompetitorDetails();
  }, [selectedCompetitor, selectedLinea, allLineas, routeCoordinates]);

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200">
      <div className="flex-none p-6 border-b border-slate-700 bg-slate-800/50 backdrop-blur">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-indigo-500/20 rounded-lg">
            <Network className="w-6 h-6 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Inteligencia Competitiva</h1>
        </div>
        <p className="text-sm text-slate-400">Análisis de solapamiento espacial y carga de boletos mensual entre operadores del STM.</p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-1/3 min-w-[350px] max-w-[450px] border-r border-slate-700 bg-slate-800/30 flex flex-col overflow-y-auto">
          <div className="p-6 border-b border-slate-700/50 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">1. Seleccionar Línea y Destino</h2>
            <div className="flex gap-2">
              <div className="flex-1">
                <select
                  value={selectedLinea}
                  onChange={(e) => setSelectedLinea(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md py-2 px-3 text-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Elija una línea y destino --</option>
                  {ucotLineas.map((l, index) => {
                    const rawCode = l.codigo.replace(/[ab]$/i, '');
                    const dest = l.destino || l.nombre.split('·')[1]?.trim() || l.nombre;
                    return (
                      <option key={`${l.id}_${index}`} value={l.codigo}>
                        Línea {rawCode} hacia {dest} ({l.sentido})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            {selectedLinea && competitors.length > 0 && (
              <div className="pt-2">
                <div className="flex justify-between text-xs text-slate-400 mb-2">
                  <span>Filtrar por Solapamiento (Mínimo de paradas)</span>
                  <span className="font-mono text-indigo-400">{minOverlap} paradas</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max={maxOverlap} 
                  value={minOverlap}
                  onChange={(e) => setMinOverlap(parseInt(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>
            )}
          </div>

          <div className="p-6 flex-1 flex flex-col">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">2. Competidores Detectados (Mismo Sentido)</h2>
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
              </div>
            ) : !selectedLinea ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 text-center bg-slate-900/50 rounded-xl border border-dashed border-slate-700">
                <Search className="w-8 h-8 mb-3 opacity-50" />
                <p className="text-sm">Seleccione una línea para analizar su ecosistema competitivo.</p>
              </div>
            ) : competitors.filter((c: any) => c.shared_stops_count >= minOverlap).length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-emerald-500 p-8 text-center bg-emerald-900/10 rounded-xl border border-dashed border-emerald-900/50">
                <Check className="w-8 h-8 mb-3 opacity-50" />
                <p className="text-sm">No se detectaron competidores con ese nivel de solapamiento.</p>
              </div>
            ) : (
              <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {competitors.filter((c: any) => c.shared_stops_count >= minOverlap).map((comp, idx) => {
                  const compId = comp.competitor_route_id + (comp.competitor_direction_id === 1 ? 'b' : 'a');
                  const compInfo = allLineas.find(l => l.codigo.toLowerCase() === compId.toLowerCase());
                  const dest = compInfo ? (compInfo.destino || compInfo.nombre.split('·')[1]?.trim() || compInfo.nombre) : '';
                  return (
                  <button
                    key={`${comp.competitor_route_id}-${comp.competitor_direction_id}`}
                    onClick={() => setSelectedCompetitor(comp)}
                    className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                      selectedCompetitor?.competitor_route_id === comp.competitor_route_id
                        ? 'bg-indigo-900/40 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.1)]'
                        : 'bg-slate-900/50 border-slate-700/50 hover:border-slate-600 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex flex-col gap-1 pr-2">
                        <span className="px-2 py-0.5 bg-slate-700 rounded text-xs font-bold font-mono w-max">
                          Línea {comp.competitor_route_id}
                        </span>
                        <span className="text-xs text-slate-400 leading-tight">
                          hacia {dest || 'Destino desconocido'}
                        </span>
                      </div>
                      <span className="text-2xl font-bold text-white leading-none">#{idx + 1}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <MapPin className="w-4 h-4 text-rose-400" />
                      <span>{comp.shared_stops_count} paradas compartidas</span>
                    </div>
                  </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col relative bg-[#1a1c23] min-h-0">
          <div className="flex-none h-[40%] min-h-[300px] relative">
            <MapContainer center={[-34.8833, -56.1667]} zoom={13} zoomControl={false} className="h-full w-full">
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
              {routeCoordinates.length > 0 && (
                <>
                  <Polyline positions={routeCoordinates} color="#6366f1" weight={5} opacity={0.9} />
                  {routeStops.map((stop, idx) => (
                    <CircleMarker 
                      key={`base-stop-${idx}`} 
                      center={[stop.lat, stop.lng]} 
                      radius={4} 
                      color="#4f46e5" 
                      fillColor="#6366f1" 
                      fillOpacity={1}
                      weight={2}
                    >
                      <Popup className="text-slate-900 font-sans">
                        <div className="font-bold text-sm mb-1">{stop.nombre}</div>
                        <div className="text-xs text-slate-500">Parada ID: {stop.id}</div>
                      </Popup>
                    </CircleMarker>
                  ))}
                  <MapBoundsFitter bounds={routeCoordinates} />
                </>
              )}
              {competitorCoordinates.length > 0 && (
                <>
                  <Polyline positions={competitorCoordinates} color="#f43f5e" weight={3} opacity={0.7} dashArray="10, 10" />
                  {competitorStops.map((stop, idx) => (
                    <CircleMarker 
                      key={`comp-stop-${idx}`} 
                      center={[stop.lat, stop.lng]} 
                      radius={3} 
                      color="#be123c" 
                      fillColor="#f43f5e" 
                      fillOpacity={0.8}
                      weight={1}
                    >
                      <Popup className="text-slate-900 font-sans">
                        <div className="font-bold text-sm mb-1">{stop.nombre}</div>
                        <div className="text-xs text-slate-500">Parada ID: {stop.id}</div>
                      </Popup>
                    </CircleMarker>
                  ))}
                </>
              )}
            </MapContainer>
            <div className="absolute top-4 right-4 z-[400] bg-slate-900/80 backdrop-blur border border-slate-700 rounded-lg p-3 shadow-lg pointer-events-none">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <div className="w-4 h-4 rounded-full bg-indigo-500"></div>
                Línea Base: {selectedLinea ? `${selectedLinea.replace(/[ab]$/i, '')} (${selectedLinea.toLowerCase().endsWith('b') ? 'Vuelta' : 'Ida'})` : 'Ninguna'}
              </div>
            </div>
          </div>

          <div className="flex-1 border-t border-slate-700 bg-slate-900 p-6 flex flex-col overflow-y-auto custom-scrollbar">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex-none mb-6 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              3. Tendencias de Censo (Mensual)
            </h2>

            {trends ? (
              <div className="flex flex-col xl:flex-row gap-6 min-h-min pb-6">
                <div className="flex-1 bg-slate-800/50 rounded-xl border border-slate-700 p-6 flex flex-col">
                  <div className="text-sm text-slate-400 mb-1">Impacto en Nuestra Línea</div>
                  <div className="text-2xl font-bold text-white mb-4">
                    Línea {trends.base_line.route_id}
                    <div className="text-sm font-normal text-slate-400 mt-1 line-clamp-2 leading-tight">
                      {ucotLineas.find(l => l.codigo === selectedLinea)?.nombre || ''}
                    </div>
                  </div>
                  <div className="flex gap-4 mb-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
                    <div className="flex-1 border-r border-slate-700/50 pr-4">
                      <div className="text-[10px] uppercase text-slate-500 font-semibold mb-1">Total Recorrido</div>
                      <div className="text-sm font-mono text-white flex items-center gap-1.5">
                        <Route className="w-3.5 h-3.5 text-indigo-400" />
                        {baseDistance.toFixed(1)} km
                      </div>
                    </div>
                    {renderEvolution(trends.base_line.trend_total)}
                  </div>
                  
                  {/* GLOBAL KPI (MACRO) */}
                  <div className="mb-4 bg-slate-900/80 rounded-lg p-3 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.05)]">
                    <div className="text-[10px] uppercase text-indigo-400 font-bold mb-2">CONSOLIDADO GLOBAL (IDA + VUELTA)</div>
                    <div className="flex flex-col gap-2">
                      {[...trends.base_line.trend_total].reverse().map((t) => (
                        <div key={`total-${t.month}`} className="w-full">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-300 font-medium">{formatMonthName(t.month)}</span>
                            <span className="font-mono text-white font-bold">{t.boarding.toLocaleString()} pax</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-indigo-400 rounded-full" 
                              style={{ width: `${Math.min((t.boarding / 1000000) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* DESGLOSE DIRECCIONAL (MICRO) */}
                  <div className="flex gap-4 mt-auto">
                    {/* IDA */}
                    <div className="flex-1 bg-slate-900/40 rounded-lg p-3 border border-slate-700/50">
                      <div className="text-[10px] uppercase text-slate-500 font-bold mb-2">Sentido Ida</div>
                      <div className="flex flex-col gap-2">
                        {[...trends.base_line.trend_ida].reverse().map((t) => (
                          <div key={`ida-${t.month}`} className="w-full">
                            <div className="flex justify-between text-[10px] mb-1">
                              <span className="text-slate-400">{formatMonthName(t.month).split(' ')[0]}</span>
                              <span className="font-mono text-indigo-300">{t.boarding.toLocaleString()}</span>
                            </div>
                            <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min((t.boarding / 500000) * 100, 100)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* VUELTA */}
                    <div className="flex-1 bg-slate-900/40 rounded-lg p-3 border border-slate-700/50">
                      <div className="text-[10px] uppercase text-slate-500 font-bold mb-2">Sentido Vuelta</div>
                      <div className="flex flex-col gap-2">
                        {[...trends.base_line.trend_vuelta].reverse().map((t) => (
                          <div key={`vuelta-${t.month}`} className="w-full">
                            <div className="flex justify-between text-[10px] mb-1">
                              <span className="text-slate-400">{formatMonthName(t.month).split(' ')[0]}</span>
                              <span className="font-mono text-indigo-300">{t.boarding.toLocaleString()}</span>
                            </div>
                            <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min((t.boarding / 500000) * 100, 100)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Línea Competidora */}
                {trends.competitor_line && (
                    <div className="flex-1 bg-slate-800/50 rounded-xl border border-slate-700 p-6 flex flex-col">
                      <div className="text-sm text-slate-400 mb-1">Fuga de Carga hacia</div>
                      <div className="text-2xl font-bold text-white mb-4">
                        Línea {trends.competitor_line.route_id}
                        <div className="text-sm font-normal text-slate-400 mt-1 line-clamp-2 leading-tight">
                          {(() => {
                            const compId = trends.competitor_line.route_id + (trends.competitor_line.direction_id === 1 ? 'b' : 'a');
                            return allLineas.find(l => l.codigo.toLowerCase() === compId.toLowerCase())?.nombre || '';
                          })()}
                        </div>
                      </div>

                      <div className="flex gap-4 mb-6 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
                        <div className="flex-1 border-r border-slate-700/50 pr-4">
                          <div className="text-[10px] uppercase text-slate-500 font-semibold mb-1">Total Recorrido</div>
                          <div className="text-sm font-mono text-white flex items-center gap-1.5">
                            <Route className="w-3.5 h-3.5 text-rose-400" />
                            {compDistance.toFixed(1)} km
                          </div>
                        </div>
                        <div className="flex-1 pl-2 border-r border-slate-700/50 pr-4">
                          <div className="text-[10px] uppercase text-slate-500 font-semibold mb-1">Solapamiento</div>
                          <div className="text-sm font-mono text-emerald-400 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5" />
                            {sharedDistance.toFixed(1)} km
                          </div>
                        </div>
                        {renderEvolution(trends.competitor_line.trend)}
                      </div>
                      
                      <div className="flex-1 flex flex-col justify-start gap-2">
                      {[...trends.competitor_line.trend].reverse().map((t) => (
                        <div key={t.month} className="w-full">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-400">{formatMonthName(t.month)}</span>
                            <span className="font-mono text-rose-400">{t.boarding.toLocaleString()} pax</span>
                          </div>
                          <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-rose-500 rounded-full" 
                              style={{ width: `${(t.boarding / 60000) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500">
                Seleccione un competidor en el panel izquierdo para ver la comparativa.
              </div>
            )}
            
            {trends?.message && (
              <div className="mt-4 p-3 bg-indigo-900/20 border border-indigo-500/30 rounded-lg flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-indigo-400 flex-none mt-0.5" />
                <p className="text-sm text-indigo-300/80">{trends.message}</p>
              </div>
            )}

          </div>

        </div>
      </div>
    </div>
  );
};

export default CompetitiveAnalysis;
