import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
    CalendarClock,
    Wallet,
    LogOut,
    Menu,
    PlusCircle,
    UserPlus,
    Share2,
    Users,
    X,
    Building2,
    Bus,
    FileSpreadsheet,
    Wrench,
    ClipboardList,
    BarChart3,
    AlertTriangle,
    LayoutTemplate,
    Activity,
    Zap,
    Map
} from 'lucide-react';
import { useState, useEffect } from 'react';
import clsx from 'clsx';
import NotificationsDropdown from '../components/NotificationsDropdown';
import { useAuth } from '../context/AuthContext';
import RoadAlertsWidget from '../components/RoadAlertsWidget';
import { ShiftService } from '../services/api';

// Dynamic Menu Interfaces
interface SystemModuleItem {
    id: string;
    label: string;
    path: string;
    icon?: string;
}

interface SystemModule {
    id: string;
    label: string;
    icon: string;
    role?: string;
    items: SystemModuleItem[];
}

const ICON_MAP: Record<string, any> = {
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
    AlertTriangle,
    LayoutTemplate,
    Activity,
    Zap,
    Map
};

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
    const [menuItems, setMenuItems] = useState<SystemModule[]>([]);
    const navigate = useNavigate();

    const { user, logout } = useAuth();
    const role = user?.role || 'User';

    useEffect(() => {
        const fetchMenu = async () => {
            try {
                const response = await ShiftService.getMenu();
                const menu = response.modules || response;
                if (Array.isArray(menu) && menu.length > 0) {
                    setMenuItems(menu);
                }
            } catch (error) {
                console.error("Failed to load dynamic menu, using fallback.", error);
            }
        };
        fetchMenu();
    }, [user]);

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

    // PWA Install Logic
    useEffect(() => {
        const handler = (e: any) => {
            e.preventDefault();
            const btnContainer = document.getElementById('pwa-install-container');
            const btn = document.getElementById('pwa-install-btn');
            if (btnContainer && btn) {
                btnContainer.classList.remove('hidden');
                btn.onclick = () => {
                    e.prompt();
                    e.userChoice.then((choiceResult: any) => {
                        if (choiceResult.outcome === 'accepted') {
                            btnContainer.classList.add('hidden');
                        }
                    });
                };
            }
        };
        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const renderFallbackMenu = () => (
        <>
            {/* Fallback items if needed */}
            {role.toUpperCase() === 'SUPERADMIN' && (
                <div className="mb-6 border-t border-slate-700/30 pt-4">
                    <div className={clsx("text-xs font-semibold text-pink-500 uppercase mb-2 px-4", !isSidebarOpen && "hidden")}>SYSTEM ROOT</div>
                    <SidebarLink to="/dashboard/super-admin/tenants" icon={Building2} onClick={handleMobileLinkClick}>Gestión de Empresas</SidebarLink>
                </div>
            )}

            {/* --- DEPARTAMENTO DE TRÁNSITO --- */}
            <div className="pt-4 mt-4 border-t border-slate-700/50">
                <h4 className={clsx("px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2", !isSidebarOpen && "hidden")}>
                    🚦 Departamento de Tránsito
                </h4>

                <SidebarLink to="/dashboard/admin/boletines" icon={ClipboardList} onClick={handleMobileLinkClick}>📋 Boletines (Inspectores)</SidebarLink>
                <SidebarLink to="/dashboard/admin/rotation-matrix" icon={FileSpreadsheet} onClick={handleMobileLinkClick}>🔄 Rotación de Servicios</SidebarLink>
                <SidebarLink to="/dashboard/operativa/distribucion" icon={CalendarClock} onClick={handleMobileLinkClick}>🚌 Distribución Diaria</SidebarLink>
                <SidebarLink to="/dashboard/admin/cartones" icon={FileSpreadsheet} onClick={handleMobileLinkClick}>⚙️ Gestión de Cartones</SidebarLink>
                <SidebarLink to="/dashboard/requests" icon={Users} onClick={handleMobileLinkClick}>📨 Solicitudes y Cambios</SidebarLink>
            </div>

            {/* --- GESTIÓN DE FLOTA / TALLER --- */}
            <div className="pt-4 mt-4 border-t border-slate-700/50">
                <h4 className={clsx("px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2", !isSidebarOpen && "hidden")}>
                    🛠️ Gestión de Flota
                </h4>
                <SidebarLink to="/dashboard/fleet" icon={Bus} onClick={handleMobileLinkClick}>Coches / Inventario</SidebarLink>
                <SidebarLink to="/dashboard/admin/maintenance" icon={Wrench} onClick={handleMobileLinkClick}>Mantenimiento</SidebarLink>
                <SidebarLink to="/dashboard/driver/navigation" icon={Bus} onClick={handleMobileLinkClick}>
                    <span className="text-blue-400 font-bold">🗺️ Navegador UCOT</span>
                </SidebarLink>
                <SidebarLink to="/dashboard/driver/navigation" icon={AlertTriangle} onClick={handleMobileLinkClick}>
                    <span className="text-yellow-500 font-bold">Alertas de Vía</span>
                </SidebarLink>
            </div>

            <div className={clsx("text-xs font-semibold text-slate-500 uppercase mb-2 px-4", !isSidebarOpen && "hidden")}>ABL (Análisis y Logística)</div>
            <SidebarLink to="/dashboard/abl" icon={BarChart3} onClick={handleMobileLinkClick}>Panel de Control</SidebarLink>
            {(role.toUpperCase() === 'ADMIN' || role.toUpperCase() === 'SUPERADMIN') && (
                <SidebarLink to="/dashboard/abl/penalizations" icon={Wrench} onClick={handleMobileLinkClick}>Penalizaciones</SidebarLink>
            )}
        </>
    );

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
                    {/* DYNAMIC MENU vs FALLBACK */}
                    {menuItems.length > 0 ? (
                        menuItems.map((module) => (
                            <div key={module.id} className="pt-4 mt-4 border-t border-slate-700/50">
                                <h4 className={clsx("px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2", !isSidebarOpen && "hidden")}>
                                    {module.label}
                                </h4>
                                {module.items.map(item => {
                                    const ItemIcon = ICON_MAP[item.icon || ''] || ICON_MAP[module.icon] || LayoutTemplate;
                                    return (
                                        <SidebarLink
                                            key={item.id}
                                            to={item.path}
                                            icon={ItemIcon}
                                            onClick={handleMobileLinkClick}
                                        >
                                            {item.label}
                                        </SidebarLink>
                                    );
                                })}
                            </div>
                        ))
                    ) : (
                        renderFallbackMenu()
                    )}

                    {/* --- MODO DEBUG: SIN RESTRICCIONES --- */}
                    <div className="pt-4 mt-4 border-t border-red-500/50">
                        <h4 className={clsx("px-4 text-[10px] font-black text-red-500 uppercase tracking-widest mb-2", !isSidebarOpen && "hidden")}>
                            🔴 MODO DEBUG ACTIVO
                        </h4>
                        <SidebarLink to="/dashboard/admin/employees" icon={Users} onClick={handleMobileLinkClick}>👥 Gestión de Personal (RRHH)</SidebarLink>
                        <SidebarLink to="/dashboard/admin/users/create" icon={UserPlus} onClick={handleMobileLinkClick}>🔑 Alta de Personal</SidebarLink>
                        <SidebarLink to="/dashboard/admin/rrhh" icon={Users} onClick={handleMobileLinkClick}>⚙️ Áreas y Departamentos</SidebarLink>
                    </div>

                    <div className="border-t border-slate-800 my-2 pt-2"></div>

                    {/* MI ESPACIO (Always present) */}
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

                    <SidebarLink to="/dashboard/driver/schedule" icon={CalendarClock} onClick={handleMobileLinkClick}>Mi Diagrama</SidebarLink>

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
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-red-500/10 hover:text-red-400 w-full transition-colors mb-2"
                    >
                        <LogOut className="w-5 h-5" />
                        <span className={clsx("font-medium", !isSidebarOpen && "hidden")}>Cerrar Sesión</span>
                    </button>
                    {isSidebarOpen && (
                        <div className="text-[10px] text-slate-600 text-center font-mono">
                            v2.5 - HYBRID ENGINE (ONLINE)
                        </div>
                    )}
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
                        {/* PWA INSTALL TRIGGER */}
                        <div id="pwa-install-container" className="hidden">
                            <button
                                id="pwa-install-btn"
                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg animate-pulse flex items-center gap-2"
                            >
                                <Zap className="w-3 h-3" />
                                INSTALAR APP
                            </button>
                        </div>

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
