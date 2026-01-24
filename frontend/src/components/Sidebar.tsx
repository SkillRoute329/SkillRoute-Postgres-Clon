import { Link, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, Users, Bus, Wrench, FileText,
    Calendar, Map, AlertTriangle, ChevronRight,
    Settings, LogOut, Wallet, ShoppingCart, Activity, ShieldCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import clsx from 'clsx';

const Sidebar = () => {
    const location = useLocation();
    const { logout, user } = useAuth();

    const menuGroups = [
        {
            title: 'Departamento de Tránsito',
            items: [
                { path: '/dashboard/operativa/inspector', label: '📱 Panel Inspector', icon: AlertTriangle },
                { path: '/dashboard/admin/boletines', label: 'Histórico Boletines', icon: FileText },
                { path: '/dashboard/admin/cartones', label: 'Rotación de Servicios', icon: Calendar },
                { path: '/dashboard/operativa/distribucion', label: 'Distribución Diaria', icon: Activity },
                { path: '/dashboard/admin/rotation-matrix', label: 'Matriz de Rotación', icon: Settings },
                { path: '/dashboard/admin/shifts', label: 'Solicitudes y Cambios', icon: Users },
            ]
        },
        {
            title: 'Gestión de Flota',
            items: [
                { path: '/dashboard/fleet', label: 'Coches / Inventario', icon: Bus },
                { path: '/dashboard/admin/maintenance', label: 'Mantenimiento', icon: Wrench },
                { path: '/dashboard/driver/navigation', label: 'Navegador UCOT', icon: Map },
                { path: '/dashboard/alerts', label: 'Alertas de Vía', icon: AlertTriangle },
            ]
        },
        {
            title: 'Recursos Humanos (RRHH)',
            items: [
                { path: '/dashboard/admin/rrhh', label: 'Gestión de Personal', icon: Users },
                { path: '/dashboard/admin/employees', label: 'Fichas Médicas/CI', icon: Wallet },
            ]
        },
        {
            title: 'Soporte y Salud',
            items: [
                { path: '/dashboard/admin/maintenance-system', label: 'Estado del Sistema', icon: ShieldCheck },
                { path: '/dashboard/admin/ingestion', label: 'Ingesta de Datos', icon: FileText },
            ]
        },
        {
            title: 'Mi Espacio',
            items: [
                { path: '/dashboard/market', label: 'Bolsa de Trabajo', icon: ShoppingCart },
                { path: '/dashboard/my-balance', label: 'Mi Cuenta', icon: Wallet },
            ]
        }
    ];

    return (
        <aside className="w-72 bg-slate-950 border-r border-slate-800 flex flex-col h-full overflow-y-auto custom-scrollbar relative">
            <div className="p-6 flex items-center gap-3 border-b border-slate-900/50 bg-slate-900/20 shrink-0">
                <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center font-black text-white shadow-lg shadow-primary-900/20">
                    G
                </div>
                <div>
                    <h1 className="text-white font-black tracking-tighter text-lg leading-none">Gestión UCOT</h1>
                    <span className="text-[10px] text-primary-500 font-bold uppercase tracking-widest">Plataforma 2.0</span>
                </div>
            </div>

            <nav className="flex-1 p-4 space-y-8 mt-4">
                <Link
                    to="/dashboard"
                    className={clsx(
                        "flex items-center gap-3 p-3 rounded-xl font-bold transition-all border",
                        location.pathname === '/dashboard'
                            ? "bg-primary-600/10 border-primary-500 text-primary-400 shadow-lg shadow-primary-900/10"
                            : "border-transparent text-slate-400 hover:bg-slate-900 hover:text-white"
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
                                        className={clsx(
                                            "flex items-center justify-between p-3 rounded-xl text-sm font-medium transition-all group border",
                                            isActive
                                                ? "bg-slate-800 border-slate-700 text-white"
                                                : "border-transparent text-slate-400 hover:bg-slate-900 hover:text-white"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <Icon className={clsx("w-4 h-4 transition-colors", isActive ? "text-primary-400" : "text-slate-500 group-hover:text-primary-400")} />
                                            {item.label}
                                        </div>
                                        <ChevronRight className={clsx("w-3 h-3 opacity-0 group-hover:opacity-100 transition-all", isActive && "opacity-100")} />
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
                    className="w-full flex items-center gap-3 p-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-all font-bold text-sm"
                >
                    <LogOut className="w-5 h-5" />
                    Cerrar Sesión
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
