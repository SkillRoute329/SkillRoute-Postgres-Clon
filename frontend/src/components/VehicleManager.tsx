import { useState, useEffect } from 'react';
import { UniversalService } from '../services/api'; // Using Universal as bridge unless specific vehicle logic requires specialized hook
import { Plus, Search, Edit, ShieldAlert, BusFront, FileText, X, Check } from 'lucide-react';
import ImageUploader from './ImageUploader';
import { doc, updateDoc, getFirestore } from 'firebase/firestore';

// We assume UniversalService handles basic CRUD, but we might need direct Firestore for specific sub-updates or use specialized API endpoints if available.
// For now, let's build on top of API but do Image association client-side or separate API call.

const VehicleManager = () => {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<any>(null);

  // Filters
  const [filter, setFilter] = useState('');

  useEffect(() => {
    loadFleet();
  }, []);

  const loadFleet = async () => {
    try {
      // Fetch from Universal Endpoint (mapped to FleetController)
      const res = await UniversalService.list('fleet'); // or 'vehicles'
      // Handle array or {data} format
      setVehicles(Array.isArray(res) ? res : res.data || []);
    } catch (error) {
      console.error('Error loading fleet', error);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const data: any = {
      internalNumber: formData.get('internalNumber'),
      plate: formData.get('plate'),
      brand: formData.get('brand'),
      model: formData.get('model'),
      capacity: Number(formData.get('capacity')),
      status: 'ACTIVE', // Default
      updatedAt: new Date().toISOString(),
    };

    if (editingVehicle) {
      // Call Update API
      await UniversalService.update('fleet', editingVehicle.id, data);
    } else {
      // Create
      data.incidents = [];
      data.photos = [];
      data.id = data.internalNumber; // Use Internal Number as ID preferred
      await UniversalService.create('fleet', data);
    }
    setIsModalOpen(false);
    loadFleet();
  };

  const handlePhotoUploaded = async (url: string, meta: any) => {
    if (!editingVehicle) return;

    // Update vehicle with new photo
    // We can do this via API or direct Firestore update if permitted
    // Let's assume API patch if possible, or simple local state update then save?
    // Better: Direct update to ensure persistence immediately without form submit

    const db = getFirestore();
    try {
      const photoObj = { url, ...meta, uploadedAt: new Date().toISOString() };
      const vRef = doc(db, 'vehicles', editingVehicle.id);
      // Updating 'photos' array - naive
      const currentPhotos = editingVehicle.photos || [];
      await updateDoc(vRef, {
        photos: [...currentPhotos, photoObj],
      });

      // Update local state
      setEditingVehicle({ ...editingVehicle, photos: [...currentPhotos, photoObj] });
      loadFleet(); // Refresh list to catch update
    } catch (e) {
      console.error('Error saving photo link', e);
      alert('Error vinculando foto al vehículo');
    }
  };

  const filtered = vehicles.filter(
    (v) =>
      v.internalNumber?.toLowerCase().includes(filter.toLowerCase()) ||
      v.plate?.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <BusFront className="w-8 h-8 text-indigo-400" />
            Gestión de Flota
            <span className="text-xs px-2 py-1 bg-indigo-500/20 text-indigo-400 rounded-full border border-indigo-500/20">
              Total: {vehicles.length}
            </span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">Inventario técnico de unidades</p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar coche..."
              className="bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((vehicle) => (
          <div
            key={vehicle.id}
            className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden hover:border-indigo-500/50 transition-colors group"
          >
            <div className="p-5">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-2xl font-black text-white">#{vehicle.internalNumber}</h3>
                  <p className="text-slate-400 text-sm font-mono">{vehicle.plate}</p>
                </div>
                <div
                  className={`px-2 py-1 rounded-lg text-xs font-bold border ${vehicle.status === 'BLOCKED' ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'}`}
                >
                  {vehicle.status}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div>
                  <span className="text-slate-500 block text-xs uppercase">Marca</span>
                  <span className="text-white">{vehicle.brand}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs uppercase">Modelo</span>
                  <span className="text-white">{vehicle.model}</span>
                </div>
              </div>

              {/* Blocking Incidents Warning */}
              {vehicle.status === 'BLOCKED' && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4 flex items-center gap-3">
                  <ShieldAlert className="w-5 h-5 text-red-400" />
                  <div className="text-xs text-red-300">
                    <span className="font-bold block">Unidad Bloqueada</span>
                    Incidencia mecánica abierta
                  </div>
                </div>
              )}

              {/* Photos Preview */}
              <div className="flex gap-2 overflow-x-auto pb-2">
                {vehicle.photos &&
                  vehicle.photos.map((p: any, idx: number) => (
                    <img
                      key={idx}
                      src={p.url}
                      className="w-12 h-12 rounded-lg object-cover border border-slate-600"
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
                className="text-slate-400 hover:text-white p-2 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <Edit className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Dynamic Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-slate-800 flex justify-between">
              <h2 className="text-xl font-bold text-white">
                {editingVehicle ? `Editar Coche #${editingVehicle.internalNumber}` : 'Nuevo Coche'}
              </h2>
              <button onClick={() => setIsModalOpen(false)}>
                <X className="text-slate-400" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Form */}
              <form id="vehicleForm" onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    N° Interno
                  </label>
                  <input
                    name="internalNumber"
                    required
                    defaultValue={editingVehicle?.internalNumber}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    Matrícula
                  </label>
                  <input
                    name="plate"
                    required
                    defaultValue={editingVehicle?.plate}
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
                      defaultValue={editingVehicle?.brand}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                      Modelo
                    </label>
                    <input
                      name="model"
                      defaultValue={editingVehicle?.model}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    Capacidad
                  </label>
                  <input
                    name="capacity"
                    type="number"
                    defaultValue={editingVehicle?.capacity}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white"
                  />
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
                      {editingVehicle.photos?.map((p: any, idx: number) => (
                        <div key={idx} className="relative group">
                          <img
                            src={p.url}
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
    </div>
  );
};

export default VehicleManager;
