/**
 * ServiceCategoryManager.tsx
 *
 * Componente para asignar servicios (cartones) a categorías de vehículos.
 * - Selección de temporada (Verano/Invierno) y tipo de día (Hábil/Sábado/Domingo-Festivo)
 * - Vista de servicios disponibles con selección múltiple
 * - Asignación masiva a categorías
 * - Resumen visual de asignaciones por categoría
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Tag,
  Sun,
  Snowflake,
  Calendar,
  CheckSquare,
  Square,
  ArrowRight,
  Loader2,
  Trash2,
  BarChart3,
  Filter,
  Search,
  ChevronDown,
  ChevronRight,
  Bus,
  LayoutGrid,
  List,
} from 'lucide-react';
import { useEmpresaPropia } from '../hooks/useEmpresaPropia';
import { VehicleCategoryService } from '../services/firestore';
import {
  ServiceCategoryAssignmentService,
  type ServiceCategoryAssignment,
} from '../services/firestore/serviceCategoryAssignment';
import type { VehicleCategory } from '../services/firestore/types';
import { CartonService } from '../services/firestore';

type Temporada = 'VERANO_2026' | 'INVIERNO_2026';
type TipoDia = 'HABIL' | 'SABADO' | 'DOMINGO_FESTIVO';

interface ServiceItem {
  serviceNumber: string;
  linea: string;
  title?: string;
}

const TEMPORADAS: { value: Temporada; label: string; icon: typeof Sun }[] = [
  { value: 'VERANO_2026', label: 'Verano 2026', icon: Sun },
  { value: 'INVIERNO_2026', label: 'Invierno 2026', icon: Snowflake },
];

const TIPOS_DIA: { value: TipoDia; label: string }[] = [
  { value: 'HABIL', label: 'Día Hábil' },
  { value: 'SABADO', label: 'Sábado' },
  { value: 'DOMINGO_FESTIVO', label: 'Domingo / Festivo' },
];

const ServiceCategoryManager = () => {
  const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
  const [temporada, setTemporada] = useState<Temporada>('VERANO_2026');
  const [tipoDia, setTipoDia] = useState<TipoDia>('HABIL');
  const [categories, setCategories] = useState<VehicleCategory[]>([]);
  const [assignments, setAssignments] = useState<ServiceCategoryAssignment[]>([]);
  const [availableServices, setAvailableServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Selection state
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [targetCategoryId, setTargetCategoryId] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [lineFilter, setLineFilter] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Load categories
  useEffect(() => {
    const unsub = VehicleCategoryService.subscribe(setCategories);
    return () => unsub();
  }, []);

  // Load assignments for current season/day
  useEffect(() => {
    const unsub = ServiceCategoryAssignmentService.subscribe(temporada, tipoDia, setAssignments);
    return () => unsub();
  }, [temporada, tipoDia]);

  // Load available services
  const loadServices = useCallback(async () => {
    setLoading(true);
    try {
      const lineIds = await CartonService.getLineIds();
      const allServices: ServiceItem[] = [];
      const seen = new Set<string>();

      for (const lineId of lineIds) {
        const services = await CartonService.getAll(lineId, tipoDia);
        for (const s of services) {
          const sn = String(s.serviceNumber || s.id);
          if (!seen.has(sn)) {
            seen.add(sn);
            allServices.push({
              serviceNumber: sn,
              linea: String(s.linea || s.line || lineId),
              title: s.title || s.nombreCorto || '',
            });
          }
        }
      }

      // Sort by service number
      allServices.sort((a, b) => {
        const na = parseInt(a.serviceNumber) || 0;
        const nb = parseInt(b.serviceNumber) || 0;
        return na - nb;
      });

      setAvailableServices(allServices);
    } catch (err) {
      console.error('[ServiceCategoryManager] Error loading services:', err);
    } finally {
      setLoading(false);
    }
  }, [tipoDia]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  // Derived data
  const assignedMap = useMemo(() => {
    const m = new Map<string, ServiceCategoryAssignment>();
    assignments.forEach((a) => m.set(a.serviceNumber, a));
    return m;
  }, [assignments]);

  const unassignedServices = useMemo(() => {
    return availableServices.filter((s) => !assignedMap.has(s.serviceNumber));
  }, [availableServices, assignedMap]);

  const assignedByCategory = useMemo(() => {
    const grouped: Record<string, ServiceCategoryAssignment[]> = {};
    assignments.forEach((a) => {
      if (!grouped[a.categoryId]) grouped[a.categoryId] = [];
      grouped[a.categoryId].push(a);
    });
    return grouped;
  }, [assignments]);

  const availableLines = useMemo(() => {
    const lines = new Set<string>();
    availableServices.forEach((s) => {
      if (s.linea) lines.add(s.linea);
    });
    return Array.from(lines).sort();
  }, [availableServices]);

  // Filtered unassigned services
  const filteredUnassigned = useMemo(() => {
    return unassignedServices.filter((s) => {
      const matchesSearch =
        !searchFilter ||
        s.serviceNumber.includes(searchFilter) ||
        (s.title || '').toLowerCase().includes(searchFilter.toLowerCase());
      const matchesLine = !lineFilter || s.linea === lineFilter;
      return matchesSearch && matchesLine;
    });
  }, [unassignedServices, searchFilter, lineFilter]);

  // Handlers
  const toggleService = (sn: string) => {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      if (next.has(sn)) next.delete(sn);
      else next.add(sn);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedServices(new Set(filteredUnassigned.map((s) => s.serviceNumber)));
  };

  const selectNone = () => {
    setSelectedServices(new Set());
  };

  const handleAssign = async () => {
    if (selectedServices.size === 0 || !targetCategoryId) {
      alert('Selecciona servicios y una categoría destino.');
      return;
    }

    const cat = categories.find((c) => c.id === targetCategoryId);
    if (!cat) return;

    if (
      !confirm(
        `¿Asignar ${selectedServices.size} servicios a la categoría "${cat.name}" para ${temporada} / ${tipoDia}?`,
      )
    )
      return;

    setSaving(true);
    try {
      const serviceNumbers = Array.from(selectedServices);
      // Get line info for each service
      const serviceMap = new Map(availableServices.map((s) => [s.serviceNumber, s]));

      await ServiceCategoryAssignmentService.bulkAssign(
        serviceNumbers,
        targetCategoryId,
        cat.name,
        temporada,
        tipoDia,
        serviceMap.get(serviceNumbers[0])?.linea,
      );

      setSelectedServices(new Set());
      alert(`✅ ${serviceNumbers.length} servicios asignados a "${cat.name}".`);
    } catch (err) {
      console.error('Error assigning:', err);
      alert('Error al asignar servicios.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    if (!confirm('¿Eliminar esta asignación?')) return;
    try {
      await ServiceCategoryAssignmentService.delete(assignmentId);
    } catch (err) {
      console.error('Error deleting assignment:', err);
    }
  };

  const handleClearCategoryAssignments = async (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    if (
      !confirm(`¿Eliminar TODAS las asignaciones de "${cat?.name}" para ${temporada} / ${tipoDia}?`)
    )
      return;

    try {
      const count = await ServiceCategoryAssignmentService.deleteByCategory(
        categoryId,
        temporada,
        tipoDia,
      );
      alert(`${count} asignaciones eliminadas.`);
    } catch (err) {
      console.error('Error clearing:', err);
    }
  };

  const toggleCategoryExpanded = (catId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800/80 to-indigo-900/30 p-6 rounded-2xl border border-slate-700">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Bus className="w-8 h-8 text-indigo-400" />
          Asignación de Servicios a Categorías
          <span className="text-xs px-2 py-1 bg-indigo-500/20 text-indigo-400 rounded-full border border-indigo-500/20">
            Motor de Rotación
          </span>
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Asigna servicios (cartones) a categorías de vehículos para definir la rotación por
          temporada y tipo de día.
        </p>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mt-4">
          {/* Temporada */}
          <div className="flex items-center gap-2 bg-slate-900 p-1.5 rounded-xl border border-slate-700">
            {TEMPORADAS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.value}
                  onClick={() => setTemporada(t.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                    temporada === t.value
                      ? t.value.startsWith('VERANO')
                        ? 'bg-orange-600 text-white shadow-lg shadow-orange-900/40'
                        : 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                      : 'text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Tipo de Día */}
          <div className="flex items-center gap-2 bg-slate-900 p-1.5 rounded-xl border border-slate-700">
            {TIPOS_DIA.map((d) => (
              <button
                key={d.value}
                onClick={() => setTipoDia(d.value)}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  tipoDia === d.value
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40'
                    : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                {d.label}
              </button>
            ))}
          </div>

          {/* Stats */}
          <div className="ml-auto flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 rounded-xl border border-slate-700">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-400">Asignados:</span>
              <span className="text-emerald-400 font-bold">{assignments.length}</span>
            </div>
            <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 rounded-xl border border-slate-700">
              <Filter className="w-4 h-4 text-amber-400" />
              <span className="text-slate-400">Sin asignar:</span>
              <span className="text-amber-400 font-bold">{unassignedServices.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Unassigned Services */}
        <div className="bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden flex flex-col max-h-[70vh]">
          <div className="p-4 border-b border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <LayoutGrid className="w-5 h-5 text-amber-400" />
                Servicios Sin Asignar
                <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/20">
                  {filteredUnassigned.length}
                </span>
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                  className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800"
                  title="Cambiar vista"
                  aria-label="Cambiar entre vista de cuadrícula y lista"
                >
                  {viewMode === 'grid' ? (
                    <List className="w-4 h-4" />
                  ) : (
                    <LayoutGrid className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Buscar servicio..."
                  title="Buscar servicio por número"
                  aria-label="Buscar servicio por número"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <select
                value={lineFilter}
                onChange={(e) => setLineFilter(e.target.value)}
                title="Filtrar por línea"
                aria-label="Filtrar por línea"
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm"
              >
                <option value="">Todas las líneas</option>
                {availableLines.map((l) => (
                  <option key={l} value={l}>
                    Línea {l}
                  </option>
                ))}
              </select>
            </div>

            {/* Select All / None */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded hover:bg-slate-800"
                >
                  Seleccionar todos ({filteredUnassigned.length})
                </button>
                <button
                  onClick={selectNone}
                  className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-800"
                >
                  Limpiar selección
                </button>
              </div>
              {selectedServices.size > 0 && (
                <span className="text-xs text-indigo-400 font-bold">
                  {selectedServices.size} seleccionados
                </span>
              )}
            </div>
          </div>

          {/* Services List */}
          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                <span className="ml-3 text-slate-400">Cargando servicios...</span>
              </div>
            ) : filteredUnassigned.length === 0 ? (
              <div className="text-center text-slate-500 py-12">
                <Tag className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                <p className="font-medium">
                  {unassignedServices.length === 0
                    ? 'Todos los servicios están asignados'
                    : 'No hay servicios con ese filtro'}
                </p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {filteredUnassigned.map((s) => {
                  const isSelected = selectedServices.has(s.serviceNumber);
                  return (
                    <button
                      key={s.serviceNumber}
                      onClick={() => toggleService(s.serviceNumber)}
                      className={`p-2 rounded-xl border text-center transition-all ${
                        isSelected
                          ? 'bg-indigo-600/30 border-indigo-500 text-white shadow-lg shadow-indigo-900/20'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600 hover:bg-slate-750'
                      }`}
                      title={`Servicio ${s.serviceNumber} — Línea ${s.linea}`}
                    >
                      <div className="font-mono font-bold text-sm">{s.serviceNumber}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">L.{s.linea}</div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredUnassigned.map((s) => {
                  const isSelected = selectedServices.has(s.serviceNumber);
                  return (
                    <button
                      key={s.serviceNumber}
                      onClick={() => toggleService(s.serviceNumber)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${
                        isSelected
                          ? 'bg-indigo-600/20 border border-indigo-500/50 text-white'
                          : 'bg-slate-800/50 border border-transparent text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-indigo-400 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-600 shrink-0" />
                      )}
                      <span className="font-mono font-bold text-sm">{s.serviceNumber}</span>
                      <span className="text-xs text-slate-500">Línea {s.linea}</span>
                      {s.title && (
                        <span className="text-xs text-slate-600 truncate">{s.title}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Assignment Action Bar */}
          {selectedServices.size > 0 && (
            <div className="p-4 border-t border-slate-800 bg-slate-800/50 backdrop-blur">
              <div className="flex items-center gap-3">
                <select
                  value={targetCategoryId}
                  onChange={(e) => setTargetCategoryId(e.target.value)}
                  title="Categoría destino"
                  aria-label="Seleccionar categoría destino para la asignación"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm"
                >
                  <option value="">Seleccionar categoría destino...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.description ? `(${c.description})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAssign}
                  disabled={!targetCategoryId || saving}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-indigo-900/20 whitespace-nowrap"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                  Asignar {selectedServices.size}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Assigned by Category */}
        <div className="bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden flex flex-col max-h-[70vh]">
          <div className="p-4 border-b border-slate-800">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Tag className="w-5 h-5 text-emerald-400" />
              Asignaciones por Categoría
              <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">
                {Object.keys(assignedByCategory).length} categorías
              </span>
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {categories.length === 0 ? (
              <div className="text-center text-slate-500 py-12">
                <Tag className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                <p className="font-medium mb-2">Sin categorías creadas</p>
                <p className="text-sm">
                  Crea categorías en <strong>Gestión de Flota → Categorías</strong> primero.
                </p>
              </div>
            ) : (
              categories.map((cat) => {
                const catAssignments = assignedByCategory[cat.id!] || [];
                const isExpanded = expandedCategories.has(cat.id!);
                return (
                  <div
                    key={cat.id}
                    className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden"
                  >
                    <style>{`.cat-marker-${cat.id} { background-color: ${cat.color || '#6366f1'}; }`}</style>
                    {/* Category Header */}
                    <button
                      onClick={() => toggleCategoryExpanded(cat.id!)}
                      className="w-full flex items-center justify-between p-4 hover:bg-slate-750 transition-colors"
                      aria-label={`Expandir categoría ${cat.name}`}
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-slate-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-500" />
                        )}
                        <div className={`w-3 h-3 rounded-full shrink-0 cat-marker-${cat.id}`} />
                        <div className="text-left">
                          <div className="text-white font-bold text-sm">{cat.name}</div>
                          {cat.description && (
                            <div className="text-xs text-slate-500">{cat.description}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                            catAssignments.length > 0
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-slate-700 text-slate-500 border-slate-600'
                          }`}
                        >
                          {catAssignments.length} servicios
                        </span>
                        {catAssignments.length > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClearCategoryAssignments(cat.id!);
                            }}
                            className="text-red-400/50 hover:text-red-400 p-1 rounded hover:bg-red-500/10"
                            title="Vaciar todas las asignaciones de esta categoría"
                            aria-label={`Eliminar todas las asignaciones de ${cat.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </button>

                    {/* Expanded: list assigned services */}
                    {isExpanded && (
                      <div className="px-4 pb-3 border-t border-slate-700">
                        {catAssignments.length === 0 ? (
                          <p className="text-sm text-slate-500 py-3 text-center">
                            Sin servicios asignados aún.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {catAssignments
                              .sort((a, b) => parseInt(a.serviceNumber) - parseInt(b.serviceNumber))
                              .map((a) => (
                                <div
                                  key={a.id}
                                  className="group flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg border border-slate-700 hover:border-red-500/50 transition-colors"
                                >
                                  <span className="font-mono text-xs text-white font-bold">
                                    {a.serviceNumber}
                                  </span>
                                  {a.linea && (
                                    <span className="text-[10px] text-slate-500">L.{a.linea}</span>
                                  )}
                                  <button
                                    onClick={() => handleRemoveAssignment(a.id!)}
                                    className="text-slate-600 hover:text-red-400 transition-colors ml-0.5 opacity-0 group-hover:opacity-100"
                                    title="Quitar asignación"
                                    aria-label={`Quitar servicio ${a.serviceNumber} de ${cat.name}`}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Summary Bar */}
      {assignments.length > 0 && (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-indigo-400" />
            Resumen de Rotación — {temporada.replace('_', ' ')} / {tipoDia.replace('_', ' ')}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {categories.map((cat) => {
              const count = (assignedByCategory[cat.id!] || []).length;
              const pct =
                availableServices.length > 0
                  ? Math.round((count / availableServices.length) * 100)
                  : 0;
              return (
                <div key={cat.id} className="bg-slate-900 rounded-xl p-3 border border-slate-700">
                  <style>{`.cat-bg-${cat.id} { background-color: ${cat.color || '#6366f1'}; } .cat-w-${cat.id} { width: ${pct}%; }`}</style>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-2.5 h-2.5 rounded-full cat-bg-${cat.id}`} />
                    <span className="text-xs font-bold text-white truncate">{cat.name}</span>
                  </div>
                  <div className="text-2xl font-black text-white">{count}</div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 cat-bg-${cat.id} cat-w-${cat.id}`}
                    />
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">{pct}% del total</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceCategoryManager;
