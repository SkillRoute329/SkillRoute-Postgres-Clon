import { useState } from 'react';
import { Send, Wrench, X } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../services/api';

export default function ConductorAcciones() {
  const { user } = useAuth();
  const [showPapelito, setShowPapelito] = useState(false);
  const [showAveria, setShowAveria] = useState(false);

  // Form State Papelito
  const [tipoSolicitud, setTipoSolicitud] = useState('correlativo');
  const [fechaObjetivo, setFechaObjetivo] = useState(new Date().toISOString().split('T')[0]);
  const [turnoObjetivo, setTurnoObjetivo] = useState('');
  const [cocheObjetivo, setCocheObjetivo] = useState('');
  const [notas, setNotas] = useState('');

  // Form State Avería
  const [vehiculoId, setVehiculoId] = useState('');
  const [motivoAveria, setMotivoAveria] = useState('');

  const submitPapelito = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/listero/solicitudes', {
        tipoSolicitud,
        fechaObjetivo,
        turnoObjetivo,
        cocheObjetivo,
        notas
      });
      alert('Solicitud enviada al Listero');
      setShowPapelito(false);
    } catch (err) {
      alert('Error enviando solicitud');
      console.error(err);
    }
  };

  const submitAveria = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/listero/vehiculo-taller', {
        vehiculoId,
        vehiculoInterno: vehiculoId,
        motivo: motivoAveria,
        fecha: new Date().toISOString().split('T')[0]
      });
      alert('Avería reportada exitosamente.');
      setShowAveria(false);
    } catch (err) {
      alert('Error reportando avería');
      console.error(err);
    }
  };

  return (
    <div className="flex gap-2 mb-4 px-2 mt-4 md:mt-0">
      <button 
        onClick={() => setShowPapelito(true)}
        className="flex-1 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/50 text-indigo-300 py-2 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold transition-colors"
      >
        <Send className="w-4 h-4" />
        Enviar Papelito
      </button>
      
      <button 
        onClick={() => setShowAveria(true)}
        className="flex-1 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/50 text-rose-300 py-2 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold transition-colors"
      >
        <Wrench className="w-4 h-4" />
        Reportar Avería
      </button>

      {/* MODAL PAPELITO */}
      {showPapelito && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5 relative">
            <button onClick={() => setShowPapelito(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-white mb-4">Enviar Solicitud al Listero</h3>
            <form onSubmit={submitPapelito} className="space-y-3">
              <div>
                <label className="text-slate-400 text-xs block mb-1">Tipo de Solicitud</label>
                <select value={tipoSolicitud} onChange={e => setTipoSolicitud(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                  <option value="correlativo">Turno Correlativo (Doble)</option>
                  <option value="cambio_turno">Cambio de Turno</option>
                  <option value="cambio_descanso">Cambio de Descanso</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">Fecha de la Solicitud</label>
                <input type="date" value={fechaObjetivo} onChange={e => setFechaObjetivo(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Turno Deseado</label>
                  <select value={turnoObjetivo} onChange={e => setTurnoObjetivo(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                    <option value="">Cualquiera</option>
                    <option value="Mañana">Mañana</option>
                    <option value="Tarde">Tarde</option>
                    <option value="Noche">Noche</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Coche Preferido</label>
                  <input type="text" placeholder="Ej: 154" value={cocheObjetivo} onChange={e => setCocheObjetivo(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">Notas / Motivo</label>
                <textarea rows={2} value={notas} onChange={e => setNotas(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" placeholder="Opcional..." />
              </div>
              <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-lg mt-2">
                Enviar Papelito
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL AVERIA */}
      {showAveria && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5 relative">
            <button onClick={() => setShowAveria(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-white mb-4">Reportar Coche en Taller</h3>
            <form onSubmit={submitAveria} className="space-y-3">
              <div>
                <label className="text-slate-400 text-xs block mb-1">Coche (Nº Interno)</label>
                <input type="text" value={vehiculoId} onChange={e => setVehiculoId(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" placeholder="Ej: 154" />
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">Motivo / Tipo de Avería</label>
                <textarea rows={3} value={motivoAveria} onChange={e => setMotivoAveria(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" placeholder="Ej: Problema eléctrico, frenos..." />
              </div>
              <button type="submit" className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-2 rounded-lg mt-2">
                Reportar Avería
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
