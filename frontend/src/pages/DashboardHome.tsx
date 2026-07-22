import { useAuth } from '../context/AuthContext';
import { formatDateLong } from '../utils/dateFormatter';
import DashboardOperacional from './dashboard/DashboardOperacional';
import DashboardGodMode from './dashboard/DashboardGodMode';
import DashboardDriver from './dashboard/DashboardDriver';

const DashboardHome = () => {
  const { user } = useAuth();

  const isOperacional = ['SuperAdmin', 'Admin', 'Inspector', 'Listero'].some(
    (r) => user?.role?.toLowerCase() === r.toLowerCase(),
  );

  // God Mode — usuario especial de datos
  if (user?.internalNumber === '0000') {
    return <DashboardGodMode />;
  }

  // Panel operacional para Admin/Inspector/Listero
  if (isOperacional) {
    return (
      <div className="animate-fade-in space-y-6 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Hola, <span className="text-indigo-400">{user?.firstName || 'Inspector'}</span>
            </h1>
            <p className="text-slate-400 text-sm capitalize">{formatDateLong(new Date())}</p>
          </div>
          <span className="px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-xs font-bold uppercase">
            {user?.role}
          </span>
        </div>
        <DashboardOperacional />
      </div>
    );
  }

  // Dashboard para conductor (Driver/User)
  return <DashboardDriver />;
};

export default DashboardHome;
