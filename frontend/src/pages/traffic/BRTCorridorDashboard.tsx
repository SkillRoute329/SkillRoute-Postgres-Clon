import React, { useState, useMemo } from 'react';
import { Train } from 'lucide-react';

// Data types
import { TabType, todasAfectadas } from './data/brtData';

// Tabs
import TabCorredores from './components/BRT/TabCorredores';
import TabImpacto from './components/BRT/TabImpacto';
import TabModelo from './components/BRT/TabModelo';
import TabAlimentadoras from './components/BRT/TabAlimentadoras';
import TabTimeline from './components/BRT/TabTimeline';
import TabBenchmarks from './components/BRT/TabBenchmarks';
import TabObras from './components/BRT/TabObras';
import TabSimulador from './components/BRT/TabSimulador';
import TabPropuesta from './components/BRT/TabPropuesta';

/**
 * BRTCorridorDashboard — Estrategia UCOT ante el BRT Metropolitano 2027-2029
 * 
 * Este módulo ha sido refactorizado separando la data estática y las vistas
 * para mayor mantenibilidad y limpieza arquitectónica.
 */
export default function BRTCorridorDashboard() {
  const [tabActiva, setTabActiva] = useState<TabType>('corredores');

  const tabsMeta: [TabType, string][] = useMemo(() => [
    ['corredores', '🗺️ Corredores'],
    ['impacto', '⚡ Impacto UCOT'],
    ['modelo', '💰 Modelo $/km'],
    ['alimentadoras', '🚌 Alimentadoras'],
    ['timeline', '📅 Timeline'],
    ['benchmarks', '🌍 Benchmarks'],
    ['obras', '🔧 Plan Obras'],
    ['simulador', '🎮 Simulador'],
    ['propuesta', '🏛️ UCOT→ASM'],
  ], []);

  const renderTabContent = () => {
    switch (tabActiva) {
      case 'corredores': return <TabCorredores />;
      case 'impacto': return <TabImpacto />;
      case 'modelo': return <TabModelo />;
      case 'alimentadoras': return <TabAlimentadoras />;
      case 'timeline': return <TabTimeline />;
      case 'benchmarks': return <TabBenchmarks />;
      case 'obras': return <TabObras />;
      case 'simulador': return <TabSimulador />;
      case 'propuesta': return <TabPropuesta />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
      {/* ── HEADER ── */}
      <div className="mb-6">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-12 h-12 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center shrink-0">
            <Train className="w-6 h-6 text-red-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">BRT Metropolitano 2027–2029</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Estrategia UCOT ante la reforma del transporte de Montevideo · Análisis de impacto, oportunidades y adaptación
            </p>
          </div>
          <div className="flex gap-4 flex-wrap">
            <div className="bg-slate-900 rounded-xl border border-slate-800 px-4 py-3 text-center">
              <p className="text-slate-500 text-[10px] uppercase font-bold">Inversión</p>
              <p className="text-xl font-black text-white">US$ 490M</p>
            </div>
            <div className="bg-slate-900 rounded-xl border border-slate-800 px-4 py-3 text-center">
              <p className="text-slate-500 text-[10px] uppercase font-bold">Inicio obras</p>
              <p className="text-xl font-black text-amber-400">Ene 2027</p>
            </div>
            <div className="bg-slate-900 rounded-xl border border-slate-800 px-4 py-3 text-center">
              <p className="text-slate-500 text-[10px] uppercase font-bold">Líneas UCOT</p>
              <p className="text-xl font-black text-red-400">{todasAfectadas.length} afect.</p>
            </div>
            <div className="bg-slate-900 rounded-xl border border-slate-800 px-4 py-3 text-center">
              <p className="text-slate-500 text-[10px] uppercase font-bold">Nuevo modelo</p>
              <p className="text-xl font-black text-emerald-400">$/km</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="flex gap-1 border-b border-slate-800 mb-6 overflow-x-auto">
        {tabsMeta.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTabActiva(id)}
            className={`px-3 py-2.5 text-xs md:text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tabActiva === id
                ? 'border-primary-500 text-primary-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── CONTENIDO DINÁMICO DE LA PESTAÑA ── */}
      {renderTabContent()}
      
    </div>
  );
}
