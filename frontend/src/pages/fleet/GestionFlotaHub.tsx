import { lazy } from 'react';
import { Bus, Wrench, Activity } from 'lucide-react';
import PageHub from '../../components/PageHub';

const OperacionesFlotaMaster = lazy(() => import('./OperacionesFlotaMaster'));
const MantenimientoMaster = lazy(() => import('./MantenimientoMaster'));
const ConfiabilidadRecursosMaster = lazy(() => import('./ConfiabilidadRecursosMaster'));

const TABS = [
  { key: 'operaciones',   label: 'Operaciones de Flota',      icon: Bus,           Component: OperacionesFlotaMaster },
  { key: 'mantenimiento', label: 'Mantenimiento y Taller',    icon: Wrench,        Component: MantenimientoMaster },
  { key: 'confiabilidad', label: 'Recursos y Confiabilidad',  icon: Activity,      Component: ConfiabilidadRecursosMaster },
] as const;

export default function GestionFlotaHub() {
  return <PageHub tabs={TABS} defaultTab="operaciones" />;
}
