/**
 * PrivateRoute — Control de acceso basado en roles.
 *
 * Uso en App.tsx:
 *   <PrivateRoute>                          → requiere login
 *   <PrivateRoute roles={['ADMIN']}>        → requiere rol ADMIN
 *   <PrivateRoute roles={['ADMIN','TRAFFIC']}> → requiere uno de esos roles
 *
 * Roles reconocidos (insensible a mayúsculas):
 *   admin | traffic | listero | driver | conductor | inspector | user
 */
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface PrivateRouteProps {
  children: React.ReactNode;
  /** Lista de roles permitidos. Si está vacío, solo requiere autenticación. */
  roles?: string[];
}

function normalizeRole(role: string | undefined | null): string {
  return (role || '').toLowerCase().trim();
}

function hasRequiredRole(userRole: string | undefined, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  const nr = normalizeRole(userRole);
  // SUPERADMIN y ADMIN tienen acceso universal
  if (nr === 'superadmin' || nr === 'admin') return true;
  return allowed.some((r) => r.toLowerCase() === nr);
}

export default function PrivateRoute({ children, roles = [] }: PrivateRouteProps) {
  const { isAuthenticated, user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return null;

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!hasRequiredRole(user.role as string, roles)) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[50vh] gap-4 text-center p-8">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.94-2.5l-6.94-12a2 2 0 00-3.88 0l-6.94 12A2 2 0 005.07 19z" />
          </svg>
        </div>
        <h2 className="text-xl font-black text-white">Acceso Denegado</h2>
        <p className="text-slate-400 text-sm max-w-xs">
          Tu rol <span className="text-red-400 font-bold">({user.role || 'USER'})</span> no tiene
          permiso para acceder a este módulo.
        </p>
        <p className="text-slate-600 text-xs">
          Roles requeridos: {roles.join(', ')}
        </p>
        <button
          onClick={() => window.history.back()}
          className="mt-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm text-slate-300 font-bold transition-colors"
        >
          ← Volver
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
