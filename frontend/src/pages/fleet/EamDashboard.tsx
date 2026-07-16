import { useState, useEffect } from 'react';
import { eamService } from '../../services/eamService';
import { FleetService } from '../../services/firestore/fleet';
import {
  Activity,
  Wrench,
  Clock,
  TrendingUp,
  AlertTriangle,
  Bus
} from 'lucide-react';

export default function EamDashboard() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<{
    globalMtbf: number | null;
    globalMttr: number | null;
    vehicleMetrics: Array<{
      vehicleId: string;
      internalNumber: string;
      mtbf: number | null;
      mttr: number | null;
    }>;
  }>({ globalMtbf: null, globalMttr: null, vehicleMetrics: [] });

  useEffect(() => {
    async function fetchMetrics() {
      try {
        setLoading(true);
        const vehicles = await FleetService.getVehicles();
        
        const vMetrics = await Promise.all(
          vehicles.map(async (v) => {
            const mtbf = await eamService.calculateMTBF(v.id);
            const mttr = await eamService.calculateMTTR(v.id);
            return {
              vehicleId: v.id,
              internalNumber: v.internalNumber,
              mtbf,
              mttr
            };
          })
        );

        // Calculate global averages (only for those that have data)
        const validMtbf = vMetrics.filter(m => m.mtbf !== null).map(m => m.mtbf!);
        const validMttr = vMetrics.filter(m => m.mttr !== null).map(m => m.mttr!);

        const globalMtbf = validMtbf.length > 0 ? validMtbf.reduce((a, b) => a + b, 0) / validMtbf.length : null;
        const globalMttr = validMttr.length > 0 ? validMttr.reduce((a, b) => a + b, 0) / validMttr.length : null;

        setMetrics({
          globalMtbf,
          globalMttr,
          vehicleMetrics: vMetrics.sort((a, b) => {
            // Sort by lowest MTBF (most failing) first
            if (a.mtbf !== null && b.mtbf !== null) return a.mtbf - b.mtbf;
            if (a.mtbf !== null) return -1;
            if (b.mtbf !== null) return 1;
            return 0;
          })
        });

      } catch (error) {
        console.error('Error fetching EAM metrics', error);
      } finally {
        setLoading(false);
      }
    }

    fetchMetrics();
  }, []);

  const formatHours = (hours: number | null) => {
    if (hours === null) return 'N/A';
    if (hours < 24) return `${hours.toFixed(1)} hrs`;
    const days = hours / 24;
    return `${days.toFixed(1)} días`;
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Activity className="text-blue-400 w-6 h-6" />
          Dashboard EAM & Confiabilidad
        </h1>
        <p className="text-slate-400 text-sm mt-1">Monitoreo de MTBF (Mean Time Between Failures) y MTTR (Mean Time To Repair)</p>
      </div>

      {loading ? (
        <div className="text-slate-400 p-8 text-center animate-pulse">Calculando métricas de confiabilidad...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Global MTBF */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6 flex items-center gap-6 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <TrendingUp className="w-32 h-32 text-blue-500" />
              </div>
              <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30 flex-shrink-0 z-10">
                <Wrench className="w-8 h-8 text-blue-400" />
              </div>
              <div className="z-10">
                <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-1">MTBF Global (Flota)</p>
                <div className="flex items-end gap-3">
                  <span className="text-4xl font-black text-white">
                    {formatHours(metrics.globalMtbf)}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-2">Tiempo promedio entre fallas correctivas</p>
              </div>
            </div>

            {/* Global MTTR */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6 flex items-center gap-6 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <Clock className="w-32 h-32 text-amber-500" />
              </div>
              <div className="w-16 h-16 rounded-2xl bg-amber-500/20 flex items-center justify-center border border-amber-500/30 flex-shrink-0 z-10">
                <Clock className="w-8 h-8 text-amber-400" />
              </div>
              <div className="z-10">
                <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-1">MTTR Global (Reparación)</p>
                <div className="flex items-end gap-3">
                  <span className="text-4xl font-black text-white">
                    {formatHours(metrics.globalMttr)}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-2">Tiempo promedio de resolución de averías</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden shadow-lg mt-8">
            <div className="p-5 border-b border-slate-700/50 bg-slate-800/30 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Bus className="w-5 h-5 text-slate-400" />
                Análisis por Vehículo
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-800/50 text-xs uppercase text-slate-500 font-semibold border-b border-slate-700">
                  <tr>
                    <th className="px-6 py-4">Coche</th>
                    <th className="px-6 py-4">MTBF (Confiabilidad)</th>
                    <th className="px-6 py-4">MTTR (Mantenibilidad)</th>
                    <th className="px-6 py-4 text-right">Estado Crítico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {metrics.vehicleMetrics.map((vm) => {
                    const isCritical = vm.mtbf !== null && vm.mtbf < 48; // Less than 48 hours between failures is bad
                    return (
                      <tr key={vm.vehicleId} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4 font-medium text-white flex items-center gap-2">
                          #{vm.internalNumber}
                        </td>
                        <td className="px-6 py-4">
                          <span className={isCritical ? 'text-red-400 font-bold' : 'text-emerald-400 font-semibold'}>
                            {formatHours(vm.mtbf)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-amber-400 font-semibold">
                            {formatHours(vm.mttr)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {isCritical ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-500/20 text-red-400 rounded-full text-xs font-bold">
                              <AlertTriangle className="w-3 h-3" /> ATENCIÓN REQUERIDA
                            </span>
                          ) : (
                            <span className="text-slate-500 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {metrics.vehicleMetrics.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                        No hay datos suficientes para calcular las métricas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
