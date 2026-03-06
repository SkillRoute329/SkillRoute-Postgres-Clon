import { useState, useEffect } from 'react';
import { X, Check, AlertTriangle, Info, Clock } from 'lucide-react';
import { checkCompetitorProximity } from '../services/CompetitorIntelligence';
import { db } from '../config/firebase'; // Ensure authorized
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

interface ControlProps {
  lineId: string;
  serviceId: string;
  stopName: string;
  scheduledTime: string;
  onClose: () => void;
  onSuccess: () => void;
}

const ControlPointForm = ({
  lineId,
  serviceId,
  stopName,
  scheduledTime,
  onClose,
  onSuccess,
}: ControlProps) => {
  const [loadLevel, setLoadLevel] = useState('');
  const [competitorAlert, setCompetitorAlert] = useState<any>(null);
  const [delta, setDelta] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Initial Intelligence Check
  useEffect(() => {
    const check = async () => {
      const intel = await checkCompetitorProximity(lineId, 0, 0);
      setCompetitorAlert(intel);
    };
    check();
  }, [lineId, stopName]);

  const handleConfirm = async () => {
    if (!loadLevel) {
      alert('Seleccione nivel de carga');
      return;
    }

    setSubmitting(true);
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) throw new Error('No autorizado');

      const stopKey = stopName.replace(/[\.\#\$\[\]\/]/g, '').trim();
      const controlRef = doc(db, 'lineas', lineId, 'servicios', serviceId, 'controls', stopKey);

      await setDoc(controlRef, {
        timestamp: new Date().toISOString(), // Real Time Check
        inspectorId: user.uid,
        inspectorName: user.displayName || 'Inspector',
        stopName,
        load: loadLevel,
        timeDelta: delta, // Adjusted time
        type: 'CHECK',
        reason: delta !== 0 ? 'Ajuste Operativo / Competencia' : 'Normal',
      });

      // Also update Service Status Summary in Parent
      const serviceRef = doc(db, 'lineas', lineId, 'servicios', serviceId);
      await setDoc(
        serviceRef,
        {
          lastControl: new Date().toISOString(),
          currentDelay: delta,
        },
        { merge: true },
      );

      onSuccess();
    } catch (error) {
      console.error(error);
      alert('Error guardando control');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 w-full md:w-[500px] md:rounded-2xl rounded-t-2xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-900 flex justify-between items-center">
          <div>
            <h3 className="text-white font-bold text-lg">{stopName}</h3>
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Clock className="w-4 h-4" />
              Programado: <span className="text-white font-mono font-bold">{scheduledTime}</span>
            </div>
          </div>
          <button onClick={onClose}>
            <X className="text-slate-400" />
          </button>
        </div>

        <div className="p-5 space-y-6 overflow-y-auto">
          {/* Tactical Alert */}
          {competitorAlert && competitorAlert.detected && (
            <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl flex gap-3 animate-pulse">
              <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0" />
              <div>
                <h4 className="text-amber-400 font-bold text-sm">Inteligencia Táctica</h4>
                <p className="text-amber-200/80 text-xs leading-relaxed mt-1">
                  {competitorAlert.message}
                </p>
              </div>
            </div>
          )}

          {competitorAlert && !competitorAlert.detected && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl flex gap-3">
              <Info className="w-5 h-5 text-emerald-500 shrink-0" />
              <p className="text-emerald-400/80 text-xs mt-0.5">{competitorAlert.message}</p>
            </div>
          )}

          {/* Load Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-3">
              Carga de Pasajeros
            </label>
            <div className="grid grid-cols-4 gap-2">
              {['VACIO', 'SENTADOS', 'LLENO', 'EXPLOTADO'].map((level) => (
                <button
                  key={level}
                  onClick={() => setLoadLevel(level)}
                  className={`py-3 rounded-xl text-xs font-bold border transition-all ${
                    loadLevel === level
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/50'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Traffic Management (Header/Terminals usually) */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-3">
              Gestión de Salida (Minutos)
            </label>
            <div className="flex bg-slate-800 rounded-xl border border-slate-700 p-1">
              <button
                onClick={() => setDelta((d) => d - 1)}
                className="flex-1 py-2 rounded-lg hover:bg-slate-700 text-slate-300 font-bold"
              >
                -
              </button>
              <div
                className={`w-16 flex items-center justify-center font-mono font-bold ${delta > 0 ? 'text-red-400' : delta < 0 ? 'text-emerald-400' : 'text-white'}`}
              >
                {delta > 0 ? `+${delta}` : delta}
              </div>
              <button
                onClick={() => setDelta((d) => d + 1)}
                className="flex-1 py-2 rounded-lg hover:bg-slate-700 text-slate-300 font-bold"
              >
                +
              </button>
            </div>
            <p className="text-center text-xs text-slate-500 mt-2">
              {delta < 0 ? 'Adelantar salida' : delta > 0 ? 'Atrasar salida' : 'Salida puntual'}
            </p>
          </div>
        </div>

        {/* Footer Action */}
        <div className="p-5 border-t border-slate-800 bg-slate-900/50">
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] transition-all rounded-xl font-bold text-white shadow-lg shadow-emerald-900/20 flex justify-center items-center gap-2"
          >
            {submitting ? (
              'Guardando...'
            ) : (
              <>
                <Check className="w-5 h-5" /> CONFIRMAR PASADA
              </>
            )}
          </button>
          <p className="text-center text-[10px] text-slate-600 mt-3 flex justify-center items-center gap-1">
            <Info className="w-3 h-3" /> El sistema auditará esta acción con tu ID
          </p>
        </div>
      </div>
    </div>
  );
};

export default ControlPointForm;
