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
  PieChart,
  Navigation,
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
    // ── 1. Trabajo diario: planificación, despacho, navegación ──
    {
      title: 'Operación Diaria',
      items: [
        // Hub: Cartones + Matriz + Boletín + Asignación de Servicios
        { path: '/dashboard/traffic/planificacion', label: 'Planificación',       icon: ClipboardList },
        // Hub: Terminal Listero + Listero Cascada + Distribución
        { path: '/dashboard/traffic/listero',       label: 'Listero y Distribución', icon: Users        },
        { path: '/dashboard/traffic/navigation',    label: 'Navegador',           icon: Map           },
      ],
    },

    // ── 2. Supervisión en turno: todo lo del despachante en una sección ──
    {
      title: 'Control y Monitoreo',
      items: [
        // Hub: Centro de Turno + Desvíos + Radar Sombra
        { path: '/dashboard/traffic/centro-turno',             label: 'Turno en Vivo',      icon: Zap    },
        // Hub: Monitoreo de Flota + Mapa en Vivo STM
        { path: '/dashboard/traffic/fleet-monitor',            label: 'Posición de Flota',  icon: Radio  },
        // Hub: Diagnóstico + Ranking + OTP + AutoStats GPS
        { path: '/dashboard/traffic/diagnostico-cumplimiento', label: 'Cumplimiento',       icon: Search },
        // Hub: Incidencias + Contingencia
        { path: '/dashboard/traffic/incidents',                label: 'Incidencias',        icon: Siren  },
      ],
    },

    // ── 3. Análisis estratégico y competitivo ──
    {
      title: 'Inteligencia Competitiva',
      items: [
        { path: '/dashboard/traffic/ceo',                  label: 'Centro de Mando',    icon: TrendingUp },
        // Hub: Corredores + Market Share + Penetración + Analytics + Headway
        { path: '/dashboard/traffic/corridor-intelligence', label: 'Inteligencia Cross-Op.',   icon: Network    },
        // Hub: Mapa Corredores + Reproducción GPS
        { path: '/dashboard/traffic/corridor-map',         label: 'Mapas Estratégicos', icon: Map        },
        { path: '/dashboard/traffic/brt',                  label: 'BRT 2027',           icon: Train      },
      ],
    },

    // ── 4. Financiero (todo en un hub) ──
    {
      title: 'Financiero',
      items: [
        // Hub: Proyecciones + Financiero Operativo + ROI
        { path: '/dashboard/traffic/financiero', label: 'Análisis Financiero', icon: DollarSign },
      ],
    },

    // ── 5. Flota y personal (2 hubs) ──
    {
      title: 'Flota y Personal',
      items: [
        // Hub: Inventario + Disponibilidad + Mantenimiento + Revisión + Alertas
        { path: '/dashboard/fleet',       label: 'Gestión de Flota',    icon: Bus   },
        // Hub: Personal + Fichas + Turnos + Rotación + Feriados
        { path: '/dashboard/admin/rrhh',  label: 'Gestión de Personal', icon: Users },
      ],
    },

    // ── 6. Administración del sistema (4 items) ──
    {
      title: 'Administración',
      items: [
        { path: '/dashboard/admin/asignacion-vehiculos', label: 'Asignación de Coches',    icon: Bus        },
        // Hub: Control Inspectores + Captura Inspector
        { path: '/dashboard/traffic/inspector-control',  label: 'Inspectores',             icon: Activity   },
        // Hub: Estado Sistema + Monitor STM + Ingesta + Turnos OTP + Config + Setup + Seed
        { path: '/dashboard/admin/sistema',              label: 'Sistema y Configuración', icon: ShieldCheck},
        // Hub: Cumplimiento MTOP + Cross-Op + Rendición + Audit Log
        { path: '/dashboard/admin/regulatorio',          label: 'Reportes Regulatorios',   icon: Shield     },
      ],
    },

    // ── 7. Área personal del empleado ──
    {
      title: 'Mi Espacio',
      items: [
        { path: '/dashboard/driver/compliance', label: 'Mi Rendimiento',  icon: Activity     },
        { path: '/dashboard/market',            label: 'Bolsa de Trabajo', icon: ShoppingCart },
        { path: '/dashboard/my-balance',        label: 'Mi Cuenta',        icon: Wallet       },
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