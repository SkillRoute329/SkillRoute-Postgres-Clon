import React, { useState, useEffect, useMemo } from 'react';
import { Network } from 'lucide-react';
import api from '../../services/api';
import { getNavigationLineas, getNavigationLineaData } from '../../features/navigation/services/navigationDataService';
import { useAuth } from '../../context/AuthContext';
import { calculateTotalDistance, calculateSharedDistance } from '../../utils/geoUtils';
import toast from 'react-hot-toast';

import type { CompetitorInfo, TrendData, LineaCatalogInfo } from './components/NetworkEditor/types';
import { CompetitiveMap } from './components/NetworkEditor/CompetitiveMap';
import { TrendCharts, renderHeaderEvolution } from './components/NetworkEditor/TrendCharts';
import { CompetitorSelector } from './components/NetworkEditor/CompetitorSelector';

const CompetitiveAnalysis: React.FC = () => {
  const [allLineas, setAllLineas] = useState<LineaCatalogInfo[]>([]);
  const [selectedLinea, setSelectedLinea] = useState<string>('');

  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);
  const [competitorCoordinates, setCompetitorCoordinates] = useState<[number, number][]>([]);
  
  const [routeStops, setRouteStops] = useState<any[]>([]);
  const [competitorStops, setCompetitorStops] = useState<any[]>([]);
  
  const [competitors, setCompetitors] = useState<CompetitorInfo[]>([]);
  const [selectedCompetitor, setSelectedCompetitor] = useState<CompetitorInfo | null>(null);
  
  const [trends, setTrends] = useState<TrendData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { user } = useAuth();
  
  const isAdmin = user?.role === 'ADMIN' || user?.rol === 'ADMIN';
  const userEmpresaStr = (user?.empresa as string) || (localStorage.getItem('skillroute.empresaPropia') as string) || 'UCOT';
  
  const allowedLineas = useMemo(() => {
    if (isAdmin) return allLineas;
    return allLineas.filter(l => l.empresa?.toUpperCase() === userEmpresaStr.toUpperCase());
  }, [allLineas, isAdmin, userEmpresaStr]);

  const [minOverlap, setMinOverlap] = useState<number>(10);
  const [maxOverlap, setMaxOverlap] = useState<number>(50);

  const [baseDistance, setBaseDistance] = useState<number>(0);
  const [compDistance, setCompDistance] = useState<number>(0);
  const [sharedDistance, setSharedDistance] = useState<number>(0);

  // Mapeo dinámico y configurable de agencias
  const AGENCY_MAP: Record<string, number> = { 'COETC': 10, 'COME': 20, 'CUTCSA': 50, 'UCOT': 70 };
  const OVERLAP_THRESHOLD_KM = 0.05; // Extraído de hardcode

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
        
        // El id de agencia base lo inferimos de la línea seleccionada
        const currentLineObj = allLineas.find(l => l.codigo === selectedLinea);
        const baseAgencyId = currentLineObj ? (AGENCY_MAP[currentLineObj.empresa] || 50) : 70;

        const lineData = await getNavigationLineaData(baseAgencyId, selectedLinea);
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
        
        const compAgencyId = AGENCY_MAP[compInfo?.empresa || ''] || 50;

        const compLineData = await getNavigationLineaData(compAgencyId, compId);
        if (compLineData && compLineData.recorrido) {
          const compCoords = compLineData.recorrido.map((c: any) => [c.lat, c.lng]);
          setCompetitorCoordinates(compCoords);
          setCompetitorStops(compLineData.paradas || []);
          
          setCompDistance(calculateTotalDistance(compCoords));
          setSharedDistance(calculateSharedDistance(routeCoordinates, compCoords, OVERLAP_THRESHOLD_KM));
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
      {/* HEADER SECTION */}
      <div className="flex-none px-4 py-3 md:px-6 md:py-4 border-b border-slate-700 bg-slate-800/50 backdrop-blur flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2 lg:gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-1.5 bg-indigo-500/20 rounded-lg">
              <Network className="w-5 h-5 text-indigo-400" />
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">Inteligencia Competitiva</h1>
          </div>
          <p className="text-xs md:text-sm text-slate-400">Análisis de solapamiento espacial y carga de boletos mensual entre operadores del STM.</p>
        </div>

        {trends && (
          <div className="flex items-center gap-4 animate-in fade-in slide-in-from-right-4 duration-500">
            {renderHeaderEvolution(trends.base_line.trend_total, `Línea ${trends.base_line.route_id} (Total)`)}
            {trends.competitor_line && renderHeaderEvolution(trends.competitor_line.trend, `Fuga a ${trends.competitor_line.route_id}`)}
          </div>
        )}
      </div>

      {/* CONTENT LAYOUT */}
      <div className="flex-1 flex overflow-hidden flex-col md:flex-row">
        {/* SIDEBAR SELECTOR */}
        <CompetitorSelector
          selectedLinea={selectedLinea}
          setSelectedLinea={setSelectedLinea}
          allowedLineas={allowedLineas}
          allLineas={allLineas}
          competitors={competitors}
          selectedCompetitor={selectedCompetitor}
          setSelectedCompetitor={setSelectedCompetitor}
          minOverlap={minOverlap}
          setMinOverlap={setMinOverlap}
          maxOverlap={maxOverlap}
          isLoading={isLoading}
        />

        {/* MAP & CHARTS AREA */}
        <div className="flex-1 flex flex-col relative bg-[#1a1c23] min-h-0">
          <CompetitiveMap
            routeCoordinates={routeCoordinates}
            routeStops={routeStops}
            competitorCoordinates={competitorCoordinates}
            competitorStops={competitorStops}
            selectedLinea={selectedLinea}
          />

          <div className="flex-1 border-t border-slate-700 bg-slate-900 p-6 flex flex-col overflow-y-auto custom-scrollbar">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex-none mb-6 flex items-center gap-2">
              <Network className="w-4 h-4" />
              3. Tendencias de Censo (Mensual)
            </h2>
            
            <TrendCharts
              trends={trends}
              baseDistance={baseDistance}
              compDistance={compDistance}
              sharedDistance={sharedDistance}
              allowedLineas={allowedLineas}
              selectedLinea={selectedLinea}
              allLineas={allLineas}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompetitiveAnalysis;
