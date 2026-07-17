import { lazy } from 'react';
import { Siren, ShieldAlert } from 'lucide-react';
import PageHub from '../../components/PageHub';

const IncidentCommandCenter     = lazy(() => import('./IncidentCommandCenter'));
const ContingencyManagementPage = lazy(() => import('./ContingencyManagementPage'));

const TABS = [
  { key: 'incidencias',  label: 'Centro de Incidencias',   icon: Siren,       Component: IncidentCommandCenter },
  { key: 'contingencia', label: 'Gestión de Contingencia', icon: ShieldAlert, Component: ContingencyManagementPage },
] as const;

export default function IncidenciasHub() {
  return <PageHub tabs={TABS} defaultTab="incidencias" />;
}
