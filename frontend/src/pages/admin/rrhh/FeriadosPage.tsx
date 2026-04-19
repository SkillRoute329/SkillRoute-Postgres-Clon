import { useState, useEffect } from 'react';
import { Calendar, Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { FeriadosService, type Feriado } from '../../../services/feriadosService';

export default function FeriadosPage() {
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newFeriado, setNewFeriado] = useState<Omit<Feriado, 'id'>>({
    fecha: '',
    nombre: '',
    recurrente: false,
    tipoHorario: 'DOMINGO',
  });

  useEffect(() => {
    const unsub = FeriadosService.subscribe((data: Feriado[]) => {
      setFeriados(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleAdd = async () => {
    if (!newFeriado.fecha || !newFeriado.nombre) return;
    try {
      await FeriadosService.add(newFeriado);
      setIsAdding(false);
      setNewFeriado({ fecha: '', nombre: '', recurrente: false, tipoHorario: 'DOMINGO' });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar feriado?')) return;
    try {
      await FeriadosService.remove(id);
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Cargando feriados...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Calendar className="w-6 h-6 text-primary-500" />
          Calendario de Feriados
        </h1>
        <button
          onClick={() => setIsAdding(true)}
          className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium"
        >
          <Plus className="w-4 h-4" />
          Nuevo Feriado
        </button>
      </div>

      {isAdding && (
        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Fecha</label>
              <input
                id="fecha-input"
                title="Fecha del Feriado"
                placeholder="YYYY-MM-DD"
                type="date"
                value={newFeriado.fecha}
                onChange={(e) => setNewFeriado({ ...newFeriado, fecha: e.target.value })}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Nombre</label>
              <input
                id="nombre-input"
                title="Nombre del Feriado"
                type="text"
                placeholder="Ej. Día del Trabajador"
                value={newFeriado.nombre}
                onChange={(e) => setNewFeriado({ ...newFeriado, nombre: e.target.value })}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                id="recurrente_chk"
                checked={newFeriado.recurrente}
                onChange={(e) => setNewFeriado({ ...newFeriado, recurrente: e.target.checked })}
                className="w-4 h-4 rounded border-slate-600 text-primary-500 focus:ring-primary-500 bg-slate-900"
              />
              <label htmlFor="recurrente_chk" className="text-sm text-slate-300">
                Se repite todos los años
              </label>
            </div>
            <div>
              <label
                htmlFor="tipo-horario-select"
                className="block text-sm font-medium text-slate-300 mb-1"
              >
                Tipo de Horario
              </label>
              <select
                id="tipo-horario-select"
                title="Seleccionar Tipo de Horario"
                value={newFeriado.tipoHorario}
                onChange={(e) =>
                  setNewFeriado({
                    ...newFeriado,
                    tipoHorario: e.target.value as Feriado['tipoHorario'],
                  })
                }
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
              >
                <option value="DOMINGO">Grilla de Domingo</option>
                <option value="SABADO">Grilla de Sábado</option>
                <option value="ESPECIAL">Grilla Especial</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-700">
            <button
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 text-slate-300 hover:text-white"
            >
              Cancelar
            </button>
            <button
              onClick={handleAdd}
              disabled={!newFeriado.fecha || !newFeriado.nombre}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Guardar Feriado
            </button>
          </div>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-800 border-b border-slate-700 text-slate-300 text-sm">
              <th className="p-4 font-medium">Fecha</th>
              <th className="p-4 font-medium">Nombre / Motivo</th>
              <th className="p-4 font-medium">Horario Base</th>
              <th className="p-4 font-medium">Recurrente</th>
              <th className="p-4 font-medium w-16">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {feriados.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-center text-slate-500 py-8">
                  No hay feriados registrados en Firestore.
                </td>
              </tr>
            ) : (
              feriados.map((f) => (
                <tr key={f.id} className="hover:bg-slate-800/50 transition-colors text-slate-200">
                  <td className="p-4">{f.fecha}</td>
                  <td className="p-4 font-medium">{f.nombre}</td>
                  <td className="p-4">
                    <span className="bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded text-xs font-medium">
                      {f.tipoHorario}
                    </span>
                  </td>
                  <td className="p-4">
                    {f.recurrente ? (
                      <span className="text-emerald-400 text-sm">✓ Sí</span>
                    ) : (
                      <span className="text-slate-500 text-sm">No</span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => f.id && handleDelete(f.id)}
                      className="text-slate-400 hover:text-red-400 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-5 h-5 mx-auto" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
