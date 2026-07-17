import { lazy } from 'react';
import { Shield, ClipboardList, CheckSquare } from 'lucide-react';
import PageHub from '../../components/PageHub';

const AuditoriaCumplimientoMaster = lazy(() => import('./AuditoriaCumplimientoMaster'));
const TransparenciaSubsidiosMaster = lazy(() => import('./TransparenciaSubsidiosMaster'));
const AdminAuditLog = lazy(() => import('./AdminAuditLog'));

const TABS = [
  { key: 'auditoria',     label: 'Auditoría de Cumplimiento', icon: Shield,        Component: AuditoriaCumplimientoMaster },
  { key: 'transparencia', label: 'Transparencia y Subsidios', icon: CheckSquare,   Component: TransparenciaSubsidiosMaster },
  { key: 'audit',         label: 'Trazabilidad (Audit Log)',  icon: ClipboardList, Component: AdminAuditLog },
] as const;

export default function RegulatorioHub() {
  return <PageHub tabs={TABS} defaultTab="auditoria" />;
}

