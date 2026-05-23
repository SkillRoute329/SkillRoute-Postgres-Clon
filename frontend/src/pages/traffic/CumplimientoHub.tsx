import { lazy } from 'react';
import { Search, Bus, BarChart3, Activity, TrendingUp, Navigation, Database, Globe, GitCompare, Repeat, AlertTriangle, Lightbulb, FlaskConical } from 'lucide-react';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import { OPERADORES_ID_NOMBRE } from '../../utils/operadores';
import PageHub from '../../components/PageHub';

// Vista profesional con matriz puntos de control × coches por día (2026-05-04).
// El componente legacy ./DiagnosticoCumplimiento se preserva como fallback.
const DiagnosticoCumplimiento = lazy(() => import('./CumplimientoPorLineaPro'));
const RankingCoches           = lazy(() => import('./RankingCoches'));
const OTPDashboard            = lazy(() => import('./OTPDashboard'));
const AutoStatsModule         = lazy(() => import('./AutoStatsModule'));
const TendenciaTab            = lazy(() => import('./TendenciaTab'));
const AnalisisEtapas          = lazy(() => import('./AnalisisEtapas'));
// FASE 5.15 (2026-05-14): Demanda oficial IMM (catalogodatos.gub.uy).
const DemandaOficialIMM       = lazy(() => import('./DemandaOficialIMM'));
const MapaGlobalIMM           = lazy(() => import('./MapaGlobalIMM'));
// FASE 5.17 (2026-05-16): comparación 3 columnas por tramo (IMM·cartón·GPS).
const ComparacionServicioCoche = lazy(() => import('./ComparacionServicioCoche'));
const RotacionSustituciones    = lazy(() => import('./RotacionSustituciones'));
// FASE 5.17: panel de comando — problemas de toda la flota, carga sola.
const PanelCumplimiento        = lazy(() => import('./PanelCumplimiento'));
// FASE 5.18: motor prescriptivo + predictivo (recomendaciones/proyección).
const CentroComando            = lazy(() => import('./CentroComando'));
// FASE 5.19: simulador de escenarios (estimador de impacto transparente).
const SimuladorEscenarios      = lazy(() => import('./SimuladorEscenarios'));

// FASE 5.16: fuente única utils/operadores.ts.
const AGENCIAS = OPERADORES_ID_NOMBRE;

const TABS = [
  { key: 'panel',       label: 'Panel Cumplimiento', icon: AlertTriangle, Component: PanelCumplimiento },
  { key: 'comando',     label: 'Recomendaciones & Proyección', icon: Lightbulb, Component: CentroComando },
  { key: 'simulador',   label: 'Simulador de Escenarios', icon: FlaskConical, Component: SimuladorEscenarios },
  { key: 'diagnostico', label: 'Por Línea',          icon: Search,     Component: DiagnosticoCumplimiento },
  { key: 'ranking',     label: 'Ranking de Coches',  icon: Bus,        Component: RankingCoches },
  { key: 'otp',         label: 'Puntualidad OTP',    icon: BarChart3,  Component: OTPDashboard },
  { key: 'autostats',   label: 'Por Coche',          icon: Activity,   Component: AutoStatsModule },
  { key: 'tendencia',   label: 'Semana vs Semana',   icon: TrendingUp, Component: TendenciaTab },
  { key: 'etapas',      label: 'Análisis por Etapa', icon: Navigation, Component: AnalisisEtapas },
  { key: 'carton-gps',  label: 'Cartón vs GPS',      icon: GitCompare, Component: ComparacionServicioCoche },
  { key: 'rotacion',    label: 'Rotación & Sustituciones', icon: Repeat, Component: RotacionSustituciones },
  // FASE 5.15: nuevos tabs con validaciones oficiales IMM
  { key: 'demanda-imm', label: 'Demanda IMM',        icon: Database,   Component: DemandaOficialIMM },
  { key: 'mapa-global', label: 'Mapa global IMM',    icon: Globe,      Component: MapaGlobalIMM },
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

  return <PageHub tabs={TABS} defaultTab="panel" headerExtra={operadorSelector} />;
}
