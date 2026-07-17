import { lazy, Suspense } from 'react';

const EconomicProjectionsPage = lazy(() => import('./EconomicProjectionsPage'));
const ROICalculator = lazy(() => import('./ROICalculator'));

export default function SimulacionProyeccionesMaster() {
  return (
    <div className="flex flex-col gap-6 w-full h-full pb-10">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-[600px]">
        {/* Proyecciones */}
        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Proyecciones Económicas
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Proyecciones...</div>}>
              <EconomicProjectionsPage />
            </Suspense>
          </div>
        </section>

        {/* ROI */}
        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Calculadora de ROI
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Calculadora...</div>}>
              <ROICalculator />
            </Suspense>
          </div>
        </section>
      </div>
    </div>
  );
}
