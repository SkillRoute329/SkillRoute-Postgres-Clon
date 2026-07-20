import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { ESCENARIOS_DESVIO } from '../../data/brtData';

export default function TabSimulador() {
  const [escenarioSel, setEscenarioSel] = useState<string>('obra_8oct');
  const escenario = ESCENARIOS_DESVIO.find(e => e.id === escenarioSel) ?? ESCENARIOS_DESVIO[0];

  return (
    <div className="space-y-5">
      <p className="text-slate-400 text-sm">
        Seleccioná un escenario de desvío para ver el plan de contingencia operativa y el impacto estimado.
      </p>

      {/* Selector escenario */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {ESCENARIOS_DESVIO.map(e => (
          <button
            key={e.id}
            onClick={() => setEscenarioSel(e.id)}
            className={`text-left px-4 py-3 rounded-xl border transition-all ${
              escenarioSel === e.id
                ? 'border-primary-500 bg-primary-950/30'
                : 'border-slate-700 bg-slate-900 hover:border-slate-600'
            }`}
          >
            <p className={`font-bold text-sm ${escenarioSel === e.id ? 'text-primary-300' : 'text-white'}`}>{e.titulo}</p>
            <p className="text-slate-400 text-xs mt-0.5">{e.tramo}</p>
          </button>
        ))}
      </div>

      {/* Detalle del escenario */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-4 border-b border-slate-800 bg-slate-800/40">
          <h3 className="font-bold text-white text-lg">{escenario.titulo}</h3>
          <p className="text-slate-300 text-sm mt-1">{escenario.descripcion}</p>
        </div>

        {/* Métricas del impacto */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-b border-slate-800 divide-x divide-slate-800">
          {[
            { l: 'Pasajeros afectados/día', v: escenario.pasajerosDesplazados.toLocaleString(), color: 'text-amber-400' },
            { l: 'Líneas impactadas', v: escenario.lineasAfectadas.join(', '), color: 'text-red-400' },
            { l: 'Duración estimada', v: escenario.duracionEstMeses < 1 ? '1 día' : `${escenario.duracionEstMeses} meses`, color: 'text-white' },
            { l: '+min viaje promedio', v: `+${escenario.impactoPassengerMin} min`, color: 'text-orange-400' },
          ].map(({ l, v, color }) => (
            <div key={l} className="px-4 py-3 text-center">
              <p className="text-slate-500 text-[10px] uppercase">{l}</p>
              <p className={`font-bold text-sm mt-1 ${color}`}>{v}</p>
            </div>
          ))}
        </div>

        {/* Plan de desvío */}
        <div className="p-4">
          <p className="text-xs text-slate-500 uppercase font-bold mb-3">Plan de Contingencia UCOT</p>
          <div className="space-y-2">
            {escenario.planDesvio.map((accion, i) => (
              <div key={i} className="flex items-start gap-3 bg-slate-800/50 rounded-lg p-3">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded shrink-0 mt-0.5 ${
                  accion.tipo === 'desvio' ? 'bg-orange-900/40 text-orange-400 border border-orange-700/50' :
                  accion.tipo === 'refuerzo' ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/50' :
                  accion.tipo === 'info' ? 'bg-blue-900/40 text-blue-400 border border-blue-700/50' :
                  accion.tipo === 'especial' ? 'bg-purple-900/40 text-purple-400 border border-purple-700/50' :
                  'bg-slate-700 text-slate-300'
                }`}>
                  {accion.tipo.toUpperCase()}
                </span>
                <p className="text-slate-300 text-sm leading-relaxed">{accion.accion}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Costos adicionales */}
        <div className="px-4 py-3 border-t border-slate-800 bg-red-900/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-300">
            <Info className="w-4 h-4" />
            <span className="text-sm font-bold">Costo operativo adicional estimado</span>
          </div>
          <span className="font-mono font-black text-red-400">${escenario.costoAdicionalDia.toLocaleString()} UYU/día</span>
        </div>
      </div>
    </div>
  );
}
