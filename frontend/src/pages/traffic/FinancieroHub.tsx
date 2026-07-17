import { lazy } from 'react';
import { DollarSign, PieChart, Download } from 'lucide-react';
import PageHub from '../../components/PageHub';

const AnaliticaGestioFinancieraMaster = lazy(() => import('./AnaliticaGestioFinancieraMaster'));
const SimulacionProyeccionesMaster = lazy(() => import('./SimulacionProyeccionesMaster'));
const ExportadorReportes = lazy(() => import('./ExportadorReportes'));

const TABS = [
  { key: 'analitica',    label: 'Analítica y Gestión',     icon: PieChart,   Component: AnaliticaGestioFinancieraMaster },
  { key: 'proyecciones', label: 'Simulación y Proyecciones', icon: DollarSign, Component: SimulacionProyeccionesMaster },
  { key: 'exportar',     label: 'Exportar Reportes',       icon: Download,   Component: ExportadorReportes },
] as const;

export default function FinancieroHub() {
  return <PageHub tabs={TABS} defaultTab="analitica" />;
}
