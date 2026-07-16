import { lazy } from 'react';
import { Bus, Activity, Wrench, Clipboard, AlertTriangle, Fuel } from 'lucide-react';
import PageHub from '../../components/PageHub';

const VehicleList          = lazy(() => import('./VehicleList'));
const DisponibilidadFlota  = lazy(() => import('./DisponibilidadFlota'));
const MaintenanceDashboard = lazy(() => import('../admin/MaintenanceDashboard'));
const VehicleCheck         = lazy(() => import('./VehicleCheck'));
const RoadAlertsPage       = lazy(() => import('../alerts/RoadAlertsPage'));
const CombustibleModule       = VehicleList;
const MantenimientoPredictivo = lazy(() => import('./MantenimientoPredictivo'));
const WorkOrders              = lazy(() => import('./WorkOrders'));
const EamDashboard            = lazy(() => import('./EamDashboard'));

const TABS = [
  { key: 'inventario',     label: 'Coches / Inventario',      icon: Bus,           Component: VehicleList },
  { key: 'disponibilidad', label: 'Disponibilidad de Flota',  icon: Activity,      Component: DisponibilidadFlota },
  { key: 'mantenimiento',  label: 'Mantenimiento',            icon: Wrench,        Component: MaintenanceDashboard },
  { key: 'predictivo',     label: 'Mantenimiento Predictivo', icon: Wrench,        Component: MantenimientoPredictivo },
  { key: 'work_orders',    label: 'Órdenes de Trabajo',       icon: Clipboard,     Component: WorkOrders },
  { key: 'eam_dashboard',  label: 'Confiabilidad (EAM)',      icon: Activity,      Component: EamDashboard },
  { key: 'combustible',    label: 'Combustible',              icon: Fuel,          Component: CombustibleModule },
  { key: 'revision',       label: 'Revisión Vehicular',       icon: Clipboard,     Component: VehicleCheck },
  { key: 'alertas',        label: 'Alertas de Vía',           icon: AlertTriangle, Component: RoadAlertsPage },
] as const;

export default function GestionFlotaHub() {
  return <PageHub tabs={TABS} defaultTab="inventario" />;
}
