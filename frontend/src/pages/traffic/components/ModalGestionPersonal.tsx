import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../../services/api';

interface ConductorMaestro {
  id: string;
  internalNumber: string;
  fullName: string;
  rol: string;
  telefono: string | null;
  data_jsonb?: any;
}

interface Props {
  onClose: () => void;
}

export const ModalGestionPersonal: React.FC<Props> = ({ onClose }) => {
  const [personal, setPersonal] = useState<ConductorMaestro[]>([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Edit form state
  const [editForm, setEditForm] = useState<any>({});

  const cargarMaestro = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/listero/personal-maestro');
      if (res.ok) setPersonal(res.personal);
    } catch (e) {
      console.error(e);
      alert('Error cargando maestro de personal');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarMaestro();
  }, []);

  const rotarSemana = async (tipo: 'semanal' | 'quincenal') => {
    if (!window.confirm(`¿Estás seguro de rotar la asignación ${tipo}? (Mañana pasará a Tarde, Tarde a Mañana)`)) return;
    setProcesando(true);
    try {
      const res = await apiFetch('/listero/rotar-semana', {
        method: 'POST',
        body: JSON.stringify({ tipo })
      });
      if (res.ok) {
        alert(`Éxito: ${res.actualizados} conductores rotados.`);
        cargarMaestro();
      }
    } catch (e) {
      console.error(e);
      alert('Error al rotar semana');
    } finally {
      setProcesando(false);
    }
  };

  const iniciarEdicion = (c: ConductorMaestro) => {
    setEditingId(c.id);
    setEditForm({
      fullName: c.fullName,
      internalNumber: c.internalNumber,
      telefono: c.telefono || '',
      tipo_vinculo: c.data_jsonb?.tipo_vinculo || 'flotante',
      coche_fijo_id: c.data_jsonb?.coche_fijo_id || '',
      rotacion_semana_actual: c.data_jsonb?.rotacion_semana_actual || 'mañana',
      tipo_rotacion: c.data_jsonb?.tipo_rotacion || 'semanal'
    });
  };

  const guardarEdicion = async () => {
    if (!editingId) return;
    setProcesando(true);
    try {
      const payload = {
        fullName: editForm.fullName,
        internalNumber: editForm.internalNumber,
        telefono: editForm.telefono,
        data_jsonb: {
          tipo_vinculo: editForm.tipo_vinculo,
          coche_fijo_id: editForm.coche_fijo_id,
          rotacion_semana_actual: editForm.rotacion_semana_actual,
          tipo_rotacion: editForm.tipo_rotacion,
        }
      };

      const res = await apiFetch(`/listero/personal-maestro/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setEditingId(null);
        cargarMaestro();
      }
    } catch (e) {
      console.error(e);
      alert('Error al guardar datos');
    } finally {
      setProcesando(false);
    }
  };

  // Agrupaciones
  const fijosManana = personal.filter(p => p.data_jsonb?.tipo_vinculo === 'fijo' && p.data_jsonb?.rotacion_semana_actual === 'mañana');
  const fijosTarde = personal.filter(p => p.data_jsonb?.tipo_vinculo === 'fijo' && p.data_jsonb?.rotacion_semana_actual === 'tarde');
  const flotantes = personal.filter(p => p.data_jsonb?.tipo_vinculo !== 'fijo');

  const renderColumna = (titulo: string, color: string, lista: ConductorMaestro[]) => (
    <div className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg p-3 flex flex-col h-[500px]">
      <h3 className={`font-black text-sm uppercase mb-3 ${color}`}>{titulo} ({lista.length})</h3>
      <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
        {lista.map(c => (
          <div key={c.id} className="bg-slate-900 border border-slate-700 p-2 rounded-md">
            {editingId === c.id ? (
              <div className="space-y-2">
                <input 
                  type="text" 
                  value={editForm.fullName} 
                  onChange={e => setEditForm({...editForm, fullName: e.target.value})}
                  className="w-full bg-black text-white text-xs px-2 py-1 rounded" 
                  placeholder="Nombre"
                />
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={editForm.internalNumber} 
                    onChange={e => setEditForm({...editForm, internalNumber: e.target.value})}
                    className="w-1/3 bg-black text-white text-xs px-2 py-1 rounded" 
                    placeholder="Interno"
                  />
                  <input 
                    type="text" 
                    value={editForm.telefono} 
                    onChange={e => setEditForm({...editForm, telefono: e.target.value})}
                    className="w-2/3 bg-black text-white text-xs px-2 py-1 rounded" 
                    placeholder="Teléfono"
                  />
                </div>
                <div className="flex gap-2">
                  <select 
                    value={editForm.tipo_vinculo} 
                    onChange={e => setEditForm({...editForm, tipo_vinculo: e.target.value})}
                    className="flex-1 bg-black text-white text-xs px-2 py-1 rounded"
                  >
                    <option value="flotante">Flotante</option>
                    <option value="fijo">Fijo</option>
                  </select>
                  {editForm.tipo_vinculo === 'fijo' && (
                    <input 
                      type="text" 
                      value={editForm.coche_fijo_id} 
                      onChange={e => setEditForm({...editForm, coche_fijo_id: e.target.value})}
                      className="w-16 bg-black text-white text-xs px-2 py-1 rounded" 
                      placeholder="Coche"
                    />
                  )}
                </div>
                {editForm.tipo_vinculo === 'fijo' && (
                  <div className="flex gap-2">
                    <select 
                      value={editForm.rotacion_semana_actual} 
                      onChange={e => setEditForm({...editForm, rotacion_semana_actual: e.target.value})}
                      className="flex-1 bg-black text-white text-xs px-2 py-1 rounded"
                    >
                      <option value="mañana">Turno Mañana</option>
                      <option value="tarde">Turno Tarde</option>
                    </select>
                    <select 
                      value={editForm.tipo_rotacion} 
                      onChange={e => setEditForm({...editForm, tipo_rotacion: e.target.value})}
                      className="flex-1 bg-black text-white text-xs px-2 py-1 rounded"
                    >
                      <option value="semanal">Semanal</option>
                      <option value="quincenal">Quincenal</option>
                    </select>
                  </div>
                )}
                <div className="flex gap-2 justify-end mt-2">
                  <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-white">Cancelar</button>
                  <button onClick={guardarEdicion} disabled={procesando} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-500">Guardar</button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex justify-between items-start">
                  <p className="text-xs font-bold text-white truncate">{c.fullName}</p>
                  <button onClick={() => iniciarEdicion(c)} className="text-xs text-blue-400 hover:text-blue-300">Editar</button>
                </div>
                <p className="text-[10px] text-slate-400">INT {c.internalNumber} {c.telefono ? `- Tel: ${c.telefono}` : ''}</p>
                {c.data_jsonb?.tipo_vinculo === 'fijo' && (
                  <div className="mt-1 flex gap-1">
                    <span className="text-[9px] bg-slate-800 text-slate-300 px-1 py-0.5 rounded">Coche {c.data_jsonb.coche_fijo_id}</span>
                    <span className="text-[9px] bg-slate-800 text-slate-300 px-1 py-0.5 rounded">{c.data_jsonb.tipo_rotacion || 'semanal'}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-2xl w-full max-w-5xl flex flex-col h-[90vh]">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-slate-900 rounded-t-xl">
          <h2 className="text-xl font-black text-white uppercase tracking-wider">Gestión Maestra de Personal y Rotaciones</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>
        
        <div className="p-4 bg-slate-800/30 flex items-center gap-4 border-b border-gray-700">
           <div className="flex flex-col">
              <span className="text-sm font-bold text-white">Automatización Masiva</span>
              <span className="text-xs text-gray-400">Rota todos los choferes fijos (Mañana ↔ Tarde)</span>
           </div>
           <button 
             onClick={() => rotarSemana('semanal')}
             disabled={procesando}
             className="ml-auto bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded shadow text-sm font-bold transition-all disabled:opacity-50"
           >
             Rotar Semanales
           </button>
           <button 
             onClick={() => rotarSemana('quincenal')}
             disabled={procesando}
             className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded shadow text-sm font-bold transition-all disabled:opacity-50"
           >
             Rotar Quincenales
           </button>
        </div>

        <div className="flex-1 p-4 overflow-hidden flex gap-4">
          {loading ? (
             <div className="w-full h-full flex items-center justify-center text-gray-400">Cargando base de datos maestra...</div>
          ) : (
            <>
              {renderColumna('Fijos - Mañana', 'text-emerald-400', fijosManana)}
              {renderColumna('Fijos - Tarde', 'text-orange-400', fijosTarde)}
              {renderColumna('Flotantes / Retén', 'text-blue-400', flotantes)}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
