import { Suspense, useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, X, Zap, Activity, ShieldAlert, Bus, Bell, MapPin } from 'lucide-react';
import { LiveDataProvider, useLiveData } from '../context/LiveDataContext';
import clsx from 'clsx';
import Sidebar from '../components/Sidebar';
import NotificationsDropdown from '../components/NotificationsDropdown';
import RoadAlertsWidget from '../components/RoadAlertsWidget';
import RouteErrorBoundary from '../components/RouteErrorBoundary';
import DriverAlertOverlay from '../components/DriverAlertOverlay';
import PropagacionLiveWidget from '../components/PropagacionLiveWidget';
import DriverLineaAlertToast from '../components/DriverLineaAlertToast';
import { useAuth } from '../context/AuthContext';
import AiCopilotChat from '../components/AiCopilotChat';
import { Sparkles } from 'lucide-react';


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

// ── Indicadores en vivo — usa LiveDataContext ─────────────────────────────────
const LiveIndicators = () => {
  const { fleetKPIs, busesLoading, alertasCriticas, otpHoy, selectedLine, setSelectedLine, selectedOperator, setSelectedOperator } = useLiveData();
  return (
    <div className="hidden md:flex items-center gap-2 text-[11px] font-bold">
      {/* FASE 5.35: selector global de operador. Filtra el contexto y se
          recuerda entre pantallas (localStorage). */}
      <select
        value={selectedOperator}
        onChange={(e) => setSelectedOperator(e.target.value)}
        className="bg-slate-800 border border-slate-700/60 rounded-full px-3 py-1 text-emerald-300 font-bold text-[10px] focus:outline-none focus:border-emerald-500"
        title="Operador activo · contexto compartido entre módulos"
      >
        <option value="70">UCOT (70)</option>
        <option value="50">CUTCSA (50)</option>
        <option value="20">COME (20)</option>
        <option value="10">COETC (10)</option>
      </select>
      <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/60 rounded-full px-3 py-1" title="Buses propios · total sistema">
        <Bus className={`w-3 h-3 ${busesLoading ? 'text-slate-500 animate-pulse' : 'text-emerald-400'}`} />
        {busesLoading ? (
          <span className="text-slate-500">···</span>
        ) : (
          <>
            <span className="text-emerald-400">{fleetKPIs.totalPropios}</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400">{fleetKPIs.totalPropios + fleetKPIs.totalRivales}</span>
            <span className="text-slate-500">sistema</span>
          </>
        )}
      </div>

      {alertasCriticas > 0 && (
        <div className="flex items-center gap-1.5 bg-red-950/60 border border-red-500/40 rounded-full px-3 py-1 animate-pulse" title="Alertas críticas activas">
          <Bell className="w-3 h-3 text-red-400" />
          <span className="text-red-300">{alertasCriticas}</span>
        </div>
      )}

      {otpHoy !== null && (
        <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/60 rounded-full px-3 py-1" title="OTP del día (GPS)">
          <span className={otpHoy >= 90 ? 'text-emerald-400' : otpHoy >= 75 ? 'text-yellow-400' : 'text-red-400'}>
            {otpHoy.toFixed(1)}%
          </span>
          <span className="text-slate-500">OTP</span>
        </div>
      )}

      {/* Línea seleccionada — contexto compartido entre módulos */}
      {selectedLine && (
        <div className="flex items-center gap-1.5 bg-blue-950/60 border border-blue-500/40 rounded-full pl-3 pr-1.5 py-1" title="Línea activa en todos los módulos">
          <MapPin className="w-3 h-3 text-blue-400" />
          <span className="text-blue-300">L{selectedLine}</span>
          <button
            onClick={() => setSelectedLine(null)}
            className="ml-1 text-slate-500 hover:text-white transition-colors rounded-full p-0.5"
            title="Limpiar filtro de línea"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};

// --- SYSTEM HEALTH INDICATOR with POPUP ---
import { SystemHealthPanel } from '../components/admin/SystemHealthPanel';

const SystemStatus = () => {
  const [status, setStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [latency, setLatency] = useState<number>(0);
  const [isOpen, setIsOpen] = useState(false);

  const checkStatus = async () => {
    const start = Date.now();
    try {
      await fetch('/version.json', { cache: 'no-store' });
      setLatency(Date.now() - start);
      setStatus('online');
    } catch {
      setStatus('offline');
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
            <span className="text-[10px] font-bold text-emerald-400">
              EN LÍNEA
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

const DashboardLayoutInner = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [mostrarCopiloto, setMostrarCopiloto] = useState(false);
  const { user } = useAuth();
  const location = useLocation();
  const { selectedLine } = useLiveData();

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

          <LiveIndicators />

          <div className="flex items-center gap-4">
            {/* Copiloto IA Global */}
            <button
              onClick={() => setMostrarCopiloto(!mostrarCopiloto)}
              title="Activar Copiloto Táctico (IA)"
              className={clsx(
                "flex items-center justify-center min-h-[44px] min-w-[44px] p-2.5 rounded-full border-2 transition-all duration-300 touch-manipulation",
                mostrarCopiloto 
                  ? "border-indigo-400 bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.5)]"
                  : "border-indigo-500/40 bg-slate-800 text-indigo-400 hover:bg-indigo-500/10 hover:border-indigo-400"
              )}
            >
              <Sparkles size={18} className={clsx(mostrarCopiloto ? "animate-spin" : "animate-pulse")} />
            </button>

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
              <RouteErrorBoundary key={location.pathname} module="Módulo">
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


        {/* ── PANEL LATERAL IA SOBERANA GLOBAL ── */}
        {mostrarCopiloto && (
          <div 
            className="absolute top-0 right-0 bottom-0 w-full sm:w-[420px] z-[2000] bg-slate-900 border-l border-slate-700 shadow-2xl transform transition-all animate-in slide-in-from-right duration-300 flex flex-col"
            style={{ height: '100%' }}
          >
            <div className="relative h-full flex flex-col">
              {/* Botón Cerrar Panel flotante o cabecera */}
              <div className="absolute -left-10 top-6 z-50">
                <button 
                  onClick={() => setMostrarCopiloto(false)}
                  className="bg-slate-800 text-slate-300 hover:text-white p-2 rounded-l-xl border border-slate-700 border-r-0 shadow-2xl transition-colors"
                  title="Cerrar Copiloto"
                >
                  <X size={20} />
                </button>
              </div>
              
              <AiCopilotChat 
                className="flex-1 rounded-none border-0" 
                placeholder="Consultá sobre coches, líneas, conductores o estadísticas generales..."
                initialContext={{
                  linea: selectedLine || 'Sistema Completo',
                  destino: 'Análisis Global',
                  rivales: ['CUTCSA', 'COME', 'COETC', 'UCOT'],
                  puntosCarga: ['Red General STM'],
                  estrategia: 'Asistencia de inteligencia integral para la operación.'
                }}
              />
            </div>
          </div>
        )}

      </main>

      {/* Overlay FCM de alertas tácticas — activo en todas las vistas
          autenticadas (conductor, inspector, tráfico). Escucha onMessage
          foreground y muestra modal con ACK. */}
      <DriverAlertOverlay />

      {/* FASE 5.30 (2026-05-21) — Widget de propagación en vivo: muestra
          eventos del bus socket (motor de consecuencias, operaciones,
          cambios de DB) en tiempo real. Materializa visualmente el cometido
          de interconexión: cada acción en una pantalla se ve aquí. */}
      <PropagacionLiveWidget />

      {/* FASE 5.35 (2026-05-22) — Toast de alerta crítica de línea para
          conductores: aparece sólo si el rol es driver/chofer y el motor
          dispara un evento crítico en alguna línea. Cierra el bucle de
          propagación hacia la planta operativa. */}
      <DriverLineaAlertToast />
    </div>
  );
};

const DashboardLayout = () => (
  <LiveDataProvider>
    <DashboardLayoutInner />
  </LiveDataProvider>
);

export default DashboardLayout;
