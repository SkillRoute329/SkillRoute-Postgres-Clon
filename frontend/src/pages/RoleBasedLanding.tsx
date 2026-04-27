import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import DashboardHome from './DashboardHome';

// Mapa rol → ruta de workspace. ADMIN y SUPERADMIN quedan en DashboardHome (vista global).
const ROLE_WORKSPACE: Record<string, string> = {
  traffic:      '/dashboard/traffic/centro-turno',
  inspector:    '/dashboard/traffic/inspector-control',
  listero:      '/dashboard/traffic/listero',
  rrhh:         '/dashboard/admin/rrhh',
  mantenimiento:'/dashboard/fleet/disponibilidad',
  driver:       '/dashboard/driver/schedule',
  conductor:    '/dashboard/driver/schedule',
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
