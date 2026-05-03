import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2, RefreshCw, AlertCircle, CheckCircle, Edit2, X } from 'lucide-react';
import {
  fetchConfigSalarial,
  updateTurnosSalariales,
  updateDescuentos,
  calcularJornalNeto,
  type TurnosVigentes,
  type DescuentosConfig,
  type DescuentoItem,
  type CategoriaSalarial,
} from '../../services/autoStatsService';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return `$${n.toLocaleString('es-UY')}`;
}

// ─── Panel de categorías salariales ──────────────────────────────────────────
const TurnosPanel: React.FC<{ turnos: TurnosVigentes; onSaved: () => void }> = ({ turnos, onSaved }) => {
  const [cats, setCats] = useState({ ...turnos.categorias });
  const [vigencia, setVigencia] = useState(turnos.vigenciaDesde);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const update = (catKey: string, field: keyof CategoriaSalarial, val: string | number) => {
    setCats(prev => ({
      ...prev,
      [catKey]: { ...prev[catKey], [field]: typeof val === 'string' ? val : Number(val) },
    }));
  };

  const guardar = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await updateTurnosSalariales(cats, vigencia);
      setMsg({ type: 'ok', text: 'Valores guardados correctamente.' });
      onSaved();
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold">Valores de Jornal por Categoría</h3>
          <p className="text-xs text-slate-400 mt-0.5">Montos nominales en UYU antes de descuentos.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Vigencia desde</label>
          <input
            type="date"
            value={vigencia}
            onChange={e => setVigencia(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:border-blue-500 outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(cats).map(([key, cat]) => (
          <div key={key} className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-200 font-medium">{cat.label}</span>
              <span className="text-xs text-slate-500">{cat.descripcion}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Jornal (UYU)</label>
                <input
                  type="number"
                  value={cat.jornal}
                  onChange={e => update(key, 'jornal', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm font-mono focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Recargo (UYU)</label>
                <input
                  type="number"
                  value={cat.recargo}
                  onChange={e => update(key, 'recargo', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm font-mono focus:border-blue-500 outline-none"
                />
              </div>
            </div>
            <div className="text-right text-xs text-slate-400">
              Total con recargo: <span className="text-emerald-400 font-semibold">{fmt(cat.jornal + cat.recargo)}</span>
            </div>
          </div>
        ))}
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${msg.type === 'ok' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
          {msg.type === 'ok' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      <button
        onClick={guardar}
        disabled={saving}
        className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 rounded-xl px-5 py-2.5 text-white font-semibold text-sm transition-all"
      >
        {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Guardar valores
      </button>
    </div>
  );
};

// ─── Panel de descuentos ──────────────────────────────────────────────────────
const DescuentosPanel: React.FC<{ descuentos: DescuentosConfig; onSaved: () => void }> = ({ descuentos, onSaved }) => {
  const [items, setItems] = useState<DescuentoItem[]>([...descuentos.items]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);

  const toggle = (idx: number) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, activo: !it.activo } : it));
  };

  const updateItem = (idx: number, field: keyof DescuentoItem, val: unknown) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  };

  const agregar = () => {
    const nuevo: DescuentoItem = {
      id: `custom_${Date.now()}`,
      nombre: 'Nuevo descuento',
      tipo: 'porcentaje',
      valor: 0,
      activo: false,
      orden: items.length + 1,
      descripcion: '',
    };
    setItems(prev => [...prev, nuevo]);
    setEditIdx(items.length);
  };

  const eliminar = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
    setEditIdx(null);
  };

  const guardar = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await updateDescuentos(items, descuentos.vigenciaDesde);
      setMsg({ type: 'ok', text: 'Reglas de descuento guardadas.' });
      onSaved();
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold">Reglas de Descuento</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Inyectables. Activar/desactivar sin tocar código. Se aplican en el orden indicado.
          </p>
        </div>
        <button
          onClick={agregar}
          className="flex items-center gap-1 text-xs bg-slate-800 border border-slate-700 hover:border-blue-500 rounded-lg px-3 py-1.5 text-slate-300 transition-colors"
        >
          <Plus className="w-3 h-3" /> Agregar
        </button>
      </div>

      <div className="space-y-2">
        {items.map((item, idx) => (
          <div
            key={item.id}
            className={`border rounded-lg p-3 transition-colors ${item.activo ? 'border-slate-600 bg-slate-800/40' : 'border-slate-700/40 bg-slate-800/10 opacity-60'}`}
          >
            {editIdx === idx ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-500">Nombre</label>
                    <input
                      value={item.nombre}
                      onChange={e => updateItem(idx, 'nombre', e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Tipo</label>
                    <select
                      value={item.tipo}
                      onChange={e => updateItem(idx, 'tipo', e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm focus:border-blue-500 outline-none"
                    >
                      <option value="porcentaje">Porcentaje</option>
                      <option value="monto_fijo">Monto fijo</option>
                      <option value="progresivo">Progresivo (IRPF)</option>
                    </select>
                  </div>
                </div>
                {item.tipo !== 'progresivo' && (
                  <div>
                    <label className="text-xs text-slate-500">
                      {item.tipo === 'porcentaje' ? 'Porcentaje (%)' : 'Monto mensual (UYU)'}
                    </label>
                    <input
                      type="number"
                      value={item.valor ?? 0}
                      onChange={e => updateItem(idx, 'valor', Number(e.target.value))}
                      className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm font-mono focus:border-blue-500 outline-none"
                    />
                  </div>
                )}
                <div>
                  <label className="text-xs text-slate-500">Descripción</label>
                  <input
                    value={item.descripcion}
                    onChange={e => updateItem(idx, 'descripcion', e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm focus:border-blue-500 outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditIdx(null)} className="text-xs bg-blue-600 hover:bg-blue-500 rounded px-3 py-1 text-white">
                    Listo
                  </button>
                  <button onClick={() => eliminar(idx)} className="text-xs bg-red-600/20 hover:bg-red-600/40 rounded px-3 py-1 text-red-400">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggle(idx)}
                    className={`w-8 h-4 rounded-full transition-colors relative ${item.activo ? 'bg-blue-500' : 'bg-slate-600'}`}
                  >
                    <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${item.activo ? 'left-4' : 'left-0.5'}`} />
                  </button>
                  <div>
                    <div className="text-slate-200 text-sm font-medium">{item.nombre}</div>
                    <div className="text-xs text-slate-500">{item.descripcion}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-slate-300">
                    {item.tipo === 'porcentaje' && `${item.valor}%`}
                    {item.tipo === 'monto_fijo' && fmt(item.valor ?? 0)}
                    {item.tipo === 'progresivo' && 'Progresivo'}
                  </span>
                  <button onClick={() => setEditIdx(idx)} className="text-slate-500 hover:text-slate-300">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${msg.type === 'ok' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
          {msg.type === 'ok' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      <button
        onClick={guardar}
        disabled={saving}
        className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 rounded-xl px-5 py-2.5 text-white font-semibold text-sm transition-all"
      >
        {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Guardar reglas
      </button>
    </div>
  );
};

// ─── Simulador de neto ────────────────────────────────────────────────────────
const SimuladorNeto: React.FC<{ turnos: TurnosVigentes; descuentos: DescuentosConfig }> = ({ turnos, descuentos }) => {
  const [catKey, setCatKey] = useState(Object.keys(turnos.categorias)[0]);
  const [conRecargo, setConRecargo] = useState(false);

  const cat = turnos.categorias[catKey];
  const bruto = cat ? cat.jornal + (conRecargo ? cat.recargo : 0) : 0;
  const calculo = calcularJornalNeto(bruto, descuentos);

  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6 space-y-4">
      <h3 className="text-white font-semibold">Simulador de Jornal Neto</h3>
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Categoría</label>
          <select
            value={catKey}
            onChange={e => setCatKey(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none"
          >
            {Object.entries(turnos.categorias).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={conRecargo}
              onChange={e => setConRecargo(e.target.checked)}
              className="w-4 h-4 accent-blue-500"
            />
            Con recargo
          </label>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-lg p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Jornal bruto</span>
          <span className="text-white font-semibold font-mono">{fmt(calculo.bruto)}</span>
        </div>
        {calculo.descuentosDetalle.map(d => (
          <div key={d.nombre} className="flex justify-between text-sm">
            <span className="text-slate-400">— {d.nombre}</span>
            <span className="text-red-400 font-mono">-{fmt(d.monto)}</span>
          </div>
        ))}
        <div className="flex justify-between text-sm border-t border-slate-700 pt-2">
          <span className="text-slate-400">Total descuentos</span>
          <span className="text-red-400 font-mono">-{fmt(calculo.totalDescuentos)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span className="text-slate-200">Jornal NETO</span>
          <span className="text-emerald-400 text-lg font-mono">{fmt(calculo.neto)}</span>
        </div>
      </div>
      <p className="text-xs text-slate-600">
        * Descuento IRPF estimado asumiendo ~25 jornales/mes.
        Los valores reales dependen del ingreso anual y deducciones personales del conductor.
      </p>
    </div>
  );
};

// ─── Tab principal ────────────────────────────────────────────────────────────
export const ConfigSalarialTab: React.FC = () => {
  const [config, setConfig] = useState<{ turnos: TurnosVigentes | null; descuentos: DescuentosConfig | null }>({
    turnos: null,
    descuentos: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = () => {
    setLoading(true);
    fetchConfigSalarial()
      .then(setConfig)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando configuración salarial...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-400 bg-red-500/10 rounded-lg p-4">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        <span>Error: {error}</span>
      </div>
    );
  }

  if (!config.turnos) {
    return (
      <div className="text-center text-slate-400 py-12">
        <p>Sin configuración salarial. Ejecutar:</p>
        <code className="text-xs text-slate-500 bg-slate-800 px-3 py-1 rounded mt-2 inline-block">
          python scripts/seed_config_salarial.py
        </code>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold">Configuración Salarial</h2>
          <p className="text-xs text-slate-400">Vigente desde {config.turnos.vigenciaDesde}</p>
        </div>
        <button onClick={cargar} className="text-slate-500 hover:text-slate-300 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <TurnosPanel turnos={config.turnos} onSaved={cargar} />
      {config.descuentos && <DescuentosPanel descuentos={config.descuentos} onSaved={cargar} />}
      {config.descuentos && <SimuladorNeto turnos={config.turnos} descuentos={config.descuentos} />}
    </div>
  );
};
