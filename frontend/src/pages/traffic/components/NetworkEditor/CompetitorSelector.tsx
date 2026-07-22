import React from 'react';
import { Search, Check, MapPin } from 'lucide-react';
import type { CompetitorInfo, LineaCatalogInfo } from './types';

interface CompetitorSelectorProps {
  selectedLinea: string;
  setSelectedLinea: (linea: string) => void;
  allowedLineas: LineaCatalogInfo[];
  allLineas: LineaCatalogInfo[];
  competitors: CompetitorInfo[];
  selectedCompetitor: CompetitorInfo | null;
  setSelectedCompetitor: (comp: CompetitorInfo | null) => void;
  minOverlap: number;
  setMinOverlap: (val: number) => void;
  maxOverlap: number;
  isLoading: boolean;
}

export const CompetitorSelector: React.FC<CompetitorSelectorProps> = ({
  selectedLinea,
  setSelectedLinea,
  allowedLineas,
  allLineas,
  competitors,
  selectedCompetitor,
  setSelectedCompetitor,
  minOverlap,
  setMinOverlap,
  maxOverlap,
  isLoading
}) => {
  return (
    <div className="w-full md:w-1/3 md:min-w-[280px] md:max-w-[350px] border-b md:border-b-0 md:border-r border-slate-700 bg-slate-800/30 flex flex-col overflow-y-auto max-h-[300px] md:max-h-full">
      <div className="p-4 border-b border-slate-700/50 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">1. Seleccionar Línea y Destino</h2>
        <div className="flex gap-2">
          <div className="flex-1">
            <select
              value={selectedLinea}
              onChange={(e) => setSelectedLinea(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-md py-2 px-3 text-white focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">-- Elija una línea y destino --</option>
              {allowedLineas.map((l, index) => {
                const rawCode = l.codigo.replace(/[ab]$/i, '');
                const dest = l.destino || l.nombre.split('·')[1]?.trim() || l.nombre;
                return (
                  <option key={`${l.id}_${index}`} value={l.codigo}>
                    Línea {rawCode} hacia {dest} ({l.sentido}) - {l.empresa}
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

      <div className="p-4 flex-1 flex flex-col">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">2. Competidores Detectados (Mismo Sentido)</h2>
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
              
              const isSelected = selectedCompetitor?.competitor_route_id === comp.competitor_route_id && selectedCompetitor?.competitor_direction_id === comp.competitor_direction_id;
              
              const cti = comp.cannibalization_score || 0;
              let badgeColor = 'bg-slate-700 text-slate-300';
              let badgeText = 'Bajo';
              if (cti > 70) {
                badgeColor = 'bg-rose-500/20 text-rose-400 border border-rose-500/30';
                badgeText = 'Crítico';
              } else if (cti > 40) {
                badgeColor = 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
                badgeText = 'Medio';
              }

              return (
              <button
                key={`${comp.competitor_route_id}-${comp.competitor_direction_id}`}
                onClick={() => setSelectedCompetitor(comp)}
                className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                  isSelected
                    ? 'bg-indigo-500/10 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.1)]' 
                    : 'bg-slate-800/50 border-slate-700 hover:bg-slate-700/50 hover:border-slate-600'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold text-lg ${isSelected ? 'text-indigo-400' : 'text-slate-200'}`}>
                      {comp.competitor_route_id}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400">
                      {compInfo?.empresa || 'N/A'}
                    </span>
                  </div>
                  {comp.cannibalization_score !== undefined && (
                    <div className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${badgeColor}`} title={`Índice de Fuga: ${cti}/100`}>
                      Amenaza {badgeText} ({cti})
                    </div>
                  )}
                </div>
                <div className="text-sm text-slate-400 mb-3 truncate flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Hacia {dest || (comp.competitor_direction_id === 1 ? 'Vuelta' : 'Ida')}
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-900/50 rounded-lg p-2 flex flex-col justify-center border border-slate-700/50">
                    <span className="text-slate-500 font-medium">Solapamiento</span>
                    <span className="font-bold text-slate-200 font-mono text-sm">{comp.shared_stops_count} p.</span>
                  </div>
                  {comp.competitor_daily_trips ? (
                    <div className="bg-slate-900/50 rounded-lg p-2 flex flex-col justify-center border border-slate-700/50">
                      <span className="text-slate-500 font-medium">Frecuencia (Base | Rival)</span>
                      <span className="font-bold text-slate-200 font-mono text-xs mt-0.5">
                        <span className="text-indigo-400">{comp.base_daily_trips}</span> vs <span className="text-rose-400">{comp.competitor_daily_trips}</span> v/d
                      </span>
                    </div>
                  ) : (
                    <div className="bg-slate-900/50 rounded-lg p-2 flex flex-col justify-center border border-slate-700/50">
                      <span className="text-slate-500 font-medium">Overl. Score</span>
                      <span className="font-bold text-slate-200 font-mono text-sm">{comp.overlap_score ? comp.overlap_score.toFixed(2) : 'N/A'}</span>
                    </div>
                  )}
                </div>
              </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
