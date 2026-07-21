import React, { useState, useEffect } from 'react';
import { Wrench, ChevronRight, Layers, Edit2, Save, Trash2, X, Plus } from 'lucide-react';
import { PLAN_OBRAS as FALLBACK } from '../../data/brtData';

export default function TabObras() {
  const [obras, setObras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchObras();
  }, []);

  const fetchObras = async () => {
    try {
      const res = await fetch('/api/brt/obras');
      if (!res.ok) throw new Error();
      const { data } = await res.json();
      const mapped = data.map((d: any) => ({
        id: d.id,
        fase: d.fase,
        periodo: d.periodo,
        color: d.color,
        orden: d.orden,
        acciones: typeof d.acciones === 'string' ? JSON.parse(d.acciones) : d.acciones
      }));
      setObras(mapped);
    } catch {
      setObras(FALLBACK.map((o, i) => ({ ...o, id: i + 1, orden: i + 1 })));
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (ob: any) => {
    setEditForm({ ...ob, accionesStr: ob.acciones.join('\n') });
    setIsEditing(true);
  };

  const handleCreate = () => {
    setEditForm({
      id: null,
      fase: '',
      periodo: '',
      color: 'amber',
      orden: obras.length + 1,
      accionesStr: ''
    });
    setIsEditing(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar fase de obra?')) return;
    try {
      await fetch(`/api/brt/obras/${id}`, { method: 'DELETE' });
      await fetchObras();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        fase: editForm.fase,
        periodo: editForm.periodo,
        color: editForm.color,
        orden: editForm.orden,
        acciones: editForm.accionesStr.split('\n').map((a: string) => a.trim()).filter(Boolean)
      };

      const url = editForm.id ? `/api/brt/obras/${editForm.id}` : '/api/brt/obras';
      const method = editForm.id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error();
      await fetchObras();
      setIsEditing(false);
    } catch (err) {
      console.error(err);
      alert('Error guardando');
    } finally {
      setIsSaving(false);
    }
  };

  const colorFase: Record<string, string> = {
    amber: 'border-amber-700/50 bg-amber-900/10',
    red: 'border-red-700/50 bg-red-900/10',
    orange: 'border-orange-700/50 bg-orange-900/10',
    blue: 'border-blue-700/50 bg-blue-900/10',
    emerald: 'border-emerald-700/50 bg-emerald-900/10',
  };
  
  const colorFaseText: Record<string, string> = {
    amber: 'text-amber-300', red: 'text-red-300', orange: 'text-orange-300',
    blue: 'text-blue-300', emerald: 'text-emerald-300',
  };

  if (loading) return <div className="text-white">Cargando obras...</div>;

  return (
    <div className="space-y-5">
      <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4 flex items-start gap-3 justify-between">
        <div className="flex gap-3">
          <Wrench className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-300">La construcción es el mayor riesgo operativo</p>
            <p className="text-amber-400/80 text-sm mt-1 max-w-3xl">
              Durante las obras, UCOT debe mantener el servicio con desvíos y lanzaderas, coordinar con la IMM y demostrar resiliencia operativa.
            </p>
          </div>
        </div>
        {!isEditing && (
          <button onClick={handleCreate} className="px-3 py-2 bg-amber-800 hover:bg-amber-700 text-white rounded font-bold text-sm flex gap-2 items-center">
            <Plus className="w-4 h-4" /> Nueva Fase
          </button>
        )}
      </div>

      {isEditing && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-xl">
          <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
            <h3 className="text-white font-bold">{editForm.id ? 'Editar Fase' : 'Nueva Fase'}</h3>
            <button onClick={() => setIsEditing(false)}><X className="text-slate-400 w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nombre de Fase</label>
              <input type="text" value={editForm.fase} onChange={e => setEditForm({...editForm, fase: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Periodo (ej. Q3-Q4 2026)</label>
              <input type="text" value={editForm.periodo} onChange={e => setEditForm({...editForm, periodo: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Color (amber, red, orange, blue, emerald)</label>
              <select value={editForm.color} onChange={e => setEditForm({...editForm, color: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm">
                <option value="amber">Amber</option>
                <option value="red">Red</option>
                <option value="orange">Orange</option>
                <option value="blue">Blue</option>
                <option value="emerald">Emerald</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Orden (número)</label>
              <input type="number" value={editForm.orden} onChange={e => setEditForm({...editForm, orden: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Acciones (una por línea)</label>
              <textarea value={editForm.accionesStr} onChange={e => setEditForm({...editForm, accionesStr: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm h-32" />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-700">
            <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-slate-400 hover:text-white">Cancelar</button>
            <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-white flex gap-2"><Save className="w-4 h-4"/>Guardar</button>
          </div>
        </div>
      )}

      {obras.map(fase => (
        <div key={fase.id} className={`rounded-xl border overflow-hidden relative group ${colorFase[fase.color] || colorFase.amber}`}>
          <div className="absolute top-3 right-3 hidden group-hover:flex gap-2 z-10">
            <button onClick={() => handleEdit(fase)} className="p-1.5 bg-slate-800 rounded text-slate-300 hover:text-white"><Edit2 className="w-3.5 h-3.5" /></button>
            <button onClick={() => handleDelete(fase.id)} className="p-1.5 bg-red-900/50 rounded text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          <div className={`px-4 py-3 border-b pr-20 ${colorFase[fase.color] || colorFase.amber}`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className={`font-bold text-sm ${colorFaseText[fase.color] || colorFaseText.amber}`}>{fase.fase}</p>
              <span className={`text-xs px-2 py-0.5 rounded font-mono ${colorFaseText[fase.color] || colorFaseText.amber} bg-slate-900/60`}>
                {fase.periodo}
              </span>
            </div>
          </div>
          <div className="p-4">
            <div className="space-y-2">
              {(fase.acciones || []).map((a: string, i: number) => (
                <div key={i} className="flex items-start gap-2">
                  <ChevronRight className={`w-4 h-4 shrink-0 mt-0.5 ${colorFaseText[fase.color] || colorFaseText.amber}`} />
                  <p className="text-slate-300 text-sm">{a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 mt-8">
        <p className="text-xs text-slate-500 uppercase font-bold mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4" /> Capacidades digitales de SkillRoute para la fase de obras
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            ['🗺️ Módulo de desvíos activo', 'Activar rutas alternativas con un click y notificar conductores en tiempo real'],
            ['📡 GPS tracking continuo', 'Monitorear cumplimiento de desvíos y detectar incidentes al instante'],
            ['📊 KPIs en tiempo real', 'Reportar a IMM/MTOP sobre niveles de servicio durante obras'],
            ['🔔 Alertas a pasajeros', 'Sistema de notificaciones sobre cambios de recorrido por obras'],
            ['🗓️ Distribución dinámica', 'Reasignar coches y conductores automáticamente según la fase de obra activa'],
            ['📋 Boletín adaptado', 'Generar boletines de inspección actualizados con las nuevas rutas de desvío'],
          ].map(([titulo, desc]) => (
            <div key={titulo as string} className="flex items-start gap-2 bg-slate-800 rounded-xl p-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-white mt-0.5">{titulo}</p>
                <p className="text-slate-400 text-xs mt-1">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
