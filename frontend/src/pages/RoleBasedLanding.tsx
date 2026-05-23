import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import DashboardHome from './DashboardHome';

// Mapa rol → ruta de workspace. ADMIN y SUPERADMIN quedan en DashboardHome (vista global).
// FASE 5.37 (2026-05-22): driver/conductor van directo a "Mi Línea" — la pantalla
// que les muestra su turno activo + propagación en su línea.
const ROLE_WORKSPACE: Record<string, string> = {
  traffic:      '/dashboard/traffic/centro-turno',
  inspector:    '/dashboard/traffic/inspector-control',
  listero:      '/dashboard/traffic/listero',
  rrhh:         '/dashboard/admin/rrhh',
  mantenimiento:'/dashboard/fleet/disponibilidad',
  driver:       '/dashboard/driver/mi-linea',
  conductor:    '/dashboard/driver/mi-linea',
  chofer:       '/dashboard/driver/mi-linea',
  user:         '/dashboard/admin/rendicion-cuentas',
};

const RoleBasedLanding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user?.role) return;
    const rol = user.role.toLowerCase();
    const destino = ROLE_WORKSPACE[rol];
    if (destino) {
      navigate(destino, { replace: true });
    }
    // ADMIN y SUPERADMIN no están en el mapa → se quedan en DashboardHome
  }, [user?.role, navigate]);

  // Mientras se resuelve el rol (o si es ADMIN/SUPERADMIN), renderiza DashboardHome
  return <DashboardHome />;
};

export default RoleBasedLanding;
