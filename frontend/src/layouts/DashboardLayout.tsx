
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
    CalendarClock,
    Wallet,
    LogOut,
    Menu,
    PlusCircle,
    Share2,
    Users,
    X,
    Building2,
    Bus,
    FileSpreadsheet,
    Wrench,
    ClipboardList,
    BarChart3,
    AlertTriangle
} from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import NotificationsDropdown from '../components/NotificationsDropdown';
import { useAuth } from '../context/AuthContext';
import RoadAlertsWidget from '../components/RoadAlertsWidget';

const SidebarLink = ({ to, icon: Icon, children, onClick }: { to: string; icon: any; children: React.ReactNode, onClick?: () => void }) => (
    <NavLink
        to={to}
        onClick={onClick}
        className={({ isActive }) => clsx(
            "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
            isActive
                ? "bg-primary-600 text-white shadow-lg shadow-primary-900/20"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
        )}
    >
        <Icon className="w-5 h-5" />
        <span className="font-medium"><span>{children}</span></span>
    </NavLink>
);

const DashboardLayout = () => {
    // Initial state: Closed on mobile (width < 1024), Open on Desktop
    const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);
    const navigate = useNavigate();

    const { user, logout } = useAuth();
    const role = user?.role || 'User';

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // Close sidebar only if on mobile
    const handleMobileLinkClick = () => {
        if (window.innerWidth < 1024) {
            setIsSidebarOpen(false);
        }
    };

    const handleShareApp = async () => {
        const url = window.location.origin + '/login';
        try {
            await navigator.clipboard.writeText(url);
            alert('Enlace copiado al portapapeles: ' + url);
        } catch (err) {
            console.error('Error al copiar:', err);
            prompt('Copia este enlace para compartir:', url);
        }
        handleMobileLinkClick();
    };

    return (
        <div className="flex h-screen bg-slate-900 overflow-hidden">
            {/* Sidebar Overlay for Mobile */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-20 lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={clsx(
                "bg-slate-900 border-r border-slate-800 w-64 flex flex-col transition-all duration-300 z-30 fixed lg:relative h-full",
                !isSidebarOpen && "-translate-x-full lg:translate-x-0 lg:w-20"
            )}>
                <div className="h-16 flex items-center px-6 border-b border-slate-800">
                    {/* Logo logic remains same, just ensuring correct open state visually */}
                    <div className="flex items-center gap-2 text-white font-bold text-xl tracking-tight">
                        {isSidebarOpen ? (
                            <>
                                <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">G</div>
                                <span>Gestión UCOT</span>
                            </>
                        ) : (
                            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center text-white font-bold ml-1">G</div>
                        )}
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
                    {role === 'SuperAdmin' && (
                        <div className="mb-6">
                            <div className={clsx("text-xs font-semibold text-pink-500 uppercase mb-2 px-4", !isSidebarOpen && "hidden")}>Super Admin</div>
                            <SidebarLink to="/dashboard/super-admin/tenants" icon={Wallet} onClick={handleMobileLinkClick}>Gestión Empresas</SidebarLink>
                        </div>
                    )}

                    {(role === 'Admin' || role === 'SuperAdmin') && (
                        <div className="mb-6">
                            <div className={clsx("text-xs font-semibold text-slate-500 uppercase mb-2 px-4", !isSidebarOpen && "hidden")}>Administración</div>
                            <SidebarLink to="/dashboard/admin/rrhh" icon={Users} onClick={handleMobileLinkClick}>Recursos Humanos</SidebarLink>
                        </div>
                    )}

                    {/* Super Admin Section */}
                    {user?.role === 'SuperAdmin' && (
                        <div className="pt-4 mt-4 border-t border-slate-700/50">
                            <h4 className={clsx("px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2", !isSidebarOpen && "hidden")}>
                                Super Admin
                            </h4>
                            <NavLink
                                to="/dashboard/super-admin/tenants"
                                onClick={handleMobileLinkClick}
                                className={({ isActive }) => clsx(
                                    'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200',
                                    isActive
                                        ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/20'
                                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                )}
                            >
                                <Building2 className="w-5 h-5" />
                                <span className="font-medium">Gestión Empresas</span>
                            </NavLink>
                        </div>
                    )}

                    {/* --- DEPARTAMENTO DE TRÁNSITO --- */}
                    <div className="pt-4 mt-4 border-t border-slate-700/50">
                        <h4 className={clsx("px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2", !isSidebarOpen && "hidden")}>
                            🚦 Departamento de Tránsito
                        </h4>

                        <SidebarLink to="/dashboard/admin/boletines" icon={ClipboardList} onClick={handleMobileLinkClick}>📋 Boletines (Inspectores)</SidebarLink>
                        {/* Rotación apunta a Cartones por ahora como vista de lista, o placeholder si se prefiere */}
                        <SidebarLink to="/dashboard/admin/cartones?view=list" icon={FileSpreadsheet} onClick={handleMobileLinkClick}>🔄 Rotación de Servicios</SidebarLink>
                        <SidebarLink to="/dashboard/operativa/distribucion" icon={CalendarClock} onClick={handleMobileLinkClick}>🚌 Distribución Diaria</SidebarLink>
                        <SidebarLink to="/dashboard/admin/cartones" icon={FileSpreadsheet} onClick={handleMobileLinkClick}>⚙️ Gestión de Cartones</SidebarLink>

                        {/* NUEVO ITEM SOLICITADO FASE 2 */}
                        <SidebarLink to="/dashboard/requests" icon={Users} onClick={handleMobileLinkClick}>📨 Solicitudes y Cambios</SidebarLink>
                    </div>

                    {/* --- GESTIÓN DE FLOTA / TALLER --- */}
                    <div className="pt-4 mt-4 border-t border-slate-700/50">
                        <h4 className={clsx("px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2", !isSidebarOpen && "hidden")}>
                            🛠️ Gestión de Flota
                        </h4>
                        <NavLink
                            to="/dashboard/fleet"
                            onClick={handleMobileLinkClick}
                            className={({ isActive }) => clsx(
                                'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200',
                                isActive
                                    ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/20'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                            )}
                        >
                            <Bus className="w-5 h-5" />
                            <span className="font-medium">Coches / Inventario</span>
                        </NavLink>

                        <SidebarLink to="/dashboard/admin/maintenance" icon={Wrench} onClick={handleMobileLinkClick}>Mantenimiento</SidebarLink>
                        {/* Boletines removido de aquí arriba ya que paso a Transito */}

                        {/* Road Alerts Link */}
                        <div onClick={handleMobileLinkClick}>
                            <a href="#road-alerts-widget" className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-slate-400 hover:bg-slate-800 hover:text-white">
                                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                                <span className="font-medium text-yellow-500">Alertas de Vía</span>
                            </a>
                        </div>
                    </div>

                    <div className={clsx("text-xs font-semibold text-slate-500 uppercase mb-2 px-4", !isSidebarOpen && "hidden")}>ABL (Análisis y Logística)</div>

                    {/* ABL Sections */}
                    <SidebarLink to="/dashboard/abl" icon={BarChart3} onClick={handleMobileLinkClick}>Panel de Control</SidebarLink>

                    {(role === 'Admin' || role === 'SuperAdmin') && (
                        <SidebarLink to="/dashboard/abl/penalizations" icon={Wrench} onClick={handleMobileLinkClick}>Penalizaciones</SidebarLink>
                    )}

                    <div className="border-t border-slate-800 my-2 pt-2"></div>

                    <div className={clsx("text-xs font-semibold text-slate-500 uppercase mb-2 px-4", !isSidebarOpen && "hidden")}>Mi Espacio</div>

                    <NavLink
                        to="/dashboard/create-shift"
                        onClick={handleMobileLinkClick}
                        className={({ isActive }) => clsx(
                            "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 mb-4 border border-dashed border-slate-700",
                            isActive
                                ? "bg-slate-800 text-white"
                                : "text-primary-400 hover:bg-slate-800 hover:text-primary-300"
                        )}
                    >
                        <PlusCircle className="w-5 h-5" />
                        <span className={clsx("font-medium", !isSidebarOpen && "hidden")}>Nuevo Turno</span>
                    </NavLink>

                    {/* <SidebarLink to="/dashboard/my-stats" icon={BarChart3} onClick={handleMobileLinkClick}>Mis Estadísticas</SidebarLink> */}

                    <SidebarLink to="/dashboard/my-balance" icon={Wallet} onClick={handleMobileLinkClick}>Mi Balance</SidebarLink>

                    <div className="border-t border-slate-800 my-2 pt-2">
                        <button
                            onClick={handleShareApp}
                            className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white w-full transition-all duration-200"
                        >
                            <Share2 className="w-5 h-5" />
                            <span className="font-medium">Compartir App</span>
                        </button>
                    </div>
                </nav>

                <div className="p-4 border-t border-slate-800">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-red-500/10 hover:text-red-400 w-full transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                        <span className={clsx("font-medium", !isSidebarOpen && "hidden")}>Cerrar Sesión</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-full relative">
                {/* Top Header */}
                <header className="h-16 flex items-center justify-between px-6 bg-slate-900 border-b border-slate-800">
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 lg:hidden"
                    >
                        {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>

                    <div className="flex-1"></div>

                    <div className="flex items-center gap-4">
                        <NotificationsDropdown />

                        <div className="text-right hidden sm:block">
                            <div className="text-sm font-medium text-white"><span>{user?.fullName || 'Usuario'}</span></div>
                            <div className="text-xs text-slate-500">
                                <span>Int #{user?.internalNumber || '0000'}</span>
                                {(user as any)?.tenant?.name && (
                                    <span className="ml-1 text-primary-400"> • {(user as any).tenant.name}</span>
                                )}
                            </div>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 overflow-hidden">
                            {/* Avatar Placeholder */}
                            <div className="w-full h-full flex items-center justify-center text-slate-500 font-bold">
                                <span>{user?.firstName?.charAt(0) || 'U'}</span>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <div className="flex-1 overflow-auto p-3 md:p-6 bg-slate-950">
                    <RoadAlertsWidget />
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default DashboardLayout;
