import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFirestoreCollection } from '../../hooks/useFirestoreCollection';
import { IncidentService } from '../../services/IncidentService';
import type { IncidentType } from '../../services/IncidentService';
import { Zap, Wrench, Siren, Timer, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react';
import { showSuccess, showError, showLoading, dismiss } from '../../context/FeedbackProvider';
import clsx from 'clsx';

export const QuickDispatchPanel = () => {
  const { user } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<string>('');
  const { data: vehicles } = useFirestoreCollection('vehiculos');

  // Filter only active vehicles or all? Let's show all but maybe sort by number
  const sortedVehicles =
    vehicles?.sort(
      (a: any, b: any) => (Number(a.internalNumber) || 0) - (Number(b.internalNumber) || 0),
    ) || [];

  const handleQuickAction = async (type: IncidentType) => {
    if (!selectedVehicle) {
      showError('⚠️ Selecciona una unidad primero');
      return;
    }

    const vehicleNum = vehicles.find((v: any) => v.id === selectedVehicle)?.internalNumber;
    const tId = showLoading(`Reportando ${type} en Coche ${vehicleNum}...`);

    try {
      await IncidentService.reportIncident(
        selectedVehicle,
        type,
        String(user?.id || 'unknown'),
        user?.fullName || 'Dispatcher',
      );

      dismiss(tId);
      showSuccess(`Incidencia #${type.substring(0, 3)} creada para Coche ${vehicleNum}`);
      setSelectedVehicle(''); // Reset selection
      setIsExpanded(false); // Close panel after action
    } catch (e: any) {
      dismiss(tId);
      showError(`Error al crear reporte: ${e.message}`);
    }
  };

  if (!['Admin', 'SuperAdmin', 'Inspector'].includes(user?.role || '')) return null;

  return (
    <div
      className={clsx(
        'fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ease-out',
        isExpanded ? 'h-auto' : 'h-12 translate-y-0', // Collapsed state logic could be handled differently if we want it fully hidden or just a tab
      )}
    >
      {/* TOGGLE TAB */}
      {!isExpanded && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 animate-bounce-slow">
          <button
            onClick={() => setIsExpanded(true)}
            className="bg-primary-600 hover:bg-primary-500 text-white shadow-lg shadow-primary-900/50 rounded-full px-6 py-3 flex items-center gap-2 font-bold text-sm tracking-wide transition-transform hover:scale-105"
          >
            <Zap className="w-4 h-4" />
            DESPACHO RÁPIDO
            <ChevronUp className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* EXPANDED PANEL */}
      <div
        className={clsx(
          'bg-slate-900/95 backdrop-blur-xl border-t border-slate-700 p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] transition-transform duration-300',
          isExpanded ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-primary-500 to-indigo-600 p-2.5 rounded-xl shadow-lg">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white tracking-tight">
                  Consola de Despacho
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  MODO OPERATIVO EN VIVO • ESCRITURA DIRECTA
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white p-2 rounded-lg transition-colors"
            >
              <ChevronDown className="w-6 h-6" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* SELECT UNIT */}
            <div className="lg:col-span-1">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                1. Seleccionar Unidad
              </label>
              <div className="relative group">
                <select
                  value={selectedVehicle}
                  onChange={(e) => setSelectedVehicle(e.target.value)}
                  className="w-full bg-slate-950 border-2 border-slate-700 text-white text-lg font-bold rounded-xl px-4 py-3 appearance-none focus:border-primary-500 focus:ring-4 focus:ring-primary-500/20 transition-all cursor-pointer hover:border-slate-500"
                >
                  <option value="">-- Seleccionar Coche --</option>
                  {sortedVehicles.map((v: any) => (
                    <option key={v.id} value={v.id} className="bg-slate-900">
                      🚍 {v.internalNumber} - {v.plate}
                    </option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover:text-primary-400 transition-colors">
                  <ChevronDown className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* ACTIONS */}
            <div className="lg:col-span-3">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                2. Ejecutar Acción Inmediata
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <button
                  onClick={() => handleQuickAction('MECANICA')}
                  disabled={!selectedVehicle}
                  className="group relative overflow-hidden bg-slate-800 hover:bg-orange-600/90 disabled:opacity-40 disabled:hover:bg-slate-800 rounded-xl p-4 transition-all duration-300 border border-slate-700 hover:border-orange-500"
                >
                  <div className="flex flex-col items-center gap-2 relative z-10">
                    <Wrench className="w-8 h-8 text-orange-400 group-hover:text-white mb-1 transition-colors" />
                    <span className="font-bold text-slate-200 group-hover:text-white">
                      Mecánica
                    </span>
                  </div>
                  <div className="absolute -bottom-12 -right-12 w-24 h-24 bg-orange-500/20 rounded-full group-hover:scale-150 transition-transform duration-500"></div>
                </button>

                <button
                  onClick={() => handleQuickAction('ACCIDENTE')}
                  disabled={!selectedVehicle}
                  className="group relative overflow-hidden bg-slate-800 hover:bg-red-600/90 disabled:opacity-40 disabled:hover:bg-slate-800 rounded-xl p-4 transition-all duration-300 border border-slate-700 hover:border-red-500"
                >
                  <div className="flex flex-col items-center gap-2 relative z-10">
                    <Siren className="w-8 h-8 text-red-500 group-hover:text-white mb-1 animate-pulse-slow transition-colors" />
                    <span className="font-bold text-slate-200 group-hover:text-white">
                      Accidente
                    </span>
                  </div>
                </button>

                <button
                  onClick={() => handleQuickAction('EVASION')}
                  disabled={!selectedVehicle}
                  className="group relative overflow-hidden bg-slate-800 hover:bg-purple-600/90 disabled:opacity-40 disabled:hover:bg-slate-800 rounded-xl p-4 transition-all duration-300 border border-slate-700 hover:border-purple-500"
                >
                  <div className="flex flex-col items-center gap-2 relative z-10">
                    <ShieldAlert className="w-8 h-8 text-purple-400 group-hover:text-white mb-1 transition-colors" />
                    <span className="font-bold text-slate-200 group-hover:text-white">Evasión</span>
                  </div>
                </button>

                <button
                  onClick={() => handleQuickAction('DEMORA')}
                  disabled={!selectedVehicle}
                  className="group relative overflow-hidden bg-slate-800 hover:bg-yellow-600/90 disabled:opacity-40 disabled:hover:bg-slate-800 rounded-xl p-4 transition-all duration-300 border border-slate-700 hover:border-yellow-500"
                >
                  <div className="flex flex-col items-center gap-2 relative z-10">
                    <Timer className="w-8 h-8 text-yellow-400 group-hover:text-white mb-1 transition-colors" />
                    <span className="font-bold text-slate-200 group-hover:text-white">Retraso</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
