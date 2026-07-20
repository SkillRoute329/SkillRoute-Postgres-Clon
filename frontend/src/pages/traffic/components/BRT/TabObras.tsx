import React from 'react';
import { Wrench, ChevronRight, Layers } from 'lucide-react';
import { PLAN_OBRAS } from '../../data/brtData';

export default function TabObras() {
  const colorFase: Record<string, string> = {
    amber: 'border-amber-700/50 bg-amber-900/10',
    red: 'border-red-700/50 bg-red-900/10',
    orange: 'border-orange-700/50 bg-orange-900/10',
    blue: 'border-blue-700/50 bg-blue-900/10',
    emerald: 'border-emerald-700/50 bg-emerald-900/10',
  };
  
  const colorFaseText: Record<string, string> = {
    amber: 'text-amber-300', red: 'text-red-300', orange: 'text-orange-300',
    blue: 'text-blue-300', emerald: 'text-emerald-300',
  };

  return (
    <div className="space-y-5">
      <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4 flex items-start gap-3">
        <Wrench className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-amber-300">La construcción es el mayor riesgo operativo</p>
          <p className="text-amber-400/80 text-sm mt-1">
            Durante las obras (2027-2029), UCOT debe mantener el servicio con desvíos y lanzaderas,
            coordinar con la IMM y demostrar resiliencia operativa. Esto es una oportunidad de visibilidad.
          </p>
        </div>
      </div>

      {PLAN_OBRAS.map(fase => (
        <div key={fase.fase} className={`rounded-xl border overflow-hidden ${colorFase[fase.color]}`}>
          <div className={`px-4 py-3 border-b ${colorFase[fase.color]}`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className={`font-bold text-sm ${colorFaseText[fase.color]}`}>{fase.fase}</p>
              <span className={`text-xs px-2 py-0.5 rounded font-mono ${colorFaseText[fase.color]} bg-slate-900/60`}>
                {fase.periodo}
              </span>
            </div>
          </div>
          <div className="p-4">
            <div className="space-y-2">
              {fase.acciones.map((a, i) => (
                <div key={i} className="flex items-start gap-2">
                  <ChevronRight className={`w-4 h-4 shrink-0 mt-0.5 ${colorFaseText[fase.color]}`} />
                  <p className="text-slate-300 text-sm">{a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
        <p className="text-xs text-slate-500 uppercase font-bold mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4" /> Capacidades digitales de SkillRoute para la fase de obras
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            ['🗺️ Módulo de desvíos activo', 'Activar rutas alternativas con un click y notificar conductores en tiempo real'],
            ['📡 GPS tracking continuo', 'Monitorear cumplimiento de desvíos y detectar incidentes al instante'],
            ['📊 KPIs en tiempo real', 'Reportar a IMM/MTOP sobre niveles de servicio durante obras'],
            ['🔔 Alertas a pasajeros', 'Sistema de notificaciones sobre cambios de recorrido por obras'],
            ['🗓️ Distribución dinámica', 'Reasignar coches y conductores automáticamente según la fase de obra activa'],
            ['📋 Boletín adaptado', 'Generar boletines de inspección actualizados con las nuevas rutas de desvío'],
          ].map(([titulo, desc]) => (
            <div key={titulo as string} className="flex items-start gap-2 bg-slate-800 rounded-xl p-3">
              <p className="text-sm font-medium text-white mt-0.5">{titulo}</p>
              <p className="text-slate-400 text-xs mt-1">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
