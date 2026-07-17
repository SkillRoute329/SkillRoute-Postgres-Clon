import { lazy, Suspense } from 'react';

const OTPDashboard = lazy(() => import('./OTPDashboard'));
const DiagnosticoCumplimiento = lazy(() => import('./CumplimientoPorLineaPro'));
const RunTimesTab = lazy(() => import('./RunTimesTab'));
const StopDwellTab = lazy(() => import('./StopDwellTab'));
const AnalisisEtapas = lazy(() => import('./AnalisisEtapas'));

export default function AnalisisServicioMaster() {
  return (
    <div className="flex flex-col gap-6 w-full h-full pb-10">
      {/* Vista Global (OTP) */}
      <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col h-[500px]">
        <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
          Puntualidad Global (OTP)
        </div>
        <div className="flex-1 overflow-auto relative">
          <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando OTP Global...</div>}>
            <OTPDashboard />
          </Suspense>
        </div>
      </section>

      {/* Diagnóstico de Línea */}
      <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col min-h-[600px]">
        <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
          Análisis Específico por Línea
        </div>
        <div className="flex-1 overflow-auto relative p-2">
          <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Diagnóstico por Línea...</div>}>
            <DiagnosticoCumplimiento />
          </Suspense>
        </div>
      </section>

      {/* Tiempos de Viaje y Parada */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-[600px]">
        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Tiempos de Viaje (Run Times)
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Tiempos de Viaje...</div>}>
              <RunTimesTab />
            </Suspense>
          </div>
        </section>
        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Tiempos en Parada (Dwell Times)
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Tiempos de Parada...</div>}>
              <StopDwellTab />
            </Suspense>
          </div>
        </section>
      </div>

      {/* Etapas */}
      <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col min-h-[700px]">
        <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
          Análisis Geoespacial por Etapa
        </div>
        <div className="flex-1 overflow-auto relative">
          <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Análisis por Etapas...</div>}>
            <AnalisisEtapas />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
