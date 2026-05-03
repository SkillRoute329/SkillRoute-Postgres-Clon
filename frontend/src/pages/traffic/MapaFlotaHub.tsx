import { useState, lazy, Suspense } from 'react';
import { Radio, MapPin, RefreshCw, BarChart2, Users } from 'lucide-react';

const FleetMonitorModule        = lazy(() => import('./FleetMonitorModule'));
const LiveMapPage               = lazy(() => import('./LiveMapPage'));
const FlotaInteligente          = lazy(() => import('./FlotaInteligente'));
const RendimientoConductores    = lazy(() => import('./RendimientoConductores'));

const TABS = [
  { key: 'monitor',      label: 'Monitoreo de Flota',      icon: Radio    },
  { key: 'mapa',         label: 'Mapa en Vivo STM',        icon: MapPin   },
  { key: 'inteligencia', label: 'Inteligencia de Flota',   icon: BarChart2 },
  { key: 'conductores',  label: 'Rendimiento Conductores', icon: Users    },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const Loader = () => (
  <div className="flex items-center justify-center py-24 gap-3">
    <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
    <span className="text-slate-400 text-sm">Cargando…</span>
  </div>
);

export default function MapaFlotaHub() {
  const [tab, setTab] = useState<TabKey>('monitor');
  return (
    <div className="bg-slate-950 h-screen flex flex-col overflow-hidden">
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
      <div className="flex-1 overflow-auto">
        <Suspense fallback={<Loader />}>
          {tab === 'monitor'      && <FleetMonitorModule />}
          {tab === 'mapa'         && <LiveMapPage />}
          {tab === 'inteligencia' && <FlotaInteligente />}
          {tab === 'conductores'  && <RendimientoConductores />}
        </Suspense>
      </div>
    </div>
  );
}
