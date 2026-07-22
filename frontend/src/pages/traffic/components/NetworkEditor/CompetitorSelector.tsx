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
  );
};
