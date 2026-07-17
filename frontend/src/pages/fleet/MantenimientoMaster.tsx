import { lazy, Suspense } from 'react';

const MaintenanceDashboard = lazy(() => import('../admin/MaintenanceDashboard'));
const MantenimientoPredictivo = lazy(() => import('./MantenimientoPredictivo'));
const WorkOrders = lazy(() => import('./WorkOrders'));

export default function MantenimientoMaster() {
  return (
    <div className="flex flex-col gap-6 w-full h-full pb-10">
      {/* Resumen Mantenimiento y Predictivo */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-[600px]">
        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Mantenimiento Activo
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Mantenimiento...</div>}>
              <MaintenanceDashboard />
            </Suspense>
          </div>
        </section>

        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Mantenimiento Predictivo (IA)
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Modelo Predictivo...</div>}>
              <MantenimientoPredictivo />
            </Suspense>
          </div>
        </section>
      </div>

      {/* Ordenes de Trabajo */}
      <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col min-h-[600px]">
        <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
          Órdenes de Trabajo (Talleres)
        </div>
        <div className="flex-1 overflow-auto relative p-2">
          <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Órdenes de Trabajo...</div>}>
            <WorkOrders />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
