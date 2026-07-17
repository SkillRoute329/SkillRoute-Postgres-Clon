import { lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Zap, Activity } from 'lucide-react';
import PageHub from '../../components/PageHub';

const OperativaAuditoriaMaster = lazy(() => import('./OperativaAuditoriaMaster'));
const DiagnosticoConfiguracionMaster = lazy(() => import('./DiagnosticoConfiguracionMaster'));

const TABS = [
  { key: 'operativa',   label: 'Operativa y Auditoría',     icon: Zap,      Component: OperativaAuditoriaMaster },
  { key: 'diagnostico', label: 'Diagnóstico y Configuración', icon: Activity, Component: DiagnosticoConfiguracionMaster },
] as const;

export default function MotorHub() {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = TABS.some((t) => t.key === tabParam) ? tabParam! : 'operativa';

  return <PageHub key={defaultTab} tabs={TABS} defaultTab={defaultTab} />;
}
