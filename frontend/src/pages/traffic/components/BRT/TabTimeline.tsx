import React, { useState, useEffect } from 'react';
import { Calendar, CheckCircle, Clock, ShieldCheck, Info, Edit2, Trash2, Plus, Save, X } from 'lucide-react';
import { TIMELINE as FALLBACK } from '../../data/brtData';

export default function TabTimeline() {
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchTimeline();
  }, []);

  const fetchTimeline = async () => {
    try {
      const res = await fetch('/api/brt/timeline');
      if (!res.ok) throw new Error();
      const { data } = await res.json();
      setTimeline(data);
    } catch {
      setTimeline(FALLBACK.map((t, i) => ({ ...t, id: i + 1, orden: i + 1 })));
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (t: any) => {
    setEditForm({ ...t });
    setIsEditing(true);
  };

  const handleCreate = () => {
    setEditForm({
      id: null,
      periodo: '',
      evento: '',
      estado: 'pendiente',
      detalle: '',
      orden: timeline.length + 1
    });
    setIsEditing(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar evento?')) return;
    try {
      await fetch(`/api/brt/timeline/${id}`, { method: 'DELETE' });
      await fetchTimeline();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        periodo: editForm.periodo,
        evento: editForm.evento,
        estado: editForm.estado,
        detalle: editForm.detalle,
        orden: editForm.orden
      };

      const url = editForm.id ? `/api/brt/timeline/${editForm.id}` : '/api/brt/timeline';
      const method = editForm.id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error();
      await fetchTimeline();
      setIsEditing(false);
    } catch (err) {
      console.error(err);
      alert('Error guardando');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div className="text-white">Cargando cronograma...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4 flex items-start gap-3 justify-between">
        <div className="flex gap-3">
          <Calendar className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-300">Ventana crítica: Licitaciones 2026 Q3-Q4</p>
            <p className="text-amber-400/80 text-sm mt-1 max-w-2xl">
              El proceso de licitación para operadores alimentadores se abrirá en el segundo semestre de 2026.
              UCOT debe tener lista su propuesta técnica y financiera antes de ese período.
            </p>
          </div>
        </div>
        {!isEditing && (
          <button onClick={handleCreate} className="px-3 py-2 bg-amber-800 hover:bg-amber-700 text-white rounded font-bold text-sm flex gap-2 items-center">
            <Plus className="w-4 h-4" /> Nuevo Evento
          </button>
        )}
      </div>

      {isEditing && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-xl">
          <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
            <h3 className="text-white font-bold">{editForm.id ? 'Editar Evento' : 'Nuevo Evento'}</h3>
            <button onClick={() => setIsEditing(false)}><X className="text-slate-400 w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Periodo</label>
              <input type="text" value={editForm.periodo} onChange={e => setEditForm({...editForm, periodo: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Estado</label>
              <select value={editForm.estado} onChange={e => setEditForm({...editForm, estado: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm">
                <option value="pendiente">Pendiente</option>
                <option value="en_curso">En Curso</option>
                <option value="completado">Completado</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Evento</label>
              <input type="text" value={editForm.evento} onChange={e => setEditForm({...editForm, evento: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Detalle</label>
              <textarea value={editForm.detalle} onChange={e => setEditForm({...editForm, detalle: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm h-16" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Orden (número)</label>
              <input type="number" value={editForm.orden} onChange={e => setEditForm({...editForm, orden: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-700">
            <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-slate-400 hover:text-white">Cancelar</button>
            <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-white flex gap-2"><Save className="w-4 h-4"/>Guardar</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {timeline.map((t, i) => (
          <div key={t.id} className="flex gap-4 group relative">
            <div className="absolute right-0 top-0 hidden group-hover:flex gap-2">
              <button onClick={() => handleEdit(t)} className="p-1.5 bg-slate-800 rounded text-slate-300 hover:text-white"><Edit2 className="w-3.5 h-3.5" /></button>
              <button onClick={() => handleDelete(t.id)} className="p-1.5 bg-red-900/50 rounded text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                t.estado === 'completado' ? 'bg-emerald-600 text-white' :
                t.estado === 'en_curso' ? 'bg-amber-600 text-white animate-pulse' :
                'bg-slate-800 text-slate-400 border border-slate-700'
              }`}>
                {t.estado === 'completado' ? <CheckCircle className="w-5 h-5" /> :
                 t.estado === 'en_curso' ? <Clock className="w-5 h-5" /> :
                 <Clock className="w-5 h-5" />}
              </div>
              {i < timeline.length - 1 && (
                <div className={`w-0.5 flex-1 mt-2 min-h-[20px] ${
                  t.estado === 'completado' ? 'bg-emerald-700' : 'bg-slate-800'
                }`} />
              )}
            </div>
            <div className="flex-1 pb-5">
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 pr-16">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <span className={`text-sm font-black px-2 py-0.5 rounded ${
                    t.estado === 'completado' ? 'bg-emerald-900/40 text-emerald-300' :
                    t.estado === 'en_curso' ? 'bg-amber-900/40 text-amber-300' :
                    'bg-slate-800 text-slate-400'
                  }`}>
                    {t.periodo}
                  </span>
                  {t.estado === 'en_curso' && (
                    <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded-full font-bold animate-pulse">
                      AHORA
                    </span>
                  )}
                </div>
                <p className="text-white font-bold text-sm">{t.evento}</p>
                <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">{t.detalle}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Checklist UCOT */}
      <div className="bg-slate-900 rounded-xl border border-primary-800/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-primary-800/40 bg-primary-900/20">
          <p className="font-bold text-primary-300 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Checklist estratégico para UCOT — ¿Qué hacer AHORA?
          </p>
        </div>
        <div className="p-4 space-y-3">
          {[
            { prioridad: 'URGENTE', accion: 'Contratar asesor legal especializado en contratos de concesión de transporte público', deadline: 'Antes de Q3 2026' },
            { prioridad: 'URGENTE', accion: 'Presentar propuesta técnica formal para operar alimentadoras en los corredores A y B', deadline: 'Q3 2026' },
            { prioridad: 'ALTA', accion: 'Mapear recorridos de las 5 alimentadoras propuestas con datos GPS reales', deadline: '2026' },
            { prioridad: 'ALTA', accion: 'Calcular viabilidad financiera con tarifa $420 UYU/km en escenarios optimista/conservador/pesimista', deadline: '2026' },
            { prioridad: 'MEDIA', accion: 'Evaluar renovación de flota (buses accesibles, puertas al nivel de parada BRT)', deadline: '2027' },
            { prioridad: 'MEDIA', accion: 'Negociar con MTOP/IMM posición preferente como operador histórico de los corredores', deadline: '2026-2027' },
            { prioridad: 'INFO', accion: 'Monitorear avance de obras y ajustar servicios transitoriamente durante la construcción', deadline: '2027-2029' },
          ].map(item => (
            <div key={item.accion} className="flex items-start gap-3">
              <span className={`text-[10px] font-black px-2 py-0.5 rounded shrink-0 mt-0.5 ${
                item.prioridad === 'URGENTE' ? 'bg-red-900/50 text-red-300 border border-red-700/50' :
                item.prioridad === 'ALTA' ? 'bg-amber-900/50 text-amber-300 border border-amber-700/50' :
                item.prioridad === 'MEDIA' ? 'bg-blue-900/50 text-blue-300 border border-blue-700/50' :
                'bg-slate-800 text-slate-400 border border-slate-700'
              }`}>
                {item.prioridad}
              </span>
              <div className="flex-1">
                <p className="text-slate-200 text-sm">{item.accion}</p>
                <p className="text-slate-500 text-xs mt-0.5">Deadline: {item.deadline}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
