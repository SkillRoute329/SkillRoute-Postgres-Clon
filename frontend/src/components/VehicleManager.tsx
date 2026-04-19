import { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Edit,
  ShieldAlert,
  BusFront,
  FileText,
  X,
  Check,
  Tag,
  Upload,
  Trash2,
} from 'lucide-react';
import ImageUploader from './ImageUploader';
import { doc, updateDoc, getFirestore } from 'firebase/firestore';
import { FleetService, VehicleCategoryService } from '../services/firestore';
import type { Vehicle, VehicleCategory } from '../services/firestore/types';
import { getFlotaUCOT, getFlotaStats } from '../data/flotaUCOT';

const VehicleManager = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [categories, setCategories] = useState<VehicleCategory[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [filter, setFilter] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [_loading, _setLoading] = useState(false);

  // Category management
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '', color: '#6366f1' });

  // Bulk load
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, running: false });

  useEffect(() => {
    const unsub = FleetService.subscribeVehicles(setVehicles);
    const unsubCat = VehicleCategoryService.subscribe(setCategories);
    return () => {
      unsub();
      unsubCat();
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const data: Record<string, unknown> = {
      internalNumber: formData.get('internalNumber') as string,
      plate: formData.get('plate') as string,
      brand: formData.get('brand') as string,
      model: formData.get('model') as string,
      capacity: Number(formData.get('capacity')),
      categoryId: formData.get('categoryId') as string,
      category: categories.find((c) => c.id === formData.get('categoryId'))?.name || '',
      status: editingVehicle?.status || 'ACTIVE',
      updatedAt: new Date().toISOString(),
    };

    if (editingVehicle) {
      await FleetService.updateVehicle(editingVehicle.id, data);
    } else {
      data.incidents = [];
      data.photos = [];
      data.id = data.internalNumber;
      await FleetService.createVehicle(data);
    }
    setIsModalOpen(false);
    setEditingVehicle(null);
  };

  const handlePhotoUploaded = async (url: string, meta: Record<string, unknown>) => {
    if (!editingVehicle) return;
    const database = getFirestore();
    try {
      const photoObj = { url, ...meta, uploadedAt: new Date().toISOString() };
      const vRef = doc(database, 'vehiculos', String(editingVehicle.id));
      const currentPhotos = editingVehicle.photos || [];
      await updateDoc(vRef, { photos: [...currentPhotos, photoObj] });
      setEditingVehicle({ ...editingVehicle, photos: [...currentPhotos, photoObj] });
    } catch (err) {
      console.error('Error saving photo link', err);
      alert('Error vinculando foto al vehículo');
    }
  };

  // --- Categoría CRUD ---
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    await VehicleCategoryService.create(categoryForm);
    setCategoryForm({ name: '', description: '', color: '#6366f1' });
    setShowCategoryModal(false);
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('¿Eliminar esta categoría?')) return;
    await VehicleCategoryService.delete(id);
  };

  // --- Carga masiva ---
  const handleBulkLoad = async () => {
    const flota = getFlotaUCOT();
    const existingNumbers = new Set(vehicles.map((v) => String(v.internalNumber)));
    const toLoad = flota.filter((f) => !existingNumbers.has(f.internalNumber));

    if (toLoad.length === 0) {
      alert('Todos los coches de FLOTA1-1 ya están cargados en el sistema.');
      return;
    }

    if (
      !confirm(
        `Se cargarán ${toLoad.length} coches nuevos (de ${flota.length} totales). ¿Continuar?`,
      )
    )
      return;

    setBulkProgress({ done: 0, total: toLoad.length, running: true });
    let done = 0;

    for (const entry of toLoad) {
      try {
        await FleetService.createVehicle({
          internalNumber: entry.internalNumber,
          brand: entry.brand,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
        });
      } catch {
        console.error(`Error cargando coche ${entry.internalNumber}`);
      }
      done++;
      setBulkProgress({ done, total: toLoad.length, running: done < toLoad.length });
    }

    setBulkProgress((prev) => ({ ...prev, running: false }));
    alert(`Carga completada: ${done} coches cargados.`);
    setShowBulkModal(false);
  };

  // --- Filtrado ---
  const filtered = vehicles.filter((v) => {
    const matchesText =
      String(v.internalNumber ?? '')
        .toLowerCase()
        .includes(filter.toLowerCase()) ||
      String(v.plate ?? '')
        .toLowerCase()
        .includes(filter.toLowerCase()) ||
      String(v.brand ?? '')
        .toLowerCase()
        .includes(filter.toLowerCase());
    const matchesCategory = !filterCategory || v.categoryId === filterCategory;
    return matchesText && matchesCategory;
  });

  const stats = getFlotaStats();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-800/50 p-6 rounded-2xl border border-slate-700 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <BusFront className="w-8 h-8 text-indigo-400" />
            Gestión de Flota
            <span className="text-xs px-2 py-1 bg-indigo-500/20 text-indigo-400 rounded-full border border-indigo-500/20">
              {vehicles.length} cargados / {stats.total} totales
            </span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Inventario técnico de unidades · Motor de Rotación
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar coche..."
              aria-label="Buscar coche por número, matrícula o marca"
              title="Buscar coche"
              className="bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          {categories.length > 0 && (
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              aria-label="Filtrar por categoría"
              title="Filtrar por categoría"
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm"
            >
              <option value="">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setShowCategoryModal(true)}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-xl flex items-center gap-2 text-sm"
            title="Gestionar categorías de vehículos"
          >
            <Tag className="w-4 h-4" /> Categorías
          </button>
          <button
            onClick={() => setShowBulkModal(true)}
            className="bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-2 rounded-xl flex items-center gap-2 text-sm font-bold"
            title="Cargar flota UCOT desde datos maestros"
          >
            <Upload className="w-4 h-4" /> Cargar Flota UCOT
          </button>
          <button
            onClick={() => {
              setEditingVehicle(null);
              setIsModalOpen(true);
            }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-lg shadow-indigo-900/20"
          >
            <Plus className="w-5 h-5" /> Nuevo Coche
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((vehicle) => (
          <div
            key={vehicle.id}
            className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden hover:border-indigo-500/50 transition-colors group"
          >
            <div className="p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-2xl font-black text-white">#{vehicle.internalNumber}</h3>
                  <p className="text-slate-400 text-sm font-mono">{vehicle.plate || '—'}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div
                    className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${
                      vehicle.status === 'BLOCKED' || vehicle.status === 'Taller'
                        ? 'bg-red-500/20 text-red-400 border-red-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    }`}
                  >
                    {vehicle.status || 'ACTIVE'}
                  </div>
                  {vehicle.category && (
                    <span className="text-[10px] px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/20">
                      {vehicle.category}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-500 block text-xs uppercase">Marca</span>
                  <span className="text-white">{vehicle.brand || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs uppercase">Modelo</span>
                  <span className="text-white">{vehicle.model || '—'}</span>
                </div>
              </div>

              {(vehicle.status === 'BLOCKED' || vehicle.status === 'Taller') && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mt-3 flex items-center gap-3">
                  <ShieldAlert className="w-5 h-5 text-red-400" />
                  <div className="text-xs text-red-300">
                    <span className="font-bold block">Unidad Bloqueada</span>
                    Incidencia mecánica abierta
                  </div>
                </div>
              )}

              {/* Photos Preview */}
              <div className="flex gap-2 overflow-x-auto pb-2 mt-3">
                {vehicle.photos &&
                  vehicle.photos.map((p, idx: number) => (
                    <img
                      key={idx}
                      src={p.url}
                      alt={`Foto ${idx + 1} del vehículo ${vehicle.internalNumber}`}
                      className="w-10 h-10 rounded-lg object-cover border border-slate-600"
                    />
                  ))}
              </div>
            </div>

            <div className="bg-slate-900/50 p-3 border-t border-slate-700 flex justify-end gap-2">
              <button
                onClick={() => {
                  setEditingVehicle(vehicle);
                  setIsModalOpen(true);
                }}
                aria-label={`Editar vehículo ${vehicle.internalNumber}`}
                title="Editar vehículo"
                className="text-slate-400 hover:text-white p-2 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <Edit className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && vehicles.length > 0 && (
        <div className="text-center text-slate-500 py-12">
          No se encontraron coches con ese filtro.
        </div>
      )}

      {vehicles.length === 0 && (
        <div className="text-center text-slate-500 py-12 bg-slate-800/30 rounded-2xl border border-dashed border-slate-700">
          <BusFront className="w-12 h-12 mx-auto mb-3 text-slate-600" />
          <p className="text-lg font-medium mb-2">Sin vehículos cargados</p>
          <p className="text-sm">
            Usa el botón <strong>"Cargar Flota UCOT"</strong> para importar los {stats.total} coches
            del padrón o crea coches manualmente.
          </p>
        </div>
      )}

      {/* Vehicle Edit/Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-slate-800 flex justify-between">
              <h2 className="text-xl font-bold text-white">
                {editingVehicle ? `Editar Coche #${editingVehicle.internalNumber}` : 'Nuevo Coche'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                aria-label="Cerrar modal"
                title="Cerrar"
              >
                <X className="text-slate-400" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <form id="vehicleForm" onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    N° Interno
                  </label>
                  <input
                    name="internalNumber"
                    required
                    defaultValue={editingVehicle?.internalNumber ?? ''}
                    placeholder="Ej: 101"
                    title="Número interno del vehículo"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    Matrícula
                  </label>
                  <input
                    name="plate"
                    defaultValue={editingVehicle?.plate ?? ''}
                    placeholder="Ej: ABC 1234"
                    title="Matrícula del vehículo"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                      Marca
                    </label>
                    <input
                      name="brand"
                      defaultValue={editingVehicle?.brand ?? ''}
                      placeholder="Ej: Volvo"
                      title="Marca del vehículo"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                      Modelo
                    </label>
                    <input
                      name="model"
                      defaultValue={editingVehicle?.model ?? ''}
                      placeholder="Ej: OF-1722"
                      title="Modelo del vehículo"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                      Capacidad
                    </label>
                    <input
                      name="capacity"
                      type="number"
                      defaultValue={editingVehicle?.capacity ?? ''}
                      placeholder="Ej: 40"
                      title="Capacidad de pasajeros"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                      Categoría
                    </label>
                    <select
                      name="categoryId"
                      defaultValue={editingVehicle?.categoryId ?? ''}
                      title="Categoría del vehículo"
                      aria-label="Categoría del vehículo"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white"
                    >
                      <option value="">Sin categoría</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </form>

              {/* Docs / Photos Side */}
              <div className="border-l border-slate-800 pl-6 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-400" /> Documentación
                </h3>
                {editingVehicle ? (
                  <>
                    <ImageUploader
                      path={`vehicles/${editingVehicle.internalNumber}`}
                      label="Subir Libreta / Foto"
                      onUploadComplete={handlePhotoUploaded}
                    />
                    <div className="grid grid-cols-2 gap-2 mt-4">
                      {editingVehicle.photos &&
                        editingVehicle.photos.map((p, idx: number) => (
                          <div key={idx} className="relative group">
                            <img
                              src={p.url}
                              alt={`Documento ${idx + 1} del vehículo`}
                              className="w-full h-24 object-cover rounded-lg border border-slate-700"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <a
                                href={p.url}
                                target="_blank"
                                className="text-xs text-white underline"
                              >
                                Ver
                              </a>
                            </div>
                          </div>
                        ))}
                    </div>
                  </>
                ) : (
                  <div className="text-slate-500 text-sm text-center p-8 bg-slate-800/50 rounded-xl border border-dashed border-slate-700">
                    Guarde el coche primero para subir documentos.
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-slate-800 bg-slate-800/30 flex justify-end gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={() =>
                  (document.getElementById('vehicleForm') as HTMLFormElement)?.requestSubmit()
                }
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold"
              >
                <Check className="w-4 h-4 inline mr-2" /> Guardar Ficha
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Management Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Tag className="w-5 h-5 text-indigo-400" />
                Categorías de Vehículos
              </h2>
              <button
                onClick={() => setShowCategoryModal(false)}
                aria-label="Cerrar modal de categorías"
                title="Cerrar"
              >
                <X className="text-slate-400 w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <p className="text-xs text-slate-500">
                Categorías: Híbrido, Piso Bajo, MT15, Convencional, Eléctrico, etc.
              </p>

              {/* Existing categories */}
              {categories.length > 0 ? (
                <div className="space-y-2">
                  {categories.map((cat) => (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between p-3 bg-slate-800 rounded-xl border border-slate-700"
                    >
                      <div className="flex items-center gap-3">
                        <style>{`#cat-bullet-${cat.id} { background-color: ${cat.color || '#6366f1'}; }`}</style>
                        <div id={`cat-bullet-${cat.id}`} className="w-3 h-3 rounded-full" />
                        <div>
                          <span className="text-white font-medium text-sm">{cat.name}</span>
                          {cat.description && (
                            <p className="text-xs text-slate-500">{cat.description}</p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteCategory(cat.id!)}
                        className="text-red-400 hover:text-red-300 p-1"
                        aria-label={`Eliminar categoría ${cat.name}`}
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-sm text-center py-4">
                  Sin categorías creadas aún.
                </p>
              )}

              {/* Create new */}
              <form
                onSubmit={handleSaveCategory}
                className="space-y-3 pt-3 border-t border-slate-800"
              >
                <h4 className="text-xs font-bold text-slate-400 uppercase">Nueva Categoría</h4>
                <input
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm"
                  placeholder="Nombre (ej: Híbrido, MT15, Piso Bajo)"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  required
                  title="Nombre de la categoría"
                  aria-label="Nombre de la nueva categoría"
                />
                <input
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm"
                  placeholder="Descripción (opcional)"
                  value={categoryForm.description}
                  onChange={(e) =>
                    setCategoryForm({ ...categoryForm, description: e.target.value })
                  }
                  title="Descripción de la categoría"
                  aria-label="Descripción de la nueva categoría"
                />
                <div className="flex items-center gap-3">
                  <label className="text-xs text-slate-400">Color:</label>
                  <input
                    type="color"
                    value={categoryForm.color}
                    onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer"
                    title="Color de la categoría"
                    aria-label="Color de la nueva categoría"
                  />
                </div>
                <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-xl font-bold text-sm">
                  Crear Categoría
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Load Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-400" />
                Carga Masiva — Flota UCOT
              </h2>
              <button
                onClick={() => !bulkProgress.running && setShowBulkModal(false)}
                aria-label="Cerrar modal de carga masiva"
                title="Cerrar"
              >
                <X className="text-slate-400 w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <h4 className="text-white font-bold mb-2">Resumen del Padrón (FLOTA1-1.docx)</h4>
                <div className="text-sm text-slate-300 space-y-1">
                  <p>
                    Total de coches: <strong className="text-emerald-400">{stats.total}</strong>
                  </p>
                  <p>
                    Ya cargados: <strong className="text-blue-400">{vehicles.length}</strong>
                  </p>
                  <p>
                    Pendientes:{' '}
                    <strong className="text-amber-400">
                      {Math.max(0, stats.total - vehicles.length)}
                    </strong>
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {Object.entries(stats.byBrand)
                    .sort((a, b) => b[1] - a[1])
                    .map(([brand, count]) => (
                      <div key={brand} className="text-xs text-slate-400 flex justify-between">
                        <span>{brand}</span>
                        <span className="text-white font-mono">{count}</span>
                      </div>
                    ))}
                </div>
              </div>

              {bulkProgress.running && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Progreso</span>
                    <span className="text-white font-mono">
                      {bulkProgress.done}/{bulkProgress.total}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <style>{`#bulk-loading-bar { width: ${(bulkProgress.done / bulkProgress.total) * 100}%; }`}</style>
                    <div
                      id="bulk-loading-bar"
                      className="bg-emerald-500 h-full transition-all duration-300 rounded-full"
                    />
                  </div>
                </div>
              )}

              <button
                onClick={handleBulkLoad}
                disabled={bulkProgress.running}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2"
              >
                {bulkProgress.running ? (
                  `Cargando... ${bulkProgress.done}/${bulkProgress.total}`
                ) : (
                  <>
                    <Upload className="w-5 h-5" /> Iniciar Carga Masiva
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VehicleManager;
