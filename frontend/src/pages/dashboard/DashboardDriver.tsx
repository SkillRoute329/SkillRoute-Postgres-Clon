import { useState } from 'react';
import StatsWidget from '../../components/StatsWidget';
import VehicleCheckModal from '../../components/VehicleCheckModal';
import { Play, CheckCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function DashboardDriver() {
  const { user } = useAuth();
  const [isCheckOpen, setIsCheckOpen] = useState(false);
  const [shiftStarted, setShiftStarted] = useState(false);

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
}
