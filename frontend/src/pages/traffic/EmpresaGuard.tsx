import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import PendienteIntegracion from './PendienteIntegracion';

interface EmpresaGuardProps {
  /** Códigos de empresa (string) que tienen integración disponible. Ej: ['70'] para solo UCOT */
  empresasHabilitadas: string[];
  children: React.ReactNode;
  /** Nombre legible del módulo que se está protegiendo. Ej: "Documentos de Servicio" */
  nombreModulo: string;
}

/**
 * EmpresaGuard — Wrapper que muestra children solo si la empresa
 * actualmente seleccionada tiene integración disponible.
 * Para empresas sin integración muestra PendienteIntegracion.
 */
export default function EmpresaGuard({ empresasHabilitadas, children, nombreModulo }: EmpresaGuardProps) {
  const { empresaPropia } = useEmpresaPropia();
  const empresaId = String(empresaPropia);

  if (empresasHabilitadas.includes(empresaId)) {
    return <>{children}</>;
  }

  return <PendienteIntegracion empresaId={empresaId} nombreModulo={nombreModulo} />;
}
