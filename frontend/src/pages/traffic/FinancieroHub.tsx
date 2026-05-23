import { lazy } from 'react';
import { DollarSign, BarChart3, TrendingUp, Route, PieChart, Download } from 'lucide-react';
import PageHub from '../../components/PageHub';

const EconomicProjectionsPage  = lazy(() => import('./EconomicProjectionsPage'));
const PanelFinancieroOperativo = lazy(() => import('./PanelFinancieroOperativo'));
const ROICalculator            = lazy(() => import('./ROICalculator'));
const PLPorOperador            = lazy(() => import('./PLPorOperador'));
const CostoPorLinea            = PLPorOperador;
const ExportadorReportes       = lazy(() => import('./ExportadorReportes'));

const TABS = [
  { key: 'pl',           label: 'P&L por Operador',        icon: PieChart,   Component: PLPorOperador },
  { key: 'costo-linea',  label: 'Costo por Línea',         icon: Route,      Component: CostoPorLinea },
  { key: 'proyecciones', label: 'Proyecciones Económicas', icon: DollarSign, Component: EconomicProjectionsPage },
  { key: 'operativo',    label: 'Gestión Financiera',      icon: BarChart3,  Component: PanelFinancieroOperativo },
  { key: 'roi',          label: 'Calculadora de ROI',      icon: TrendingUp, Component: ROICalculator },
  { key: 'exportar',     label: 'Exportar Reportes',       icon: Download,   Component: ExportadorReportes },
] as const;

export default function FinancieroHub() {
  return <PageHub tabs={TABS} defaultTab="pl" />;
}
