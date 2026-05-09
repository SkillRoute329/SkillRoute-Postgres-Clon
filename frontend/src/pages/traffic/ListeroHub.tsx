import { useState, lazy, Suspense } from 'react';
import { Users, Route, RefreshCw, Info } from 'lucide-react';

const TerminalListero  = lazy(() => import('./TerminalListero'));
const ListeroModule    = lazy(() => import('./ListeroModule'));
const DistribucionDiaria = lazy(() => import('./DistribucionDiaria'));

const TABS = [
  { key: 'terminal',    label: 'Terminal Listero',  icon: Users  },
  { key: 'cascada',     label: 'Listero Cascada',   icon: Users  },
  { key: 'distribucion',label: 'Distribución Diaria', icon: Route },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const Loader = () => (
  <div className="flex items-center justify-center py-24 gap-3">
    <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
    <span className="text-slate-400 text-sm">Cargando…</span>
  </div>
);

export default function ListeroHub() {
  const [tab, setTab] = useState<TabKey>('terminal');
  return (
    <div className="bg-slate-950 min-h-screen flex flex-col">
      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-6 pt-5">
        <div className="flex gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-all ${
                  tab === t.key ? 'border-blue-500 text-white bg-slate-800/50' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}>
                <Icon className="w-4 h-4" />{t.label}
              </button>
            );
          })}
        </div>
      </div>
      {/* Banner de transparencia — modelo operativo en desarrollo */}
      <div
        className="bg-slate-800/60 border-b border-slate-700/60 text-slate-400 text-xs px-6 py-2.5 flex items-start gap-2.5"
        title="Estamos modelando la operativa real UCOT (turnos 1°/2°/3°/nocturno, rotación correlativa de servicios, paralización IMM). El detalle del rediseño está en el documento referenciado."
      >
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-500" />
        <span>
          Vista del día actual. La rotación semanal de turnos y la matriz de coches × conductores fijos están en el módulo de{' '}
          <span className="text-slate-300 font-medium">Listero Operativo</span>{' '}
          (en desarrollo).
        </span>
      </div>
      <div className="flex-1">
        <Suspense fallback={<Loader />}>
          {tab === 'terminal' ? <TerminalListero /> : tab === 'cascada' ? <ListeroModule /> : <DistribucionDiaria />}
        </Suspense>
      </div>
    </div>
  );
}
