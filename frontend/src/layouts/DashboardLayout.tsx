import { Suspense, useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, X, Zap, Activity, ShieldAlert } from 'lucide-react'; // Added ShieldAlert
import clsx from 'clsx';
import Sidebar from '../components/Sidebar';
import NotificationsDropdown from '../components/NotificationsDropdown';
import RoadAlertsWidget from '../components/RoadAlertsWidget';
import RouteErrorBoundary from '../components/RouteErrorBoundary';
import DriverAlertOverlay from '../components/DriverAlertOverlay';
import { useAuth } from '../context/AuthContext';
import { db } from '../config/firebase';
import { getDoc, doc } from 'firebase/firestore';

const SimulationBanner = () => {
  const isSim = sessionStorage.getItem('TRANSFORMA_SIMULATION_MODE') === 'true';
  if (!isSim) return null;
  return (
    <div className="bg-purple-600 text-white text-xs font-bold px-4 py-1 flex items-center justify-center gap-2 animate-pulse shadow-lg z-[1000] relative">
      <ShieldAlert className="w-4 h-4" />
      MODO SIMULACIÓN / PRUEBAS - CAMBIOS NO GUARDADOS
    </div>
  );
};

// --- SYSTEM HEALTH INDICATOR with POPUP ---
import { SystemHealthPanel } from '../components/admin/SystemHealthPanel';
import { ConnectivityDebugWidget } from '../components/admin/ConnectivityDebugWidget';

const SystemStatus = () => {
  const [status, setStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [latency, setLatency] = useState<number>(0);
  const [isOpen, setIsOpen] = useState(false);

  const checkStatus = async () => {
    const start = Date.now();
    try {
      await getDoc(doc(db, '_healthcheck', 'status'));
      const lat = Date.now() - start;
      setLatency(lat);
      setStatus('online');
    } catch (e: any) {
      if (e?.code === 'permission-denied') {
        // Red está funcionando, el servidor respondió aunque haya bloqueado por reglas
        const lat = Date.now() - start;
        setLatency(lat);
        setStatus('online');
      } else {
        console.error('Health Check Failed:', e);
        setStatus('offline');
      }
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (isOpen && !(e.target as Element).closest('.health-widget')) {
        setIsOpen(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [isOpen]);

  return (
    <div className="relative health-widget">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 min-h-[44px] min-w-[44px] px-3 py-2 rounded-full bg-slate-800 border border-slate-700 hover:bg-slate-700 active:bg-slate-600 transition-colors touch-manipulation disabled:opacity-50"
        title={`Estado del Sistema (Latencia: ${latency}ms)`}
      >
        {status === 'checking' && <Activity className="w-4 h-4 text-slate-500 animate-pulse" />}

        {status === 'online' && (
          <>
            <div className="relative">
              <div
                className={`w-2 h-2 rounded-full animate-pulse ${latency > 1000 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
              ></div>
              <div
                className={`absolute inset-0 rounded-full animate-ping opacity-20 ${latency > 1000 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
              ></div>
            </div>
            <span
              className={`text-[10px] font-bold ${latency > 1000 ? 'text-yellow-400' : 'text-emerald-400'}`}
            >
              {latency > 1000 ? 'LENTO' : 'EN LÍNEA'}
            </span>
          </>
        )}

        {status === 'offline' && (
          <>
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span className="text-[10px] font-bold text-red-400">OFFLINE</span>
          </>
        )}
      </button>

      {/* POPUP PANEL */}
      {isOpen && (
        <div className="absolute right-0 mt-4 z-[100] animate-fade-in-up origin-top-right">
          <SystemHealthPanel />
        </div>
      )}
    </div>
  );
};

const DashboardLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user } = useAuth();

  return (
    <div className="flex h-screen w-full max-w-[100vw] bg-slate-900 overflow-hidden relative">
      {/* Simulation Banner REMOVED per user request */}

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[40] md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Component */}
      <div
        className={clsx(
          'transition-transform duration-300 fixed md:static top-0 left-0 z-[50] h-full flex-shrink-0 w-72 md:w-64 bg-slate-950 border-r border-slate-800',
          !isSidebarOpen && '-translate-x-full md:translate-x-0',
        )}
      >
        <Sidebar onClose={() => setIsSidebarOpen(false)} />
      </div>

      {/* Main Content */}
      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative lg:ml-0">
        {/* Top Header */}
        <header className="h-16 flex items-center justify-between px-6 bg-slate-900/50 backdrop-blur-md border-b border-slate-800 z-10">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-lg hover:bg-slate-800 active:bg-slate-700 text-slate-400 md:hidden touch-manipulation"
            aria-label={isSidebarOpen ? 'Cerrar menú' : 'Abrir menú'}
          >
            {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

          <div className="flex-1"></div>

          <div className="flex items-center gap-4">
            {/* Health Check Widget */}
            <SystemStatus />
            <div className="w-px h-6 bg-slate-700 mx-2 hidden sm:block"></div>

            <NotificationsDropdown />

            <div className="text-right hidden sm:block">
              <div className="text-sm font-bold text-white tracking-tight">
                {user?.fullName || 'Usuario UCOT'}
              </div>
              <div className="text-[10px] text-primary-400 font-black uppercase">
                Int #{user?.internalNumber || '----'} | {user?.role || 'Verificando...'}
              </div>
            </div>

            <div className="w-10 h-10 rounded-full bg-primary-600 border-2 border-primary-400 flex items-center justify-center text-white font-black shadow-lg shadow-primary-900/20">
              {user?.firstName?.charAt(0) || user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 flex flex-col min-h-0 overflow-x-hidden overflow-y-auto bg-slate-900/50 custom-scrollbar relative">
          <div className="p-4 md:p-8 min-h-full flex flex-col flex-1 max-w-[100vw] w-full">
            <RoadAlertsWidget />
            <div className="flex-1 min-h-0 relative w-full max-w-full">
              <RouteErrorBoundary module="Módulo">
                <Suspense
                  fallback={
                    <div className="flex flex-col items-center justify-center p-12 text-slate-500">
                      <Zap className="w-10 h-10 mb-4 animate-pulse text-primary-500" />
                      <p className="text-xs font-black uppercase tracking-widest">
                        Cargando Módulo...
                      </p>
                    </div>
                  }
                >
                  <div className="h-full min-h-0 w-full max-w-full">
                    <Outlet />
                  </div>
                </Suspense>
              </RouteErrorBoundary>
            </div>
          </div>
        </div>

        {/* NETWORK DEBUGGER (Only Admins) */}
        {user?.role === 'ADMIN' && <ConnectivityDebugWidget />}
      </main>

      {/* Overlay FCM de alertas tácticas — activo en todas las vistas
          autenticadas (conductor, inspector, tráfico). Escucha onMessage
          foreground y muestra modal con ACK. */}
      <DriverAlertOverlay />
    </div>
  );
};

export default DashboardLayout;
