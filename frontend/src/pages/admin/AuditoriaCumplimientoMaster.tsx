import { lazy, Suspense } from 'react';

const RegulatorComplianceView = lazy(() => import('../regulatorio/RegulatorComplianceView'));
const ComplianceHub = lazy(() => import('./ComplianceHub'));
const CrossOpCoverage = lazy(() => import('./CrossOpCoverage'));

export default function AuditoriaCumplimientoMaster() {
  return (
    <div className="flex flex-col gap-6 w-full h-full pb-10">
      {/* Sistema y MTOP */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-[600px]">
        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Cumplimiento del Sistema (Global)
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Cumplimiento del Sistema...</div>}>
              <RegulatorComplianceView />
            </Suspense>
          </div>
        </section>

        <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
            Cumplimiento MTOP e IMM
          </div>
          <div className="flex-1 overflow-auto relative p-2">
            <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Cumplimiento Institucional...</div>}>
              <ComplianceHub />
            </Suspense>
          </div>
        </section>
      </div>

      {/* Cross-Op Coverage */}
      <section className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col min-h-[600px]">
        <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 font-semibold text-slate-200">
          Cobertura Cross-Operacional (Red Compartida)
        </div>
        <div className="flex-1 overflow-auto relative p-2">
          <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando Cobertura...</div>}>
            <CrossOpCoverage />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
