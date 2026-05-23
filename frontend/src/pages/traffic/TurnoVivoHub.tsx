import { lazy } from 'react';
import { Zap, Navigation, Radio } from 'lucide-react';
import PageHub from '../../components/PageHub';

const CentroTurnoDashboard = lazy(() => import('./CentroTurnoDashboard'));
const GestionDesviosPage   = lazy(() => import('./GestionDesviosPage'));
const ShadowRadar          = lazy(() => import('./ShadowRadar'));

const TABS = [
  { key: 'turno',   label: 'Centro de Turno',   icon: Zap,        Component: CentroTurnoDashboard },
  { key: 'desvios', label: 'Centro de Desvíos', icon: Navigation, Component: GestionDesviosPage },
  { key: 'radar',   label: 'Radar Sombra',      icon: Radio,      Component: ShadowRadar },
] as const;

export default function TurnoVivoHub() {
  return <PageHub tabs={TABS} defaultTab="turno" />;
}
