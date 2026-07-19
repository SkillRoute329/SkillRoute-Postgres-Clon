import React, { useState } from 'react';
import { apiFetch } from '../../../services/api';

interface Conductor {
  id: string;
  internalNumber: string;
  fullName: string;
  estadoHoy: string;
  regimenRotacion?: string;
  patronDescanso?: string;
}

interface Props {
  conductor: Conductor;
  onClose: () => void;
  onSuccess: () => void;
}

export const ModalEditarConductor: React.FC<Props> = ({ conductor, onClose, onSuccess }) => {
  const [estadoHoy, setEstadoHoy] = useState(conductor.estadoHoy || 'disponible');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await apiFetch(`/listero/conductores/${conductor.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ estadoHoy })
      });
      onSuccess();
    } catch (error) {
      console.error(error);
      alert('Error al actualizar estado del conductor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1e1e1e] border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-lg font-bold text-white">Gestión de Personal</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <p className="text-gray-300 font-medium mb-1">{conductor.fullName}</p>
            <p className="text-xs text-gray-500 mb-4">Interno: {conductor.internalNumber}</p>
            
            <label className="block text-sm text-gray-400 mb-1">Estado de Hoy</label>
            <select
              value={estadoHoy}
              onChange={(e) => setEstadoHoy(e.target.value)}
              className="w-full bg-[#2a2a2a] text-white border border-gray-600 rounded px-3 py-2"
            >
              <option value="disponible">Disponible (Libre)</option>
              <option value="reserva">Reserva Activa</option>
              <option value="franco">Franco (Día Libre)</option>
              <option value="licencia">Licencia</option>
              <option value="enfermo">Parte de Enfermo</option>
              <option value="ausente">Ausente Sin Aviso</option>
            </select>
            <p className="text-xs text-gray-500 mt-2">
              Nota: Cambiar el estado a "Ausente" aquí no disparará alertas automáticas ni buscará suplentes. Use el botón "Registrar Ausencia" en la grilla para eso.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded text-gray-300 hover:bg-gray-800">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-medium disabled:opacity-50">
              {loading ? 'Guardando...' : 'Aplicar Estado'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
