import { useState, lazy, Suspense } from 'react';
import { Search, Bus, BarChart3, Activity, TrendingUp, RefreshCw } from 'lucide-react';

const DiagnosticoCumplimiento = lazy(() => import('./DiagnosticoCumplimiento'));
const RankingCoches           = lazy(() => import('./RankingCoches'));
const OTPDashboard            = lazy(() => import('./OTPDashboard'));
const AutoStatsModule         = lazy(() => import('./AutoStatsModule'));
const TendenciaTab            = lazy(() => import('./TendenciaTab'));

const TABS = [
  { key: 'diagnostico', label: 'Diagnóstico por Línea',   icon: Search     },
  { key: 'ranking',     label: 'Ranking de Coches',        icon: Bus        },
  { key: 'otp',         label: 'Puntualidad OTP',          icon: BarChart3  },
  { key: 'autostats',   label: 'Cumplimiento Horario GPS', icon: Activity   },
  { key: 'tendencia',   label: 'Semana vs Semana',         icon: TrendingUp },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const Loader = () => (
  <div className="flex items-center justify-center py-24 gap-3">
    <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
    <span className="text-slate-400 text-sm">Cargando…</span>
  </div>
);

export default function CumplimientoHub() {
  const [tab, setTab] = useState<TabKey>('diagnostico');
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
          {tab === 'diagnostico' ? <DiagnosticoCumplimiento /> :
           tab === 'ranking'     ? <RankingCoches />           :
           tab === 'otp'         ? <OTPDashboard />            :
           tab === 'tendencia'   ? <TendenciaTab />            :
                                   <AutoStatsModule />}
        </Suspense>
      </div>
    </div>
  );
}
