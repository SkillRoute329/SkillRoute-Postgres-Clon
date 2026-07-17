import { lazy, Suspense } from 'react';

const PanelRendicionCuentas = lazy(() => import('./PanelRendicionCuentas'));
const SubsidiosMTOP = lazy(() => import('./SubsidiosMTOP'));

export default function TransparenciaSubsidiosMaster() {
  return (
    <div className="flex flex-col gap-6 w-full h-full pb-10">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-[600px]">
        {/* Rendición de Cuentas */}
        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Rendición de Cuentas Transparente
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Rendición...</div>}>
              <PanelRendicionCuentas />
            </Suspense>
          </div>
        </section>

        {/* Subsidios */}
        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Gestión de Subsidios MTOP
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Subsidios...</div>}>
              <SubsidiosMTOP />
            </Suspense>
          </div>
        </section>
      </div>
    </div>
  );
}
