import { lazy, Suspense } from 'react';

const RankingCoches = lazy(() => import('./RankingCoches'));
const AutoStatsModule = lazy(() => import('./AutoStatsModule'));
const RotacionSustituciones = lazy(() => import('./RotacionSustituciones'));
const ComparacionServicioCoche = lazy(() => import('./ComparacionServicioCoche'));
const TendenciaTab = lazy(() => import('./TendenciaTab'));
const DemandaOficialIMM = lazy(() => import('./DemandaOficialIMM'));
const MapaGlobalIMM = lazy(() => import('./MapaGlobalIMM'));

export default function AuditoriaFlotaMaster() {
  return (
    <div className="flex flex-col gap-6 w-full h-full pb-10">
      {/* Ranking y AutoStats */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-[600px]">
        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Ranking de Desempeño por Vehículo
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Ranking de Coches...</div>}>
              <RankingCoches />
            </Suspense>
          </div>
        </section>
        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Estadísticas Detalladas por Coche
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Estadísticas por Coche...</div>}>
              <AutoStatsModule />
            </Suspense>
          </div>
        </section>
      </div>

      {/* Validaciones IMM y Cartón */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-[600px]">
        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Cruce de Datos: Cartón vs GPS vs IMM
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Cartón vs GPS...</div>}>
              <ComparacionServicioCoche />
            </Suspense>
          </div>
        </section>
        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Demanda Oficial (IMM)
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Demanda IMM...</div>}>
              <DemandaOficialIMM />
            </Suspense>
          </div>
        </section>
      </div>

      {/* Rotación y Tendencias */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-[500px]">
        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Análisis de Rotación y Sustituciones
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Rotación...</div>}>
              <RotacionSustituciones />
            </Suspense>
          </div>
        </section>
        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Tendencias y Evolución
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Tendencias...</div>}>
              <TendenciaTab />
            </Suspense>
          </div>
        </section>
      </div>

      {/* Mapa Global IMM */}
      <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col h-[700px]">
        <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
          Mapa Global de Servicios (IMM)
        </div>
        <div className="flex-1 overflow-auto relative p-2">
          <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Mapa Global IMM...</div>}>
            <MapaGlobalIMM />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
