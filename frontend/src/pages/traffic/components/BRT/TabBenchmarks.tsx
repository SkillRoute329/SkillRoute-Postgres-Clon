import React, { useState, useEffect } from 'react';
import { Edit2, Save, Trash2, X, Plus } from 'lucide-react';
import { BENCHMARKS_BRT as FALLBACK } from '../../data/brtData';

export default function TabBenchmarks() {
  const [benchmarks, setBenchmarks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchBenchmarks();
  }, []);

  const fetchBenchmarks = async () => {
    try {
      const res = await fetch('/api/brt/benchmarks');
      if (!res.ok) throw new Error();
      const { data } = await res.json();
      const mapped = data.map((d: any) => ({
        id: d.id,
        ciudad: d.ciudad,
        pais: d.pais,
        bandera: d.bandera,
        inicioOp: d.inicio_op,
        kmRed: d.km_red,
        pasajerosDia: d.pasajeros_dia,
        pasKm: d.pas_km,
        costoKm: d.costo_km,
        velocidadKmh: d.velocidad_kmh,
        tarifaUSD: d.tarifa_usd,
        modelo: d.modelo,
        leccion: d.leccion,
        fortaleza: d.fortaleza,
        riesgo: d.riesgo,
        relevanciaUCOT: d.relevancia_ucot,
        color: d.color
      }));
      setBenchmarks(mapped);
    } catch {
      setBenchmarks(FALLBACK.map((b, i) => ({ ...b, id: i + 1 })));
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (b: any) => {
    setEditForm({ ...b });
    setIsEditing(true);
  };

  const handleCreate = () => {
    setEditForm({
      id: null,
      ciudad: '',
      pais: '',
      bandera: '🏳️',
      inicioOp: 2000,
      kmRed: 10,
      pasajerosDia: 100000,
      pasKm: 10000,
      costoKm: 3.5,
      velocidadKmh: 25,
      tarifaUSD: 0.50,
      modelo: '',
      leccion: '',
      fortaleza: '',
      riesgo: '',
      relevanciaUCOT: 'MEDIA',
      color: '#ffffff'
    });
    setIsEditing(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar benchmark?')) return;
    try {
      await fetch(`/api/brt/benchmarks/${id}`, { method: 'DELETE' });
      await fetchBenchmarks();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        ciudad: editForm.ciudad,
        pais: editForm.pais,
        bandera: editForm.bandera,
        inicio_op: editForm.inicioOp,
        km_red: editForm.kmRed,
        pasajeros_dia: editForm.pasajerosDia,
        pas_km: editForm.pasKm,
        costo_km: editForm.costoKm,
        velocidad_kmh: editForm.velocidadKmh,
        tarifa_usd: editForm.tarifaUSD,
        modelo: editForm.modelo,
        leccion: editForm.leccion,
        fortaleza: editForm.fortaleza,
        riesgo: editForm.riesgo,
        relevancia_ucot: editForm.relevanciaUCOT,
        color: editForm.color
      };

      const url = editForm.id ? `/api/brt/benchmarks/${editForm.id}` : '/api/brt/benchmarks';
      const method = editForm.id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error();
      await fetchBenchmarks();
      setIsEditing(false);
    } catch (err) {
      console.error(err);
      alert('Error guardando');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div className="text-white">Cargando benchmarks...</div>;

  return (
    <div className="space-y-5">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 flex justify-between items-start">
        <p className="text-slate-300 text-sm leading-relaxed max-w-3xl">
          Análisis de los sistemas BRT más relevantes del mundo para contextualizar el proyecto de Montevideo.
          Los benchmarks muestran qué funciona, qué falla y qué es directamente aplicable a UCOT.
        </p>
        {!isEditing && (
          <button onClick={handleCreate} className="px-3 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded font-bold text-sm flex gap-2 items-center">
            <Plus className="w-4 h-4" /> Nuevo
          </button>
        )}
      </div>

      {isEditing && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-xl">
          <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
            <h3 className="text-white font-bold">{editForm.id ? 'Editar Benchmark' : 'Nuevo Benchmark'}</h3>
            <button onClick={() => setIsEditing(false)}><X className="text-slate-400 w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Ciudad</label>
              <input type="text" value={editForm.ciudad} onChange={e => setEditForm({...editForm, ciudad: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">País</label>
              <input type="text" value={editForm.pais} onChange={e => setEditForm({...editForm, pais: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Bandera (emoji)</label>
              <input type="text" value={editForm.bandera} onChange={e => setEditForm({...editForm, bandera: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Inicio Op.</label>
              <input type="number" value={editForm.inicioOp} onChange={e => setEditForm({...editForm, inicioOp: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Km Red</label>
              <input type="number" value={editForm.kmRed} onChange={e => setEditForm({...editForm, kmRed: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Pasajeros/Día</label>
              <input type="number" value={editForm.pasajerosDia} onChange={e => setEditForm({...editForm, pasajerosDia: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Pas/Km</label>
              <input type="number" value={editForm.pasKm} onChange={e => setEditForm({...editForm, pasKm: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Costo/Km ($)</label>
              <input type="number" step="0.1" value={editForm.costoKm} onChange={e => setEditForm({...editForm, costoKm: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Velocidad (km/h)</label>
              <input type="number" value={editForm.velocidadKmh} onChange={e => setEditForm({...editForm, velocidadKmh: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Tarifa USD</label>
              <input type="number" step="0.01" value={editForm.tarifaUSD} onChange={e => setEditForm({...editForm, tarifaUSD: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Color (HEX)</label>
              <input type="text" value={editForm.color} onChange={e => setEditForm({...editForm, color: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Relevancia UCOT</label>
              <input type="text" value={editForm.relevanciaUCOT} onChange={e => setEditForm({...editForm, relevanciaUCOT: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs text-slate-400 mb-1">Modelo Comercial</label>
              <input type="text" value={editForm.modelo} onChange={e => setEditForm({...editForm, modelo: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs text-slate-400 mb-1">Lección Clave</label>
              <input type="text" value={editForm.leccion} onChange={e => setEditForm({...editForm, leccion: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs text-slate-400 mb-1">Fortaleza</label>
              <input type="text" value={editForm.fortaleza} onChange={e => setEditForm({...editForm, fortaleza: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs text-slate-400 mb-1">Riesgo a evitar</label>
              <input type="text" value={editForm.riesgo} onChange={e => setEditForm({...editForm, riesgo: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-700">
            <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-slate-400 hover:text-white">Cancelar</button>
            <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-white flex gap-2"><Save className="w-4 h-4"/>Guardar</button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {benchmarks.map(b => (
          <div key={b.id} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden relative group">
            <div className="absolute right-2 top-2 hidden group-hover:flex gap-1 z-10">
              <button onClick={() => handleEdit(b)} className="p-1.5 bg-slate-800 rounded text-slate-300 hover:text-white"><Edit2 className="w-3.5 h-3.5" /></button>
              <button onClick={() => handleDelete(b.id)} className="p-1.5 bg-red-900/50 rounded text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <div className="px-4 py-3 border-b border-slate-800" style={{ borderLeftColor: b.color, borderLeftWidth: 4 }}>
              <p className="font-bold text-white text-sm">{b.bandera} {b.ciudad}</p>
              <p className="text-slate-400 text-xs mt-0.5">{b.pais} · Desde {b.inicioOp}</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { l: 'Red', v: `${b.kmRed} km` },
                  { l: 'Pas/día', v: (b.pasajerosDia / 1_000_000).toFixed(1) + 'M' },
                  { l: 'km/h', v: b.velocidadKmh },
                ].map(({ l, v }) => (
                  <div key={l} className="bg-slate-800 rounded-lg p-2 text-center">
                    <p className="text-slate-500 text-[10px]">{l}</p>
                    <p className="text-white font-bold text-sm">{v}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-slate-500 text-[10px] uppercase font-bold mb-1">Modelo</p>
                <p className="text-slate-300 text-xs">{b.modelo}</p>
              </div>
              <div>
                <p className="text-slate-500 text-[10px] uppercase font-bold mb-1">Lección clave</p>
                <p className="text-slate-300 text-xs">{b.leccion}</p>
              </div>
              <div className="bg-emerald-900/20 rounded-lg p-2">
                <p className="text-[10px] text-emerald-400 font-bold uppercase mb-1">Fortaleza</p>
                <p className="text-emerald-300 text-xs">{b.fortaleza}</p>
              </div>
              <div className="bg-red-900/20 rounded-lg p-2">
                <p className="text-[10px] text-red-400 font-bold uppercase mb-1">Riesgo a evitar</p>
                <p className="text-red-300 text-xs">{b.riesgo}</p>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${
                  b.relevanciaUCOT.startsWith('MUY ALTA') ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50' :
                  b.relevanciaUCOT.startsWith('ALTA') ? 'bg-primary-900/50 text-primary-300 border-primary-700/50' :
                  'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {b.relevanciaUCOT.split(' — ')[0]}
                </span>
                <span className="text-slate-500 text-[10px]">para UCOT</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabla comparativa */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800">
          <p className="font-bold text-sm">Comparativa de KPIs internacionales</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60">
                <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Sistema</th>
                <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Km red</th>
                <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Pas/km/día</th>
                <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Costo/km (USD)</th>
                <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Velocidad</th>
                <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Tarifa USD</th>
              </tr>
            </thead>
            <tbody>
              {benchmarks.map(b => (
                <tr key={b.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="px-3 py-2.5 font-medium text-white">{b.bandera} {b.ciudad.split(' — ')[0]}</td>
                  <td className="px-3 py-2.5 text-right text-slate-300">{b.kmRed}</td>
                  <td className="px-3 py-2.5 text-right text-slate-300">{Math.round(b.pasajerosDia / b.kmRed)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-300">${b.costoKm}</td>
                  <td className="px-3 py-2.5 text-right text-slate-300">{b.velocidadKmh} km/h</td>
                  <td className="px-3 py-2.5 text-right text-slate-300">${b.tarifaUSD}</td>
                </tr>
              ))}
              <tr className="bg-primary-900/20 font-bold">
                <td className="px-3 py-2.5 text-primary-300">🇺🇾 Montevideo (objetivo)</td>
                <td className="px-3 py-2.5 text-right text-primary-300">~58</td>
                <td className="px-3 py-2.5 text-right text-primary-300">~14,000</td>
                <td className="px-3 py-2.5 text-right text-primary-300">~$4.0</td>
                <td className="px-3 py-2.5 text-right text-primary-300">~28 km/h</td>
                <td className="px-3 py-2.5 text-right text-primary-300">~$0.50</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
