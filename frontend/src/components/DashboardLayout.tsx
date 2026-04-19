import { useState } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';

type User = { fullName?: string; role?: string };

export default function DashboardLayout() {
  const [user] = useState<User | null>(() => {
    const raw = sessionStorage.getItem('user');
    if (raw)
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    return null;
  });
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    navigate('/login', { replace: true });
  };

  const link = (path: string, label: string) => {
    const isActive = location.pathname === path || location.pathname.startsWith(path + '/');
    return (
      <Link
        to={path}
        className={`block px-4 py-2.5 rounded-lg mb-1 no-underline transition-colors ${
          isActive
            ? 'text-white bg-slate-700'
            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar como en el programa real: w-64 bg-slate-900 */}
      <aside className="w-64 bg-slate-900 border-r border-slate-700 py-6 px-4 flex flex-col">
        <h2 className="m-0 mb-6 text-lg font-bold text-slate-200">TransformaFacil</h2>
        <nav className="flex-1">
          {link('/dashboard', 'Dashboard')}
          <div className="mt-4 mb-2 text-slate-500 text-xs font-semibold">Tránsito</div>
          {link('/dashboard/transit/service-matrix', 'Matriz de Servicio')}
          {link('/dashboard/transit/statistics', 'Estadísticas')}
          <div className="mt-4 mb-2 text-slate-500 text-xs font-semibold">Admin</div>
          {link('/dashboard/admin/ingestion', 'Ingestion de datos')}
          {link('/dashboard/admin/users', 'Usuarios')}
        </nav>
        <button
          onClick={handleLogout}
          className="px-4 py-2.5 bg-transparent border border-slate-700 rounded-lg text-slate-400 cursor-pointer text-sm hover:bg-slate-800 transition-colors mt-auto"
        >
          Cerrar sesión
        </button>
      </aside>
      <main className="flex-1 p-8 bg-slate-900 overflow-y-auto">
        <header className="mb-6">
          <h1 className="m-0 text-2xl font-bold text-slate-200">
            Hola, {user?.fullName ?? 'Usuario'}
          </h1>
          <p className="m-0 mt-1 text-slate-400 text-sm">{user?.role ?? '—'}</p>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
