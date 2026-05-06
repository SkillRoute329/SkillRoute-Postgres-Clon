import React, { useState, useEffect } from 'react';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import { Bus, Plus, Search, Edit2, Wrench, Users, Calendar, History, Building2 } from 'lucide-react';
import { FleetService, UserService } from '../../services/api';
import clsx from 'clsx';
import VehicleHistoryModal from '../../components/fleet/VehicleHistoryModal';

const STATUS_OPTIONS = [
  {
    value: 'OPERATIONAL',
    label: 'Operativo',
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  },
  {
    value: 'MAINTENANCE',
    label: 'Taller',
    color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  },
  { value: 'STOPPED', label: 'Paralizado', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
];

// 🛡️ Utility: Nuclear Date Formatter
// 🛡️ Data Auditor: Renderizado de Fechas con Alerta de Corrupción
const renderDateOrAlert = (label: string, rawValue: any, vehicleId: string) => {
  try {
    if (!rawValue) return <span className="text-gray-400">Sin datos</span>;

    // Intento de parseo estricto
    let d;
    if (rawValue.seconds) d = new Date(rawValue.seconds * 1000);
    else if (typeof rawValue.toDate === 'function') d = rawValue.toDate();
    else d = new Date(rawValue);

    if (isNaN(d.getTime())) throw new Error('Invalid Date Value');

    return (
      <span className="text-slate-300 font-medium text-xs">{d.toLocaleDateString('es-UY')}</span>
    );
  } catch (err) {
    // 🚨 AQUÍ ESTÁ LA CLAVE: DELATAR AL CULPABLE
    console.error(
      `🚨 DATO CORRUPTO DETECTADO | Coche: ${vehicleId} | Campo: ${label} | Valor:`,
      rawValue,
    );

    // Retornar alerta visual visible
    return (
      <span className="bg-red-500/10 text-red-400 px-2 py-0.5 rounded font-bold text-[10px] border border-red-500/30 flex items-center gap-1">
        ⚠️ ERROR DATOS
      </span>
    );
  }
};

const VehicleList = () => {
  const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
    const [vehicles, setVehicles] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);

  // Form State
  const [formData, setFormData] = useState<{
    internalNumber: string;
    plate: string;
    make: string;
    model: string;
    year: string;
    status: string;
    rotationSchemeId: string;
    driverIds: number[];
    features: any; // Store full features object
  }>({
    internalNumber: '',
    plate: '',
    make: '',
    model: '',
    year: '',
    status: 'OPERATIONAL',
    rotationSchemeId: '',
    driverIds: [],
    features: { customFields: [], driverRotationMode: 'ALL_SAME' },
  });

  const [editingId, setEditingId] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [rotationSchemes, setRotationSchemes] = useState<any[]>([]);

  // History Modal State
  const [historyVehicle, setHistoryVehicle] = useState<{ id: number; number: string } | null>(null);
  const [reportingRotura, setReportingRotura] = useState<number | string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const reportarRotura = async (v: any) => {
    if (v.status === 'MAINTENANCE') return;
    setReportingRotura(v.id);
    try {
      await FleetService.updateVehicle(v.id, { status: 'MAINTENANCE' });
      await loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setReportingRotura(null);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [vData, uData, rData] = await Promise.all([
        FleetService.getVehicles(empresaPropia ?? undefined),
        UserService.getAll(),
        FleetService.getRotationSchemes(),
      ]);
      setVehicles(vData);
      setAllUsers(uData.filter((u: any) => u.role === 'User'));
      setRotationSchemes(rData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadVehicles = async () => {
    try {
      const data = await FleetService.getVehicles(empresaPropia ?? undefined);
      setVehicles(data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleEdit = async (vPreview: any) => {
    // 🚀 PERFORMANCE: Fetch Full Details (including photos) on Demand
    // This prevents data loss (editing incomplete object) and prevents list bloat.
    setLoading(true);
    try {
      const v = await FleetService.getVehicleById(vPreview.id);

      // Parse features safely
      let parsedFeatures = { customFields: [], driverRotationMode: 'ALL_SAME' };
      try {
        if (v.features) {
          parsedFeatures = typeof v.features === 'string' ? JSON.parse(v.features) : v.features;
          if (!parsedFeatures.customFields) parsedFeatures.customFields = [];
          if (!parsedFeatures.driverRotationMode) parsedFeatures.driverRotationMode = 'ALL_SAME';
        }
      } catch (e) {
        console.error('Error parsing features JSON', e);
      }

      setFormData({
        internalNumber: v.internalNumber || '',
        plate: v.plate || '',
        make: v.make || '',
        model: v.model || '',
        year: v.year || '',
        status: v.status || 'OPERATIONAL',
        rotationSchemeId: v.rotationSchemeId?.toString() || '',
        driverIds: (v.assignedDrivers as { id: number }[] | undefined)?.map((d) => d.id) ?? [],
        features: parsedFeatures,
      });
      setEditingId(v.id as number);
      setShowModal(true);
    } catch (err) {
      console.error('Error loading vehicle details', err);
      alert('Error cargando detalles: ' + (err as any).message);
    } finally {
      setLoading(false);
    }
  };

  const handleNew = () => {
    setFormData({
      internalNumber: '',
      plate: '',
      make: '',
      model: '',
      year: '',
      status: 'OPERATIONAL',
      rotationSchemeId: '',
      driverIds: [],
      features: { customFields: [], driverRotationMode: 'ALL_SAME' },
    });
    setEditingId(null);
    setShowModal(true);
  };

  // Custom Field Helpers
  const addCustomField = () => {
    setFormData((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        customFields: [...(prev.features.customFields || []), { key: '', value: '' }],
      },
    }));
  };

  const removeCustomField = (index: number) => {
    const newFields = [...formData.features.customFields];
    newFields.splice(index, 1);
    setFormData((prev) => ({
      ...prev,
      features: { ...prev.features, customFields: newFields },
    }));
  };

  const updateCustomField = (index: number, field: 'key' | 'value', val: string) => {
    const newFields = [...formData.features.customFields];
    newFields[index][field] = val;
    setFormData((prev) => ({
      ...prev,
      features: { ...prev.features, customFields: newFields },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Sanitize custom fields
      const cleanCustomFields =
        formData.features.customFields?.filter(
          (f: any) => f.key && f.key.trim() !== '' && f.value && f.value.trim() !== '',
        ) || [];

      const payload = {
        ...formData,
        year: formData.year ? Number(formData.year) : undefined,
        rotationSchemeId: formData.rotationSchemeId ? Number(formData.rotationSchemeId) : null,
        driverIds: formData.driverIds,
        features: {
          ...formData.features,
          customFields: cleanCustomFields,
        },
      };

      if (editingId) {
        await FleetService.updateVehicle(editingId, payload);
        alert('Unidad actualizada correctamente.');
      } else {
        await FleetService.createVehicle(payload);
        alert('Unidad creada correctamente.');
      }

      setShowModal(false);
      loadData();
    } catch (error: any) {
      console.error('Save error', error);
      const msg = error.response?.data?.message || error.message || 'Error técnico al guardar';
      alert('Error: ' + msg);
    }
  };

  const filteredVehicles = vehicles.filter((v) => {
    const num = v.internalNumber || v.carNumber || '';
    const plate = v.plate || '';
    return (
      num.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plate.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const getStatusStyle = (status: string) => {
    const config = STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];
    return config.color;
  };

  const getStatusLabel = (status: string) => {
    const config = STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];
    return config.label;
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto animate-fade-in-up pb-24">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-1 md:mb-2 flex items-center gap-2">
            <Bus className="w-8 h-8 text-primary-500" />
            Gestión Operativa de Flota
          </h1>
          <p className="text-slate-400 text-sm md:text-base">
            Control de unidades, marcas, modelos, esquemas de rotación y asignación de personal.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <input
              type="text"
              placeholder="Buscar por coche o matrícula..."
              className="input-field w-full pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
          </div>

          <button
            onClick={handleNew}
            className="btn btn-primary flex items-center justify-center gap-2 whitespace-nowrap py-2.5"
          >
            <Plus className="w-5 h-5" /> <span className="hidden sm:inline">Nueva Unidad</span>
            <span className="sm:hidden">Nuevo</span>
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
        </div>
      ) : filteredVehicles.length === 0 ? (
        <div className="text-center py-20 bg-slate-800/50 rounded-2xl border border-dashed border-slate-700">
          <Bus className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <h3 className="text-xl text-slate-300 font-medium mb-2">No se encontraron unidades</h3>
          <p className="text-slate-500">Intenta con otro término de búsqueda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {filteredVehicles.map((v) => (
            <div
              key={v.id}
              className="glass-panel p-5 md:p-6 hover:border-primary-500/50 transition-all active:scale-[0.98] group relative overflow-hidden flex flex-col"
              data-testid={`vehicle-card-${v.internalNumber ?? v.carNumber ?? v.id}`}
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-100 transition-opacity pointer-events-none">
                <Bus className="w-24 h-24 text-white" />
              </div>

              <div className="relative z-10 flex-1">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0 font-bold text-lg">
                      {v.internalNumber || v.carNumber}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">
                        Coche {v.internalNumber || v.carNumber}
                      </h3>
                      <p className="text-sm text-slate-400">
                        {v.make || v.brand || 'Sin Marca'} {v.model || ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleEdit(v)}
                    className="p-2 text-slate-500 hover:text-white bg-slate-800/50 rounded-lg"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-sm border-b border-slate-800 pb-2">
                    <span className="text-slate-500">Esquema:</span>
                    <span className="text-primary-400 font-medium flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {v.rotationScheme?.name || 'Manual'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 text-sm border-b border-slate-800 pb-2">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 flex items-center gap-1">
                        <Users className="w-3 h-3" /> Conductores:
                      </span>
                      <span className="text-slate-300 font-bold">
                        {v.assignedDrivers?.length || 0} / 3
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {v.assignedDrivers?.map((d: any) => (
                        <span
                          key={d.id}
                          className="px-2 py-0.5 bg-slate-800 rounded text-[10px] text-slate-400 border border-slate-700"
                        >
                          {d.fullName} ({d.internalNumber})
                        </span>
                      ))}
                      {(!v.assignedDrivers || v.assignedDrivers.length === 0) && (
                        <span className="text-slate-600 italic text-[10px]">Sin asignar</span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between text-sm items-center">
                    <span className="text-slate-500">Estado:</span>
                    <span
                      className={clsx(
                        `px-2 py-0.5 rounded-full text-xs font-bold border`,
                        getStatusStyle(v.status),
                      )}
                    >
                      {getStatusLabel(v.status)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm items-center pt-2 border-t border-slate-800/50 mt-2">
                    <span className="text-slate-500 w-24">Última Insp.:</span>
                    {renderDateOrAlert('lastInspection', v.lastInspection, v.id)}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-auto pt-4 border-t border-slate-800 relative z-10">
                <button
                  type="button"
                  onClick={() => reportarRotura(v)}
                  disabled={v.status === 'MAINTENANCE' || reportingRotura === v.id}
                  className="min-h-[44px] px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg border border-red-500 transition-colors flex items-center justify-center gap-2"
                  title="Reportar rotura – dispara alerta en Lista Diaria (Efecto Mariposa)"
                  data-testid="btn-reportar-rotura"
                >
                  {reportingRotura === v.id ? (
                    <span className="animate-pulse">...</span>
                  ) : (
                    '🔴 Reportar Rotura'
                  )}
                </button>
                <a
                  href={`/dashboard/fleet/inspect/${v.id}`}
                  className="min-h-[44px] flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 border border-slate-700"
                >
                  <Wrench className="w-4 h-4" /> Inspección
                </a>
                <button
                  onClick={() =>
                    setHistoryVehicle({ id: v.id, number: v.internalNumber || v.carNumber })
                  }
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-primary-400 rounded-lg border border-slate-700 transition-colors min-h-[44px]"
                  title="Ver Historial de la Unidad"
                >
                  <History className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* History Modal */}
      {historyVehicle && (
        <VehicleHistoryModal
          vehicleId={historyVehicle.id}
          vehicleNumber={historyVehicle.number}
          onClose={() => setHistoryVehicle(null)}
        />
      )}

      {/* Modal Crear/Editar */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-800 rounded-2xl w-full max-w-2xl p-6 border border-slate-700 shadow-xl animate-scale-in relative my-4 md:my-0">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingId ? 'Editar Unidad Operativa' : 'Nueva Unidad Operativa'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column: Vehicle Info */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-slate-400 font-medium mb-1 block uppercase tracking-wider text-[10px]">
                        Número de Coche *
                      </label>
                      <input
                        required
                        type="text"
                        className="input-field w-full"
                        placeholder="Ej. 105"
                        value={formData.internalNumber}
                        onChange={(e) =>
                          setFormData({ ...formData, internalNumber: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm text-slate-400 font-medium mb-1 block uppercase tracking-wider text-[10px]">
                        Estado
                      </label>
                      <select
                        className="input-field w-full"
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-slate-400 font-medium mb-1 block uppercase tracking-wider text-[10px]">
                        Marca
                      </label>
                      <input
                        type="text"
                        className="input-field w-full"
                        placeholder="Mercedes"
                        value={formData.make}
                        onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-sm text-slate-400 font-medium mb-1 block uppercase tracking-wider text-[10px]">
                        Modelo
                      </label>
                      <input
                        type="text"
                        className="input-field w-full"
                        placeholder="O500"
                        value={formData.model}
                        onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-slate-400 font-medium mb-1 block uppercase tracking-wider text-[10px]">
                        Matrícula
                      </label>
                      <input
                        type="text"
                        className="input-field w-full"
                        placeholder="STU-1234"
                        value={formData.plate}
                        onChange={(e) => setFormData({ ...formData, plate: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-sm text-slate-400 font-medium mb-1 block uppercase tracking-wider text-[10px]">
                        Año
                      </label>
                      <input
                        type="number"
                        className="input-field w-full"
                        placeholder="2024"
                        value={formData.year}
                        onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-slate-400 font-medium mb-1 block uppercase tracking-wider text-[10px]">
                      Tipo de Rotación (Cartón)
                    </label>
                    <select
                      className="input-field w-full"
                      value={formData.rotationSchemeId}
                      onChange={(e) =>
                        setFormData({ ...formData, rotationSchemeId: e.target.value })
                      }
                    >
                      <option value="">Carga Manual (Sin Rotación)</option>
                      {rotationSchemes.map((rs) => (
                        <option key={rs.id} value={rs.id}>
                          {rs.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Right Column: Driver Assignment */}
                <div className="space-y-4">
                  <label className="text-sm text-slate-400 font-medium mb-1 block uppercase tracking-wider text-[10px]">
                    Asignar Conductores (Máx 3)
                  </label>
                  <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-3 h-56 overflow-y-auto space-y-2 custom-scrollbar">
                    {allUsers.map((user) => {
                      const isSelected = formData.driverIds.includes(user.id);
                      return (
                        <div
                          key={user.id}
                          onClick={() => {
                            if (isSelected) {
                              setFormData({
                                ...formData,
                                driverIds: formData.driverIds.filter((id) => id !== user.id),
                              });
                            } else if (formData.driverIds.length < 3) {
                              setFormData({
                                ...formData,
                                driverIds: [...formData.driverIds, user.id],
                              });
                            }
                          }}
                          className={clsx(
                            'flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border',
                            isSelected
                              ? 'bg-primary-500/20 border-primary-500/50 text-white'
                              : 'hover:bg-slate-800 border-transparent text-slate-400',
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={clsx(
                                'w-2 h-2 rounded-full',
                                isSelected ? 'bg-primary-500' : 'bg-slate-600',
                              )}
                            ></div>
                            <span className="text-xs font-medium">
                              {user.fullName} ({user.internalNumber})
                            </span>
                          </div>
                          {isSelected && <Plus className="w-3 h-3 rotate-45" />}
                        </div>
                      );
                    })}
                    {allUsers.length === 0 && (
                      <p className="text-slate-600 text-xs italic text-center py-10">
                        No hay conductores disponibles
                      </p>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 italic text-right">
                    Seleccionados: {formData.driverIds.length}/3
                  </p>

                  <div className="pt-2 border-t border-slate-700 mt-2">
                    <label className="text-sm text-slate-400 font-medium mb-1 block uppercase tracking-wider text-[10px]">
                      Rotación Choferes
                    </label>
                    <select
                      className="input-field w-full text-sm"
                      value={formData.features.driverRotationMode || 'ALL_SAME'}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          features: { ...formData.features, driverRotationMode: e.target.value },
                        })
                      }
                    >
                      <option value="ALL_SAME">Todos a la vez (Copia)</option>
                      <option value="WEEKLY">Semanal (Rotativo)</option>
                      <option value="BIWEEKLY">Quincenal (Rotativo)</option>
                      <option value="FIXED_TURNS">Turnos Fijos (Diario)</option>
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">
                      {formData.features.driverRotationMode === 'WEEKLY' &&
                        'Los choferes rotarán turnos cada semana (Lun-Dom).'}
                      {formData.features.driverRotationMode === 'BIWEEKLY' &&
                        'Los choferes rotarán cada 2 semanas.'}
                      {(formData.features.driverRotationMode === 'ALL_SAME' ||
                        formData.features.driverRotationMode === 'FIXED_TURNS') &&
                        'Todos los choferes asignados trabajarán cada día (ej. Turno Mañana/Tarde).'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Custom Fields Section */}
              <div className="border-t border-slate-700 pt-4 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-slate-400 font-medium uppercase tracking-wider text-[10px]">
                    Campos Adicionales
                  </label>
                  <button
                    type="button"
                    onClick={addCustomField}
                    className="text-primary-400 text-xs hover:text-primary-300 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Agregar Campo
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {formData.features.customFields?.map((field: any, idx: number) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Nombre (ej. Motor)"
                        className="input-field flex-1 text-xs py-1"
                        value={field.key}
                        onChange={(e) => updateCustomField(idx, 'key', e.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="Valor (ej. V8)"
                        className="input-field flex-1 text-xs py-1"
                        value={field.value}
                        onChange={(e) => updateCustomField(idx, 'value', e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => removeCustomField(idx)}
                        className="text-red-400 hover:text-red-300 p-1"
                      >
                        <Plus className="w-4 h-4 rotate-45" />
                      </button>
                    </div>
                  ))}
                  {(!formData.features.customFields ||
                    formData.features.customFields.length === 0) && (
                    <p className="text-slate-600 text-xs italic">Sin campos adicionales.</p>
                  )}
                </div>
              </div>

              <div className="flex gap-3 mt-6 pt-4 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2 text-slate-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button type="submit" className="flex-1 btn btn-primary py-2">
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default VehicleList;
