import React from 'react';
import { Flame, Clock, ArrowRight, ShieldAlert, Zap } from 'lucide-react';
import type { HotspotOptimizationData } from './types';

interface HotspotInterleavingProps {
  hotspotData: HotspotOptimizationData | null;
  isLoading: boolean;
}

export const HotspotInterleaving: React.FC<HotspotInterleavingProps> = ({ hotspotData, isLoading }) => {
  if (isLoading) {
    return (
      <div className="mt-4 bg-slate-800/30 border border-slate-700 rounded-xl p-6 flex flex-col items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
        <p className="text-sm text-slate-400">Analizando cruces horarios en el hotspot...</p>
      </div>
    );
  }

  if (!hotspotData || !hotspotData.hotspot) {
    return null;
  }

  const { hotspot, scheduleCrossings, baseTravelTimeMinutes } = hotspotData;

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-1.5 bg-rose-500/20 rounded-lg">
          <Flame className="w-5 h-5 text-rose-500" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">4. Optimización Táctica (Anti-Bunching)</h2>
          <p className="text-xs text-slate-400">
            Punto Caliente (Epicentro): <span className="text-rose-400 font-semibold">{hotspot.stop_name}</span> (Aprox. {hotspot.total_boardings.toLocaleString()} pasajeros)
          </p>
        </div>
      </div>

      {scheduleCrossings.length === 0 ? (
        <div className="bg-emerald-900/10 border border-emerald-900/50 rounded-xl p-6 text-center">
          <Zap className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
          <h3 className="text-emerald-400 font-medium">Cobertura Limpia</h3>
          <p className="text-sm text-slate-400">No se detectaron robos de carga (Bunching) del competidor en este hotspot.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {scheduleCrossings.map((cross, idx) => (
            <div key={idx} className="bg-slate-900/80 border border-rose-500/30 rounded-xl p-4 relative overflow-hidden group hover:border-rose-500/60 transition-colors">
              
              <div className="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>
              
              <div className="flex justify-between items-start mb-3 pl-2">
                <div className="flex items-center gap-1 text-rose-400 text-xs font-bold uppercase tracking-wider">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Robo de Carga
                </div>
                <div className="px-2 py-0.5 bg-rose-500/10 text-rose-300 rounded text-xs font-mono font-bold">
                  Gap: -{cross.gap_minutes} min
                </div>
              </div>

              <div className="pl-2 mb-4 space-y-2">
                <div className="flex justify-between items-center text-sm border-b border-slate-700/50 pb-2">
                  <span className="text-slate-400">Competidor llega:</span>
                  <span className="font-mono text-white font-bold">{cross.comp_arrival}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">Tu llegada:</span>
                  <span className="font-mono text-slate-300">{cross.base_arrival}</span>
                </div>
              </div>

              {cross.tactical_advice && (
                <div className="bg-slate-800/50 rounded-lg p-3 pl-4 border border-slate-700 relative">
                  <div className="absolute top-1/2 left-0 -translate-y-1/2 -ml-[1px] w-[2px] h-3/4 bg-indigo-500 rounded-r-full"></div>
                  <h4 className="text-xs font-semibold text-indigo-400 mb-2 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Offset Táctico Recomendado
                  </h4>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex flex-col">
                      <span className="text-slate-500">Salida actual</span>
                      <span className="font-mono text-slate-300 line-through opacity-70">{cross.tactical_advice.current_origin_departure}</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-600" />
                    <div className="flex flex-col text-right">
                      <span className="text-slate-500">Nueva Salida</span>
                      <span className="font-mono text-indigo-400 font-bold text-sm bg-indigo-500/10 px-1 rounded">
                        {cross.tactical_advice.recommended_origin_departure}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 text-[10px] text-slate-500 text-center">
                    (Tiempo estimado al hotspot: {baseTravelTimeMinutes} min)
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
