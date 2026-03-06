import React, { useState } from 'react';
import { Camera, AlertCircle, CheckCircle, Save, X, ShieldAlert } from 'lucide-react';
import { Camera as CapCamera, CameraResultType } from '@capacitor/camera';
import { API_URL } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface VehicleCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (data: any) => void;
  vehicleId: string;
}

const VehicleCheckModal: React.FC<VehicleCheckModalProps> = ({
  isOpen,
  onClose,
  onComplete,
  vehicleId,
}) => {
  const { token } = useAuth();
  const [step, setStep] = useState<'ask' | 'inspect' | 'waiver'>('ask');
  const [photos, setPhotos] = useState<string[]>(['', '', '', '']); // Frente, Atrás, Izq, Der
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const labels = ['Frente', 'Atrás', 'Lateral Izq', 'Lateral Der'];

  const handleCapture = async (index: number) => {
    try {
      const image = await CapCamera.getPhoto({
        quality: 60,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
      });
      if (image.dataUrl) {
        const newPhotos = [...photos];
        newPhotos[index] = image.dataUrl;
        setPhotos(newPhotos);
      }
    } catch (e) {
      console.warn('Camera closed');
    }
  };

  const submitCheck = async (status: 'OK' | 'WAIVER') => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/fleet/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cocheId: vehicleId,
          photos: status === 'OK' ? photos : [],
          notes,
          estado: status,
        }),
      });

      if (res.ok) {
        onComplete(await res.json());
      } else {
        alert('Error al guardar reporte');
      }
    } catch (e) {
      alert('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden animate-scale-in">
        {/* STEP: ASK */}
        {step === 'ask' && (
          <div className="p-8 text-center">
            <div className="w-20 h-20 bg-primary-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldAlert className="w-10 h-10 text-primary-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Check-in de Unidad</h2>
            <p className="text-slate-400 mb-8">
              ¿Desea realizar la inspección visual del coche #{vehicleId} antes de comenzar?
            </p>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setStep('inspect')}
                className="btn btn-primary py-4 text-lg font-bold"
              >
                SÍ, INSPECCIONAR
              </button>
              <button
                onClick={() => setStep('waiver')}
                className="btn bg-slate-800 text-slate-300 hover:bg-slate-700 py-4 text-lg font-bold"
              >
                NO, OMITIR
              </button>
            </div>
          </div>
        )}

        {/* STEP: INSPECT */}
        {step === 'inspect' && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Inspección Visual</h3>
              <button onClick={onClose} className="text-slate-500">
                <X />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {photos.map((p, i) => (
                <button
                  key={i}
                  onClick={() => handleCapture(i)}
                  className="aspect-video bg-slate-800 rounded-xl border-2 border-dashed border-slate-700 flex flex-col items-center justify-center relative overflow-hidden group active:scale-95 transition-all"
                >
                  {p ? (
                    <>
                      <img src={p} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Camera className="text-white" />
                      </div>
                    </>
                  ) : (
                    <>
                      <Camera className="w-8 h-8 text-slate-500 mb-1" />
                      <span className="text-[10px] uppercase font-bold text-slate-500">
                        {labels[i]}
                      </span>
                    </>
                  )}
                </button>
              ))}
            </div>

            <textarea
              placeholder="Resumen de daños o novedades..."
              className="input-field w-full h-24 mb-6"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <button
              disabled={loading || photos.some((p) => !p)}
              onClick={() => submitCheck('OK')}
              className="btn btn-primary w-full py-4 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
              ) : (
                <Save />
              )}
              GUARDAR Y COMENZAR
            </button>
          </div>
        )}

        {/* STEP: WAIVER */}
        {step === 'waiver' && (
          <div className="p-8">
            <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-2xl mb-8">
              <div className="flex items-center gap-3 text-red-500 mb-4">
                <AlertCircle className="w-8 h-8" />
                <h3 className="text-xl font-bold uppercase tracking-tight">Advertencia Crítica</h3>
              </div>
              <p className="text-red-200 leading-relaxed font-medium">
                Al omitir la inspección, usted asume la <strong>responsabilidad total</strong> por
                cualquier daño preexistente no reportado en el coche #{vehicleId}.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                disabled={loading}
                onClick={() => submitCheck('WAIVER')}
                className="btn bg-red-600 hover:bg-red-500 text-white py-4 font-bold active:scale-95"
              >
                ACEPTAR RIESGO E INICIAR
              </button>
              <button
                onClick={() => setStep('inspect')}
                className="text-slate-400 hover:text-white py-2 text-sm font-medium"
              >
                Volver a Inspección
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VehicleCheckModal;
