import { useState, lazy, Suspense } from 'react';
import { Search, Bus, BarChart3, Activity, TrendingUp, RefreshCw, Navigation } from 'lucide-react';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';

// Vista profesional con matriz puntos de control × coches por día (2026-05-04).
// El componente legacy ./DiagnosticoCumplimiento se preserva como fallback.
const DiagnosticoCumplimiento = lazy(() => import('./CumplimientoPorLineaPro'));
const RankingCoches           = lazy(() => import('./RankingCoches'));
const OTPDashboard            = lazy(() => import('./OTPDashboard'));
const AutoStatsModule         = lazy(() => import('./AutoStatsModule'));
const TendenciaTab            = lazy(() => import('./TendenciaTab'));
const AnalisisEtapas          = lazy(() => import('./AnalisisEtapas'));

const AGENCIAS = [
  { id: '70', nombre: 'UCOT'   },
  { id: '50', nombre: 'CUTCSA' },
  { id: '20', nombre: 'COME'   },
  { id: '10', nombre: 'COETC'  },
] as const;

const TABS = [
  { key: 'diagnostico', label: 'Por Línea',              icon: Search     },
  { key: 'ranking',     label: 'Ranking de Coches',      icon: Bus        },
  { key: 'otp',         label: 'Puntualidad OTP',        icon: BarChart3  },
  { key: 'autostats',   label: 'Por Coche',              icon: Activity   },
  { key: 'tendencia',   label: 'Semana vs Semana',       icon: TrendingUp },
  { key: 'etapas',      label: 'Análisis por Etapa',     icon: Navigation },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const Loader = () => (
  <div className="flex items-center justify-center py-24 gap-3">
    <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
    <span className="text-slate-400 text-sm">Cargando…</span>
  </div>
);

export default function CumplimientoHub() {
  const { empresaPropia, setEmpresaPropia } = useEmpresaPropia();
  const [tab, setTab] = useState<TabKey>('diagnostico');

  return (
    <div className="bg-slate-950 min-h-screen flex flex-col">
      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-6 pt-4">

        {/* Selector de empresa — compartido por todas las tabs */}
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

        {/* Tabs de módulo */}
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
           tab === 'autostats'   ? <AutoStatsModule />         :
           tab === 'tendencia'   ? <TendenciaTab />            :
                                   <AnalisisEtapas />}
        </Suspense>
      </div>
    </div>
  );
}
