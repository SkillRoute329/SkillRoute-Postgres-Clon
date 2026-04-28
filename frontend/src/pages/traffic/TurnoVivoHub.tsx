import { useState, lazy, Suspense } from 'react';
import { Zap, Navigation, Radio, RefreshCw } from 'lucide-react';

const CentroTurnoDashboard = lazy(() => import('./CentroTurnoDashboard'));
const GestionDesviosPage    = lazy(() => import('./GestionDesviosPage'));
const ShadowRadar           = lazy(() => import('./ShadowRadar'));

const TABS = [
  { key: 'turno',   label: 'Centro de Turno',  icon: Zap        },
  { key: 'desvios', label: 'Centro de Desvíos', icon: Navigation },
  { key: 'radar',   label: 'Radar Sombra',      icon: Radio      },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const Loader = () => (
  <div className="flex items-center justify-center py-24 gap-3">
    <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
    <span className="text-slate-400 text-sm">Cargando…</span>
  </div>
);

export default function TurnoVivoHub() {
  const [tab, setTab] = useState<TabKey>('turno');
  return (
    <div className="bg-slate-950 min-h-screen flex flex-col">
      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-6 pt-5">
        <div className="flex gap-1 flex-wrap">
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
      <div className="flex-1">
        <Suspense fallback={<Loader />}>
          {tab === 'turno' ? <CentroTurnoDashboard /> : tab === 'desvios' ? <GestionDesviosPage /> : <ShadowRadar />}
        </Suspense>
      </div>
    </div>
  );
}
