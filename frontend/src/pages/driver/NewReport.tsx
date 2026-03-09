import React, { useState, useEffect } from 'react';
import { ArrowLeft, Bus, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MaintenanceService, FleetService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { UniversalImageUploader } from '../../components/common/UniversalImageUploader';

const NewReport = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    vehicleId: user?.assignedVehicleId?.toString() || '',
    title: '',
    description: '',
    priority: 'NORMAL',
    evidencePhotos: '',
  });

  useEffect(() => {
    FleetService.getVehicles().then(setVehicles).catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.vehicleId || !formData.title || !formData.description) {
      alert('Por favor complete todos los campos obligatorios.');
      return;
    }

    setLoading(true);
    try {
      await MaintenanceService.create({
        ...formData,
        vehicleId: Number(formData.vehicleId),
      });
      alert('Reporte enviado correctamente. El equipo de mantenimiento ha sido notificado.');
      navigate('/dashboard');
    } catch (error) {
      console.error(error);
      alert('Error al enviar el reporte.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      <header>
        <h1 className="text-3xl font-black text-white flex items-center gap-3">
          <AlertTriangle className="w-8 h-8 text-yellow-500" />
          Reportar Novedad
        </h1>
        <p className="text-slate-400">Informe cualquier desperfecto técnico o de carrocería.</p>
      </header>

      <div className="glass-panel p-6 md:p-8 rounded-[2rem] border border-slate-800">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Vehículo */}
          <div>
            <label className="block text-sm font-bold text-slate-300 mb-2 uppercase tracking-widest text-[10px]">
              Coche Involucrado
            </label>
            <div className="relative">
              <Bus className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
              <select
                className="input-field w-full pl-12 h-14 text-lg font-bold"
                value={formData.vehicleId}
                onChange={(e) => setFormData({ ...formData, vehicleId: e.target.value })}
                required
              >
                <option value="">Seleccione el coche...</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    Coche {v.internalNumber} ({v.plate || 'Sin Matrícula'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Título */}
          <div>
            <label className="block text-sm font-bold text-slate-300 mb-2 uppercase tracking-widest text-[10px]">
              ¿Qué sucedió? (Breve)
            </label>
            <input
              type="text"
              placeholder="Ej: Aire acondicionado no enfría"
              className="input-field w-full h-14"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-sm font-bold text-slate-300 mb-2 uppercase tracking-widest text-[10px]">
              Detalles Adicionales
            </label>
            <textarea
              placeholder="Describa el problema con el mayor detalle posible..."
              className="input-field w-full min-h-[120px] p-4"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
            />
          </div>

          {/* Foto */}
          <div>
            <UniversalImageUploader
              label="Foto de Evidencia (Opcional)"
              folder="mantenimiento"
              onUploadComplete={(url) => setFormData((prev) => ({ ...prev, evidencePhotos: url }))}
              currentImageUrl={formData.evidencePhotos}
            />
          </div>

          {/* Prioridad */}
          <div>
            <label className="block text-sm font-bold text-slate-300 mb-4 uppercase tracking-widest text-[10px]">
              Gravedad Percibida
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  id: 'LOW',
                  label: 'Leve',
                  color:
                    'peer-checked:bg-emerald-500/20 peer-checked:text-emerald-400 peer-checked:border-emerald-500',
                },
                {
                  id: 'NORMAL',
                  label: 'Normal',
                  color:
                    'peer-checked:bg-blue-500/20 peer-checked:text-blue-400 peer-checked:border-blue-500',
                },
                {
                  id: 'HIGH',
                  label: 'Urgente',
                  color:
                    'peer-checked:bg-red-500/20 peer-checked:text-red-400 peer-checked:border-red-500',
                },
              ].map((p) => (
                <label key={p.id} className="relative cursor-pointer">
                  <input
                    type="radio"
                    name="priority"
                    value={p.id}
                    className="sr-only peer"
                    checked={formData.priority === p.id}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  />
                  <div
                    className={`p-4 text-center rounded-xl bg-slate-800 border border-slate-700 text-slate-400 font-bold transition-all ${p.color}`}
                  >
                    {p.label}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full py-5 text-xl font-black flex items-center justify-center gap-3 shadow-xl shadow-primary-900/40"
          >
            {loading ? (
              <span className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
            ) : (
              <ShieldCheck className="w-6 h-6" />
            )}
            ENVIAR REPORTE
          </button>
          <p className="text-center text-[10px] text-slate-500 uppercase tracking-widest font-bold">
            Esta información será recibida por el personal de taller inmediatamente.
          </p>
        </form>
      </div>
    </div>
  );
};

export default NewReport;
