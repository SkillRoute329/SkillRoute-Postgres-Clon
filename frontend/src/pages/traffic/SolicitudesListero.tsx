import { useState, useEffect } from 'react';
import { FileText, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../services/api';

interface Solicitud {
  id: string;
  conductorNombre: string;
  tipoSolicitud: string;
  fechaObjetivo: string;
  turnoObjetivo?: string;
  cocheObjetivo?: string;
  estado: string;
  notas?: string;
  createdAt: string;
}

interface Emparejamiento {
  s1: string;
  s2: string;
  tipo: string;
}

export default function SolicitudesListero() {
  const { user } = useAuth();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [emparejamientos, setEmparejamientos] = useState<Emparejamiento[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/listero/solicitudes');
      if (res.data?.ok) {
        setSolicitudes(res.data.solicitudes);
      }
      
      const today = new Date().toISOString().split('T')[0];
      const emRes = await api.get(`/api/listero/solicitudes/emparejamientos?fecha=${today}`);
      if (emRes.data?.ok) {
         setEmparejamientos(emRes.data.emparejamientos);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdateEstado = async (id: string, nuevoEstado: string) => {
    try {
      await api.patch(`/api/listero/solicitudes/${id}/estado`, { estado: nuevoEstado });
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Error al actualizar');
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            Bandeja de Papelitos
          </h2>
          <p className="text-slate-400 text-sm">Solicitudes de correlativos, turnos y descansos de los conductores.</p>
        </div>
        <button onClick={fetchData} className="px-3 py-1.5 bg-slate-800 text-slate-200 text-sm rounded hover:bg-slate-700">Actualizar</button>
      </div>

      {emparejamientos.length > 0 && (
        <div className="mb-6 p-4 rounded-lg bg-blue-900/20 border border-blue-500/30">
          <h3 className="text-blue-400 font-semibold mb-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Emparejamientos Sugeridos
          </h3>
          <ul className="text-sm text-slate-300 space-y-2">
            {emparejamientos.map((em, idx) => (
              <li key={idx}>Sugerencia ({em.tipo}): Cruzar solicitud {em.s1.slice(0,6)} con {em.s2.slice(0,6)}</li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Cargando...</p>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950 text-slate-400">
              <tr>
                <th className="px-4 py-3">Conductor</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Fecha / Detalles</th>
                <th className="px-4 py-3">Notas</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {solicitudes.map(s => (
                <tr key={s.id} className="border-t border-slate-800">
                  <td className="px-4 py-3">{s.conductorNombre}</td>
                  <td className="px-4 py-3 capitalize">{s.tipoSolicitud.replace('_', ' ')}</td>
                  <td className="px-4 py-3">
                    {s.fechaObjetivo} {s.turnoObjetivo && `(T. ${s.turnoObjetivo})`} {s.cocheObjetivo && `(C. ${s.cocheObjetivo})`}
                  </td>
                  <td className="px-4 py-3">{s.notas || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs ${
                      s.estado === 'aprobado' ? 'bg-green-900/50 text-green-400' :
                      s.estado === 'rechazado' ? 'bg-red-900/50 text-red-400' :
                      'bg-yellow-900/50 text-yellow-400'
                    }`}>
                      {s.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    {s.estado === 'pendiente' && (
                      <>
                        <button onClick={() => handleUpdateEstado(s.id, 'aprobado')} className="text-green-400 hover:text-green-300">
                          <CheckCircle className="w-5 h-5" />
                        </button>
                        <button onClick={() => handleUpdateEstado(s.id, 'rechazado')} className="text-red-400 hover:text-red-300">
                          <XCircle className="w-5 h-5" />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {solicitudes.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No hay papelitos pendientes</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
