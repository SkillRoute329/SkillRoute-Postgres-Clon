import React, { useState, useEffect } from 'react';
import { Award, Star, BarChart3, Layers, CheckCircle, Building2, Edit2, Save, X } from 'lucide-react';
import { PROPUESTA_ASM as FALLBACK } from '../../data/brtData';

export default function TabPropuesta() {
  const [propuesta, setPropuesta] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchPropuesta();
  }, []);

  const fetchPropuesta = async () => {
    try {
      const res = await fetch('/api/brt/propuesta');
      if (!res.ok) throw new Error();
      const { data } = await res.json();
      setPropuesta({
        ...data,
        ventajas_competitivas: typeof data.ventajas_competitivas === 'string' ? JSON.parse(data.ventajas_competitivas) : data.ventajas_competitivas,
        modelo_comercial: typeof data.modelo_comercial === 'string' ? JSON.parse(data.modelo_comercial) : data.modelo_comercial,
        kpis_internacionales: typeof data.kpis_internacionales === 'string' ? JSON.parse(data.kpis_internacionales) : data.kpis_internacionales,
      });
    } catch {
      setPropuesta({
        titulo: FALLBACK.titulo,
        subtitulo: FALLBACK.subtitulo,
        ventajas_competitivas: FALLBACK.ventajasCompetitivas,
        modelo_comercial: FALLBACK.modeloComercial,
        kpis_internacionales: FALLBACK.kpisInternacionales,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setEditForm({
      titulo: propuesta.titulo,
      subtitulo: propuesta.subtitulo,
      ventajasStr: JSON.stringify(propuesta.ventajas_competitivas, null, 2),
      modelosStr: JSON.stringify(propuesta.modelo_comercial, null, 2),
      kpisStr: JSON.stringify(propuesta.kpis_internacionales, null, 2),
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        titulo: editForm.titulo,
        subtitulo: editForm.subtitulo,
        ventajas_competitivas: JSON.parse(editForm.ventajasStr),
        modelo_comercial: JSON.parse(editForm.modelosStr),
        kpis_internacionales: JSON.parse(editForm.kpisStr),
      };

      const res = await fetch('/api/brt/propuesta', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error();
      await fetchPropuesta();
      setIsEditing(false);
    } catch (err) {
      console.error(err);
      alert('Error guardando. Revise que el formato JSON sea válido.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading || !propuesta) return <div className="text-white">Cargando propuesta...</div>;

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="bg-gradient-to-r from-primary-900/40 to-slate-900 rounded-2xl border border-primary-700/40 p-6 relative group">
        {!isEditing && (
          <button onClick={handleEdit} className="absolute top-4 right-4 p-2 bg-primary-800 hover:bg-primary-700 text-white rounded-lg flex gap-2 items-center text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity">
            <Edit2 className="w-4 h-4" /> Editar Propuesta
          </button>
        )}
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary-600/30 border border-primary-500/50 flex items-center justify-center shrink-0">
            <Award className="w-8 h-8 text-primary-400" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white">{propuesta.titulo}</h2>
            <p className="text-primary-300 mt-1">{propuesta.subtitulo}</p>
          </div>
        </div>
      </div>

      {isEditing && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-xl">
          <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
            <h3 className="text-white font-bold">Editar Propuesta Estratégica</h3>
            <button onClick={() => setIsEditing(false)}><X className="text-slate-400 w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-1 gap-4 mb-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Título</label>
              <input type="text" value={editForm.titulo} onChange={e => setEditForm({...editForm, titulo: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Subtítulo</label>
              <input type="text" value={editForm.subtitulo} onChange={e => setEditForm({...editForm, subtitulo: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Ventajas Competitivas (JSON Array)</label>
              <textarea value={editForm.ventajasStr} onChange={e => setEditForm({...editForm, ventajasStr: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm h-32 font-mono text-xs" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Modelos Comerciales (JSON Object)</label>
              <textarea value={editForm.modelosStr} onChange={e => setEditForm({...editForm, modelosStr: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm h-32 font-mono text-xs" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">KPIs Internacionales (JSON Array)</label>
              <textarea value={editForm.kpisStr} onChange={e => setEditForm({...editForm, kpisStr: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm h-32 font-mono text-xs" />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-700">
            <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-slate-400 hover:text-white">Cancelar</button>
            <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-white flex gap-2"><Save className="w-4 h-4"/>Guardar</button>
          </div>
        </div>
      )}

      {/* Ventajas competitivas */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800">
          <p className="font-bold text-sm flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-400" /> ¿Por qué UCOT es el operador natural del BRT?
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-800">
          {(propuesta.ventajas_competitivas || []).map((v: any) => (
            <div key={v.titulo} className="p-4 border-b border-slate-800/50">
              <p className="font-bold text-white text-sm flex items-center gap-2">
                <span className="text-xl">{v.icono}</span> {v.titulo}
              </p>
              <p className="text-slate-400 text-xs mt-1 leading-relaxed">{v.detalle}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 3 opciones de negocio */}
      <div>
        <p className="text-xs text-slate-500 uppercase font-bold mb-3">3 modelos de participación posibles</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.values(propuesta.modelo_comercial || {}).map((op: any, i) => (
            <div key={op.nombre} className={`bg-slate-900 rounded-xl border overflow-hidden ${
              i === 1 ? 'border-primary-600/60' : 'border-slate-700'
            }`}>
              {i === 1 && (
                <div className="bg-primary-600 px-3 py-1 text-center">
                  <p className="text-white text-xs font-black">RECOMENDADO</p>
                </div>
              )}
              <div className="p-4">
                <p className="font-bold text-white text-sm">{op.nombre}</p>
                <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">{op.descripcion}</p>
                <div className="mt-4 space-y-2">
                  {[
                    { l: 'Ingresos anuales est.', v: `US$ ${(op.ingresosAnualesEstUSD / 1_000_000).toFixed(1)}M` },
                    { l: 'Coches involucrados', v: op.cochesInvolucrados > 0 ? op.cochesInvolucrados : 'N/A' },
                    { l: 'Conductores', v: op.conductores },
                    { l: 'Plazo contrato', v: op.plazo },
                  ].map(({ l, v }) => (
                    <div key={l} className="flex justify-between text-xs">
                      <span className="text-slate-500">{l}</span>
                      <span className="text-white font-medium">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* KPIs a alcanzar */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800">
          <p className="font-bold text-sm flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary-400" /> Brecha UCOT vs estándares internacionales BRT
          </p>
        </div>
        <div className="divide-y divide-slate-800/50">
          {(propuesta.kpis_internacionales || []).map((k: any) => (
            <div key={k.kpi} className="px-4 py-3 grid grid-cols-1 md:grid-cols-4 gap-2 items-start">
              <p className="text-white text-sm font-medium">{k.kpi}</p>
              <div>
                <p className="text-[10px] text-slate-500 uppercase">Meta BRT</p>
                <p className="text-emerald-400 font-bold text-sm">{k.meta}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase">UCOT actual</p>
                <p className="text-amber-400 font-bold text-sm">{k.ucotActual}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase">Plan de cierre</p>
                <p className="text-slate-300 text-xs leading-relaxed">{k.brecha}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Multi-tenant / SaaS para ASM */}
      <div className="bg-slate-900 rounded-2xl border border-primary-700/40 overflow-hidden">
        <div className="px-5 py-4 border-b border-primary-700/30 bg-primary-900/20">
          <p className="font-black text-white text-lg flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary-400" /> Plataforma Multi-Empresa — El paso natural al sistema completo
          </p>
          <p className="text-primary-300/80 text-sm mt-1">
            SkillRoute está diseñado como plataforma multi-tenant. UCOT es el primer cliente, la ASM puede ser el administrador global.
          </p>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                rol: 'Empresa Operadora', ejemplo: 'UCOT, COETC, COME, CUTCSA',
                icono: '🚌', color: 'border-blue-700/40 bg-blue-900/10',
                capacidades: [
                  'Su propia flota, conductores y líneas',
                  'KPIs operativos en tiempo real',
                  'Gestión de turnos y cartones',
                  'Módulo de contingencias y desvíos',
                  'Dashboard CEO con proyecciones',
                ],
              },
              {
                rol: 'Administrador ASM', ejemplo: 'Agencia del Sistema Metropolitano',
                icono: '🏛️', color: 'border-primary-600/60 bg-primary-900/20',
                capacidades: [
                  'Vista global de todas las empresas',
                  'KPIs consolidados por corredor BRT',
                  'Gestión de licitaciones y contratos',
                  'Validación de km facturados por empresa',
                  'Panel de cumplimiento MTOP/IMM',
                  'Comparación de desempeño entre operadores',
                ],
              },
              {
                rol: 'Regulador / MTOP-IMM', ejemplo: 'Solo lectura y auditoría',
                icono: '⚖️', color: 'border-slate-700 bg-slate-900/40',
                capacidades: [
                  'Acceso de solo-lectura a todos los datos',
                  'Reportes de cumplimiento automáticos',
                  'Auditoría de km facturados vs operados',
                  'Alertas de incumplimiento de KPIs',
                  'Exportación a formatos MTOP',
                ],
              },
            ].map(t => (
              <div key={t.rol} className={`rounded-xl border p-4 ${t.color}`}>
                <p className="text-xl mb-2">{t.icono}</p>
                <p className="font-bold text-white text-sm">{t.rol}</p>
                <p className="text-slate-500 text-xs mb-3">{t.ejemplo}</p>
                <div className="space-y-1.5">
                  {t.capacidades.map(c => (
                    <div key={c} className="flex items-start gap-1.5">
                      <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                      <p className="text-slate-300 text-xs">{c}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
