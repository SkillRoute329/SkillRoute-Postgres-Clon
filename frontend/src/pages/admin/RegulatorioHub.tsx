import { lazy } from 'react';
import { Shield, Network, ClipboardList, DollarSign } from 'lucide-react';
import PageHub from '../../components/PageHub';

const ComplianceHub          = lazy(() => import('./ComplianceHub'));
const CrossOpCoverage        = lazy(() => import('./CrossOpCoverage'));
const PanelRendicionCuentas  = lazy(() => import('./PanelRendicionCuentas'));
const AdminAuditLog          = lazy(() => import('./AdminAuditLog'));
const SubsidiosMTOP          = lazy(() => import('./SubsidiosMTOP'));

const TABS = [
  { key: 'mtop',      label: 'Cumplimiento MTOP/IMM', icon: Shield,        Component: ComplianceHub },
  { key: 'crossop',   label: 'Cobertura Cross-Op',    icon: Network,       Component: CrossOpCoverage },
  { key: 'rendicion', label: 'Rendición de Cuentas',  icon: ClipboardList, Component: PanelRendicionCuentas },
  { key: 'audit',     label: 'Audit Log',             icon: ClipboardList, Component: AdminAuditLog },
  { key: 'subsidios', label: 'Subsidios MTOP',        icon: DollarSign,    Component: SubsidiosMTOP },
] as const;

export default function RegulatorioHub() {
  return <PageHub tabs={TABS} defaultTab="mtop" />;
}
