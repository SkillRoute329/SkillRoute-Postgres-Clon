
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    CalendarClock,
    Wallet,
    Settings,
    LogOut,
    Menu,
    X,
    PlusCircle,
    Users,
    MessageCircle,
    QrCode,
    Share2
} from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import NotificationsDropdown from '../components/NotificationsDropdown';
import { useAuth } from '../context/AuthContext';

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
                                <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">T</div>
                                <span>Transforma</span>
                            </>
                        ) : (
                            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center text-white font-bold ml-1">T</div>
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
                            <SidebarLink to="/dashboard/admin/shifts" icon={CalendarClock} onClick={handleMobileLinkClick}>Gestión Turnos</SidebarLink>
                            <SidebarLink to="/dashboard/admin/users" icon={Users} onClick={handleMobileLinkClick}>Usuarios</SidebarLink>
                            <SidebarLink to="/dashboard/admin/balances" icon={Wallet} onClick={handleMobileLinkClick}>Balances Globales</SidebarLink>
                            <SidebarLink to="/dashboard/admin/communications" icon={MessageCircle} onClick={handleMobileLinkClick}>Comunicaciones</SidebarLink>
                            <SidebarLink to="/dashboard/admin/whatsapp-bot" icon={QrCode} onClick={handleMobileLinkClick}>Bot WhatsApp</SidebarLink>

                            <SidebarLink to="/dashboard/admin/config" icon={Settings} onClick={handleMobileLinkClick}>Configuración</SidebarLink>
                        </div>
                    )}

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

                    <SidebarLink to="/dashboard/market" icon={LayoutDashboard} onClick={handleMobileLinkClick}>Turnos Públicos</SidebarLink>
                    <SidebarLink to="/dashboard/my-shifts" icon={CalendarClock} onClick={handleMobileLinkClick}>Mis Turnos</SidebarLink>
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
                <div className="flex-1 overflow-auto p-6 bg-slate-950">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default DashboardLayout;
