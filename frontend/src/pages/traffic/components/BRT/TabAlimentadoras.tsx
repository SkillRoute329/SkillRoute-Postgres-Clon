import React from 'react';
import { LINEAS_ALIMENTADORAS_PROPUESTAS } from '../../data/brtData';

export default function TabAlimentadoras() {
  return (
    <div className="space-y-5">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
        <p className="text-slate-300 text-sm leading-relaxed">
          Una vez operativo el BRT, los pasajeros usarán el troncal para el tramo largo.
          Las <strong className="text-white">líneas alimentadoras</strong> conectan barrios sin cobertura BRT con los nodos de intercambio.
          UCOT tiene ventaja competitiva: conoce los recorridos actuales, tiene personal y flota disponibles.
          A continuación, <strong className="text-white">{LINEAS_ALIMENTADORAS_PROPUESTAS.length} propuestas de nuevas líneas</strong> basadas
          en zonas geográficas sin cobertura BRT directa.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {LINEAS_ALIMENTADORAS_PROPUESTAS.map(al => {
          const ingresoMens = Math.round(al.ingresoEstDia * 26 / 1000);
          return (
            <div key={al.id} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <div className={`px-4 py-3 border-b border-slate-800 flex items-center justify-between ${
                al.viabilidad === 'MUY ALTA' ? 'bg-emerald-900/20' :
                al.viabilidad === 'ALTA' ? 'bg-primary-900/20' : 'bg-amber-900/10'
              }`}>
                <div>
                  <p className="font-bold text-white text-sm">{al.id} — {al.nombre}</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    Corredor {al.corredorAlimenta} · Migra desde: {al.lineaExistenteMigracion ?? 'línea nueva'}
                  </p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded border ${
                  al.viabilidad === 'MUY ALTA' ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50' :
                  al.viabilidad === 'ALTA' ? 'bg-blue-900/40 text-blue-300 border-blue-700/50' :
                  'bg-amber-900/40 text-amber-300 border-amber-700/50'
                }`}>
                  {al.viabilidad}
                </span>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-slate-300 text-sm">{al.descripcion}</p>
                <p className="text-slate-400 text-xs">
                  <span className="text-slate-300 font-medium">Recorrido:</span> {al.recorrido}
                </p>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {[
                    { label: 'km/viaje', valor: al.kmEstimado },
                    { label: 'Frecuencia', valor: `${al.frecuenciaMin}min` },
                    { label: 'Coches', valor: al.cochesNecesarios },
                  ].map(({ label, valor }) => (
                    <div key={label} className="bg-slate-800 rounded-lg p-2 text-center">
                      <p className="text-slate-500 text-[10px]">{label}</p>
                      <p className="text-white font-bold text-sm">{valor}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                  <span className="text-slate-400 text-xs">Ingreso estimado/mes</span>
                  <span className="font-mono font-black text-emerald-400">${ingresoMens}K UYU</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Resumen flota */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
        <p className="text-xs text-slate-500 uppercase font-bold mb-3">Resumen operativo — todas las alimentadoras</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Coches necesarios', valor: LINEAS_ALIMENTADORAS_PROPUESTAS.reduce((a, l) => a + l.cochesNecesarios, 0) },
            { label: 'Conductores', valor: LINEAS_ALIMENTADORAS_PROPUESTAS.reduce((a, l) => a + l.conductoresNecesarios, 0) },
            { label: 'km/día total', valor: LINEAS_ALIMENTADORAS_PROPUESTAS.reduce((a, l) => a + l.kmEstimado, 0) + ' km' },
            { label: 'Ingreso/mes total', valor: '$' + Math.round(LINEAS_ALIMENTADORAS_PROPUESTAS.reduce((a, l) => a + l.ingresoEstDia * 26, 0) / 1000) + 'K UYU' },
          ].map(({ label, valor }) => (
            <div key={label} className="bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-slate-400 text-[10px] uppercase">{label}</p>
              <p className="text-xl font-black text-white mt-1">{valor}</p>
            </div>
          ))}
        </div>
        <p className="text-slate-500 text-xs mt-3">
          * La flota UCOT actual tiene 257 coches disponibles. Las alimentadoras propuestas requieren {LINEAS_ALIMENTADORAS_PROPUESTAS.reduce((a, l) => a + l.cochesNecesarios, 0)} coches
          — cubribles con la flota existente redirigida desde las líneas superpuestas con BRT.
        </p>
      </div>
    </div>
  );
}
