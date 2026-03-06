import { useState, useEffect, useCallback } from 'react';
import { Clock, Bus, ChevronDown, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { CartonService, FleetService } from '../../services/api';
import type { ServiceItem, Vehicle } from '../../services/firestore/types';
import UniversalResourceManager from '../../components/UniversalResourceManager';

// Reusing ServiceItem from types

const RotationMatrix = () => {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);

  // Accordion State
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Filters
  const [filterSeason, setFilterSeason] = useState<number | undefined>(undefined);
  const [filterDayType, setFilterDayType] = useState('HABIL');

  // Swap Modal State
  const [swapModal, setSwapModal] = useState<{ open: boolean; service: ServiceItem | null }>({
    open: false,
    service: null,
  });
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [swapLoading, setSwapLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await CartonService.getAll(
        filterSeason != null ? String(filterSeason) : undefined,
        filterDayType,
      )) as ServiceItem[];
      const sorted = (data || []).sort(
        (a: ServiceItem, b: ServiceItem) => Number(a.serviceCode) - Number(b.serviceCode),
      );
      setServices(sorted);
    } catch (error) {
      console.error('Failed to load services', error);
    } finally {
      setLoading(false);
    }
  }, [filterSeason, filterDayType]);

  const loadVehicles = useCallback(async () => {
    try {
      const v = await FleetService.getVehicles();
      setAllVehicles(v);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadVehicles();
  }, [loadData, loadVehicles]);

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  // Grouping Logic
  const vehicleTypeOrder = ['Hibrido', 'Convencional', 'Piso Bajo', 'MT15', 'Electrico', 'Micro'];
  const normalizeType = (t: string) => {
    if (t.includes('Híbrido') || t.includes('Hibrido')) return 'Hibrido';
    if (t.includes('Eléctrico') || t.includes('Electrico')) return 'Electrico';
    return t;
  };

  const groupedServices = services.reduce(
    (acc, curr: ServiceItem) => {
      const type = normalizeType(curr.vehicleType || 'OTROS');
      if (!acc[type]) acc[type] = [];
      acc[type].push(curr);
      return acc;
    },
    {} as Record<string, ServiceItem[]>,
  );

  const orderedGroups = Object.keys(groupedServices).sort((a, b) => {
    const idxA = vehicleTypeOrder.indexOf(a);
    const idxB = vehicleTypeOrder.indexOf(b);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });

  const parseTurns = (dataStr: string) => {
    try {
      return JSON.parse(dataStr);
    } catch {
      return {};
    }
  };

  // Swap Logic
  const openSwapModal = (service: ServiceItem) => {
    setSwapModal({ open: true, service });
    setSelectedVehicleId(service.assignedTo?.toString() || '');
  };

  const closeSwapModal = () => {
    setSwapModal({ open: false, service: null });
    setSelectedVehicleId('');
  };

  const handleSwapSubmit = async () => {
    if (!swapModal.service) return;
    setSwapLoading(true);
    try {
      const vid =
        selectedVehicleId === 'null' || selectedVehicleId === '' ? null : Number(selectedVehicleId);
      await CartonService.swapVehicle(
        String(swapModal.service.id),
        vid !== null ? String(vid) : null,
      );
      await loadData(); // Refresh to show new assignment
      closeSwapModal();
    } catch {
      alert('Error al realizar sustitución');
    } finally {
      setSwapLoading(false);
    }
  };

  // Filter Vehicles for Modal
  const getAvailableVehicles = () => {
    // Get IDs of vehicles currently assigned in the VIEWED service list (excluding current service's own car)
    const assignedIds = new Set(
      services
        .filter((s: ServiceItem) => s.assignedTo && s.id !== swapModal.service?.id)
        .map((s: ServiceItem) => s.assignedTo!),
    );

    // Filter fleet: Active, Not Assigned, and (Optional) Match Category logic could go here
    return allVehicles.filter(
      (v: Vehicle) => v.status !== 'MAINTENANCE' && !assignedIds.has(String(v.id)),
      // && v.features?.includes(swapModal.service?.vehicleType) // Loose matching if features exist
    );
  };

  return (
    <div className="space-y-6 animate-fade-in-up pb-24 relative">
      {/* --- HEADER --- */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            Matriz de Rotación
          </h1>
          <p className="text-slate-400 mt-1">Sábana de Servicios - Verano 2026</p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-700">
            <Clock className="w-4 h-4 text-emerald-400" />
            <select
              id="season-filter"
              title="Seleccionar Temporada"
              className="bg-transparent text-sm font-bold text-white focus:outline-none"
              value={filterSeason}
              onChange={(e) => setFilterSeason(Number(e.target.value))}
            >
              <option value="">Temporada Activa</option>
              <option value={2}>VERANO 2026</option>
            </select>
          </div>
          <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-700">
            <Bus className="w-4 h-4 text-blue-400" />
            <select
              id="day-type-filter"
              title="Tipo de Día"
              className="bg-transparent text-sm font-bold text-white focus:outline-none"
              value={filterDayType}
              onChange={(e) => setFilterDayType(e.target.value)}
            >
              <option value="HABIL">HÁBIL</option>
              <option value="SABADO">SÁBADO</option>
              <option value="DOMINGO">DOMINGO</option>
            </select>
          </div>
        </div>
      </div>

      {/* --- BULK MANAGEMENT --- */}
      <div className="mb-8">
        <UniversalResourceManager entityKey="ROTATION" />
      </div>

      {/* --- ACCORDION LIST --- */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
        </div>
      ) : Object.keys(groupedServices).length === 0 ? (
        <div className="text-center py-20 text-slate-500 bg-slate-900/30 rounded-3xl border border-slate-800 border-dashed">
          <Bus className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg">No hay datos de servicios disponibles.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orderedGroups.map((type) => {
            const items = groupedServices[type];
            const isExpanded = expandedGroups[type];
            // Calculate REAL stats
            const totalVars = items.length;
            const assignedVars = items.filter((i) => i.assignedVehicle).length;
            const assignedPercentage = Math.round((assignedVars / totalVars) * 100);

            return (
              <div
                key={type}
                className="bg-slate-800/40 border border-slate-700 rounded-xl overflow-hidden shadow-lg"
              >
                <button
                  onClick={() => toggleGroup(type)}
                  className={clsx(
                    'w-full flex items-center justify-between p-4 transition-colors hover:bg-slate-700/50',
                    isExpanded ? 'bg-slate-700/30' : '',
                  )}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-indigo-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-slate-400" />
                    )}
                    <div className="flex flex-col items-start">
                      <span className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        FLOTA {type.toUpperCase()}
                        <span className="text-xs bg-slate-700 px-2 py-0.5 rounded-full text-slate-300 font-normal border border-slate-600">
                          {items[0].serviceCode} - {items[items.length - 1].serviceCode}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="hidden md:flex flex-col items-end">
                      <div className="w-32 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={clsx(
                            'h-full transition-all duration-500',
                            assignedPercentage === 100 ? 'bg-emerald-500' : 'bg-amber-500',
                          )}
                          style={{ width: `${assignedPercentage}%` }}
                        ></div>
                      </div>
                      <span
                        className={clsx(
                          'text-xs font-medium mt-1',
                          assignedPercentage === 100 ? 'text-emerald-400' : 'text-amber-400',
                        )}
                      >
                        {assignedPercentage}% Asignado
                      </span>
                    </div>
                    <div className="bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-lg font-bold text-sm min-w-[3rem]">
                      {totalVars}
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-700/50 overflow-x-auto">
                    <table className="w-full text-left text-sm md:text-base">
                      <thead className="bg-slate-900/50 text-slate-400 font-mono text-xs uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-3 min-w-[80px]">Servicio</th>
                          <th className="px-4 py-3 min-w-[80px]">Línea</th>
                          <th className="px-4 py-3 min-w-[150px]">Turno 1 / Matutino</th>
                          <th className="px-4 py-3 min-w-[150px]">Turno 2 / Vespertino</th>
                          <th className="px-4 py-3 min-w-[150px]">Turno 3 / Nocturno</th>
                          <th className="px-4 py-3 min-w-[160px]">Unidad Asignada</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/50">
                        {items.map((srv: ServiceItem) => {
                          const details = parseTurns(srv.routeData);
                          const isBlank = srv.line === 'EN BLANCO' || srv.line === 'PARALIZA';
                          return (
                            <tr
                              key={srv.id}
                              className={clsx(
                                'hover:bg-indigo-500/5 transition-colors',
                                isBlank && 'opacity-50 bg-slate-900/30',
                              )}
                            >
                              <td className="px-4 py-3 font-bold text-white font-mono">
                                {srv.serviceCode}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={clsx(
                                    'px-2 py-0.5 rounded text-xs font-bold',
                                    srv.line === '300'
                                      ? 'bg-red-500/20 text-red-300'
                                      : isBlank
                                        ? 'bg-slate-700 text-slate-400'
                                        : !srv.line
                                          ? 'bg-red-900 text-white animate-pulse'
                                          : 'bg-blue-500/20 text-blue-300',
                                  )}
                                >
                                  {srv.line || `⚠️ ERROR DATOS (ID: ${srv.id})`}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                                {details.t1 || srv.startTime + ' - ' + (srv.endTime || '?')}
                              </td>
                              <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                                {details.t2 || '-'}
                              </td>
                              <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                                {details.t3 ||
                                  (details.note ? (
                                    <span className="text-yellow-500/80 italic">
                                      {details.note}
                                    </span>
                                  ) : (
                                    '-'
                                  ))}
                              </td>
                              <td className="px-4 py-3">
                                {!isBlank &&
                                  (srv.assignedVehicle ? (
                                    <button
                                      onClick={() => openSwapModal(srv)}
                                      className="group flex items-center justify-between gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all w-full md:w-auto"
                                      title="Click para sustituir unidad"
                                    >
                                      <div className="flex items-center gap-2">
                                        <Bus className="w-3.5 h-3.5" />
                                        <span className="font-bold text-sm">
                                          Coche {srv.assignedTo}
                                        </span>
                                      </div>
                                      {/* Swap Icon on Hover */}
                                      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs bg-emerald-500 text-white px-1.5 rounded">
                                        ⇄
                                      </span>
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => openSwapModal(srv)}
                                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 text-slate-400 rounded-lg hover:bg-slate-600 hover:text-white transition-all text-xs border border-dashed border-slate-600 w-full md:w-auto"
                                    >
                                      <span>Sin Asignar</span>
                                      <span className="bg-slate-900 px-1.5 py-0.5 rounded text-[10px]">
                                        +
                                      </span>
                                    </button>
                                  ))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* --- SWAP MODAL --- */}
      {swapModal.open && swapModal.service && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6 relative animate-in zoom-in-95 duration-200">
            <button
              onClick={closeSwapModal}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              ✕
            </button>

            <div className="mb-6">
              <h2 className="text-xl font-bold text-white mb-1">Sustitución de Unidad</h2>
              <p className="text-slate-400 text-sm">
                Servicio{' '}
                <span className="text-white font-mono font-bold">
                  {swapModal.service.serviceCode}
                </span>{' '}
                • Línea {swapModal.service.line}
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-slate-700/50 rounded-xl border border-slate-600">
                <label className="block text-xs uppercase tracking-wider text-slate-400 font-bold mb-2">
                  Unidad Actual
                </label>
                {swapModal.service.assignedTo ? (
                  <div className="flex items-center gap-3 text-emerald-400 font-bold text-lg">
                    <Bus className="w-6 h-6" />
                    Coche {swapModal.service.assignedTo}
                  </div>
                ) : (
                  <div className="text-slate-500 italic flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full border border-dashed border-slate-500 flex items-center justify-center text-xs">
                      ?
                    </div>
                    Sin asignación
                  </div>
                )}
              </div>

              <div className="flex justify-center text-slate-500 my-2">
                <span className="text-2xl">↓</span>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-400 font-bold mb-2">
                  Nueva Unidad (Reemplazo)
                </label>
                <select
                  id="swap-vehicle-select"
                  title="Seleccionar Nueva Unidad"
                  className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  value={selectedVehicleId}
                  onChange={(e) => setSelectedVehicleId(e.target.value)}
                >
                  <option value="" disabled>
                    Seleccione un coche disponible...
                  </option>
                  <option value="null" className="text-red-400 font-bold">
                    ❌ Desvincular (Dejar vacío)
                  </option>
                  {getAvailableVehicles().map((v) => (
                    <option key={v.id} value={v.id}>
                      Coche {v.internalNumber} ({v.model || 'Sin Modelo'})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-2">
                  * Mostrando solo coches libres y operativos.
                </p>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  onClick={closeSwapModal}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSwapSubmit}
                  disabled={swapLoading || selectedVehicleId === ''}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl transition-colors font-bold flex justify-center items-center gap-2"
                >
                  {swapLoading ? <span className="animate-spin">↻</span> : 'Confirmar Cambio'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RotationMatrix;
