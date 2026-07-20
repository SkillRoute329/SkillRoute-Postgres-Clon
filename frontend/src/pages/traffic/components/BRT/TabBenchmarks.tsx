import React from 'react';
import { BENCHMARKS_BRT } from '../../data/brtData';

export default function TabBenchmarks() {
  return (
    <div className="space-y-5">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
        <p className="text-slate-300 text-sm leading-relaxed">
          Análisis de los 5 sistemas BRT más relevantes del mundo para contextualizar el proyecto de Montevideo.
          Los benchmarks muestran qué funciona, qué falla y qué es directamente aplicable a UCOT.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {BENCHMARKS_BRT.map(b => (
          <div key={b.ciudad} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800" style={{ borderLeftColor: b.color, borderLeftWidth: 4 }}>
              <p className="font-bold text-white text-sm">{b.bandera} {b.ciudad}</p>
              <p className="text-slate-400 text-xs mt-0.5">{b.pais} · Desde {b.inicioOp}</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { l: 'Red', v: `${b.kmRed} km` },
                  { l: 'Pas/día', v: (b.pasajerosDia / 1_000_000).toFixed(1) + 'M' },
                  { l: 'km/h', v: b.velocidadKmh },
                ].map(({ l, v }) => (
                  <div key={l} className="bg-slate-800 rounded-lg p-2 text-center">
                    <p className="text-slate-500 text-[10px]">{l}</p>
                    <p className="text-white font-bold text-sm">{v}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-slate-500 text-[10px] uppercase font-bold mb-1">Modelo</p>
                <p className="text-slate-300 text-xs">{b.modelo}</p>
              </div>
              <div>
                <p className="text-slate-500 text-[10px] uppercase font-bold mb-1">Lección clave</p>
                <p className="text-slate-300 text-xs">{b.leccion}</p>
              </div>
              <div className="bg-emerald-900/20 rounded-lg p-2">
                <p className="text-[10px] text-emerald-400 font-bold uppercase mb-1">Fortaleza</p>
                <p className="text-emerald-300 text-xs">{b.fortaleza}</p>
              </div>
              <div className="bg-red-900/20 rounded-lg p-2">
                <p className="text-[10px] text-red-400 font-bold uppercase mb-1">Riesgo a evitar</p>
                <p className="text-red-300 text-xs">{b.riesgo}</p>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${
                  b.relevanciaUCOT.startsWith('MUY ALTA') ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50' :
                  b.relevanciaUCOT.startsWith('ALTA') ? 'bg-primary-900/50 text-primary-300 border-primary-700/50' :
                  'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {b.relevanciaUCOT.split(' — ')[0]}
                </span>
                <span className="text-slate-500 text-[10px]">para UCOT</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabla comparativa */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800">
          <p className="font-bold text-sm">Comparativa de KPIs internacionales</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60">
                <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Sistema</th>
                <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Km red</th>
                <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Pas/km/día</th>
                <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Costo/km (USD)</th>
                <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Velocidad</th>
                <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Tarifa USD</th>
              </tr>
            </thead>
            <tbody>
              {BENCHMARKS_BRT.map(b => (
                <tr key={b.ciudad} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="px-3 py-2.5 font-medium text-white">{b.bandera} {b.ciudad.split(' — ')[0]}</td>
                  <td className="px-3 py-2.5 text-right text-slate-300">{b.kmRed}</td>
                  <td className="px-3 py-2.5 text-right text-slate-300">{Math.round(b.pasajerosDia / b.kmRed)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-300">${b.costoKm}</td>
                  <td className="px-3 py-2.5 text-right text-slate-300">{b.velocidadKmh} km/h</td>
                  <td className="px-3 py-2.5 text-right text-slate-300">${b.tarifaUSD}</td>
                </tr>
              ))}
              <tr className="bg-primary-900/20 font-bold">
                <td className="px-3 py-2.5 text-primary-300">🇺🇾 Montevideo (objetivo)</td>
                <td className="px-3 py-2.5 text-right text-primary-300">~58</td>
                <td className="px-3 py-2.5 text-right text-primary-300">~14,000</td>
                <td className="px-3 py-2.5 text-right text-primary-300">~$4.0</td>
                <td className="px-3 py-2.5 text-right text-primary-300">~28 km/h</td>
                <td className="px-3 py-2.5 text-right text-primary-300">~$0.50</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
