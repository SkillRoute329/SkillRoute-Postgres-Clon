import { useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { INCIDENCIA_META } from '../../../services/incidenciasService';
import type { FirestoreIncidencia } from '../../../hooks/useIncidencias';

interface IncidenciaModalProps {
  mode: 'CREATE' | 'EDIT';
  initialData: Partial<FirestoreIncidencia>;
  onClose: () => void;
  onSave: (data: Partial<FirestoreIncidencia>) => Promise<void>;
  saving: boolean;
}

export function IncidenciaModal({ mode, initialData, onClose, onSave, saving }: IncidenciaModalProps) {
  const [data, setData] = useState<Partial<FirestoreIncidencia>>(
    initialData || { type: 'otro', description: '', priority: 'MEDIA', vehicleId: '' }
  );

  const handleSave = async () => {
    await onSave(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="flex justify-between items-center p-4 border-b border-white/5">
          <h3 className="text-lg font-bold text-white">
            {mode === 'CREATE' ? 'Crear Incidencia' : 'Editar Incidencia'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Tipo</label>
            <select
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              value={data.type || 'otro'}
              onChange={e => setData({ ...data, type: e.target.value })}
            >
              {Object.keys(INCIDENCIA_META).map(k => (
                <option key={k} value={k}>{INCIDENCIA_META[k].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Prioridad</label>
            <select
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              value={data.priority || 'MEDIA'}
              onChange={e => setData({ ...data, priority: e.target.value as any })}
            >
              <option value="BAJA">Baja</option>
              <option value="MEDIA">Media</option>
              <option value="ALTA">Alta</option>
              <option value="CRITICA">Crítica</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Nº Vehículo (Opcional)</label>
            <input
              type="text"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              placeholder="Ej: 35"
              value={data.vehicleId || ''}
              onChange={e => setData({ ...data, vehicleId: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Descripción</label>
            <textarea
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 min-h-[80px]"
              placeholder="Detalles de la incidencia..."
              value={data.description || ''}
              onChange={e => setData({ ...data, description: e.target.value })}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 p-4 border-t border-white/5 bg-slate-900/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50"
          >
            {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
