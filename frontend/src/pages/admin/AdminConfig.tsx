import { useState, useEffect } from 'react';
import {
  Save,
  Settings,
  DollarSign,
  AlertCircle,
  Clock,
  Plus,
  X,
  Calendar,
  Edit,
  Trash,
  FileText,
  Database,
  Download,
} from 'lucide-react';
import { ShiftService } from '../../services/api';
import clsx from 'clsx';

interface Category {
  id: number;
  name: string;
  baseValue: string;
  extraHourValue: string;
}

interface PriceHistory {
  id: number;
  baseValue: string;
  extraHourValue: string;
  effectiveDate: string;
  createdAt: string;
}

const AdminConfig = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [transformaFacilDiscount, setSkillRouteDiscount] = useState('0');
  const [isLoading, setIsLoading] = useState(true);

  // Create State
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', baseValue: '', extraHourValue: '' });

  // Edit Modal State
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editTab, setEditTab] = useState<'general' | 'history'>('general');

  // Edit Form State (for General Tab)
  const [editFormData, setEditFormData] = useState({ name: '', baseValue: '', extraHourValue: '' });

  // History State (for History Tab)
  const [history, setHistory] = useState<PriceHistory[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [newHistoryPrice, setNewHistoryPrice] = useState({
    effectiveDate: '',
    baseValue: '',
    extraHourValue: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [cats, config] = await Promise.all([
        ShiftService.getCategories(),
        ShiftService.getSystemConfig(),
      ]);
      if (Array.isArray(cats)) setCategories(cats);
      if (config && (config as Record<string, unknown>).TRANSFORMA_FACIL_DISCOUNT != null)
        setSkillRouteDiscount(
          String((config as Record<string, unknown>).TRANSFORMA_FACIL_DISCOUNT),
        );
    } catch (error) {
      console.error('Error loading config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Actions ---

  const handleUpdateGlobal = async () => {
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/system-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: 'TRANSFORMA_FACIL_DISCOUNT', value: transformaFacilDiscount }),
      });
      alert('Configuración guardada');
    } catch (error) {
      alert('Error al guardar configuración');
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await ShiftService.createCategory({
        name: newCategory.name,
        baseValue: Number(newCategory.baseValue),
        extraHourValue: Number(newCategory.extraHourValue),
      });
      setCategories((prev) =>
        [...prev, created as unknown as Category].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setIsCreatingCategory(false);
      setNewCategory({ name: '', baseValue: '', extraHourValue: '' });
      alert('Categoría creada');
    } catch (error) {
      alert('Error al crear categoría');
    }
  };

  const handleOpenEdit = (category: Category) => {
    setEditingCategory(category);
    setEditFormData({
      name: category.name,
      baseValue: category.baseValue,
      extraHourValue: category.extraHourValue,
    });
    setEditTab('general');
    // Pre-fetch history quietly
    fetchHistory(category.id);
  };

  const fetchHistory = async (id: number) => {
    setIsLoadingHistory(true);
    try {
      const hist = await ShiftService.getCategoryHistory(id);
      setHistory((hist || []) as PriceHistory[]);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSaveGeneralChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    try {
      // Update Name and/or Current Prices
      await ShiftService.updateCategory(editingCategory.id, {
        name: editFormData.name,
        baseValue: editFormData.baseValue,
        extraHourValue: editFormData.extraHourValue,
      });

      // Update local state
      setCategories((prev) =>
        prev.map((c) =>
          c.id === editingCategory.id
            ? {
                ...c,
                name: editFormData.name,
                baseValue: editFormData.baseValue,
                extraHourValue: editFormData.extraHourValue,
              }
            : c,
        ),
      );

      setEditingCategory(null); // Close modal
      alert('Cambios guardados correctamente');
    } catch (error) {
      alert('Error al guardar cambios');
    }
  };

  const handleAddHistory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    try {
      await ShiftService.addCategoryPriceHistory(editingCategory.id, newHistoryPrice as any);
      await fetchHistory(editingCategory.id); // Refresh list
      setNewHistoryPrice({
        effectiveDate: '',
        baseValue: newHistoryPrice.baseValue,
        extraHourValue: newHistoryPrice.extraHourValue,
      });
      alert('Nuevo precio programado');
    } catch (error) {
      alert('Error al programar precio');
    }
  };

  const handleDeleteCategory = async () => {
    if (!editingCategory) return;
    if (
      !confirm(
        `¿ELIMINAR DEFINITIVAMENTE la categoría "${editingCategory.name}"?\n\nEsta acción no se puede deshacer.`,
      )
    )
      return;

    try {
      await ShiftService.deleteCategory(editingCategory.id);
      setCategories((prev) => prev.filter((c) => c.id !== editingCategory.id));
      setEditingCategory(null);
      alert('Categoría eliminada');
    } catch (error) {
      alert('No se pudo eliminar. Verifica que no existan turnos asociados a esta categoría.');
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', { timeZone: 'UTC' });
  };

  // FASE 5.19: funciones reales (no stubs "próximamente").
  const handleDownloadReport = () => {
    // Export real: el diálogo de impresión del navegador permite Guardar
    // como PDF de la configuración/turnos en pantalla.
    window.print();
  };

  if (isLoading)
    return <div className="text-white text-center py-20">Cargando configuración...</div>;

  return (
    <div className="space-y-6 animate-fade-in-up pb-20">
      <div>
        <h1 className="text-2xl font-bold text-white">Configuración</h1>
        <p className="text-slate-400">Administra los valores del sistema y categorías.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Global Settings Card */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 h-fit">
          <div className="flex items-center gap-2 mb-6 text-primary-400">
            <Settings className="w-5 h-5" />
            <h2 className="font-bold text-lg">Valores Globales</h2>
          </div>

          <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800/50">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Descuento "SkillRoute" (A Canje)
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="number"
                  value={transformaFacilDiscount}
                  onChange={(e) => setSkillRouteDiscount(e.target.value)}
                  className="input-field pl-9 w-full bg-slate-800 border-slate-700 text-white focus:ring-primary-500/50"
                />
              </div>
              <button
                onClick={handleUpdateGlobal}
                className="bg-primary-600 hover:bg-primary-500 text-white px-4 rounded-lg transition-colors font-medium"
              >
                <Save className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-3 flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-primary-400" />
              Monto fijo descontado automáticamente al usar la opción SkillRoute (A Canje).
            </p>
          </div>
        </div>

        {/* 2. Categories List Card */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 text-emerald-400">
              <DollarSign className="w-5 h-5" />
              <h2 className="font-bold text-lg">Categorías de Turnos</h2>
            </div>
            <button
              onClick={() => setIsCreatingCategory(true)}
              className="flex items-center gap-2 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 px-3 py-1.5 rounded-lg transition-all text-sm font-bold border border-emerald-500/20"
            >
              <Plus className="w-4 h-4" /> Nueva
            </button>
          </div>

          <div className="space-y-2">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="group flex items-center justify-between p-4 bg-slate-900/40 rounded-xl border border-transparent hover:border-slate-700 transition-all hover:bg-slate-900/60"
              >
                <div>
                  <div className="font-bold text-white text-base">{cat.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5 flex gap-3">
                    <span>
                      Base:{' '}
                      <span className="text-slate-300 font-medium">
                        ${Number(cat.baseValue).toLocaleString()}
                      </span>
                    </span>
                    <span>
                      Extra:{' '}
                      <span className="text-slate-300 font-medium">
                        ${Number(cat.extraHourValue).toLocaleString()}
                      </span>
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleOpenEdit(cat)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  title="Editar Categoría"
                >
                  <Edit className="w-4 h-4" />
                </button>
              </div>
            ))}
            {categories.length === 0 && (
              <div className="text-center py-8 text-slate-500 italic">
                No hay categorías configuradas.
              </div>
            )}
          </div>
        </div>

        {/* 3. System Maintenance Card */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 lg:col-span-2">
          <div className="flex items-center gap-2 text-blue-400 mb-6">
            <Database className="w-5 h-5" />
            <h2 className="font-bold text-lg">Mantenimiento del Sistema</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800/50 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold mb-1 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  Reporte de Turnos
                </h3>
                <p className="text-sm text-slate-500">
                  Descarga un PDF con todos los turnos registrados.
                </p>
              </div>
              <button
                onClick={handleDownloadReport}
                className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition-colors border border-slate-700 flex items-center gap-2 text-sm font-medium"
              >
                <Download className="w-4 h-4" /> PDF
              </button>
            </div>

            <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800/50 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold mb-1 flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  Copia de Seguridad
                </h3>
                <p className="text-sm text-slate-500">
                  Los backups SQL se ejecutan automáticamente a diario en el servidor
                  (proceso <code className="text-slate-400">skillroute-backup</code>). No requiere
                  acción manual.
                </p>
              </div>
              <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-1.5">
                Automático ✓
              </span>
            </div>
          </div>
        </div>

        {/* 4. DANGER ZONE: CLEAN IMPORT */}
        <div className="glass-panel p-6 rounded-2xl border border-red-900 lg:col-span-2">
          <div className="flex items-center gap-2 text-red-500 mb-6">
            <AlertCircle className="w-5 h-5" />
            <h2 className="font-bold text-lg">Zona de Peligro: Limpieza de Base de Datos</h2>
          </div>

          <div className="bg-red-900/10 p-5 rounded-xl border border-red-500/20 flex items-center justify-between">
            <div>
              <h3 className="text-white font-bold mb-1 flex items-center gap-2">
                <Trash className="w-4 h-4 text-red-400" />
                PURGAR SISTEMA COMPLETO (RESET)
              </h3>
              <p className="text-sm text-red-200/70">
                ⚠️ Elimina TODOS los turnos, líneas y vehículos. Deja el sistema listo para una
                importación limpia.
                <br />
                Esta acción NO se puede deshacer.
              </p>
            </div>
            <button
              onClick={async () => {
                if (!confirm('⚠️ ¿ESTÁS SEGURO? ESTO BORRARÁ TODO (Turnos, Líneas, Flota).'))
                  return;
                if (!confirm('⚠️ CONFIRMA DE NUEVO: ¿BORRAR TODA LA BASE DE DATOS?')) return;
                const promptRes = prompt('Escribe "BORRAR TODO" para confirmar:');
                if (promptRes !== 'BORRAR TODO') return;

                try {
                  const token = localStorage.getItem('token');
                  await fetch('/api/emergency/wipe-all', {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  alert('Sistema purgado correctamente. Por favor recarga la página.');
                  window.location.reload();
                } catch (e) {
                  alert('Error al purgar sistema.');
                }
              }}
              className="bg-red-600 hover:bg-red-500 text-white px-6 py-3 rounded-lg transition-colors border border-red-500 flex items-center gap-2 text-sm font-black shadow-lg shadow-red-900/50"
            >
              <Trash className="w-5 h-5" />
              PURGAR TODO
            </button>
          </div>
        </div>
      </div>

      {/* --- CREATE MODAL --- */}
      {isCreatingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <h3 className="text-xl font-bold text-white mb-6">Nueva Categoría</h3>
            <form onSubmit={handleCreateCategory} className="space-y-5">
              <div>
                <label className="text-sm text-slate-400 font-medium block mb-1.5">
                  Nombre de la Categoría
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newCategory.name}
                  onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                  className="input-field w-full bg-slate-800 border-slate-600 text-white"
                  placeholder="Ej. Viaje Larga Distancia"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-400 font-medium block mb-1.5">
                    Valor Base ($)
                  </label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    value={newCategory.baseValue}
                    onChange={(e) => setNewCategory({ ...newCategory, baseValue: e.target.value })}
                    className="input-field w-full bg-slate-800 border-slate-600 text-white"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-400 font-medium block mb-1.5">
                    Hora Extra ($)
                  </label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    value={newCategory.extraHourValue}
                    onChange={(e) =>
                      setNewCategory({ ...newCategory, extraHourValue: e.target.value })
                    }
                    className="input-field w-full bg-slate-800 border-slate-600 text-white"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreatingCategory(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-bold shadow-lg shadow-emerald-900/20"
                >
                  Crear Categoría
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- EDIT UNIFIED MODAL --- */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Edit className="w-5 h-5 text-primary-400" />
                  Editar: {editingCategory.name}
                </h3>
              </div>
              <button
                onClick={() => setEditingCategory(null)}
                className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-800 bg-slate-900/50">
              <button
                onClick={() => setEditTab('general')}
                className={clsx(
                  'flex-1 py-3 text-sm font-bold border-b-2 transition-colors',
                  editTab === 'general'
                    ? 'border-primary-500 text-white bg-slate-800'
                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/50',
                )}
              >
                General
              </button>
              <button
                onClick={() => setEditTab('history')}
                className={clsx(
                  'flex-1 py-3 text-sm font-bold border-b-2 transition-colors flex items-center justify-center gap-2',
                  editTab === 'history'
                    ? 'border-emerald-500 text-white bg-slate-800'
                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/50',
                )}
              >
                <Clock className="w-4 h-4" /> Historial de Precios
              </button>
            </div>

            {/* Content Area */}
            <div className="p-6 overflow-y-auto flex-1">
              {/* TAB: GENERAL */}
              {editTab === 'general' && (
                <div className="space-y-8">
                  <form id="edit-form" onSubmit={handleSaveGeneralChanges} className="space-y-5">
                    <div>
                      <label className="text-sm text-slate-400 font-medium block mb-1.5">
                        Nombre
                      </label>
                      <input
                        type="text"
                        required
                        value={editFormData.name}
                        onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                        className="input-field w-full bg-slate-800 border-slate-600 text-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-slate-400 font-medium block mb-1.5">
                          Valor Base Actual ($)
                        </label>
                        <input
                          type="number"
                          required
                          step="0.01"
                          value={editFormData.baseValue}
                          onChange={(e) =>
                            setEditFormData({ ...editFormData, baseValue: e.target.value })
                          }
                          className="input-field w-full bg-slate-800 border-slate-600 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-slate-400 font-medium block mb-1.5">
                          Valor H. Extra Actual ($)
                        </label>
                        <input
                          type="number"
                          required
                          step="0.01"
                          value={editFormData.extraHourValue}
                          onChange={(e) =>
                            setEditFormData({ ...editFormData, extraHourValue: e.target.value })
                          }
                          className="input-field w-full bg-slate-800 border-slate-600 text-white"
                        />
                      </div>
                    </div>
                    <div className="bg-blue-900/10 border border-blue-500/20 rounded-lg p-3 flex gap-3 text-sm text-blue-300">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <p>
                        Nota: Modificar los valores aquí afectará el precio "por defecto" actual.
                        Para programar un aumento a futuro, usa la pestaña "Historial".
                      </p>
                    </div>
                  </form>

                  {/* Danger Zone */}
                  <div className="pt-8 border-t border-slate-800">
                    <h4 className="text-red-400 text-xs font-bold uppercase tracking-wider mb-3">
                      Zona de Peligro
                    </h4>
                    <div className="flex items-center justify-between p-4 border border-red-900/30 bg-red-900/10 rounded-xl">
                      <div className="text-sm text-red-200">
                        <div className="font-bold">Eliminar esta categoría</div>
                        <div className="text-xs opacity-70">Esta acción no se puede deshacer.</div>
                      </div>
                      <button
                        onClick={handleDeleteCategory}
                        type="button"
                        className="bg-red-600/20 hover:bg-red-600 hover:text-white text-red-400 border border-red-500/30 px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
                      >
                        <Trash className="w-4 h-4" />
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: HISTORY */}
              {editTab === 'history' && (
                <div className="space-y-6">
                  {/* Add History Form */}
                  <form
                    onSubmit={handleAddHistory}
                    className="bg-slate-800/30 p-4 rounded-xl border border-slate-700"
                  >
                    <h4 className="text-sm font-bold text-emerald-400 mb-3 flex items-center gap-2">
                      <Plus className="w-4 h-4" /> Programar Cambio de Precio
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                          A partir de
                        </label>
                        <input
                          type="date"
                          required
                          value={newHistoryPrice.effectiveDate}
                          onChange={(e) =>
                            setNewHistoryPrice({
                              ...newHistoryPrice,
                              effectiveDate: e.target.value,
                            })
                          }
                          className="w-full bg-slate-900 border border-slate-600 rounded-lg py-1.5 px-2 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                          Nuevo Base
                        </label>
                        <input
                          type="number"
                          required
                          placeholder="0.00"
                          step="0.01"
                          value={newHistoryPrice.baseValue}
                          onChange={(e) =>
                            setNewHistoryPrice({ ...newHistoryPrice, baseValue: e.target.value })
                          }
                          className="w-full bg-slate-900 border border-slate-600 rounded-lg py-1.5 px-3 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                          Nueva Extra
                        </label>
                        <input
                          type="number"
                          required
                          placeholder="0.00"
                          step="0.01"
                          value={newHistoryPrice.extraHourValue}
                          onChange={(e) =>
                            setNewHistoryPrice({
                              ...newHistoryPrice,
                              extraHourValue: e.target.value,
                            })
                          }
                          className="w-full bg-slate-900 border border-slate-600 rounded-lg py-1.5 px-3 text-sm text-white"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full mt-3 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 py-2 rounded-lg text-sm font-bold transition-all"
                    >
                      Programar
                    </button>
                  </form>

                  {/* List */}
                  <div>
                    <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">
                      Cronología de Precios
                    </div>
                    {isLoadingHistory ? (
                      <div className="text-center py-4 text-slate-500">Cargando...</div>
                    ) : history.length === 0 ? (
                      <div className="text-center py-8 text-slate-600 border border-dashed border-slate-800 rounded-xl">
                        No hay historial registrado.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {history.map((record) => (
                          <div
                            key={record.id}
                            className="flex items-center justify-between p-3 bg-slate-800 rounded-lg border border-slate-700/50"
                          >
                            <div className="flex items-center gap-3">
                              <div className="bg-slate-700/50 p-2 rounded text-slate-400">
                                <Calendar className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="text-sm font-bold text-white flex items-center gap-2">
                                  {formatDate(record.effectiveDate)}
                                  {new Date(record.effectiveDate) > new Date() && (
                                    <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/30">
                                      FUTURO
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  Definido el {new Date(record.createdAt).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-white font-medium text-sm">
                                ${Number(record.baseValue).toLocaleString()}
                              </div>
                              <div className="text-slate-500 text-xs">
                                +${Number(record.extraHourValue).toLocaleString()}/h
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer (for General Tab actions) */}
            {editTab === 'general' && (
              <div className="p-4 border-t border-slate-800 bg-slate-900 flex justify-end gap-3 z-10">
                <button
                  onClick={() => setEditingCategory(null)}
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  // Trigger form submission via Ref or ID logic, or just call handler if form ID is set
                  form="edit-form"
                  type="submit"
                  className="bg-primary-600 hover:bg-primary-500 text-white px-6 py-2 rounded-lg font-bold shadow-lg shadow-primary-900/20"
                >
                  Guardar Cambios
                </button>
              </div>
            )}
            {editTab === 'history' && (
              <div className="p-4 border-t border-slate-800 bg-slate-900 flex justify-end gap-3">
                <button
                  onClick={() => setEditingCategory(null)}
                  className="px-4 py-2 text-white bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium"
                >
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminConfig;
