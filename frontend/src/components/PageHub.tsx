/**
 * PageHub — contenedor de pestañas reutilizable.
 * ============================================================================
 * FASE 5.16: el mismo boilerplate (header sticky + barra de tabs + Suspense +
 * Loader) estaba copiado en ~12 *Hub.tsx idénticos. Esta es la pieza única.
 *
 * Cada Hub declara sus tabs (key/label/icon/Component lazy) y opcionalmente
 * un `headerExtra` que se renderiza ENCIMA de la barra de tabs — eso cubre
 * variantes como el selector de operador de CumplimientoHub sin forks.
 */
import { useState, Suspense, type ComponentType, type ReactNode } from 'react';
import { RefreshCw, type LucideIcon } from 'lucide-react';

export interface PageHubTab {
  key: string;
  label: string;
  icon: LucideIcon;
  Component: ComponentType;
}

interface PageHubProps {
  tabs: readonly PageHubTab[];
  defaultTab?: string;
  /** Render por encima de la barra de tabs (p.ej. selector de operador). */
  headerExtra?: ReactNode;
}

const Loader = () => (
  <div className="flex items-center justify-center py-24 gap-3">
    <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
    <span className="text-slate-400 text-sm">Cargando…</span>
  </div>
);

export default function PageHub({ tabs, defaultTab, headerExtra }: PageHubProps) {
  const [tab, setTab] = useState<string>(defaultTab ?? tabs[0]!.key);
  const Active = (tabs.find((t) => t.key === tab) ?? tabs[0]!).Component;

  return (
    <div className="bg-slate-950 min-h-screen flex flex-col">
      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-6 pt-4">
        {headerExtra}
        <div className="flex gap-1 flex-wrap">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-all ${
                  tab === t.key
                    ? 'border-blue-500 text-white bg-slate-800/50'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1">
        <Suspense fallback={<Loader />}>
          <Active />
        </Suspense>
      </div>
    </div>
  );
}
