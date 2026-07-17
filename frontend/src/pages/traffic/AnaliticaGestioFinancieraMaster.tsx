import { lazy, Suspense } from 'react';

const PLPorOperador = lazy(() => import('./PLPorOperador'));
// CostoPorLinea was mapped to PLPorOperador in the original file
const CostoPorLinea = PLPorOperador;
const PanelFinancieroOperativo = lazy(() => import('./PanelFinancieroOperativo'));

export default function AnaliticaGestioFinancieraMaster() {
  return (
    <div className="flex flex-col gap-6 w-full h-full pb-10">
      {/* P&L and Cost */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-[600px]">
        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Profit & Loss por Operador
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando P&L...</div>}>
              <PLPorOperador />
            </Suspense>
          </div>
        </section>

        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Costo por Línea
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Costo por Línea...</div>}>
              <CostoPorLinea />
            </Suspense>
          </div>
        </section>
      </div>

      {/* Operativo */}
      <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col min-h-[600px]">
        <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
          Gestión Financiera Operativa
        </div>
        <div className="flex-1 overflow-auto relative p-2">
          <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Panel Operativo...</div>}>
            <PanelFinancieroOperativo />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
