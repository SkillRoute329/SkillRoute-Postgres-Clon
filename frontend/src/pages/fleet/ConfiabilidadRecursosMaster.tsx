import { lazy, Suspense } from 'react';

const EamDashboard = lazy(() => import('./EamDashboard'));
const CombustibleModule = lazy(() => import('./VehicleList')); // Same as original code
const VehicleCheck = lazy(() => import('./VehicleCheck'));

export default function ConfiabilidadRecursosMaster() {
  return (
    <div className="flex flex-col gap-6 w-full h-full pb-10">
      {/* EAM y Combustible */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-[600px]">
        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Confiabilidad EAM (Enterprise Asset Management)
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Confiabilidad EAM...</div>}>
              <EamDashboard />
            </Suspense>
          </div>
        </section>

        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Gestión de Combustible y Eficiencia
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Módulo de Combustible...</div>}>
              <CombustibleModule />
            </Suspense>
          </div>
        </section>
      </div>

      {/* Revisión Vehicular */}
      <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col min-h-[600px]">
        <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
          Control y Revisión Vehicular
        </div>
        <div className="flex-1 overflow-auto relative p-2">
          <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Revisiones Vehiculares...</div>}>
            <VehicleCheck />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
