import { useState, useEffect } from 'react';
import StatsWidget from '../components/StatsWidget';
import { useAuth } from '../context/AuthContext';
import ExcelUploader from '../components/ExcelUploader';
import VehicleCheckModal from '../components/VehicleCheckModal';
import {
  Play, CheckCircle, AlertTriangle, Bus, Users, ShieldAlert,
  TrendingDown, Activity, Radio, ArrowRight, RefreshCw, Bell,
} from 'lucide-react';

// ─── Panel operacional para Admin/Inspector ───────────────────────────────────

interface ResumenDiario {
  turnosTotal: number;
  turnosCubiertos: number;
  turnosSinConductor: number;
  conductoresAusentes: number;
  conductoresReservaLibres: number;
  vehiculosEnTaller: number;
  coberturaFlota: number;
  alertasActivas: number;
  impactoIngresosRiesgoUSD: number;
  lineasEnRiesgoIMM: string[];
}

interface FleetKPI {
  totalUCOT: number;
  totalRivales: number;
  lineasActivas: number;
  bunchingPares: number;
}

function PanelOperacional() {
  const [resumen, setResumen] = useState<ResumenDiario | null>(null);
  const [fleet, setFleet] = useState<FleetKPI | null>(null);
  const [alertas, setAlertas] = useState<Array<{ id: string; urgencia: string; titulo: string; mensaje: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [fleetLoading, setFleetLoading] = useState(true);

  useEffect(() => {
    const fecha = new Date().toISOString().split('T')[0];

    // Resumen del día
    fetch(`/api/listero/resumen?fecha=${fecha}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.resumen) setResumen(d.resumen); })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Alertas activas
    fetch(`/api/listero/alertas?fecha=${fecha}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.alertas) setAlertas(d.alertas.slice(0, 5)); })
      .catch(() => {});

    // GPS Fleet intel
    fetch('/api/positions')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d?.buses) return;
        const buses = d.buses as Array<{ empresaId: number; linea: string; lat: number; lng: number }>;
        const ucot = buses.filter((b) => b.empresaId === 70);
        const lineas = new Set(ucot.map((b) => b.linea).filter(Boolean)).size;
        // Detección bunching simple
        let bunching = 0;
        for (let i = 0; i < ucot.length; i++) {
          for (let j = i + 1; j < ucot.length; j++) {
            if (ucot[i].linea !== ucot[j].linea) continue;
            const R = 6371;
            const dLat = ((ucot[j].lat - ucot[i].lat) * Math.PI) / 180;
            const dLng = ((ucot[j].lng - ucot[i].lng) * Math.PI) / 180;
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(ucot[i].lat * Math.PI / 180) * Math.cos(ucot[j].lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
            if (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) < 0.8) bunching++;
          }
        }
        setFleet({ totalUCOT: ucot.length, totalRivales: buses.length - ucot.length, lineasActivas: lineas, bunchingPares: bunching });
      })
      .catch(() => {})
      .finally(() => setFleetLoading(false));
  }, []);

  const URGENCIA_COLOR: Record<string, string> = {
    critica: 'border-red-500/50 bg-red-900/20 text-red-300',
    alta:    'border-orange-500/50 bg-orange-900/20 text-orange-300',
    media:   'border-amber-500/40 bg-amber-900/10 text-amber-300',
    baja:    'border-slate-600 bg-slate-800/40 text-slate-300',
  };

  return (
    <div className="space-y-5">
      {/* KPIs Operacionales */}
      <div>
        <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Situación del día</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Cargando estado operacional…
          </div>
        ) : resumen ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Cobertura flota', value: `${resumen.coberturaFlota}%`, icon: Activity, color: resumen.coberturaFlota >= 90 ? 'text-emerald-400' : resumen.coberturaFlota >= 75 ? 'text-amber-400' : 'text-red-400', sub: `${resumen.turnosCubiertos}/${resumen.turnosTotal} turnos` },
              { label: 'Sin conductor', value: resumen.turnosSinConductor, icon: Users, color: resumen.turnosSinConductor > 0 ? 'text-amber-400' : 'text-slate-500', sub: `${resumen.conductoresReservaLibres} reservas libres` },
              { label: 'Vehículos en taller', value: resumen.vehiculosEnTaller, icon: Bus, color: resumen.vehiculosEnTaller > 0 ? 'text-orange-400' : 'text-slate-500', sub: `${resumen.conductoresAusentes} ausentes hoy` },
              { label: 'Riesgo ingresos', value: `USD ${resumen.impactoIngresosRiesgoUSD}`, icon: TrendingDown, color: resumen.impactoIngresosRiesgoUSD > 0 ? 'text-red-400' : 'text-slate-500', sub: resumen.lineasEnRiesgoIMM.length > 0 ? `L${resumen.lineasEnRiesgoIMM.join(', ')} en riesgo IMM` : 'Sin riesgo IMM' },
            ].map(({ label, value, icon: Icon, color, sub }) => (
              <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`w-4 h-4 flex-none ${color}`} />
                  <span className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</span>
                </div>
                <p className={`text-2xl font-black ${color}`}>{value}</p>
                <p className="text-[10px] text-slate-600 mt-1">{sub}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-sm text-slate-500">
            Sin turnos programados hoy. <a href="/dashboard/traffic/listero" className="text-indigo-400 underline">Abrir Listero</a> para generar la programación.
          </div>
        )}
      </div>

      {/* GPS Fleet */}
      {!fleetLoading && fleet && (
        <div>
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Flota GPS en tiempo real</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'UCOT en vía', value: fleet.totalUCOT, color: 'text-amber-400' },
              { label: 'Rivales activos', value: fleet.totalRivales, color: 'text-blue-400' },
              { label: 'Líneas operando', value: fleet.lineasActivas, color: 'text-emerald-400' },
              { label: 'Alertas bunching', value: fleet.bunchingPares, color: fleet.bunchingPares > 0 ? 'text-red-400' : 'text-slate-500' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center gap-3">
                <Radio className={`w-4 h-4 flex-none ${color}`} />
                <div>
                  <p className={`text-xl font-black ${color}`}>{value}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alertas activas */}
      {alertas.length > 0 && (
        <div>
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <Bell className="w-3 h-3 text-amber-400" />
            Alertas operativas activas
          </h2>
          <div className="space-y-2">
            {alertas.map((a) => (
              <div key={a.id} className={`rounded-xl border p-3 ${URGENCIA_COLOR[a.urgencia] ?? URGENCIA_COLOR.baja}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold">{a.titulo}</p>
                  <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${URGENCIA_COLOR[a.urgencia]}`}>
                    {a.urgencia}
                  </span>
                </div>
                <p className="text-[11px] opacity-80 mt-1">{a.mensaje}</p>
              </div>
            ))}
          </div>
          {resumen && resumen.alertasActivas > 5 && (
            <a href="/dashboard/traffic/listero" className="block mt-2 text-xs text-indigo-400 hover:text-indigo-300">
              Ver todas las alertas en el Listero →
            </a>
          )}
        </div>
      )}

      {/* Accesos rápidos */}
      <div>
        <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Accesos rápidos</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Terminal del Listero', href: '/dashboard/traffic/listero', color: 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300', desc: 'Programación y ausencias' },
            { label: 'Hub de Inteligencia', href: '/dashboard/traffic/intelligence', color: 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300', desc: 'Análisis de competencia en vivo' },
            { label: 'Radar de Flota', href: '/dashboard/traffic/fleet-monitor', color: 'bg-amber-600/20 border-amber-500/40 text-amber-300', desc: 'GPS tiempo real' },
            { label: 'Competencia', href: '/dashboard/traffic/live-map', color: 'bg-red-600/20 border-red-500/40 text-red-300', desc: 'CUTCSA, COME, COETC' },
          ].map(({ label, href, color, desc }) => (
            <a
              key={label}
              href={href}
              className={`rounded-xl border p-4 transition-all hover:scale-[1.02] flex flex-col gap-1.5 ${color}`}
            >
              <p className="text-sm font-bold">{label}</p>
              <p className="text-[10px] opacity-70">{desc}</p>
              <ArrowRight className="w-3.5 h-3.5 mt-auto self-end opacity-60" />
            </a>
          ))}
        </div>
      </div>

      {resumen?.lineasEnRiesgoIMM && resumen.lineasEnRiesgoIMM.length > 0 && (
        <div className="flex items-center gap-2 bg-red-900/20 border border-red-500/30 rounded-xl p-3 text-sm text-red-300">
          <ShieldAlert className="w-4 h-4 flex-none text-red-400" />
          <span>Líneas en riesgo de infracción IMM: <strong>{resumen.lineasEnRiesgoIMM.join(', ')}</strong> — Activar protocolo de emergencia.</span>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard principal (por rol) ────────────────────────────────────────────

const DashboardHome = () => {
  const { user } = useAuth();
  const [isCheckOpen, setIsCheckOpen] = useState(false);
  const [shiftStarted, setShiftStarted] = useState(false);

  const isOperacional = ['SuperAdmin', 'Admin', 'Inspector', 'Listero'].some(
    (r) => user?.role?.toLowerCase() === r.toLowerCase(),
  );

  // God Mode — usuario especial de datos
  if (user?.internalNumber === '0000') {
    return (
      <div className="animate-fade-in space-y-6">
        <div className="bg-white p-6 rounded-lg shadow-xl border-l-4 border-blue-600">
          <h2 className="text-xl font-bold mb-4 text-slate-800">🛠️ PANEL DE CONTROL DE DATOS</h2>

          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-slate-700 font-semibold mb-2">1. Descarga el formato correcto:</p>
            <a
              href="/plantilla_oficial.xlsx"
              download="Plantilla_Oficial_2026.xlsx"
              className="inline-flex items-center gap-2 text-blue-600 font-bold hover:underline"
            >
              <span>📥</span> Bajar Plantilla Excel (Oficial)
            </a>
            <p className="text-xs text-slate-500 mt-1">Sistema listo para Cartones UCOT.</p>
          </div>

          <div>
            <p className="text-slate-700 font-semibold mb-2">2. Sube tu archivo (Validación Automática):</p>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <ExcelUploader onSuccess={() => window.location.reload()} />
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-200">
            <h3 className="font-bold text-slate-800 mb-3">🛠️ Módulos de Gestión (God Mode)</h3>
            <div className="flex flex-wrap gap-4">
              {[
                { label: '👥 Gestión de Usuarios', href: '/dashboard/admin/users', color: 'bg-purple-600 hover:bg-purple-700' },
                { label: '📡 Radar Anti-Barrido', href: '/dashboard/traffic/shadow-radar', color: 'bg-orange-600 hover:bg-orange-700' },
                { label: '🌐 Monitor Ingesta STM', href: '/dashboard/admin/stm-scraper', color: 'bg-indigo-600 hover:bg-indigo-700' },
                { label: '🧾 Terminal Listero', href: '/dashboard/traffic/listero', color: 'bg-emerald-600 hover:bg-emerald-700' },
              ].map(({ label, href, color }) => (
                <button
                  key={href}
                  onClick={() => (window.location.href = href)}
                  className={`px-4 py-2 ${color} text-white rounded-lg font-bold flex items-center gap-2 transition-colors`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Panel operacional para Admin/Inspector/Listero
  if (isOperacional) {
    return (
      <div className="animate-fade-in space-y-6 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Hola, <span className="text-indigo-400">{user?.firstName || 'Inspector'}</span>
            </h1>
            <p className="text-slate-400 text-sm">{new Date().toLocaleDateString('es-UY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          <span className="px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-xs font-bold uppercase">
            {user?.role}
          </span>
        </div>
        <PanelOperacional />
      </div>
    );
  }

  // Dashboard para conductor (Driver/User)
  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Hola, <span className="text-primary-400">{user?.firstName || 'Usuario'}</span>
          </h1>
          <p className="text-slate-400">Bienvenido al panel de operaciones.</p>
        </div>
      </div>

      <StatsWidget />

      {user?.driverStatus === 'A_LA_ORDEN_LISTA' && (
        <div className="bg-amber-500/10 border-2 border-amber-500/20 rounded-[2rem] p-8 flex flex-col md:flex-row items-center gap-6 shadow-xl shadow-amber-900/10 animate-pulse">
          <div className="w-20 h-20 bg-amber-500 rounded-full flex items-center justify-center text-white shadow-lg shrink-0">
            <AlertTriangle className="w-10 h-10" />
          </div>
          <div className="flex-1 text-center md:text-left">
            <h2 className="text-2xl font-bold text-white leading-tight">Estado: A la Orden (Lista)</h2>
            <p className="text-amber-400 font-medium">Tu coche asignado está en mantenimiento. Estás disponible para cubrir otros turnos.</p>
          </div>
          <button
            onClick={() => (window.location.href = '/dashboard/market')}
            className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg"
          >
            Ver Bolsa de Trabajo
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {!shiftStarted ? (
          <div className="lg:col-span-2 relative group overflow-hidden bg-primary-600 rounded-[2rem] p-8 shadow-2xl shadow-primary-900/40">
            <div className="absolute top-0 right-0 -mr-12 -mt-12 w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-700" />
            <div className="relative z-10">
              <h2 className="text-3xl font-black text-white mb-2 leading-tight">¿Listo para comenzar el viaje?</h2>
              <p className="text-primary-100 mb-8 max-w-md font-medium">Realiza el check-in de seguridad antes de salir a la vía.</p>
              <button
                onClick={() => setIsCheckOpen(true)}
                className="inline-flex items-center gap-4 bg-white text-primary-600 px-8 py-4 rounded-2xl font-black text-xl hover:shadow-xl active:scale-95 transition-all"
              >
                <Play className="fill-current" />
                INICIAR TURNO
              </button>
            </div>
            <div className="absolute bottom-6 right-8 text-primary-100/20">
              <Play className="w-32 h-32 rotate-12" />
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2 bg-emerald-500/10 border-2 border-emerald-500/20 rounded-[2rem] p-8 flex items-center gap-6">
            <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-emerald-900/40">
              <CheckCircle className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white leading-tight">Turno en Curso</h2>
              <p className="text-emerald-400 font-medium italic">¡Buen viaje! La seguridad es lo primero.</p>
            </div>
          </div>
        )}

        <div className="glass-panel p-6 rounded-2xl border border-slate-800">
          <h3 className="font-bold text-white mb-2">Mi Estado</h3>
          <div className="text-3xl font-bold text-green-400">Activo</div>
          <p className="text-xs text-slate-500 mt-1">Sin sanciones pendientes</p>
        </div>

        <div
          onClick={() => (window.location.href = '/dashboard/driver/navigation')}
          className="glass-panel p-6 rounded-2xl border border-yellow-500/30 hover:bg-yellow-500/10 cursor-pointer transition-all shadow-lg shadow-yellow-500/10"
        >
          <h3 className="font-bold text-yellow-500 mb-2 flex items-center gap-2">
            <span className="text-xl">📡</span> Alertas en la vía
          </h3>
          <div className="text-2xl font-bold text-white uppercase tracking-tighter">Entrar al Mapa</div>
          <p className="text-xs text-yellow-500/70 mt-1">Radar, zonas y reportes de tránsito</p>
        </div>
      </div>

      <VehicleCheckModal
        isOpen={isCheckOpen}
        onClose={() => setIsCheckOpen(false)}
        onComplete={() => { setShiftStarted(true); setIsCheckOpen(false); }}
        vehicleId={user?.assignedVehicleId || 'S/A'}
      />
    </div>
  );
};

export default DashboardHome;
