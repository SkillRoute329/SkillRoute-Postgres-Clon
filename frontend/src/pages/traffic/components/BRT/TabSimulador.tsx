import React, { useState, useEffect } from 'react';
import { Info, Plus, X, Save, AlertTriangle } from 'lucide-react';
import { ESCENARIOS_DESVIO } from '../../data/brtData';

export default function TabSimulador() {
  const [escenarios, setEscenarios] = useState<any[]>([]);
  const [escenarioSel, setEscenarioSel] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newScenario, setNewScenario] = useState({
    titulo: '', tramo: '', descripcion: '', pasajeros_desplazados: 0,
    lineas_afectadas: '', duracion_est_meses: 1, impacto_passenger_min: 0,
    costo_adicional_dia: 0, plan_desvio: ''
  });

  useEffect(() => {
    fetchScenarios();
  }, []);

  const fetchScenarios = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:3001/api/brt/scenarios');
      const data = await res.json();
      if (data.ok && data.data && data.data.length > 0) {
        setEscenarios(data.data);
        if (!escenarioSel || !data.data.find((e: any) => e.id === escenarioSel)) {
          setEscenarioSel(data.data[0].id);
        }
      } else {
        // Fallback to static data if DB is empty or fails
        setEscenarios(ESCENARIOS_DESVIO);
        setEscenarioSel(ESCENARIOS_DESVIO[0].id);
      }
    } catch (e) {
      console.error('Error fetching scenarios:', e);
      setEscenarios(ESCENARIOS_DESVIO);
      setEscenarioSel(ESCENARIOS_DESVIO[0].id);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveScenario = async () => {
    try {
      // Parse inputs
      const lineas = newScenario.lineas_afectadas.split(',').map(s => s.trim()).filter(Boolean);
      const acciones = newScenario.plan_desvio.split('\n').map(s => s.trim()).filter(Boolean).map(a => ({ tipo: 'info', accion: a }));
      
      const payload = {
        ...newScenario,
        lineas_afectadas: lineas,
        plan_desvio: acciones
      };

      const res = await fetch('http://localhost:3001/api/brt/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok) {
        setShowAddForm(false);
        fetchScenarios();
        setNewScenario({
          titulo: '', tramo: '', descripcion: '', pasajeros_desplazados: 0,
          lineas_afectadas: '', duracion_est_meses: 1, impacto_passenger_min: 0,
          costo_adicional_dia: 0, plan_desvio: ''
        });
      }
    } catch (e) {
      console.error('Error saving scenario:', e);
      alert('Error al guardar el escenario. Verifique si el backend está activo.');
    }
  };

  const handleChange = (e: any) => {
    const { name, value, type } = e.target;
    setNewScenario(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  if (loading) return <div className="p-10 text-center text-slate-400">Cargando escenarios...</div>;

  const escenario = escenarios.find(e => e.id === escenarioSel) ?? escenarios[0];

  // Helper to safely parse JSON if it comes as string from DB
  const safeJsonParse = (val: any, fallback: any) => {
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return fallback; }
    }
    return val || fallback;
  };

  const lineasAfectadas = safeJsonParse(escenario.lineas_afectadas, escenario.lineasAfectadas || []);
  const planDesvio = safeJsonParse(escenario.plan_desvio, escenario.planDesvio || []);
  const duracion = escenario.duracion_est_meses ?? escenario.duracionEstMeses ?? 1;
  const impacto = escenario.impacto_passenger_min ?? escenario.impactoPassengerMin ?? 0;
  const desplazados = escenario.pasajeros_desplazados ?? escenario.pasajerosDesplazados ?? 0;
  const costoAdicional = escenario.costo_adicional_dia ?? escenario.costoAdicionalDia ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-start">
        <p className="text-slate-400 text-sm max-w-2xl">
          Seleccioná un escenario de desvío para ver el plan de contingencia operativa y el impacto estimado.
        </p>
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-primary-600 hover:bg-primary-500 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-2"
        >
          {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showAddForm ? 'Cancelar' : 'Nuevo Escenario'}
        </button>
      </div>

      {showAddForm && (
        <div className="bg-slate-800 rounded-xl border border-slate-600 p-5 mb-6">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2">Crear Nuevo Escenario (DB)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Título</label>
              <input type="text" name="titulo" value={newScenario.titulo} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" placeholder="Ej: Obras Metro" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Tramo / Ubicación</label>
              <input type="text" name="tramo" value={newScenario.tramo} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" placeholder="Ej: Av. Italia" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Descripción</label>
              <textarea name="descripcion" value={newScenario.descripcion} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" rows={2} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Pasajeros Afectados/Día</label>
              <input type="number" name="pasajeros_desplazados" value={newScenario.pasajeros_desplazados} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Líneas Afectadas (separadas por coma)</label>
              <input type="text" name="lineas_afectadas" value={newScenario.lineas_afectadas} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" placeholder="Ej: 71, 75, 21" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Duración Est. (Meses)</label>
              <input type="number" step="0.1" name="duracion_est_meses" value={newScenario.duracion_est_meses} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Impacto (Minutos extras)</label>
              <input type="number" name="impacto_passenger_min" value={newScenario.impacto_passenger_min} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Costo Adicional Operativo ($/Día)</label>
              <input type="number" name="costo_adicional_dia" value={newScenario.costo_adicional_dia} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Plan de Desvío / Acciones (Una por línea)</label>
              <textarea name="plan_desvio" value={newScenario.plan_desvio} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" rows={3} placeholder="Ej: Desvío por calle paralela\nRefuerzo de 2 unidades" />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={handleSaveScenario} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
              <Save className="w-4 h-4" /> Guardar Escenario
            </button>
          </div>
        </div>
      )}

      {/* Selector escenario */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {escenarios.map(e => (
          <button
            key={e.id}
            onClick={() => setEscenarioSel(e.id)}
            className={`text-left px-4 py-3 rounded-xl border transition-all ${
              escenarioSel === e.id
                ? 'border-primary-500 bg-primary-950/30'
                : 'border-slate-700 bg-slate-900 hover:border-slate-600'
            }`}
          >
            <p className={`font-bold text-sm ${escenarioSel === e.id ? 'text-primary-300' : 'text-white'}`}>{e.titulo}</p>
            <p className="text-slate-400 text-xs mt-0.5">{e.tramo}</p>
          </button>
        ))}
      </div>

      {/* Detalle del escenario */}
      {escenario && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-4 py-4 border-b border-slate-800 bg-slate-800/40">
            <h3 className="font-bold text-white text-lg">{escenario.titulo}</h3>
            <p className="text-slate-300 text-sm mt-1">{escenario.descripcion}</p>
          </div>

          {/* Métricas del impacto */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-b border-slate-800 divide-x divide-slate-800">
            {[
              { l: 'Pasajeros afectados/día', v: desplazados.toLocaleString(), color: 'text-amber-400' },
              { l: 'Líneas impactadas', v: lineasAfectadas.join(', '), color: 'text-red-400' },
              { l: 'Duración estimada', v: duracion < 1 ? '1 día' : `${duracion} meses`, color: 'text-white' },
              { l: '+min viaje promedio', v: `+${impacto} min`, color: 'text-orange-400' },
            ].map(({ l, v, color }) => (
              <div key={l} className="px-4 py-3 text-center">
                <p className="text-slate-500 text-[10px] uppercase">{l}</p>
                <p className={`font-bold text-sm mt-1 ${color}`}>{v}</p>
              </div>
            ))}
          </div>

          {/* Plan de desvío */}
          <div className="p-4">
            <p className="text-xs text-slate-500 uppercase font-bold mb-3">Plan de Contingencia UCOT</p>
            <div className="space-y-2">
              {planDesvio.map((accion: any, i: number) => (
                <div key={i} className="flex items-start gap-3 bg-slate-800/50 rounded-lg p-3">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded shrink-0 mt-0.5 ${
                    accion.tipo === 'desvio' ? 'bg-orange-900/40 text-orange-400 border border-orange-700/50' :
                    accion.tipo === 'refuerzo' ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/50' :
                    accion.tipo === 'info' ? 'bg-blue-900/40 text-blue-400 border border-blue-700/50' :
                    accion.tipo === 'especial' ? 'bg-purple-900/40 text-purple-400 border border-purple-700/50' :
                    'bg-slate-700 text-slate-300'
                  }`}>
                    {(accion.tipo || 'INFO').toUpperCase()}
                  </span>
                  <p className="text-slate-300 text-sm leading-relaxed">{accion.accion}</p>
                </div>
              ))}
              {planDesvio.length === 0 && (
                <p className="text-sm text-slate-400 italic">No hay acciones de contingencia registradas.</p>
              )}
            </div>
          </div>

          {/* Costos adicionales */}
          <div className="px-4 py-3 border-t border-slate-800 bg-red-900/10 flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-300">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-bold">Costo operativo adicional estimado</span>
            </div>
            <span className="font-mono font-black text-red-400">${costoAdicional.toLocaleString()} UYU/día</span>
          </div>
        </div>
      )}
    </div>
  );
}
