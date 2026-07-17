import { lazy } from 'react';
import { ShieldAlert, BarChart4, FileCheck } from 'lucide-react';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import { OPERADORES_ID_NOMBRE } from '../../utils/operadores';
import PageHub from '../../components/PageHub';

const CentroComandoMaster = lazy(() => import('./CentroComandoMaster'));
const AnalisisServicioMaster = lazy(() => import('./AnalisisServicioMaster'));
const AuditoriaFlotaMaster = lazy(() => import('./AuditoriaFlotaMaster'));

// FASE 5.16: fuente única utils/operadores.ts.
const AGENCIAS = OPERADORES_ID_NOMBRE;

const TABS = [
  { key: 'comando',     label: 'Centro de Comando Interactivo', icon: ShieldAlert, Component: CentroComandoMaster },
  { key: 'servicio',    label: 'Análisis Integral de Servicio', icon: BarChart4, Component: AnalisisServicioMaster },
  { key: 'auditoria',   label: 'Auditoría y Flota',             icon: FileCheck, Component: AuditoriaFlotaMaster },
] as const;

export default function CumplimientoHub() {
  const { empresaPropia, setEmpresaPropia } = useEmpresaPropia();

  // Selector de empresa — compartido por todas las tabs.
  const operadorSelector = (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-xs text-slate-500 uppercase tracking-widest font-medium">Operador</span>
      <div className="flex gap-1 bg-slate-800/60 rounded-lg p-1 border border-slate-700/50">
        {AGENCIAS.map((ag) => (
          <button
            key={ag.id}
            onClick={() => setEmpresaPropia(Number(ag.id))}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              String(empresaPropia) === ag.id
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {ag.nombre}
          </button>
        ))}
      </div>
    </div>
  );

  return <PageHub tabs={TABS} defaultTab="comando" headerExtra={operadorSelector} />;
}
