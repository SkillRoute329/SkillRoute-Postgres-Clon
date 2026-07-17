import { lazy, Suspense } from 'react';

const PanelCumplimiento = lazy(() => import('./PanelCumplimiento'));
const CentroComando = lazy(() => import('./CentroComando'));
const SimuladorEscenarios = lazy(() => import('./SimuladorEscenarios'));

export default function CentroComandoMaster() {
  return (
    <div className="flex flex-col gap-6 w-full h-full pb-10">
      {/* Resumen y Problemas Actuales */}
      <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col h-[600px]">
        <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
          Estado Actual de la Flota (Alertas)
        </div>
        <div className="flex-1 overflow-auto relative">
          <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Panel de Cumplimiento...</div>}>
            <PanelCumplimiento />
          </Suspense>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-[700px]">
        {/* Recomendaciones */}
        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Motor de Recomendaciones (AI)
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Centro de Comando...</div>}>
              <CentroComando />
            </Suspense>
          </div>
        </section>

        {/* Simulador */}
        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Simulador de Escenarios
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Simulador...</div>}>
              <SimuladorEscenarios />
            </Suspense>
          </div>
        </section>
      </div>
    </div>
  );
}
