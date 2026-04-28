import { useState, lazy, Suspense } from 'react';
import { Network, PieChart, TrendingUp, Activity, BarChart3, RefreshCw, LayoutDashboard } from 'lucide-react';
import ExecutiveSummary from './ExecutiveSummary';

const CorridorIntelligence = lazy(() => import('./CorridorIntelligence'));
const CorridorMarketShare  = lazy(() => import('./CorridorMarketShare'));
const MarketPenetration    = lazy(() => import('./MarketPenetration'));
const ShadowAnalytics      = lazy(() => import('./ShadowAnalytics'));
const HeadwayInsights      = lazy(() => import('./HeadwayInsights'));

const TABS = [
  { key: 'ejecutivo',    label: 'Resumen Ejecutivo',            icon: LayoutDashboard },
  { key: 'intelligence', label: 'Inteligencia de Corredores',   icon: Network         },
  { key: 'market',       label: 'Participación por Corredor-km', icon: PieChart        },
  { key: 'penetracion',  label: 'Análisis de Penetración',      icon: TrendingUp      },
  { key: 'analytics',    label: 'Analytics Histórico',          icon: Activity        },
  { key: 'headway',      label: 'Espaciado entre Buses',        icon: BarChart3       },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const Loader = () => (
  <div className="flex items-center justify-center py-24 gap-3">
    <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
    <span className="text-slate-400 text-sm">Cargando…</span>
  </div>
);

export default function CorredoresHub() {
  const [tab, setTab] = useState<TabKey>('ejecutivo');
  return (
    <div className="bg-slate-950 min-h-screen flex flex-col">
      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-6 pt-5">
        <div className="flex gap-1 flex-wrap">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-all ${
                  tab === t.key
                    ? tab === 'ejecutivo'
                      ? 'border-orange-400 text-white bg-slate-800/50'
                      : 'border-blue-500 text-white bg-slate-800/50'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}>
                <Icon className={`w-4 h-4 ${tab === t.key && t.key === 'ejecutivo' ? 'text-orange-400' : ''}`} />
                {t.label}
                {t.key === 'ejecutivo' && tab !== 'ejecutivo' && (
                  <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 font-medium">
                    Nuevo
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1">
        {tab === 'ejecutivo' ? (
          <ExecutiveSummary />
        ) : (
          <Suspense fallback={<Loader />}>
            {tab === 'intelligence' ? <CorridorIntelligence /> :
             tab === 'market'       ? <CorridorMarketShare />  :
             tab === 'penetracion'  ? <MarketPenetration />    :
             tab === 'analytics'    ? <ShadowAnalytics />      :
                                      <HeadwayInsights />}
          </Suspense>
        )}
      </div>
    </div>
  );
}
