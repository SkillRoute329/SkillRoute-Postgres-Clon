import React, { useState } from 'react';
import { Bus, DollarSign, TrendingUp, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { MODELO_FINANCIERO } from '../../data/brtData';

export default function TabModelo() {
  const [tarifaKmSlider, setTarifaKmSlider] = useState(420);
  const [kmDiaSlider, setKmDiaSlider] = useState(220);

  const m = MODELO_FINANCIERO;
  const margenActual = m.actual.ingresoDia - m.actual.costoDia;
  const ingresoBRTCalc = tarifaKmSlider * kmDiaSlider;
  const margenBRTCalc = ingresoBRTCalc - m.brt.costoDia;
  const margenBRT = m.brt.ingresoDia - m.brt.costoDia;
  const mejoraPct = margenActual !== 0 ? Math.round((margenBRT / margenActual - 1) * 100) : 0;
  const mejoraPctCalc = margenActual !== 0 ? Math.round((margenBRTCalc / margenActual - 1) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
        <p className="text-xs text-slate-500 uppercase font-bold mb-3">Contexto del cambio</p>
        <p className="text-slate-300 text-sm leading-relaxed">
          El nuevo modelo de concesión BRT establece que las empresas operadoras cobran por <strong>kilómetro recorrido</strong>,
          no por pasajero transportado. El Estado (a través de la Agencia del Sistema Metropolitano — ASM)
          fija la tarifa por km y paga directamente a los operadores. Los usuarios pagan al Estado.
          Esto <strong>elimina el riesgo de demanda</strong> para los operadores pero introduce
          KPIs de calidad con descuentos por incumplimiento.
        </p>
      </div>

      {/* Comparativa modelo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700 bg-slate-800">
            <p className="font-bold text-white flex items-center gap-2">
              <Bus className="w-4 h-4 text-slate-400" /> Modelo ACTUAL (por pasajero)
            </p>
            <p className="text-slate-400 text-xs mt-0.5">Referencia: bus promedio UCOT hoy</p>
          </div>
          <div className="p-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Tarifa por pasajero</span>
              <span className="font-mono text-white">${m.actual.tarifa} UYU</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Pasajeros/bus/día</span>
              <span className="font-mono text-white">{m.actual.pasajerosPromDia}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Captación empresa</span>
              <span className="font-mono text-white">{m.actual.captacionEmpresa * 100}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Km recorridos/día</span>
              <span className="font-mono text-white">{m.actual.kmPromDia} km</span>
            </div>
            <div className="border-t border-slate-700 pt-3">
              <div className="flex justify-between">
                <span className="text-slate-400">Ingreso/bus/día</span>
                <span className="font-mono text-emerald-400 font-bold">${Math.round(m.actual.ingresoDia).toLocaleString()} UYU</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-slate-400">Costo/bus/día</span>
                <span className="font-mono text-red-400">${m.actual.costoDia.toLocaleString()} UYU</span>
              </div>
              <div className="flex justify-between mt-1 pt-2 border-t border-slate-700">
                <span className="text-white font-bold">Margen/bus/día</span>
                <span className={`font-mono font-black text-lg ${margenActual > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  ${Math.round(margenActual).toLocaleString()} UYU
                </span>
              </div>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Margen/bus/mes</span>
              <span className="text-slate-400">${Math.round(margenActual * 26).toLocaleString()} UYU</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl border border-emerald-700/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-emerald-700/50 bg-emerald-900/20">
            <p className="font-bold text-white flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" /> Nuevo Modelo BRT (por km)
            </p>
            <p className="text-emerald-400/70 text-xs mt-0.5">Estimación basada en contratos MTOP existentes</p>
          </div>
          <div className="p-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Tarifa por km</span>
              <span className="font-mono text-white">${m.brt.tarifaKm} UYU/km</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Km operados/bus/día</span>
              <span className="font-mono text-white">{m.brt.kmPromDia} km</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Factor nocturno</span>
              <span className="font-mono text-white">×{m.brt.bonusNocturno}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Penalización KPI min</span>
              <span className="font-mono text-amber-400">×{m.brt.riesgoMin} si incumple</span>
            </div>
            <div className="border-t border-emerald-700/30 pt-3">
              <div className="flex justify-between">
                <span className="text-slate-400">Ingreso/bus/día</span>
                <span className="font-mono text-emerald-400 font-bold">${m.brt.ingresoDia.toLocaleString()} UYU</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-slate-400">Costo/bus/día</span>
                <span className="font-mono text-red-400">${m.brt.costoDia.toLocaleString()} UYU</span>
              </div>
              <div className="flex justify-between mt-1 pt-2 border-t border-emerald-700/30">
                <span className="text-white font-bold">Margen/bus/día</span>
                <span className="font-mono font-black text-lg text-emerald-400">
                  ${margenBRT.toLocaleString()} UYU
                </span>
              </div>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Margen/bus/mes</span>
              <span className="text-slate-400">${Math.round(margenBRT * 26).toLocaleString()} UYU</span>
            </div>
          </div>
        </div>
      </div>

      {/* Banner mejora */}
      <div className={`rounded-xl border p-4 flex items-center gap-4 ${
        mejoraPct > 0
          ? 'bg-emerald-900/20 border-emerald-700/40'
          : 'bg-red-900/20 border-red-700/40'
      }`}>
        <TrendingUp className={`w-8 h-8 shrink-0 ${mejoraPct > 0 ? 'text-emerald-400' : 'text-red-400'}`} />
        <div>
          <p className={`text-xl font-black ${mejoraPct > 0 ? 'text-emerald-300' : 'text-red-300'}`}>
            {mejoraPct > 0 ? '+' : ''}{mejoraPct}% mejora en margen por bus/día
          </p>
          <p className="text-slate-400 text-sm mt-0.5">
            Con la flota actual de 257 coches y migrando al modelo BRT, el margen total mensual estimado sería de
            <strong className="text-white"> ${Math.round(margenBRT * 26 * 257 / 1_000_000).toFixed(1)}M UYU/mes</strong> vs
            <strong className="text-white"> ${Math.round(margenActual * 26 * 257 / 1_000_000).toFixed(1)}M UYU/mes</strong> actual.
          </p>
        </div>
      </div>

      {/* Ventajas y riesgos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900 rounded-xl border border-emerald-800/40 p-4">
          <p className="text-xs text-emerald-400 uppercase font-bold mb-3">Ventajas del nuevo modelo</p>
          <div className="space-y-2">
            {m.brt.ventajas.map(v => (
              <div key={v} className="flex items-start gap-2 text-sm text-emerald-300">
                <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-slate-900 rounded-xl border border-amber-800/40 p-4">
          <p className="text-xs text-amber-400 uppercase font-bold mb-3">Riesgos a gestionar</p>
          <div className="space-y-2">
            {m.brt.riesgos.map(r => (
              <div key={r} className="flex items-start gap-2 text-sm text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{r}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Simulador Interactivo */}
      <div className="bg-slate-900 rounded-xl border border-primary-800/40 p-5 mt-6">
        <p className="text-sm text-primary-400 uppercase font-bold mb-4">Simulador interactivo de escenarios</p>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-slate-400 font-bold uppercase">Tarifa por km (UYU)</label>
              <span className="font-mono font-black text-primary-400">${tarifaKmSlider}</span>
            </div>
            <input
              type="range" min={300} max={600} step={10}
              value={tarifaKmSlider}
              onChange={e => setTarifaKmSlider(Number(e.target.value))}
              className="w-full accent-primary-500"
            />
            <div className="flex justify-between text-[10px] text-slate-600">
              <span>$300 (pesimista)</span><span>$420 (base)</span><span>$600 (optimista)</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-slate-400 font-bold uppercase">Km operados/bus/día</label>
              <span className="font-mono font-black text-primary-400">{kmDiaSlider} km</span>
            </div>
            <input
              type="range" min={120} max={350} step={10}
              value={kmDiaSlider}
              onChange={e => setKmDiaSlider(Number(e.target.value))}
              className="w-full accent-primary-500"
            />
            <div className="flex justify-between text-[10px] text-slate-600">
              <span>120 (pocas rutas)</span><span>220 (base)</span><span>350 (full alimentadoras)</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          {[
            { l: 'Ingreso/bus/día', v: `$${ingresoBRTCalc.toLocaleString()} UYU`, color: 'text-emerald-400' },
            { l: 'Margen/bus/día', v: `$${margenBRTCalc.toLocaleString()} UYU`, color: margenBRTCalc > 0 ? 'text-emerald-400' : 'text-red-400' },
            { l: 'vs modelo actual', v: `${mejoraPctCalc > 0 ? '+' : ''}${mejoraPctCalc}%`, color: mejoraPctCalc > 0 ? 'text-emerald-400' : 'text-red-400' },
          ].map(({ l, v, color }) => (
            <div key={l} className="bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-slate-500 text-[10px]">{l}</p>
              <p className={`font-black text-lg ${color}`}>{v}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 text-xs text-slate-600 flex items-center gap-1">
          <Info className="w-3 h-3" />
          <span>Ingreso total flota (257 buses): ${Math.round(ingresoBRTCalc * 257 / 1_000_000).toFixed(1)}M UYU/día · ${Math.round(ingresoBRTCalc * 257 * 26 / 1_000_000).toFixed(0)}M UYU/mes</span>
        </div>
      </div>
    </div>
  );
}
