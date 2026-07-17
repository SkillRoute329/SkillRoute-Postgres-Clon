import { lazy, Suspense } from 'react';

const VehicleList = lazy(() => import('./VehicleList'));
const DisponibilidadFlota = lazy(() => import('./DisponibilidadFlota'));
const RoadAlertsPage = lazy(() => import('../alerts/RoadAlertsPage'));

export default function OperacionesFlotaMaster() {
  return (
    <div className="flex flex-col gap-6 w-full h-full pb-10">
      {/* Estado y Disponibilidad (Top) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-[600px]">
        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Coches e Inventario
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Inventario...</div>}>
              <VehicleList />
            </Suspense>
          </div>
        </section>
        
        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Disponibilidad de Flota
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Disponibilidad...</div>}>
              <DisponibilidadFlota />
            </Suspense>
          </div>
        </section>
      </div>

      {/* Alertas (Bottom) */}
      <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col min-h-[600px]">
        <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
          Alertas de Vía en Tiempo Real
        </div>
        <div className="flex-1 overflow-auto relative">
          <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Alertas...</div>}>
            <RoadAlertsPage />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
