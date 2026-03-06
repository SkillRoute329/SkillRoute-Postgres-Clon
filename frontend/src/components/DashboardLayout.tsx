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
        style={{
          display: 'block',
          padding: '10px 16px',
          borderRadius: 8,
          color: isActive ? '#fff' : '#94a3b8',
          background: isActive ? '#334155' : 'transparent',
          textDecoration: 'none',
          marginBottom: 4,
        }}
      >
        {label}
      </Link>
    );
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar como en el programa real: w-64 bg-slate-900 */}
      <aside
        style={{
          width: 256,
          background: '#0f172a',
          borderRight: '1px solid #334155',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <h2 style={{ margin: '0 0 24px', fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>
          TransformaFacil
        </h2>
        <nav style={{ flex: 1 }}>
          {link('/dashboard', 'Dashboard')}
          <div
            style={{
              marginTop: 16,
              marginBottom: 8,
              color: '#64748b',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Tránsito
          </div>
          {link('/dashboard/transit/service-matrix', 'Matriz de Servicio')}
          {link('/dashboard/transit/statistics', 'Estadísticas')}
          <div
            style={{
              marginTop: 16,
              marginBottom: 8,
              color: '#64748b',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Admin
          </div>
          {link('/dashboard/admin/ingestion', 'Ingestion de datos')}
          {link('/dashboard/admin/users', 'Usuarios')}
        </nav>
        <button
          onClick={handleLogout}
          style={{
            padding: '10px 16px',
            background: 'transparent',
            border: '1px solid #334155',
            borderRadius: 8,
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Cerrar sesión
        </button>
      </aside>
      <main style={{ flex: 1, padding: 32, background: '#0f172a' }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#e2e8f0' }}>
            Hola, {user?.fullName ?? 'Usuario'}
          </h1>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 14 }}>{user?.role ?? '—'}</p>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
