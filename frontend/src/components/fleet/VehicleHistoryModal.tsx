import React, { useState, useEffect } from 'react';
import { X, Clock, User, AlertTriangle } from 'lucide-react';
import { FleetService } from '../../services/api';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface VehicleHistoryModalProps {
  vehicleId: number;
  vehicleNumber: string;
  onClose: () => void;
}

const VehicleHistoryModal: React.FC<VehicleHistoryModalProps> = ({
  vehicleId,
  vehicleNumber,
  onClose,
}) => {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [vehicleId]);

  const loadHistory = async () => {
    try {
      const data = await FleetService.getVehicleHistory(vehicleId);
      setHistory(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col animate-scale-in">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Clock className="w-6 h-6 text-primary-500" />
              Historial de Coche {vehicleNumber}
            </h2>
            <p className="text-slate-400 text-sm">
              Registro de inspecciones y personal que operó la unidad.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-4">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-20 text-slate-500 italic">
              No hay registros de historial para esta unidad.
            </div>
          ) : (
            <div className="space-y-6">
              {history.map((inspection) => (
                <div
                  key={inspection.id}
                  className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 hover:border-slate-500 transition-all"
                >
                  <div className="flex flex-col md:flex-row justify-between gap-4 mb-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center shrink-0 border border-slate-600">
                        <User className="w-6 h-6 text-slate-300" />
                      </div>
                      <div>
                        <div className="text-white font-bold text-lg">
                          {inspection.user?.fullName}
                        </div>
                        <div className="text-sm text-slate-400">
                          Interno: {inspection.user?.internalNumber}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-primary-400 font-bold">
                        {(() => {
                          try {
                            const raw = inspection.createdAt || inspection.timestamp;
                            let dateObj = new Date();

                            // Handle Firestore Timestamp (seconds)
                            if (raw?.seconds) {
                              dateObj = new Date(raw.seconds * 1000);
                            }
                            // Handle Firestore Timestamp (toDate function)
                            else if (typeof raw?.toDate === 'function') {
                              dateObj = raw.toDate();
                            }
                            // Handle String / Number
                            else if (raw) {
                              dateObj = new Date(raw);
                            }

                            if (isNaN(dateObj.getTime())) return 'Fecha Inválida';

                            return format(dateObj, "EEEE d 'de' MMMM, HH:mm", { locale: es });
                          } catch (e) {
                            return 'Fecha Error';
                          }
                        })()}
                      </div>
                      <div
                        className={
                          inspection.status === 'OK'
                            ? 'text-emerald-400 text-sm font-bold'
                            : 'text-orange-400 text-sm font-bold'
                        }
                      >
                        Estado: {inspection.status === 'OK' ? 'CORRECTO' : 'CON DAÑOS'}
                      </div>
                    </div>
                  </div>

                  {/* Odometer & Fuel */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">
                        Kilometraje
                      </div>
                      <div className="text-white font-mono">
                        {inspection.odometer?.toLocaleString() || 'N/A'} Km
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">
                        Combustible
                      </div>
                      <div className="text-white">{inspection.fuelLevel || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Tipo</div>
                      <div className="text-slate-300 text-xs">
                        {inspection.type === 'StartShift' ? 'Inicio de Turno' : 'Fin de Turno'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">
                        ID Registro
                      </div>
                      <div className="text-slate-600 font-mono text-[10px]">#{inspection.id}</div>
                    </div>
                  </div>

                  {/* Damages */}
                  {inspection.damages?.length > 0 && (
                    <div className="mt-4 space-y-3">
                      <div className="text-xs font-bold text-orange-400 flex items-center gap-2 uppercase tracking-widest">
                        <AlertTriangle className="w-4 h-4" /> Daños Reportados
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {inspection.damages.map((d: any) => (
                          <div
                            key={d.id}
                            className="flex gap-3 bg-red-500/5 border border-red-500/20 p-3 rounded-lg"
                          >
                            {d.photoUrl && (
                              <img
                                src={d.photoUrl}
                                alt="Daño"
                                className="w-20 h-20 object-cover rounded-lg border border-red-500/30 shrink-0"
                              />
                            )}
                            <div>
                              <div className="text-white font-bold text-sm">[{d.zone}]</div>
                              <p className="text-xs text-slate-400 leading-relaxed">
                                {d.description}
                              </p>
                              <span className="text-[10px] bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded mt-1 inline-block">
                                Severidad: {d.severity}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {inspection.notes && (
                    <div className="mt-3 text-xs text-slate-400 italic bg-slate-900/30 p-2 rounded">
                      Notas: {inspection.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex justify-end">
          <button onClick={onClose} className="btn bg-slate-800 hover:bg-slate-700 text-white px-8">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default VehicleHistoryModal;
