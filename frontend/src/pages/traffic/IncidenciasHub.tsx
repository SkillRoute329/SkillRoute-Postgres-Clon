import { lazy } from 'react';
import { Siren, ShieldAlert, GitMerge } from 'lucide-react';
import PageHub from '../../components/PageHub';

const IncidentCommandCenter     = lazy(() => import('./IncidentCommandCenter'));
const ContingencyManagementPage = lazy(() => import('./ContingencyManagementPage'));
const PanelTrazabilidad360      = lazy(() => import('./PanelTrazabilidad360'));

const TABS = [
  { key: 'incidencias',  label: 'Centro de Incidencias',   icon: Siren,       Component: IncidentCommandCenter },
  { key: 'contingencia', label: 'Gestión de Contingencia', icon: ShieldAlert, Component: ContingencyManagementPage },
  { key: 'trazabilidad', label: 'Trazabilidad 360°',       icon: GitMerge,    Component: PanelTrazabilidad360 },
] as const;

export default function IncidenciasHub() {
  return <PageHub tabs={TABS} defaultTab="incidencias" />;
}
