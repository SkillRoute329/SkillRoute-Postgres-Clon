import { useState, lazy, Suspense } from 'react';
import { DollarSign, BarChart3, TrendingUp, RefreshCw } from 'lucide-react';

const EconomicProjectionsPage  = lazy(() => import('./EconomicProjectionsPage'));
const PanelFinancieroOperativo = lazy(() => import('./PanelFinancieroOperativo'));
const ROICalculator            = lazy(() => import('./ROICalculator'));

const TABS = [
  { key: 'proyecciones', label: 'Proyecciones Económicas', icon: DollarSign },
  { key: 'operativo',    label: 'Gestión Financiera',      icon: BarChart3  },
  { key: 'roi',          label: 'Calculadora de ROI',      icon: TrendingUp },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const Loader = () => (
  <div className="flex items-center justify-center py-24 gap-3">
    <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
    <span className="text-slate-400 text-sm">Cargando…</span>
  </div>
);

export default function FinancieroHub() {
  const [tab, setTab] = useState<TabKey>('proyecciones');
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
      <div className="flex-1">
        <Suspense fallback={<Loader />}>
          {tab === 'proyecciones' ? <EconomicProjectionsPage /> :
           tab === 'operativo'    ? <PanelFinancieroOperativo /> :
                                    <ROICalculator />}
        </Suspense>
      </div>
    </div>
  );
}
