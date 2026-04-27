import { useState, useMemo } from 'react';
import { DollarSign, Users, TrendingUp, Zap, Shield, BarChart2, Clock, Globe, CheckCircle, XCircle, Download } from 'lucide-react';

// ─── Parámetros por defecto — calibrados para el mercado uruguayo ───────────
const DEFAULTS = {
  inspectores: 12,
  salarioMensual: 48_000,     // UYU — Consejo de Salarios 2026 (inspector transporte)
  lineasMonitoreadas: 141,
  incidentesMensuales: 22,    // incidentes detectables por inspector/mes
  suscripcionSkillRoute: 990, // USD/mes — precio de referencia
  tipoCambio: 43,             // UYU/USD
  mesesAnalisis: 24,
};

interface Params {
  inspectores: number;
  salarioMensual: number;
  lineasMonitoreadas: number;
  incidentesMensuales: number;
  suscripcionSkillRoute: number;
  tipoCambio: number;
  mesesAnalisis: number;
}

const CAPACIDADES_COMPARACION = [
  { feature: 'Monitoreo de posición GPS en tiempo real', manual: false, skillroute: true },
  { feature: 'Detección automática de bunching (agrupamiento)', manual: false, skillroute: true },
  { feature: 'Alertas de desvío de ruta', manual: 'parcial', skillroute: true },
  { feature: 'Cumplimiento de horarios (OTP)', manual: 'parcial', skillroute: true },
  { feature: 'Análisis de competidores cross-operador', manual: false, skillroute: true },
  { feature: 'Inteligencia de corredores (DRO matrix)', manual: false, skillroute: true },
  { feature: 'Datos históricos y tendencias (90 días)', manual: false, skillroute: true },
  { feature: 'Notificaciones push a conductores', manual: false, skillroute: true },
  { feature: 'Dashboard ejecutivo en tiempo real', manual: false, skillroute: true },
  { feature: 'Export PDF/Excel de reportes', manual: false, skillroute: true },
  { feature: 'Presencia física en terminales', manual: true, skillroute: false },
  { feature: 'Intervención inmediata en campo', manual: true, skillroute: false },
];

const fmt = (n: number, decimals = 0) =>
  n.toLocaleString('es-UY', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const fmtUSD = (n: number) =>
  '$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

type SliderField = keyof Params;
interface SliderConfig {
  key: SliderField;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const SLIDERS: SliderConfig[] = [
  { key: 'inspectores', label: 'Inspectores actuales', min: 2, max: 80, step: 1, format: v => `${v} personas` },
  { key: 'salarioMensual', label: 'Salario mensual por inspector', min: 30_000, max: 100_000, step: 1_000, format: v => `$ ${fmt(v)} UYU` },
  { key: 'lineasMonitoreadas', label: 'Líneas monitoreadas', min: 10, max: 200, step: 1, format: v => `${v} líneas` },
  { key: 'suscripcionSkillRoute', label: 'Suscripción SkillRoute', min: 200, max: 5_000, step: 50, format: v => `USD ${fmt(v)}/mes` },
  { key: 'tipoCambio', label: 'Tipo de cambio UYU/USD', min: 35, max: 60, step: 0.5, format: v => `$ ${v.toFixed(1)}` },
];

const ROICalculator = () => {
  const [params, setParams] = useState<Params>(DEFAULTS);

  const calc = useMemo(() => {
    const costoInspectoresUYU = params.inspectores * params.salarioMensual;
    const costoInspectoresUSD = costoInspectoresUYU / params.tipoCambio;
    const costoSkillRouteUSD = params.suscripcionSkillRoute;
    const costoSkillRouteUYU = costoSkillRouteUSD * params.tipoCambio;

    // Capacidad de SkillRoute como % de cobertura de inspectores
    // (SkillRoute monitorea 24/7 automáticamente — equivale a ~70% del trabajo humano de monitoreo)
    // El 30% restante es presencia física que los inspectores siguen haciendo
    const pctReemplazable = 0.70;
    const inspectoresEquivalentes = Math.round(params.inspectores * pctReemplazable);
    const ahorroMensualUSD = (inspectoresEquivalentes * params.salarioMensual / params.tipoCambio) - costoSkillRouteUSD;
    const ahorroMensualUYU = ahorroMensualUSD * params.tipoCambio;
    const ahorroAnualUSD = ahorroMensualUSD * 12;

    // Payback: meses hasta que el ahorro acumulado supera inversión inicial (setup ~$0 SaaS)
    // En modelo SaaS no hay inversión inicial, payback = mes 1 si ahorro > 0
    const paybackMeses = ahorroMensualUSD > 0 ? 0 : Math.abs(Math.ceil(costoSkillRouteUSD / Math.abs(ahorroMensualUSD)));

    // ROI a N meses
    const ahorroAcumulado = ahorroMensualUSD * params.mesesAnalisis;
    const inversionAcumulada = costoSkillRouteUSD * params.mesesAnalisis;
    const roiPct = inversionAcumulada > 0 ? ((ahorroAcumulado / inversionAcumulada) * 100) : 0;

    // Incidentes detectables
    const incidentesManual = params.inspectores * params.incidentesMensuales;
    const incidentesSkillRoute = Math.round(params.lineasMonitoreadas * 8.5); // ~8.5 alertas/línea/mes calibrado

    return {
      costoInspectoresUSD,
      costoInspectoresUYU,
      costoSkillRouteUSD,
      costoSkillRouteUYU,
      inspectoresEquivalentes,
      ahorroMensualUSD,
      ahorroMensualUYU,
      ahorroAnualUSD,
      paybackMeses,
      roiPct,
      incidentesManual,
      incidentesSkillRoute,
      esRentable: ahorroMensualUSD > 0,
    };
  }, [params]);

  const set = (key: SliderField, val: number) => setParams(p => ({ ...p, [key]: val }));

  const roiColor = calc.roiPct >= 200 ? 'text-emerald-400' : calc.roiPct >= 100 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="space-y-6 animate-fade-in-up">

      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-bold text-slate-200 tracking-tight flex items-center gap-2">
          <DollarSign className="w-6 h-6 text-emerald-400" />
          Calculadora de ROI — SkillRoute vs. Inspección Manual
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Estimación del retorno sobre inversión al reemplazar monitoreo manual con SkillRoute
        </p>
      </div>

      {/* KPI cards de resultado */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`bg-slate-900 border ${calc.esRentable ? 'border-emerald-500/40' : 'border-red-500/40'} rounded-xl p-4`}>
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Ahorro mensual</p>
          <p className={`text-2xl font-black ${calc.esRentable ? 'text-emerald-400' : 'text-red-400'}`}>
            {fmtUSD(Math.abs(calc.ahorroMensualUSD))}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {calc.esRentable ? 'ahorro neto' : 'costo neto'} / mes
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Ahorro anual</p>
          <p className="text-2xl font-black text-white">{fmtUSD(calc.ahorroAnualUSD)}</p>
          <p className="text-xs text-slate-500 mt-1">proyección a 12 meses</p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">ROI {params.mesesAnalisis} meses</p>
          <p className={`text-2xl font-black ${roiColor}`}>{calc.roiPct.toFixed(0)}%</p>
          <p className="text-xs text-slate-500 mt-1">retorno sobre inversión acumulada</p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Cobertura automática</p>
          <p className="text-2xl font-black text-blue-400">{params.lineasMonitoreadas}</p>
          <p className="text-xs text-slate-500 mt-1">líneas monitoreadas 24/7</p>
        </div>
      </div>

      {/* Comparación de costos */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-red-500/20 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-red-400" />
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-widest">Inspección manual actual</h2>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-slate-400">{params.inspectores} inspectores × $ {fmt(params.salarioMensual)} UYU</span>
              <span className="text-sm font-mono text-slate-200">{fmtUSD(calc.costoInspectoresUSD)}/mes</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-400">Costo anual</span>
              <span className="text-sm font-mono text-red-400">{fmtUSD(calc.costoInspectoresUSD * 12)}/año</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-400">Incidentes detectables/mes</span>
              <span className="text-sm font-mono text-slate-300">{fmt(calc.incidentesManual)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-400">Cobertura horaria</span>
              <span className="text-sm font-mono text-slate-400">~8 h/día (turno laboral)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-400">Análisis cross-operador</span>
              <span className="text-sm font-mono text-red-400">No disponible</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-emerald-500/20 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-widest">SkillRoute (automatizado)</h2>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-slate-400">Suscripción mensual</span>
              <span className="text-sm font-mono text-slate-200">{fmtUSD(calc.costoSkillRouteUSD)}/mes</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-400">Costo anual</span>
              <span className="text-sm font-mono text-emerald-400">{fmtUSD(calc.costoSkillRouteUSD * 12)}/año</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-400">Alertas generables/mes</span>
              <span className="text-sm font-mono text-emerald-300">{fmt(calc.incidentesSkillRoute)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-400">Cobertura horaria</span>
              <span className="text-sm font-mono text-emerald-400">24/7 automático</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-400">Análisis cross-operador</span>
              <span className="text-sm font-mono text-emerald-400">Incluido</span>
            </div>
          </div>
        </div>
      </div>

      {/* Barra visual de ahorro */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-widest mb-4">
          Desglose de costos mensuales (USD)
        </h2>
        <div className="space-y-3">
          {[
            { label: 'Costo inspectores actual', value: calc.costoInspectoresUSD, color: 'bg-red-500/70', max: calc.costoInspectoresUSD },
            { label: `Costo SkillRoute (${calc.inspectoresEquivalentes} inspectores equivalentes)`, value: calc.costoSkillRouteUSD, color: 'bg-emerald-500/70', max: calc.costoInspectoresUSD },
            { label: 'Ahorro neto', value: Math.max(calc.ahorroMensualUSD, 0), color: 'bg-blue-500/70', max: calc.costoInspectoresUSD },
          ].map(row => (
            <div key={row.label}>
              <div className="flex justify-between mb-1">
                <span className="text-xs text-slate-400">{row.label}</span>
                <span className="text-xs font-mono text-slate-300">{fmtUSD(row.value)}</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all duration-500 ${row.color}`}
                  style={{ width: `${Math.min((row.value / row.max) * 100, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sliders */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-widest mb-1">Parámetros del cálculo</h2>
        <p className="text-xs text-slate-500 mb-5">Ajustá los valores para tu caso específico</p>
        <div className="grid md:grid-cols-2 gap-6">
          {SLIDERS.map(s => (
            <div key={s.key}>
              <div className="flex justify-between mb-2">
                <label className="text-xs text-slate-400">{s.label}</label>
                <span className="text-xs font-mono text-slate-200">{s.format(params[s.key] as number)}</span>
              </div>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={params[s.key] as number}
                onChange={e => set(s.key, parseFloat(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
              <div className="flex justify-between mt-0.5">
                <span className="text-[10px] text-slate-600">{s.format(s.min)}</span>
                <span className="text-[10px] text-slate-600">{s.format(s.max)}</span>
              </div>
            </div>
          ))}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-slate-400">Horizonte de análisis</label>
              <span className="text-xs font-mono text-slate-200">{params.mesesAnalisis} meses</span>
            </div>
            <input
              type="range" min={6} max={60} step={6}
              value={params.mesesAnalisis}
              onChange={e => set('mesesAnalisis', parseInt(e.target.value))}
              className="w-full accent-blue-500 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Tabla de capacidades comparadas */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-widest">Comparación de capacidades</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-800/60">
              <tr>
                <th className="text-left text-slate-500 px-4 py-2.5 font-medium">Capacidad</th>
                <th className="text-center text-red-400 px-4 py-2.5 font-medium">Inspectores manuales</th>
                <th className="text-center text-emerald-400 px-4 py-2.5 font-medium">SkillRoute</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {CAPACIDADES_COMPARACION.map(row => (
                <tr key={row.feature} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-2.5 text-slate-300">{row.feature}</td>
                  <td className="px-4 py-2.5 text-center">
                    {row.manual === true
                      ? <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" />
                      : row.manual === 'parcial'
                      ? <span className="text-[10px] text-amber-400 font-semibold">PARCIAL</span>
                      : <XCircle className="w-4 h-4 text-red-500/60 mx-auto" />}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {row.skillroute === true
                      ? <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" />
                      : <XCircle className="w-4 h-4 text-slate-600 mx-auto" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Diferenciadores exclusivos */}
      <div className="grid md:grid-cols-3 gap-4">
        {[
          {
            icon: Globe,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10',
            border: 'border-blue-500/20',
            title: 'Inteligencia de red completa',
            body: 'Ningún operador puede ver la red completa por sí solo. SkillRoute cruza datos de UCOT, CUTCSA, COME y COETC en tiempo real — una vista que no existe en ninguna otra herramienta del mercado.',
          },
          {
            icon: TrendingUp,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10',
            border: 'border-emerald-500/20',
            title: 'Matriz DRO cross-operador',
            body: '1.850 pares de solapamiento calculados sobre 1.167 shapes geométricos. Identifica exactamente qué líneas están en competencia directa y con qué intensidad (T1/T2/T3).',
          },
          {
            icon: Shield,
            color: 'text-purple-400',
            bg: 'bg-purple-500/10',
            border: 'border-purple-500/20',
            title: 'Escala sin costo lineal',
            body: 'Agregar una línea nueva o un operador nuevo no requiere contratar un inspector adicional. El costo es fijo independientemente del volumen de líneas monitoreadas.',
          },
        ].map(card => (
          <div key={card.title} className={`${card.bg} border ${card.border} rounded-xl p-5`}>
            <card.icon className={`w-5 h-5 ${card.color} mb-3`} />
            <h3 className="text-sm font-semibold text-slate-200 mb-2">{card.title}</h3>
            <p className="text-xs text-slate-400 leading-relaxed">{card.body}</p>
          </div>
        ))}
      </div>

      {/* Resumen ejecutivo */}
      <div className={`rounded-xl p-6 border ${calc.esRentable ? 'bg-emerald-900/10 border-emerald-500/20' : 'bg-slate-900 border-slate-700/50'}`}>
        <div className="flex items-start gap-3">
          <Clock className={`w-5 h-5 mt-0.5 shrink-0 ${calc.esRentable ? 'text-emerald-400' : 'text-slate-400'}`} />
          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-1">Resumen ejecutivo</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Con {params.inspectores} inspectores y una suscripción de USD {fmt(params.suscripcionSkillRoute)}/mes,
              SkillRoute genera un <strong className={calc.esRentable ? 'text-emerald-300' : 'text-red-300'}>
                {calc.esRentable ? `ahorro neto de USD ${fmt(calc.ahorroMensualUSD)}/mes` : `costo neto de USD ${fmt(Math.abs(calc.ahorroMensualUSD))}/mes`}
              </strong>{' '}
              reemplazando automáticamente el monitoreo equivalente a {calc.inspectoresEquivalentes} inspectores.
              En {params.mesesAnalisis} meses, el ROI acumulado es del <strong className={roiColor}>{calc.roiPct.toFixed(0)}%</strong>.
              {calc.ahorroAnualUSD > 0 && (
                <> El ahorro anual proyectado de <strong className="text-emerald-300">{fmtUSD(calc.ahorroAnualUSD)}</strong> incluye únicamente el diferencial de costo directo,
                sin contabilizar el valor de la inteligencia cross-operador que los inspectores no pueden proveer.</>
              )}
            </p>
          </div>
        </div>
      </div>

    </div>
  );
};

export default ROICalculator;
