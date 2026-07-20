import React from 'react';
import { AlertTriangle, ArrowRight, XCircle, CheckCircle } from 'lucide-react';
import { CORREDORES, todasAfectadas, LINEAS_ALIMENTADORAS_PROPUESTAS } from '../../data/brtData';

export default function TabImpacto() {
  return (
    <div className="space-y-5">
      <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-red-300">Impacto directo en {todasAfectadas.length} líneas UCOT</p>
          <p className="text-red-400/80 text-sm mt-1">
            Las líneas que comparten corredor con el BRT perderán pasajeros al competir con frecuencias más altas,
            menor tiempo de viaje y mayor confort. La decisión clave es: ¿reconfigurarse como alimentadoras o mantener trazados históricos?
          </p>
        </div>
      </div>

      {CORREDORES.map(c => (
        <div key={c.id} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ background: c.color }} />
            <p className="font-bold text-sm">{c.nombre}</p>
            <span className="text-xs text-slate-500">{c.lineasUCOTAfectadas.length} líneas afectadas</span>
          </div>
          <div className="divide-y divide-slate-800/40">
            {c.lineasUCOTAfectadas.map(l => (
              <div key={l.linea} className="px-4 py-3 grid grid-cols-1 md:grid-cols-4 gap-3 items-start">
                <div>
                  <p className="text-white font-bold">Línea {l.linea}</p>
                  <p className="text-slate-400 text-xs mt-0.5">{l.nombre}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-[10px] uppercase font-bold mb-1">Superposición</p>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
                    l.overlap === 'TOTAL'
                      ? 'bg-red-900/40 text-red-300 border-red-700/50'
                      : 'bg-amber-900/40 text-amber-300 border-amber-700/50'
                  }`}>
                    {l.overlap} — {l.km} km
                  </span>
                </div>
                <div className="md:col-span-2">
                  <p className="text-slate-500 text-[10px] uppercase font-bold mb-1">Estrategia recomendada</p>
                  <div className="flex items-start gap-2">
                    <ArrowRight className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <p className="text-emerald-300 text-sm">{l.estrategia}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Escenario sin adaptación */}
      <div className="bg-slate-900 rounded-xl border border-red-800/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-red-800/50 bg-red-900/20">
          <p className="font-bold text-red-300 flex items-center gap-2">
            <XCircle className="w-4 h-4" /> Escenario SIN adaptación (mantener líneas actuales)
          </p>
        </div>
        <div className="p-4 space-y-2 text-sm">
          {[
            'Pérdida estimada del 35-45% de pasajeros en líneas superpuestas para 2030',
            'Ingresos decrecientes mientras costos operativos se mantienen',
            'Riesgo de incumplimiento de compromisos contractuales con MTOP',
            'Flota subutilizada en horarios valle (mayor costo fijo por pasajero)',
            'Posible pérdida de licencias operativas en corredores BRT',
          ].map(r => (
            <div key={r} className="flex items-start gap-2 text-red-300">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{r}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Escenario con adaptación */}
      <div className="bg-slate-900 rounded-xl border border-emerald-800/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-emerald-800/50 bg-emerald-900/20">
          <p className="font-bold text-emerald-300 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" /> Escenario CON adaptación (migrar a alimentadoras + pago por km)
          </p>
        </div>
        <div className="p-4 space-y-2 text-sm">
          {[
            'Ingresos predecibles y crecientes basados en km operados',
            'Mayor número de líneas = más km = más ingresos (incentivo alineado)',
            'Posicionamiento como operador preferente en proceso de licitación',
            'Cobertura de zonas sin servicio BRT (mercado no disputado por el troncal)',
            'Contratos 8-12 años con el Estado — mayor estabilidad',
            `Con ${LINEAS_ALIMENTADORAS_PROPUESTAS.length} alimentadoras propuestas: +${LINEAS_ALIMENTADORAS_PROPUESTAS.reduce((a, l) => a + l.kmEstimado, 0)} km/día operados`,
          ].map(r => (
            <div key={r} className="flex items-start gap-2 text-emerald-300">
              <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{r}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
