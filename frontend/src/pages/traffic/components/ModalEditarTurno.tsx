import React, { useState } from 'react';
import { apiFetch } from '../../../services/api';

interface Conductor {
  id: string;
  internalNumber: string;
  fullName: string;
  estadoHoy: string;
}

interface Vehiculo {
  id: string;
  interno: string;
}

interface Props {
  turno: any;
  conductores: Conductor[];
  vehiculos: Vehiculo[];
  onClose: () => void;
  onSuccess: () => void;
}

export const ModalEditarTurno: React.FC<Props> = ({ turno, conductores, vehiculos, onClose, onSuccess }) => {
  const [conductorId, setConductorId] = useState(turno.conductorId || '');
  const [vehiculoId, setVehiculoId] = useState(turno.vehiculoId || '');
  const [horaSalida, setHoraSalida] = useState(turno.horaSalida || '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const conductorSelected = conductores.find(c => c.id === conductorId);
    const vehiculoSelected = vehiculos.find(v => v.id === vehiculoId);

    const body = {
      conductorId: conductorId || null,
      conductorNombre: conductorSelected ? conductorSelected.fullName : null,
      conductorInterno: conductorSelected ? conductorSelected.internalNumber : null,
      vehiculoId: vehiculoId || turno.vehiculoId,
      vehiculoInterno: vehiculoSelected ? vehiculoSelected.interno : turno.vehiculoInterno,
      horaSalida
    };

    try {
      await apiFetch(`/listero/turnos/${turno.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
      onSuccess();
    } catch (error) {
      console.error(error);
      alert('Error al guardar cambios');
    } finally {
      setLoading(false);
    }
  };

  const disponibles = conductores.filter(c => c.estadoHoy === 'disponible' || c.estadoHoy === 'reserva' || c.id === turno.conductorId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1e1e1e] border border-gray-700 rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-lg font-bold text-white">Editar Turno (Línea {turno.lineaId})</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Chofer Asignado</label>
            <select
              value={conductorId}
              onChange={(e) => setConductorId(e.target.value)}
              className="w-full bg-[#2a2a2a] text-white border border-gray-600 rounded px-3 py-2"
            >
              <option value="">-- Sin Conductor --</option>
              {disponibles.map(c => (
                <option key={c.id} value={c.id}>
                  {c.internalNumber} - {c.fullName} ({c.estadoHoy})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Vehículo Asignado</label>
            <select
              value={vehiculoId}
              onChange={(e) => setVehiculoId(e.target.value)}
              className="w-full bg-[#2a2a2a] text-white border border-gray-600 rounded px-3 py-2"
            >
              {vehiculos.map(v => (
                <option key={v.id} value={v.id}>
                  Coche {v.interno}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Hora Salida</label>
            <input
              type="time"
              value={horaSalida}
              onChange={(e) => setHoraSalida(e.target.value)}
              className="w-full bg-[#2a2a2a] text-white border border-gray-600 rounded px-3 py-2"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded text-gray-300 hover:bg-gray-800">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-medium disabled:opacity-50">
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
