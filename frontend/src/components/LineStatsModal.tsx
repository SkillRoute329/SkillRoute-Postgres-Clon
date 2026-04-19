import React, { useEffect, useState } from 'react';
import { AIIntelligenceService, type AgentStatus } from '../services/aiIntelligenceService';
import { Activity, X, BarChart3, Clock, AlertTriangle, ShieldCheck, Bus } from 'lucide-react';

interface Props {
  onClose: () => void;
  filteredLineId?: string | null;
}

export const LineStatsModal: React.FC<Props> = ({ onClose, filteredLineId }) => {
  const [stats, setStats] = useState<Record<string, AgentStatus>>(() => ({
    ...AIIntelligenceService.getAllAgentsStats(),
  }));

  useEffect(() => {
    // Update every second to feel "live"
    const timer = setInterval(() => {
      setStats({ ...AIIntelligenceService.getAllAgentsStats() });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const agentsList = Object.values(stats)
    .filter((agent) => (filteredLineId ? agent.lineId === filteredLineId : true))
    .sort((a, b) => b.stats.criticalIncidents - a.stats.criticalIncidents);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 font-mono">
      <div className="w-full max-w-5xl rounded-2xl border border-white/10 bg-slate-900 shadow-2xl flex flex-col h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-slate-950/50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-widest text-white uppercase">
                Inteligencia Táctica / <span className="text-cyan-400">Estadísticas por Línea</span>
              </h2>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                Monitoreo en Tiempo Real (Agentes Autónomos)
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Cerrar estadísticas"
            aria-label="Cerrar estadísticas"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-950">
          {agentsList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
              <Activity className="h-12 w-12 opacity-20" />
              <span className="text-xs uppercase tracking-widest font-black">
                No hay agentes activos registrando datos aún.
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agentsList.map((agent) => {
                const total = agent.stats.totalScans || 1;
                const criticalPct = Math.round((agent.stats.criticalIncidents / total) * 100);
                const safePct = Math.round((agent.stats.safeScans / total) * 100);

                return (
                  <div
                    key={agent.lineId}
                    className="bg-slate-900/60 border border-white/5 rounded-xl p-4 flex flex-col gap-4 shadow-lg relative overflow-hidden group hover:border-cyan-500/30 transition-all"
                  >
                    {/* Background glow if critical */}
                    {criticalPct > 30 && (
                      <div className="absolute -inset-2 bg-red-500/5 blur-2xl rounded-full z-0 pointer-events-none group-hover:bg-red-500/10 transition-all"></div>
                    )}

                    {/* Header */}
                    <div className="flex justify-between items-start z-10">
                      <div>
                        <span className="text-xl font-black text-white">LÍNEA {agent.lineId}</span>
                        {agent.lastCorridor && (
                          <div className="text-[9px] text-cyan-400 uppercase tracking-widest mt-1">
                            {agent.lastCorridor}
                          </div>
                        )}
                      </div>
                      <div
                        className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${
                          agent.threatLevel === 'CRITICAL'
                            ? 'bg-red-600 text-white animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.5)]'
                            : agent.threatLevel === 'WARN'
                              ? 'bg-amber-500/20 text-amber-500'
                              : 'bg-emerald-500/20 text-emerald-400'
                        }`}
                      >
                        {agent.threatLevel}
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-2 z-10 mt-2">
                      <div className="bg-slate-950/60 rounded p-2 border border-white/5">
                        <div className="text-[8px] text-slate-500 font-bold uppercase mb-1 flex items-center gap-1">
                          <Activity className="w-3 h-3" /> Escaneos
                        </div>
                        <div className="text-lg font-black text-slate-300">
                          {agent.stats.totalScans}
                        </div>
                      </div>
                      <div className="bg-slate-950/60 rounded p-2 border border-white/5">
                        <div className="text-[8px] text-slate-500 font-bold uppercase mb-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-red-400" /> Críticos
                        </div>
                        <div className="text-lg font-black text-red-500">
                          {agent.stats.criticalIncidents}{' '}
                          <span className="text-[10px] text-red-500/50">({criticalPct}%)</span>
                        </div>
                      </div>
                      <div className="bg-slate-950/60 rounded p-2 border border-white/5">
                        <div className="text-[8px] text-slate-500 font-bold uppercase mb-1 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-emerald-400" /> Seguros
                        </div>
                        <div className="text-lg font-black text-emerald-400">
                          {agent.stats.safeScans}{' '}
                          <span className="text-[10px] text-emerald-400/50">({safePct}%)</span>
                        </div>
                      </div>
                      <div className="bg-slate-950/60 rounded p-2 border border-white/5">
                        <div className="text-[8px] text-slate-500 font-bold uppercase mb-1 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-400" /> Retrasos Hrs
                        </div>
                        <div className="text-lg font-black text-amber-500">
                          {agent.stats.scheduleDisadvantages}
                        </div>
                      </div>
                    </div>

                    {/* Rivals Context */}
                    <div className="z-10 bg-slate-950/40 rounded p-2 border border-white/5">
                      <div className="text-[8px] text-slate-500 font-bold uppercase mb-1 flex items-center gap-1">
                        <Bus className="w-3 h-3 text-cyan-500" /> Rivales Detectados Históricamente
                      </div>
                      <div className="text-[10px] text-slate-400 italic">
                        {Array.from(agent.stats.lastDetectedRivals).length > 0
                          ? Array.from(agent.stats.lastDetectedRivals).join(', ')
                          : 'Ninguno registrado aún'}
                      </div>
                    </div>

                    {/* Last Insight */}
                    <div className="z-10 mt-auto bg-primary-950/20 border-l-2 border-primary-500 p-2 rounded text-[9px] text-primary-300/80 italic leading-relaxed">
                      "{agent.lastAnalysis}"
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
