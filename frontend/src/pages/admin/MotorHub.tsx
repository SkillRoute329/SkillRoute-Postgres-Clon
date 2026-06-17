import { lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Zap, Network, Sliders, Activity } from 'lucide-react';
import PageHub from '../../components/PageHub';

const MotorConsecuencias = lazy(() => import('../traffic/MotorConsecuencias'));
const CascadeAudit        = lazy(() => import('./CascadeAudit'));
const MotorConfigPanel    = lazy(() => import('./MotorConfigPanel'));
const MotorHealth         = lazy(() => import('./MotorHealth'));

const TABS = [
  { key: 'simulador', label: 'Simulador', icon: Zap, Component: MotorConsecuencias },
  { key: 'auditoria', label: 'Auditoría de Cascada', icon: Network, Component: CascadeAudit },
  { key: 'config', label: 'Configuración de Parámetros', icon: Sliders, Component: MotorConfigPanel },
  { key: 'salud', label: 'Salud del Motor', icon: Activity, Component: MotorHealth },
] as const;

export default function MotorHub() {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = TABS.some((t) => t.key === tabParam) ? tabParam! : 'simulador';

  return <PageHub key={defaultTab} tabs={TABS} defaultTab={defaultTab} />;
}
