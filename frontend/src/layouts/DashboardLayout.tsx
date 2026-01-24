
import { Outlet, useNavigate } from 'react-router-dom';
import { Menu, X, Zap } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import Sidebar from '../components/Sidebar';
import NotificationsDropdown from '../components/NotificationsDropdown';
import RoadAlertsWidget from '../components/RoadAlertsWidget';
import { useAuth } from '../context/AuthContext';

const DashboardLayout = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);
    const { user } = useAuth();
    const navigate = useNavigate();

    return (
        <div className="flex h-screen bg-slate-900 overflow-hidden">
            {/* Sidebar Overlay for Mobile */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[40] lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar Component */}
            <div className={clsx(
                "transition-transform duration-300 fixed lg:relative z-[50]",
                !isSidebarOpen && "-translate-x-full lg:translate-x-0"
            )}>
                <Sidebar />
            </div>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-full relative lg:ml-0">
                {/* Top Header */}
                <header className="h-16 flex items-center justify-between px-6 bg-slate-900/50 backdrop-blur-md border-b border-slate-800 z-10">
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
                            <div className="text-sm font-bold text-white tracking-tight">{user?.fullName || 'Invitado'}</div>
                            <div className="text-[10px] text-primary-400 font-black uppercase">
                                Int #{user?.internalNumber || '0000'} | {user?.role}
                            </div>
                        </div>

                        <div className="w-10 h-10 rounded-full bg-primary-600 border-2 border-primary-400 flex items-center justify-center text-white font-black shadow-lg shadow-primary-900/20">
                            {user?.firstName?.charAt(0) || 'U'}
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <div className="flex-1 overflow-auto p-4 md:p-8 bg-slate-950 custom-scrollbar">
                    <RoadAlertsWidget />
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <Outlet />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default DashboardLayout;
