import React, { useState, useEffect } from 'react';
import { Bus, DollarSign, TrendingUp, CheckCircle, AlertTriangle, Info, Edit2, Save, X } from 'lucide-react';
import { MODELO_FINANCIERO } from '../../data/brtData'; // Usado solo como fallback de riesgos/ventajas estáticas

export default function TabModelo() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<any>({});

  // Sliders for dynamic projection
  const [tarifaKmSlider, setTarifaKmSlider] = useState(420);
  const [kmDiaSlider, setKmDiaSlider] = useState(220);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:3001/api/brt/config');
      const data = await res.json();
      if (data.ok && data.data) {
        setConfig(data.data);
        setFormData(data.data);
        setTarifaKmSlider(Number(data.data.tarifa_km_brt_uyus));
        setKmDiaSlider(Number(data.data.km_promedio_dia));
      } else {
        throw new Error('Fallback to static data');
      }
    } catch (e) {
      console.warn('Error fetching BRT config, using fallback:', e);
      const m = MODELO_FINANCIERO;
      const fallbackConfig = {
        tarifa_actual_uyus: m.actual.tarifa,
        costo_dia_actual_uyus: m.actual.costoDia,
        tarifa_km_brt_uyus: m.brt.tarifaKm,
        brt_costo_dia: m.brt.costoDia,
        km_promedio_dia: m.actual.kmPromDia,
        pasajeros_prom_dia: m.actual.pasajerosPromDia,
        captacion_empresa: m.actual.captacionEmpresa,
        brt_bonus_nocturno: m.brt.bonusNocturno,
        brt_riesgo_kpi_min: m.brt.riesgoMin
      };
      setConfig(fallbackConfig);
      setFormData(fallbackConfig);
      setTarifaKmSlider(Number(fallbackConfig.tarifa_km_brt_uyus));
      setKmDiaSlider(Number(fallbackConfig.km_promedio_dia));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/brt/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.ok) {
        setConfig(data.data);
        setEditMode(false);
      }
    } catch (e) {
      console.error('Error saving BRT config:', e);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: Number(e.target.value) });
  };

  if (loading) return <div className="p-10 text-center text-slate-400">Cargando modelo financiero...</div>;
  if (!config) return <div className="p-10 text-center text-red-400">Error al cargar la configuración de la base de datos.</div>;

  const actualCosto = Number(config.costo_dia_actual_uyus);
  const actualIngreso = Number(config.tarifa_actual_uyus) * Number(config.pasajeros_prom_dia) * Number(config.captacion_empresa);
  const margenActual = actualIngreso - actualCosto;

  const brtCosto = Number(config.brt_costo_dia);
  const brtIngreso = Number(config.tarifa_km_brt_uyus) * Number(config.km_promedio_dia);
  const margenBRT = brtIngreso - brtCosto;

  const ingresoBRTCalc = tarifaKmSlider * kmDiaSlider;
  const margenBRTCalc = ingresoBRTCalc - brtCosto;
  const mejoraPct = margenActual !== 0 ? Math.round((margenBRT / margenActual - 1) * 100) : 0;
  const mejoraPctCalc = margenActual !== 0 ? Math.round((margenBRTCalc / margenActual - 1) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 flex justify-between items-start">
        <div>
          <p className="text-xs text-slate-500 uppercase font-bold mb-3">Contexto del cambio</p>
          <p className="text-slate-300 text-sm leading-relaxed max-w-3xl">
            El nuevo modelo de concesión BRT establece que las empresas operadoras cobran por <strong>kilómetro recorrido</strong>,
            no por pasajero transportado. El Estado fija la tarifa por km y paga directamente a los operadores.
            Esto elimina el riesgo de demanda para los operadores pero introduce KPIs de calidad.
          </p>
        </div>
        <button 
          onClick={() => { setEditMode(!editMode); setFormData(config); }}
          className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-2"
        >
          {editMode ? <X className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
          {editMode ? 'Cancelar Edición' : 'Editar Parámetros'}
        </button>
      </div>

      {editMode && (
        <div className="bg-slate-800 rounded-xl border border-slate-600 p-5 mb-6">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2"><Edit2 className="w-4 h-4"/> Configuración Financiera (Conexión a BD)</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Tarifa Actual ($)</label>
              <input type="number" name="tarifa_actual_uyus" value={formData.tarifa_actual_uyus} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Costo Actual/Bus/Día ($)</label>
              <input type="number" name="costo_dia_actual_uyus" value={formData.costo_dia_actual_uyus} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Tarifa BRT/Km ($)</label>
              <input type="number" name="tarifa_km_brt_uyus" value={formData.tarifa_km_brt_uyus} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Costo BRT/Bus/Día ($)</label>
              <input type="number" name="brt_costo_dia" value={formData.brt_costo_dia} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Km Promedio/Día</label>
              <input type="number" name="km_promedio_dia" value={formData.km_promedio_dia} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Pasajeros Prom/Día</label>
              <input type="number" name="pasajeros_prom_dia" value={formData.pasajeros_prom_dia} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Captación (%)</label>
              <input type="number" step="0.01" name="captacion_empresa" value={formData.captacion_empresa} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
              <Save className="w-4 h-4" /> Guardar en BD
            </button>
          </div>
        </div>
      )}

      {/* Comparativa modelo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700 bg-slate-800">
            <p className="font-bold text-white flex items-center gap-2">
              <Bus className="w-4 h-4 text-slate-400" /> Modelo ACTUAL (por pasajero)
            </p>
            <p className="text-slate-400 text-xs mt-0.5">Métricas dinámicas desde BD</p>
          </div>
          <div className="p-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Tarifa por pasajero</span>
              <span className="font-mono text-white">${config.tarifa_actual_uyus} UYU</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Pasajeros/bus/día</span>
              <span className="font-mono text-white">{config.pasajeros_prom_dia}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Captación empresa</span>
              <span className="font-mono text-white">{Number(config.captacion_empresa) * 100}%</span>
            </div>
            <div className="border-t border-slate-700 pt-3">
              <div className="flex justify-between">
                <span className="text-slate-400">Ingreso/bus/día</span>
                <span className="font-mono text-emerald-400 font-bold">${Math.round(actualIngreso).toLocaleString()} UYU</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-slate-400">Costo/bus/día</span>
                <span className="font-mono text-red-400">${Math.round(actualCosto).toLocaleString()} UYU</span>
              </div>
              <div className="flex justify-between mt-1 pt-2 border-t border-slate-700">
                <span className="text-white font-bold">Margen/bus/día</span>
                <span className={`font-mono font-black text-lg ${margenActual > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  ${Math.round(margenActual).toLocaleString()} UYU
                </span>
              </div>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Margen/bus/mes</span>
              <span className="text-slate-400">${Math.round(margenActual * 26).toLocaleString()} UYU</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl border border-emerald-700/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-emerald-700/50 bg-emerald-900/20">
            <p className="font-bold text-white flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" /> Nuevo Modelo BRT (por km)
            </p>
            <p className="text-emerald-400/70 text-xs mt-0.5">Estimación basada en parámetros guardados</p>
          </div>
          <div className="p-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Tarifa por km</span>
              <span className="font-mono text-white">${config.tarifa_km_brt_uyus} UYU/km</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Km operados/bus/día</span>
              <span className="font-mono text-white">{config.km_promedio_dia} km</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Factor nocturno / Penalización</span>
              <span className="font-mono text-white">x{config.brt_bonus_nocturno} / x{config.brt_riesgo_kpi_min}</span>
            </div>
            <div className="border-t border-emerald-700/30 pt-3">
              <div className="flex justify-between">
                <span className="text-slate-400">Ingreso/bus/día</span>
                <span className="font-mono text-emerald-400 font-bold">${Math.round(brtIngreso).toLocaleString()} UYU</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-slate-400">Costo/bus/día</span>
                <span className="font-mono text-red-400">${Math.round(brtCosto).toLocaleString()} UYU</span>
              </div>
              <div className="flex justify-between mt-1 pt-2 border-t border-emerald-700/30">
                <span className="text-white font-bold">Margen/bus/día</span>
                <span className="font-mono font-black text-lg text-emerald-400">
                  ${Math.round(margenBRT).toLocaleString()} UYU
                </span>
              </div>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Margen/bus/mes</span>
              <span className="text-slate-400">${Math.round(margenBRT * 26).toLocaleString()} UYU</span>
            </div>
          </div>
        </div>
      </div>

      {/* Banner mejora */}
      <div className={`rounded-xl border p-4 flex items-center gap-4 ${
        mejoraPct > 0
          ? 'bg-emerald-900/20 border-emerald-700/40'
          : 'bg-red-900/20 border-red-700/40'
      }`}>
        <TrendingUp className={`w-8 h-8 shrink-0 ${mejoraPct > 0 ? 'text-emerald-400' : 'text-red-400'}`} />
        <div>
          <p className={`text-xl font-black ${mejoraPct > 0 ? 'text-emerald-300' : 'text-red-300'}`}>
            {mejoraPct > 0 ? '+' : ''}{mejoraPct}% mejora en margen por bus/día
          </p>
          <p className="text-slate-400 text-sm mt-0.5">
            Con la flota actual de 257 coches y migrando al modelo BRT, el margen total mensual estimado sería de
            <strong className="text-white"> ${(margenBRT * 26 * 257 / 1_000_000).toFixed(1)}M UYU/mes</strong> vs
            <strong className="text-white"> ${(margenActual * 26 * 257 / 1_000_000).toFixed(1)}M UYU/mes</strong> actual.
          </p>
        </div>
      </div>

      {/* Simulador Interactivo */}
      <div className="bg-slate-900 rounded-xl border border-primary-800/40 p-5 mt-6">
        <p className="text-sm text-primary-400 uppercase font-bold mb-4">Simulador interactivo de escenarios (Proyección)</p>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-slate-400 font-bold uppercase">Tarifa por km (UYU)</label>
              <span className="font-mono font-black text-primary-400">${tarifaKmSlider}</span>
            </div>
            <input
              type="range" min={300} max={600} step={10}
              value={tarifaKmSlider}
              onChange={e => setTarifaKmSlider(Number(e.target.value))}
              className="w-full accent-primary-500"
            />
            <div className="flex justify-between text-[10px] text-slate-600">
              <span>$300 (pesimista)</span><span>$420 (base)</span><span>$600 (optimista)</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-slate-400 font-bold uppercase">Km operados/bus/día</label>
              <span className="font-mono font-black text-primary-400">{kmDiaSlider} km</span>
            </div>
            <input
              type="range" min={120} max={350} step={10}
              value={kmDiaSlider}
              onChange={e => setKmDiaSlider(Number(e.target.value))}
              className="w-full accent-primary-500"
            />
            <div className="flex justify-between text-[10px] text-slate-600">
              <span>120 (pocas rutas)</span><span>220 (base)</span><span>350 (full alimentadoras)</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          {[
            { l: 'Ingreso/bus/día', v: `$${Math.round(ingresoBRTCalc).toLocaleString()} UYU`, color: 'text-emerald-400' },
            { l: 'Margen/bus/día', v: `$${Math.round(margenBRTCalc).toLocaleString()} UYU`, color: margenBRTCalc > 0 ? 'text-emerald-400' : 'text-red-400' },
            { l: 'vs modelo actual', v: `${mejoraPctCalc > 0 ? '+' : ''}${mejoraPctCalc}%`, color: mejoraPctCalc > 0 ? 'text-emerald-400' : 'text-red-400' },
          ].map(({ l, v, color }) => (
            <div key={l} className="bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-slate-500 text-[10px]">{l}</p>
              <p className={`font-black text-lg ${color}`}>{v}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
