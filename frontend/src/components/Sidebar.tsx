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
      title: 'Operaciones Diarias',
      items: [
        { path: '/dashboard/traffic/service-matrix', label: 'Matriz de Servicio', icon: Calendar },
        { path: '/dashboard/traffic/cartons', label: 'Gestor de Cartones', icon: ClipboardList },
        { path: '/dashboard/traffic/listero', label: 'Terminal Listero', icon: Users },
        { path: '/dashboard/traffic/listero-cascada', label: 'Listero Cascada (Ops)', icon: Users },
        { path: '/dashboard/traffic/distribucion', label: 'Distribución Diaria', icon: Route },
        { path: '/dashboard/traffic/boletin', label: 'Boletín de Inspección', icon: FileText },
        { path: '/dashboard/traffic/navigation', label: 'Navegador UCOT', icon: Map },

      ],
    },
    {
      title: 'Control y Monitoreo',
      items: [
        { path: '/dashboard/traffic/fleet-monitor', label: 'Monitoreo de Flota', icon: Radio },
        { path: '/dashboard/traffic/otp', label: 'Puntualidad OTP', icon: BarChart3 },
        { path: '/dashboard/traffic/incidents', label: 'Centro de Incidencias', icon: Siren },
        {
          path: '/dashboard/traffic/inspector-control',
          label: 'Control Inspectores',
          icon: Activity,
        },
        {
          path: '/dashboard/traffic/inspector-capture',
          label: 'Captura Inspector (Móvil)',
          icon: Smartphone,
        },
      ],
    },
    {
      title: 'Flota y Mantenimiento',
      items: [
        { path: '/dashboard/fleet', label: 'Coches / Inventario', icon: Bus },
        { path: '/dashboard/admin/maintenance', label: 'Mantenimiento', icon: Wrench },
        { path: '/dashboard/fleet/check', label: 'Revisión Vehicular', icon: Clipboard },
        {
          path: '/dashboard/admin/service-categories',
          label: 'Asignación de Servicios',
          icon: Tag,
        },
        { path: '/dashboard/alerts', label: 'Alertas de Vía', icon: AlertTriangle },
      ],
    },
    {
      title: 'Recursos Humanos',
      items: [
        { path: '/dashboard/admin/rrhh', label: 'Gestión de Personal', icon: Users },
        { path: '/dashboard/admin/employees', label: 'Fichas Médicas / CI', icon: Wallet },
        { path: '/dashboard/admin/shifts', label: 'Gestión de Turnos', icon: Calendar },
        {
          path: '/dashboard/traffic/rotation-matrix',
          label: 'Matriz de Rotación',
          icon: RefreshCw,
        },
        { path: '/dashboard/admin/rrhh/feriados', label: 'Feriados', icon: Calendar },
      ],
    },
    {
      title: 'Inteligencia de Red',
      items: [
        {
          path: '/dashboard/traffic/corridor-intelligence',
          label: 'Inteligencia de Corredores',
          icon: Network,
        },
        {
          path: '/dashboard/traffic/corridor-map',
          label: 'Mapa de Corredores',
          icon: Map,
        },
        {
          path: '/dashboard/traffic/shadow-analytics',
          label: 'Analytics Shadow (Histórico)',
          icon: Activity,
        },
        {
          path: '/dashboard/traffic/ceo',
          label: 'Dashboard CEO (legacy)',
          icon: TrendingUp,
        },
        {
          path: '/dashboard/traffic/ceo-v7',
          label: '⭐ Centro de Mando v7',
          icon: TrendingUp,
        },
      ],
    },
    {
      title: 'Operación Táctica',
      items: [
        {
          path: '/dashboard/traffic/shadow-radar',
          label: 'Radar Sombra (Táctico)',
          icon: Radio,
        },
        {
          path: '/dashboard/traffic/live-map',
          label: '🔴 Mapa en Vivo STM',
          icon: MapPin,
        },
        {
          path: '/dashboard/traffic/autostats',
          label: 'Cumplimiento Horario',
          icon: BarChart3,
        },
        {
          path: '/dashboard/traffic/contingency',
          label: 'Gestión de Contingencia',
          icon: ShieldAlert,
        },
      ],
    },
    {
      title: 'Análisis Financiero',
      items: [
        {
          path: '/dashboard/traffic/projections',
          label: 'Proyecciones Económicas',
          icon: DollarSign,
        },
      ],
    },
    {
      title: 'Administración',
      items: [
        { path: '/dashboard/admin/ingestion', label: 'Ingesta de Datos', icon: FileText },
        { path: '/dashboard/admin/setup', label: 'Setup Inicial Maestro', icon: Zap },
        { path: '/dashboard/admin/seed', label: 'Carga Datos UCOT', icon: Database },
        {
          path: '/dashboard/admin/maintenance-system',
          label: 'Estado del Sistema',
          icon: ShieldCheck,
        },
        { path: '/dashboard/admin/compliance', label: 'Cumplimiento MTOP/IMM', icon: Shield },
        { path: '/dashboard/traffic/brt', label: 'Referencia BRT 2027', icon: Train },
        { path: '/dashboard/traffic/scraper-status', label: 'Monitor Ingesta STM', icon: Activity },
        { path: '/dashboard/admin/config', label: 'Configuración', icon: Settings },
      ],
    },
    {
      title: 'Mi Espacio',
      items: [
        { path: '/dashboard/market', label: 'Bolsa de Trabajo', icon: ShoppingCart },
        { path: '/dashboard/my-balance', label: 'Mi Cuenta', icon: Wallet },
      ],
    },
  ];

  return (
    <aside className="w-full max-w-[18rem] md:max-w-[16rem] flex flex-col h-full overflow-y-auto overflow-x-hidden custom-scrollbar relative">
      <div className="p-6 flex items-center gap-3 border-b border-slate-900/50 bg-slate-900/20 shrink-0">
        <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center font-black text-white shadow-lg shadow-primary-900/20">
          G
        </div>
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-r from-blue-400 to-orange-400 bg-clip-text text-transparent">
            SkillRoute
          </h1>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-8 mt-4">
        <Link
          to="/dashboard"
          onClick={handleNavClick}
          className={clsx(
            'flex items-center gap-3 min-h-[44px] py-3 px-3 rounded-xl font-bold transition-all border touch-manipulation active:scale-[0.98]',
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
