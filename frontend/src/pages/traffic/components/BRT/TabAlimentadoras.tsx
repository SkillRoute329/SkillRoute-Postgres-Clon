import React, { useState, useEffect } from 'react';
import { Edit2, Save, Trash2, X, Plus } from 'lucide-react';
import { LINEAS_ALIMENTADORAS_PROPUESTAS as FALLBACK } from '../../data/brtData';

export default function TabAlimentadoras() {
  const [alimentadoras, setAlimentadoras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchAlimentadoras();
  }, []);

  const fetchAlimentadoras = async () => {
    try {
      const res = await fetch('/api/brt/alimentadoras');
      if (!res.ok) throw new Error();
      const { data } = await res.json();
      const mapped = data.map((d: any) => ({
        id: d.id,
        nombre: d.nombre,
        descripcion: d.descripcion,
        recorrido: d.recorrido,
        kmEstimado: Number(d.km_estimado),
        frecuenciaMin: Number(d.frecuencia_min),
        corredorAlimenta: d.corredor_alimenta,
        pasajerosEstDia: Number(d.pasajeros_est_dia),
        conductoresNecesarios: Number(d.conductores_necesarios),
        cochesNecesarios: Number(d.coches_necesarios),
        viabilidad: d.viabilidad,
        ingresoEstDia: Number(d.ingreso_est_dia),
        lineaExistenteMigracion: d.linea_existente_migracion,
      }));
      setAlimentadoras(mapped);
    } catch {
      setAlimentadoras(FALLBACK);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (al: any) => {
    setEditForm({ ...al });
    setIsEditing(true);
  };

  const handleCreate = () => {
    setEditForm({
      id: '',
      nombre: '',
      descripcion: '',
      recorrido: '',
      kmEstimado: 0,
      frecuenciaMin: 15,
      corredorAlimenta: 'A',
      pasajerosEstDia: 0,
      conductoresNecesarios: 0,
      cochesNecesarios: 0,
      viabilidad: 'MEDIA',
      ingresoEstDia: 0,
      lineaExistenteMigracion: ''
    });
    setIsEditing(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar esta propuesta?')) return;
    try {
      await fetch(`/api/brt/alimentadoras/${id}`, { method: 'DELETE' });
      await fetchAlimentadoras();
    } catch (err) {
      console.error(err);
      alert('Error al eliminar');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        id: editForm.id, // Only matters if POST
        nombre: editForm.nombre,
        descripcion: editForm.descripcion,
        recorrido: editForm.recorrido,
        km_estimado: editForm.kmEstimado,
        frecuencia_min: editForm.frecuenciaMin,
        corredor_alimenta: editForm.corredorAlimenta,
        pasajeros_est_dia: editForm.pasajerosEstDia,
        conductores_necesarios: editForm.conductoresNecesarios,
        coches_necesarios: editForm.cochesNecesarios,
        viabilidad: editForm.viabilidad,
        ingreso_est_dia: editForm.ingresoEstDia,
        linea_existente_migracion: editForm.lineaExistenteMigracion,
      };

      const isNew = !alimentadoras.find(a => a.id === editForm.id);
      const url = isNew ? '/api/brt/alimentadoras' : `/api/brt/alimentadoras/${editForm.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) throw new Error('Error saving');
      await fetchAlimentadoras();
      setIsEditing(false);
    } catch (err) {
      console.error(err);
      alert('Error guardando. Revise conexión a BD.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div className="text-white">Cargando...</div>;

  return (
    <div className="space-y-5">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 flex justify-between items-center">
        <p className="text-slate-300 text-sm leading-relaxed max-w-3xl">
          Una vez operativo el BRT, los pasajeros usarán el troncal para el tramo largo.
          Las <strong className="text-white">líneas alimentadoras</strong> conectan barrios sin cobertura BRT con los nodos de intercambio.
          A continuación, <strong className="text-white">{alimentadoras.length} propuestas de nuevas líneas</strong>.
        </p>
        {!isEditing && (
          <button
            onClick={handleCreate}
            className="shrink-0 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-2 text-sm font-bold transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nueva Línea
          </button>
        )}
      </div>

      {isEditing && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-xl">
          <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
            <h3 className="text-white font-bold">{alimentadoras.find(a => a.id === editForm.id) ? 'Editar' : 'Nueva'} Alimentadora</h3>
            <button onClick={() => setIsEditing(false)}><X className="text-slate-400 w-5 h-5" /></button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">ID (ej. AL-C1)</label>
              <input type="text" value={editForm.id} onChange={e => setEditForm({...editForm, id: e.target.value})} disabled={!!alimentadoras.find(a => a.id === editForm.id)} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm disabled:opacity-50" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nombre</label>
              <input type="text" value={editForm.nombre} onChange={e => setEditForm({...editForm, nombre: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Descripción</label>
              <textarea value={editForm.descripcion} onChange={e => setEditForm({...editForm, descripcion: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm h-16" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Recorrido</label>
              <input type="text" value={editForm.recorrido} onChange={e => setEditForm({...editForm, recorrido: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Km Estimado</label>
              <input type="number" value={editForm.kmEstimado} onChange={e => setEditForm({...editForm, kmEstimado: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Frecuencia (min)</label>
              <input type="number" value={editForm.frecuenciaMin} onChange={e => setEditForm({...editForm, frecuenciaMin: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Corredor Alimenta</label>
              <input type="text" value={editForm.corredorAlimenta} onChange={e => setEditForm({...editForm, corredorAlimenta: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Migra desde Línea (Opcional)</label>
              <input type="text" value={editForm.lineaExistenteMigracion || ''} onChange={e => setEditForm({...editForm, lineaExistenteMigracion: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Coches Necesarios</label>
              <input type="number" value={editForm.cochesNecesarios} onChange={e => setEditForm({...editForm, cochesNecesarios: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Conductores Necesarios</label>
              <input type="number" value={editForm.conductoresNecesarios} onChange={e => setEditForm({...editForm, conductoresNecesarios: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Ingreso Est. Día ($)</label>
              <input type="number" value={editForm.ingresoEstDia} onChange={e => setEditForm({...editForm, ingresoEstDia: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Viabilidad (ALTA/MEDIA/BAJA)</label>
              <input type="text" value={editForm.viabilidad} onChange={e => setEditForm({...editForm, viabilidad: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-700">
            <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-slate-400 hover:text-white">Cancelar</button>
            <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-white flex gap-2"><Save className="w-4 h-4"/>{isSaving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {alimentadoras.map(al => {
          const ingresoMens = Math.round(al.ingresoEstDia * 26 / 1000);
          return (
            <div key={al.id} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden relative group">
              <div className="absolute top-3 right-3 hidden group-hover:flex gap-2">
                <button onClick={() => handleEdit(al)} className="p-1.5 bg-slate-800 rounded text-slate-300 hover:text-white"><Edit2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => handleDelete(al.id)} className="p-1.5 bg-red-900/50 rounded text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <div className={`px-4 py-3 border-b border-slate-800 pr-20 ${
                al.viabilidad === 'MUY ALTA' ? 'bg-emerald-900/20' :
                al.viabilidad === 'ALTA' ? 'bg-primary-900/20' : 'bg-amber-900/10'
              }`}>
                <div>
                  <p className="font-bold text-white text-sm">{al.id} — {al.nombre}</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    Corredor {al.corredorAlimenta} · Migra desde: {al.lineaExistenteMigracion || 'línea nueva'}
                  </p>
                </div>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-slate-300 text-sm">{al.descripcion}</p>
                <p className="text-slate-400 text-xs">
                  <span className="text-slate-300 font-medium">Recorrido:</span> {al.recorrido}
                </p>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {[
                    { label: 'km/viaje', valor: al.kmEstimado },
                    { label: 'Frecuencia', valor: `${al.frecuenciaMin}min` },
                    { label: 'Coches', valor: al.cochesNecesarios },
                  ].map(({ label, valor }) => (
                    <div key={label} className="bg-slate-800 rounded-lg p-2 text-center">
                      <p className="text-slate-500 text-[10px]">{label}</p>
                      <p className="text-white font-bold text-sm">{valor}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                  <span className="text-slate-400 text-xs">Ingreso estimado/mes</span>
                  <span className="font-mono font-black text-emerald-400">${ingresoMens}K UYU</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Resumen flota */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
        <p className="text-xs text-slate-500 uppercase font-bold mb-3">Resumen operativo — todas las alimentadoras</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Coches necesarios', valor: alimentadoras.reduce((a, l) => a + Number(l.cochesNecesarios), 0) },
            { label: 'Conductores', valor: alimentadoras.reduce((a, l) => a + Number(l.conductoresNecesarios), 0) },
            { label: 'km/día total', valor: alimentadoras.reduce((a, l) => a + Number(l.kmEstimado), 0) + ' km' },
            { label: 'Ingreso/mes total', valor: '$' + Math.round(alimentadoras.reduce((a, l) => a + Number(l.ingresoEstDia) * 26, 0) / 1000) + 'K UYU' },
          ].map(({ label, valor }) => (
            <div key={label} className="bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-slate-400 text-[10px] uppercase">{label}</p>
              <p className="text-xl font-black text-white mt-1">{valor}</p>
            </div>
          ))}
        </div>
        <p className="text-slate-500 text-xs mt-3">
          * La flota UCOT actual tiene 257 coches disponibles. Las alimentadoras propuestas requieren {alimentadoras.reduce((a, l) => a + Number(l.cochesNecesarios), 0)} coches
          — cubribles con la flota existente redirigida desde las líneas superpuestas con BRT.
        </p>
      </div>
    </div>
  );
}
