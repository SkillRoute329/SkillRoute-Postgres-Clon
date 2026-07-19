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

interface FlotaMaestra {
  id: string;
  interno: string;
  lineaHabitual: string;
  marca: string;
  patente: string;
  categoria: string;
  choferManana: {
    id: string;
    fullName: string;
    internalNumber: string;
    tipoRotacion: string;
  } | null;
  choferTarde: {
    id: string;
    fullName: string;
    internalNumber: string;
    tipoRotacion: string;
  } | null;
}

interface Props {
  onClose: () => void;
}

export const ModalGestionPersonal: React.FC<Props> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'personal' | 'flota'>('flota');
  const [personal, setPersonal] = useState<ConductorMaestro[]>([]);
  const [flota, setFlota] = useState<FlotaMaestra[]>([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  
  // Flota Assignment state
  const [assigningCar, setAssigningCar] = useState<{ carId: string; turno: 'mañana'|'tarde' } | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [selectedRotacion, setSelectedRotacion] = useState<'fijo'|'semanal'|'quincenal'>('semanal');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Edit Car state
  const [editingCarId, setEditingCarId] = useState<string | null>(null);
  const [editCarForm, setEditCarForm] = useState<any>({});

  const iniciarEdicionCoche = (c: FlotaMaestra) => {
    setEditingCarId(c.id);
    setEditCarForm({
      lineaHabitual: c.lineaHabitual || '',
      marca: c.marca || '',
      patente: c.patente || '',
      categoria: c.categoria || 'Normal'
    });
  };

  const guardarEdicionCoche = async () => {
    if (!editingCarId) return;
    setProcesando(true);
    try {
      const res = await apiFetch(`/listero/vehiculos/${editingCarId}`, {
        method: 'PATCH',
        body: JSON.stringify(editCarForm)
      });
      if (res.ok) {
        setEditingCarId(null);
        cargarDatos();
      }
    } catch (e) {
      console.error(e);
      alert('Error al guardar coche');
    } finally {
      setProcesando(false);
    }
  };

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [resPersonal, resFlota] = await Promise.all([
        apiFetch('/listero/personal-maestro'),
        apiFetch('/listero/flota-maestra')
      ]);
      if (resPersonal.ok) setPersonal(resPersonal.personal);
      if (resFlota.ok) setFlota(resFlota.flota);
    } catch (e) {
      console.error(e);
      alert('Error cargando base de datos maestra');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
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
        cargarDatos();
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
        cargarDatos();
      }
    } catch (e) {
      console.error(e);
      alert('Error al guardar datos');
    } finally {
      setProcesando(false);
    }
  };

  const guardarAsignacionCoche = async () => {
    if (!assigningCar) return;
    setProcesando(true);
    try {
      const res = await apiFetch('/listero/asignar-titular', {
        method: 'POST',
        body: JSON.stringify({
           vehiculoId: assigningCar.carId,
           turno: assigningCar.turno,
           conductorId: selectedDriverId || null,
           tipoRotacion: selectedRotacion
        })
      });
      if (res.ok) {
        setAssigningCar(null);
        setSelectedDriverId('');
        cargarDatos();
      }
    } catch (e) {
      console.error(e);
      alert('Error al asignar titular');
    } finally {
      setProcesando(false);
    }
  };

  // Agrupaciones de personal
  const fijosManana = personal.filter(p => p.data_jsonb?.tipo_vinculo === 'fijo' && p.data_jsonb?.rotacion_semana_actual === 'mañana');
  const fijosTarde = personal.filter(p => p.data_jsonb?.tipo_vinculo === 'fijo' && p.data_jsonb?.rotacion_semana_actual === 'tarde');
  const flotantes = personal.filter(p => p.data_jsonb?.tipo_vinculo !== 'fijo');

  const choferesDisponiblesParaAsignar = personal.filter(p => p.fullName.toLowerCase().includes(searchQuery.toLowerCase()) || p.internalNumber.includes(searchQuery));

  const renderPersonal = () => (
    <div className="flex-1 p-4 overflow-hidden flex gap-4">
      {renderColumnaPersonal('Fijos - Mañana', 'text-emerald-400', fijosManana)}
      {renderColumnaPersonal('Fijos - Tarde', 'text-orange-400', fijosTarde)}
      {renderColumnaPersonal('Flotantes / Retén', 'text-blue-400', flotantes)}
    </div>
  );

  const renderColumnaPersonal = (titulo: string, color: string, lista: ConductorMaestro[]) => (
    <div className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg p-3 flex flex-col h-[500px]">
      <h3 className={`font-black text-sm uppercase mb-3 ${color}`}>{titulo} ({lista.length})</h3>
      <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
        {lista.map(c => (
          <div key={c.id} className="bg-slate-900 border border-slate-700 p-2 rounded-md">
            {editingId === c.id ? (
              <div className="space-y-2">
                <input type="text" value={editForm.fullName} onChange={e => setEditForm({...editForm, fullName: e.target.value})} className="w-full bg-black text-white text-xs px-2 py-1 rounded" placeholder="Nombre" />
                <div className="flex gap-2">
                   <input type="text" value={editForm.internalNumber} onChange={e => setEditForm({...editForm, internalNumber: e.target.value})} className="w-1/3 bg-black text-white text-xs px-2 py-1 rounded" placeholder="Interno" />
                   <input type="text" value={editForm.telefono} onChange={e => setEditForm({...editForm, telefono: e.target.value})} className="w-2/3 bg-black text-white text-xs px-2 py-1 rounded" placeholder="Teléfono" />
                </div>
                <div className="flex gap-2">
                  <select value={editForm.tipo_vinculo} onChange={e => setEditForm({...editForm, tipo_vinculo: e.target.value})} className="flex-1 bg-black text-white text-xs px-2 py-1 rounded">
                    <option value="flotante">Flotante</option>
                    <option value="fijo">Fijo</option>
                  </select>
                  {editForm.tipo_vinculo === 'fijo' && (
                    <input type="text" value={editForm.coche_fijo_id} onChange={e => setEditForm({...editForm, coche_fijo_id: e.target.value})} className="w-16 bg-black text-white text-xs px-2 py-1 rounded" placeholder="Coche" />
                  )}
                </div>
                {editForm.tipo_vinculo === 'fijo' && (
                  <div className="flex gap-2">
                    <select value={editForm.rotacion_semana_actual} onChange={e => setEditForm({...editForm, rotacion_semana_actual: e.target.value})} className="flex-1 bg-black text-white text-xs px-2 py-1 rounded">
                      <option value="mañana">Turno Mañana</option>
                      <option value="tarde">Turno Tarde</option>
                    </select>
                    <select value={editForm.tipo_rotacion} onChange={e => setEditForm({...editForm, tipo_rotacion: e.target.value})} className="flex-1 bg-black text-white text-xs px-2 py-1 rounded">
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

  const renderFlota = () => (
    <div className="flex-1 p-4 overflow-y-auto custom-scrollbar relative">
       <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {flota.map(c => (
             <div key={c.id} className="bg-slate-800/80 border border-slate-700 rounded-lg p-3 shadow-lg flex flex-col gap-2 relative group">
                {editingCarId === c.id ? (
                  <div className="bg-slate-900 p-2 rounded border border-blue-500 mb-2 space-y-2">
                    <div className="flex gap-2">
                       <div className="w-1/2">
                         <label className="text-[9px] text-slate-400 block mb-0.5">Línea</label>
                         <input type="text" value={editCarForm.lineaHabitual} onChange={e => setEditCarForm({...editCarForm, lineaHabitual: e.target.value})} className="w-full bg-black text-white text-xs px-2 py-1 rounded border border-slate-700" placeholder="Ej: 300"/>
                       </div>
                       <div className="w-1/2">
                         <label className="text-[9px] text-slate-400 block mb-0.5">Categoría</label>
                         <input type="text" value={editCarForm.categoria} onChange={e => setEditCarForm({...editCarForm, categoria: e.target.value})} className="w-full bg-black text-white text-xs px-2 py-1 rounded border border-slate-700" placeholder="Ej: Especial"/>
                       </div>
                    </div>
                    <div className="flex gap-2">
                       <div className="w-1/2">
                         <label className="text-[9px] text-slate-400 block mb-0.5">Marca/Modelo</label>
                         <input type="text" value={editCarForm.marca} onChange={e => setEditCarForm({...editCarForm, marca: e.target.value})} className="w-full bg-black text-white text-xs px-2 py-1 rounded border border-slate-700" placeholder="Ej: Yutong"/>
                       </div>
                       <div className="w-1/2">
                         <label className="text-[9px] text-slate-400 block mb-0.5">Matrícula</label>
                         <input type="text" value={editCarForm.patente} onChange={e => setEditCarForm({...editCarForm, patente: e.target.value})} className="w-full bg-black text-white text-xs px-2 py-1 rounded border border-slate-700" placeholder="STU-1234"/>
                       </div>
                    </div>
                    <div className="flex gap-2 justify-end mt-2">
                       <button onClick={() => setEditingCarId(null)} className="text-[10px] text-gray-400 hover:text-white">Cancelar</button>
                       <button onClick={guardarEdicionCoche} disabled={procesando} className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded">Guardar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-start mb-1">
                       <div>
                         <h3 className="text-lg font-black text-white flex items-center gap-2">
                            Coche {c.interno}
                            <button onClick={() => iniciarEdicionCoche(c)} className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-blue-300 transition-opacity">
                               <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                 <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                               </svg>
                            </button>
                         </h3>
                         <div className="flex flex-wrap gap-1 mt-1">
                            {c.lineaHabitual && <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 rounded">Línea {c.lineaHabitual}</span>}
                            {c.categoria && c.categoria !== 'Normal' && <span className="text-[10px] bg-indigo-900/50 text-indigo-300 border border-indigo-700 px-1.5 rounded">{c.categoria}</span>}
                         </div>
                       </div>
                       <div className="flex flex-col items-end gap-1">
                          {c.patente && <span className="text-[9px] bg-yellow-400/20 text-yellow-300 px-1 rounded uppercase border border-yellow-500/30">{c.patente}</span>}
                          {c.marca && <span className="text-[9px] text-slate-400 truncate max-w-[80px]">{c.marca}</span>}
                       </div>
                    </div>
                  </>
                )}
                
                {/* Bloque Mañana */}
                <div className="bg-slate-900 border border-slate-700 rounded p-2">
                   <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Turno Mañana</span>
                      <button onClick={() => { setAssigningCar({carId: c.id, turno: 'mañana'}); setSelectedDriverId(c.choferManana?.id || ''); setSelectedRotacion(c.choferManana?.tipoRotacion as any || 'semanal'); }} className="text-[10px] text-blue-400 hover:text-blue-300">Editar</button>
                   </div>
                   {c.choferManana ? (
                      <div>
                         <p className="text-xs text-white truncate font-medium">{c.choferManana.fullName}</p>
                         <div className="flex gap-1 mt-1">
                            <span className="text-[9px] bg-emerald-900/50 text-emerald-300 px-1 rounded border border-emerald-800">Int: {c.choferManana.internalNumber}</span>
                            <span className="text-[9px] bg-slate-800 text-slate-400 px-1 rounded border border-slate-700">Rota {c.choferManana.tipoRotacion}</span>
                         </div>
                      </div>
                   ) : (
                      <p className="text-xs text-slate-500 italic">Sin asignar</p>
                   )}
                </div>

                {/* Bloque Tarde */}
                <div className="bg-slate-900 border border-slate-700 rounded p-2">
                   <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">Turno Tarde</span>
                      <button onClick={() => { setAssigningCar({carId: c.id, turno: 'tarde'}); setSelectedDriverId(c.choferTarde?.id || ''); setSelectedRotacion(c.choferTarde?.tipoRotacion as any || 'semanal'); }} className="text-[10px] text-blue-400 hover:text-blue-300">Editar</button>
                   </div>
                   {c.choferTarde ? (
                      <div>
                         <p className="text-xs text-white truncate font-medium">{c.choferTarde.fullName}</p>
                         <div className="flex gap-1 mt-1">
                            <span className="text-[9px] bg-orange-900/50 text-orange-300 px-1 rounded border border-orange-800">Int: {c.choferTarde.internalNumber}</span>
                            <span className="text-[9px] bg-slate-800 text-slate-400 px-1 rounded border border-slate-700">Rota {c.choferTarde.tipoRotacion}</span>
                         </div>
                      </div>
                   ) : (
                      <p className="text-xs text-slate-500 italic">Sin asignar</p>
                   )}
                </div>
             </div>
          ))}
       </div>

       {/* Sub-modal Asignación */}
       {assigningCar && (
          <div className="absolute inset-0 bg-slate-900/90 backdrop-blur flex items-center justify-center p-4 z-10">
             <div className="bg-black border border-slate-700 p-4 rounded-xl shadow-2xl w-full max-w-sm">
                <h3 className="text-white font-bold text-lg mb-4">
                  Asignar a Coche {flota.find(c=>c.id===assigningCar.carId)?.interno} - {assigningCar.turno === 'mañana' ? 'Mañana' : 'Tarde'}
                </h3>
                
                <label className="text-xs text-slate-400 mb-1 block">Chofer</label>
                <input 
                  type="text" 
                  placeholder="Buscar chofer (Nombre o Interno)..."
                  className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-2 py-2 rounded mb-2"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <select 
                  className="w-full bg-slate-900 border border-slate-700 text-white text-sm px-2 py-2 rounded mb-4"
                  value={selectedDriverId}
                  onChange={e => setSelectedDriverId(e.target.value)}
                >
                   <option value="">-- Quitar chofer (Dejar Vacío) --</option>
                   {choferesDisponiblesParaAsignar.map(p => (
                      <option key={p.id} value={p.id}>{p.internalNumber} - {p.fullName}</option>
                   ))}
                </select>

                <label className="text-xs text-slate-400 mb-1 block">Patrón de Rotación</label>
                <select 
                  className="w-full bg-slate-900 border border-slate-700 text-white text-sm px-2 py-2 rounded mb-6"
                  value={selectedRotacion}
                  onChange={e => setSelectedRotacion(e.target.value as any)}
                >
                   <option value="fijo">Turno Fijo (No Rota)</option>
                   <option value="semanal">Rota Semanalmente</option>
                   <option value="quincenal">Rota Quincenalmente</option>
                </select>

                <div className="flex gap-2 justify-end">
                   <button onClick={() => setAssigningCar(null)} className="px-4 py-2 text-sm text-slate-300 hover:text-white">Cancelar</button>
                   <button onClick={guardarAsignacionCoche} disabled={procesando} className="px-4 py-2 text-sm bg-blue-600 text-white rounded font-bold hover:bg-blue-500 shadow-lg">Asignar Titular</button>
                </div>
             </div>
          </div>
       )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-2xl w-full max-w-7xl flex flex-col h-[90vh]">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-slate-900 rounded-t-xl">
          <div className="flex gap-4 items-center">
            <h2 className="text-xl font-black text-white uppercase tracking-wider">Centro de Control Maestro</h2>
            <div className="flex bg-black p-1 rounded-lg border border-slate-700">
               <button 
                 onClick={() => setActiveTab('flota')} 
                 className={`px-4 py-1 rounded text-sm font-bold transition-all ${activeTab === 'flota' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
               >
                 Matriz de Flota
               </button>
               <button 
                 onClick={() => setActiveTab('personal')} 
                 className={`px-4 py-1 rounded text-sm font-bold transition-all ${activeTab === 'personal' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
               >
                 Bolsa de Personal
               </button>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>
        
        <div className="p-4 bg-slate-800/30 flex items-center gap-4 border-b border-gray-700">
           <div className="flex flex-col">
              <span className="text-sm font-bold text-white">Automatización de Rostering</span>
              <span className="text-xs text-gray-400">Gira los turnos de las parejas asignadas a los coches</span>
           </div>
           <button 
             onClick={() => rotarSemana('semanal')}
             disabled={procesando}
             className="ml-auto bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded shadow-lg shadow-blue-900/20 text-sm font-bold transition-all disabled:opacity-50"
           >
             Rotar Semanales
           </button>
           <button 
             onClick={() => rotarSemana('quincenal')}
             disabled={procesando}
             className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded shadow-lg shadow-indigo-900/20 text-sm font-bold transition-all disabled:opacity-50"
           >
             Rotar Quincenales
           </button>
        </div>

        {loading ? (
           <div className="flex-1 flex items-center justify-center text-gray-400 font-bold animate-pulse">Cargando base de datos maestra...</div>
        ) : (
           activeTab === 'flota' ? renderFlota() : renderPersonal()
        )}
      </div>
    </div>
  );
};
