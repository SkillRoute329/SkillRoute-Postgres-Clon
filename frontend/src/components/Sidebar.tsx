import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Bus,
  Wrench,
  FileText,
  Calendar,
  Map,
  AlertTriangle,
  ChevronRight,
  Settings,
  LogOut,
  Wallet,
  ShoppingCart,
  Activity,
  Cpu,
  ShieldCheck,
  Smartphone,
  BarChart3,
  ClipboardList,
  Radio,
  ListOrdered,
  Bot,
  Shield,
  Tag,
  RefreshCw,
  Target,
  Clipboard,
  Siren,
  Search,
  Zap,
  MapPin,
  Radar,
  Database,
  Train,
  ShieldAlert,
  TrendingUp,
  DollarSign,
  Route,
  Network,
  PieChart,
  Navigation,
  CheckSquare,
  Sliders,
  Building2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import clsx from 'clsx';

interface SidebarProps {
  onClose?: () => void;
}

const Sidebar = ({ onClose }: SidebarProps) => {
  const location = useLocation();
  const { logout, user: _user } = useAuth();

  const handleNavClick = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      onClose?.();
    }
  };

  const menuGroups = [
    {
      title: 'Grupo Operaciones',
      items: [
        { path: '/dashboard/operations/distribution', label: 'Distribución y Roster', icon: Users },
        { path: '/dashboard/admin/cartones', label: 'Registro de Planillas', icon: ClipboardList },
      ],
    },
    {
      title: 'Grupo Fiscalización',
      items: [
        { path: '/dashboard/driver/mi-linea', label: 'Línea y Competencia', icon: Bus },
      ],
    },
    {
      title: 'Grupo Taller',
      items: [
        { path: '/dashboard/driver/report', label: 'Denuncias de Cabina', icon: Wrench },
      ],
    },
    {
      title: 'Grupo Administración',
      items: [
        { path: '/dashboard/my-balance', label: 'Mi Balance y Legajo Laboral', icon: Wallet },
      ],
    },
  ];

  return (
    <aside className="w-full max-w-[18rem] md:max-w-[16rem] flex flex-col h-full overflow-y-auto overflow-x-hidden custom-scrollbar relative">
      <div className="px-4 py-3 lg:py-3 flex items-center gap-3 border-b border-slate-900/50 bg-slate-900/20 shrink-0">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white shadow-lg shadow-blue-900/30 bg-gradient-to-br from-blue-600 to-orange-500 text-sm tracking-tight">
          SR
        </div>
        <div>
          <h1 className="text-xl lg:text-2xl font-black bg-gradient-to-r from-blue-400 to-orange-400 bg-clip-text text-transparent">
            SkillRoute
          </h1>
        </div>
      </div>

      {/* Compactación responsive: en desktop/notebook reducimos los paddings
          verticales y gaps entre secciones para que ENTREN más items sin
          scroll. Mobile táctil mantiene 44px (Apple HIG). */}
      <nav className="flex-1 px-3 py-2 space-y-3 lg:space-y-4 mt-1">
        <Link
          to="/dashboard"
          onClick={handleNavClick}
          className={clsx(
            'flex items-center gap-3 min-h-[36px] lg:min-h-[40px] py-1.5 lg:py-2 px-3 rounded-lg font-bold transition-all border touch-manipulation active:scale-[0.98]',
            location.pathname === '/dashboard'
              ? 'bg-primary-600/10 border-primary-500 text-primary-400 shadow-lg shadow-primary-900/10'
              : 'border-transparent text-slate-400 hover:bg-slate-900 hover:text-white',
          )}
        >
          <LayoutDashboard className="w-5 h-5" />
          Vista General
        </Link>

        {menuGroups.map((group, idx) => (
          <div key={idx} className="space-y-2">
            <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] px-3">
              {group.title}
            </h3>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={handleNavClick}
                    className={clsx(
                      'flex items-center justify-between min-h-[44px] py-3 px-3 rounded-xl text-sm font-medium transition-all group border touch-manipulation active:scale-[0.98]',
                      isActive
                        ? 'bg-slate-800 border-slate-700 text-white'
                        : 'border-transparent text-slate-400 hover:bg-slate-900 hover:text-white',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        className={clsx(
                          'w-4 h-4 transition-colors',
                          isActive
                            ? 'text-primary-400'
                            : 'text-slate-500 group-hover:text-primary-400',
                        )}
                      />
                      {item.label}
                    </div>
                    <ChevronRight
                      className={clsx(
                        'w-3 h-3 opacity-0 group-hover:opacity-100 transition-all',
                        isActive && 'opacity-100',
                      )}
                    />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 mt-auto border-t border-slate-900 bg-slate-950/50">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 min-h-[44px] py-3 px-3 text-red-400 hover:bg-red-500/10 active:bg-red-500/20 rounded-xl transition-all font-bold text-sm touch-manipulation disabled:opacity-50"
        >
          <LogOut className="w-5 h-5" />
          Cerrar Sesión
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;