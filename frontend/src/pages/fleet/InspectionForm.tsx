import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Camera as LucideCamera,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  Bus,
  Trash2,
} from 'lucide-react';
import { FleetService } from '../../services/api';
import clsx from 'clsx';
// Native Camera Logic
import { Camera, CameraResultType } from '@capacitor/camera';

// Helper to resize images (Simulated Cloud Upload)
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800; // Resize to max 800px width
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7)); // 70% Quality
      };
    };
  });
};

const InspectionForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [lastInspection, setLastInspection] = useState<any>(null);

  // States
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);

  // Form Data
  const [odometer, setOdometer] = useState('');
  const [fuelLevel, setFuelLevel] = useState('Full');
  const [damages, setDamages] = useState<any[]>([]); // New damages being reported

  // Camera Handlers
  const [capturingZone, setCapturingZone] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (id) {
      loadLastStatus();
    } else {
      console.error('ID missing!');
      setLoading(false);
    }
  }, [id]);

  const loadLastStatus = async () => {
    try {
      // Updated to pass ID as string (Firestore Document ID)
      const data = await FleetService.getLastInspection(String(id));
      setLastInspection(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCameraClick = async (zone: string) => {
    setCapturingZone(zone);
    try {
      const image = await Camera.getPhoto({
        quality: 60,
        allowEditing: false,
        width: 1024,
        resultType: CameraResultType.DataUrl,
      });

      if (image.dataUrl) {
        // 2. Ask for Description (Could use native dialog later)
        const desc = prompt(`Describe el daño en: ${zone}`);
        if (desc) {
          setDamages([
            ...damages,
            {
              zone: zone,
              description: desc,
              severity: 'Medium',
              photoUrl: image.dataUrl,
            },
          ]);
        }
      }
    } catch (e) {
      console.warn('Camera cancelled or failed', e);
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const status = damages.length > 0 ? 'WithDamages' : 'OK';
      const result = await FleetService.createInspection({
        vehicleId: id,
        type: 'StartShift',
        odometer,
        fuelLevel,
        status,
        newDamages: damages,
      });

      if (result.id) setReportId(result.id);

      // Show Success UI
      setSuccess(true);

      // Auto Redirect after 2s
      setTimeout(() => {
        navigate('/dashboard/fleet');
      }, 2000);
    } catch (error: any) {
      console.error('Inspection Submit Error:', error);
      const msg = error.message || String(error);
      alert(`Error al guardar: ${msg}`);
      setIsSubmitting(false); // Ensure submission state is reset on error
    } finally {
      setLoading(false);
    }
  };

  if (success)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-white animate-scale-in p-6 text-center">
        <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
          <CheckCircle className="w-10 h-10 text-emerald-400" />
        </div>
        <h2 className="text-3xl font-bold mb-2">¡Reporte Guardado!</h2>
        <p className="text-slate-400 mb-8">
          El estado de la unidad ha sido actualizado correctamente.
        </p>
        {reportId && (
          <button
            onClick={() => navigate(`/dashboard/fleet/history/${id}`)} // Or specific report view if available
            className="mb-4 text-primary-400 underline"
          >
            Ver en Historial
          </button>
        )}
        <div className="text-sm text-slate-500">Redirigiendo a la flota...</div>
      </div>
    );

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 animate-fade-in-up pb-32 md:pb-24">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        capture="environment" // Forces Rear Camera on Mobile
        className="hidden"
      />

      {/* Error Message Display */}
      {success === false && (
        <div className="fixed top-4 left-4 right-4 z-50 animate-fade-in-down"></div>
      )}

      {/* Header */}
      <div className="mb-6 md:mb-8 flex items-center gap-4">
        <button
          onClick={() => navigate('/dashboard/fleet')}
          className="md:hidden p-2 -ml-2 text-slate-400 hover:text-white"
        >
          <ArrowRight className="w-6 h-6 rotate-180" />
        </button>
        <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center shrink-0">
          <Bus className="w-6 h-6 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white leading-tight">
            Inspección de Unidad
          </h1>
          <p className="text-slate-400 text-sm">Paso {step} de 2</p>
        </div>
      </div>

      {/* STEP 1: Estado Anterior (La Verdad) */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="glass-panel p-4 md:p-6 border-l-4 border-l-blue-500">
            <h3 className="text-lg font-bold text-white mb-4">Estado Reportado Anteriormente</h3>

            {!lastInspection ? (
              <div className="text-slate-400 italic bg-slate-800/50 p-4 rounded-lg">
                No hay registros previos. Vehículo presuntamente OK.
              </div>
            ) : (
              <div>
                <div className="text-sm text-slate-400 mb-4 bg-slate-800/50 p-3 rounded-lg">
                  Último reporte por:{' '}
                  <span className="text-white font-bold">
                    {lastInspection.user?.fullName || 'Sistema'}
                  </span>
                  .
                </div>

                {!lastInspection.damages || lastInspection.damages.length === 0 ? (
                  <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
                    <CheckCircle className="w-5 h-5" /> Sin daños reportados previamente.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(lastInspection.damages || []).map((d: any) => (
                      <div
                        key={d.id || Math.random()}
                        className="flex gap-3 bg-slate-800 p-3 rounded-lg border border-slate-700"
                      >
                        {/* If photo exists, show thumbnail */}
                        {d.photoUrl && (
                          <img
                            src={d.photoUrl}
                            alt="Daño"
                            className="w-20 h-20 object-cover rounded-lg border border-slate-600 shrink-0"
                          />
                        )}
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle className="w-4 h-4 text-orange-400" />
                            <span className="text-white font-medium">{d.zone}</span>
                          </div>
                          <div className="text-sm text-slate-400 leading-relaxed">
                            {d.description}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Fixed Bottom Action for Mobile */}
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-900/90 backdrop-blur border-t border-slate-800 md:relative md:bg-transparent md:border-0 md:p-0 z-10">
            <button
              onClick={() => setStep(2)}
              className="btn btn-primary w-full py-3 md:py-4 text-lg font-bold shadow-lg shadow-primary-900/30"
            >
              Continuar <ArrowRight className="w-5 h-5 ml-2" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Nueva Inspección */}
      {step === 2 && (
        <div className="space-y-6">
          <h3 className="text-lg font-bold text-white border-b border-slate-800 pb-2">
            Nuevo Reporte
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <div className="space-y-2">
              <label className="text-sm text-slate-400 font-medium">Odómetro (Km)</label>
              <input
                type="number"
                className="input-field w-full text-lg"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                placeholder="Ej. 150230"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-400 font-medium">Combustible</label>
              <select
                className="input-field w-full text-lg"
                value={fuelLevel}
                onChange={(e) => setFuelLevel(e.target.value)}
              >
                <option value="Full">Lleno (Full)</option>
                <option value="3/4">3/4 de Tanque</option>
                <option value="1/2">Medio Tanque</option>
                <option value="1/4">1/4 (Reserva)</option>
              </select>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-6">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-white font-medium">Fotos y Daños</h4>
              <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">
                Toca un área para foto
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {['Frente', 'Atrás', 'Lateral Izq', 'Lateral Der', 'Interior', 'Ruedas'].map(
                (zone) => (
                  <button
                    key={zone}
                    onClick={() => handleCameraClick(zone)}
                    className="p-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-xl border border-dashed border-slate-600 hover:border-purple-500 transition-all flex flex-col items-center gap-2 group touch-manipulation"
                  >
                    <div className="w-12 h-12 rounded-full bg-slate-700 group-hover:bg-purple-500/20 flex items-center justify-center transition-colors">
                      <LucideCamera className="w-6 h-6 text-slate-400 group-hover:text-purple-400" />
                    </div>
                    <span className="text-sm font-medium text-slate-300">{zone}</span>
                  </button>
                ),
              )}
            </div>

            {damages.length > 0 && (
              <div className="mt-6 space-y-3 animate-in fade-in slide-in-from-bottom-4">
                <h5 className="text-red-400 text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Daños a Reportar:
                </h5>
                {damages.map((d, i) => (
                  <div
                    key={i}
                    className="flex gap-3 bg-red-500/5 border border-red-500/20 p-3 rounded-lg relative group"
                  >
                    {/* Fixed Aspect Ratio Image Wrapper */}
                    <div className="w-20 h-20 shrink-0 bg-slate-900 rounded-lg overflow-hidden border border-red-500/30">
                      <img src={d.photoUrl} alt="Evidence" className="w-full h-full object-cover" />
                    </div>

                    {/* Text Container with overflow protection */}
                    <div className="flex-1 min-w-0 pr-8">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-red-200 font-bold block text-sm uppercase bg-red-500/20 px-1.5 rounded text-[10px]">
                          {d.zone}
                        </span>
                        <span className="text-xs text-red-400/70">{d.severity || 'Medium'}</span>
                      </div>
                      <p className="text-slate-300 text-sm leading-snug break-words line-clamp-2">
                        {d.description}
                      </p>
                    </div>

                    {/* Delete Button */}
                    <button
                      onClick={() => setDamages(damages.filter((_, idx) => idx !== i))}
                      className="absolute top-2 right-2 p-2 text-red-400 hover:text-white hover:bg-red-500/20 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fixed Bottom Action for Mobile */}
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-900/90 backdrop-blur border-t border-slate-800 md:relative md:bg-transparent md:border-0 md:p-0 z-20 flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="flex-1 py-3 text-slate-400 hover:text-white font-medium active:scale-95 transition-transform"
              disabled={isSubmitting}
            >
              Atrás
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className={clsx(
                'flex-[2] btn btn-primary py-3 md:py-4 text-base font-bold shadow-lg shadow-primary-900/30 flex items-center justify-center gap-2',
                isSubmitting && 'opacity-70 cursor-not-allowed',
              )}
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar Reporte'
              )}
            </button>
          </div>
          {/* Add spacer for mobile view to prevent content being hidden behind fixed footer */}
          <div className="h-24 md:hidden"></div>
        </div>
      )}
    </div>
  );
};

export default InspectionForm;
