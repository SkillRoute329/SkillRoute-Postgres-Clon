/**
 * PLPorOperador.tsx — P&L (Pérdidas y Ganancias) por operador
 * Ingresos = capacidad × ocupación × viajes/día × tarifa × días_laborables
 * Costos   = laboral + combustible + amortización + mant + seguro + admin
 */
import React, { useMemo, useState } from 'react';
import TrafficAlertsBanner from '../../components/TrafficAlertsBanner';
import { TrendingUp, TrendingDown, AlertCircle, ChevronDown } from 'lucide-react';
import { useEmpresaPropia, EMPRESAS_OPCIONES } from '../../hooks/useEmpresaPropia';
import { useAuth } from '../../context/AuthContext';
import {
  TARIFA_STM, COSTO_COMBUSTIBLE_KM, COSTO_CONDUCTOR_DIA,
  COSTO_MANTENIMIENTO_DIA, COSTO_SEGURO_DIA, KM_PROMEDIO_VIAJE,
  TIPO_CAMBIO_UYU_USD,
} from '../../config/parametros-operativos';

// ── Parámetros de modelo ─────────────────────────────────────────────────
const OCUPACION       = 0.45;                     // 45% promedio STM 2025
const DIAS_MES        = 22;                       // días laborables/mes
const FACTOR_ADMIN    = 0.12;                     // 12% overhead admin
const AMORT_DIA       = Math.round((250_000 * TIPO_CAMBIO_UYU_USD.valor) / (15 * 365));

const CAPACIDAD: Record<number, number> = { 50: 90, 70: 80, 20: 70, 10: 75 };
const VIAJES_DIA: Record<number, number> = { 50: 8, 70: 8, 20: 5, 10: 5 };
const FLOTA: Record<number, number>     = { 50: 900, 70: 220, 20: 80, 10: 50 };

// ── Tipos ────────────────────────────────────────────────────────────────
interface PLData {
  codigo: number; label: string; color: string; coches: number;
  ingresosMes: number; costosMes: number; plNeto: number; margenPct: number;
  costos: { laboral: number; combustible: number; amortizacion: number;
            mantenimiento: number; seguro: number; admin: number };
}

// ── Cálculo ───────────────────────────────────────────────────────────────
function calcPL(codigo: number): PLData {
  const cfg      = EMPRESAS_OPCIONES.find((e) => e.codigo === codigo)!;
  const cap      = CAPACIDAD[codigo] ?? 80;
  const vDia     = VIAJES_DIA[codigo] ?? 8;
  const coches   = FLOTA[codigo] ?? 100;

  const ingCocheDia  = cap * OCUPACION * vDia * TARIFA_STM.valor;
  const ingresosMes  = Math.round(ingCocheDia * coches * DIAS_MES);

  const kmDia  = KM_PROMEDIO_VIAJE.valor * vDia;
  const lab    = COSTO_CONDUCTOR_DIA.valor * 1.15;
  const comb   = COSTO_COMBUSTIBLE_KM.valor * kmDia;
  const amort  = AMORT_DIA;
  const mant   = COSTO_MANTENIMIENTO_DIA.valor;
  const seg    = COSTO_SEGURO_DIA.valor;
  const directo = lab + comb + amort + mant + seg;
  const adm    = directo * FACTOR_ADMIN;
  const costosMes = Math.round((directo + adm) * coches * DIAS_MES);

  const factor = (c: number) => Math.round(c * coches * DIAS_MES);
  return {
    codigo, label: cfg.label, color: cfg.color, coches,
    ingresosMes, costosMes,
    plNeto: ingresosMes - costosMes,
    margenPct: ingresosMes > 0
      ? Math.round(((ingresosMes - costosMes) / ingresosMes) * 1000) / 10 : 0,
    costos: {
      laboral: factor(lab), combustible: factor(comb), amortizacion: factor(amort),
      mantenimiento: factor(mant), seguro: factor(seg), admin: factor(adm),
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────
const fmtUYU = (n: number) =>
  new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU', maximumFractionDigits: 0 }).format(n);
const fmtUSD = (n: number) =>
  new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    .format(n / TIPO_CAMBIO_UYU_USD.valor);

// ── Gauge de margen ───────────────────────────────────────────────────────
function GaugeMargen({ margen }: { margen: number }) {
  const c  = Math.max(-30, Math.min(40, margen));
  const deg = ((c + 30) / 70) * 180;
  const rad = (deg * Math.PI) / 180;
  const x = 70 + 56 * Math.cos(Math.PI - rad);
  const y = 70 - 56 * Math.sin(Math.PI - rad);
  const col = margen > 10 ? '#10b981' : margen >= 0 ? '#f59e0b' : '#ef4444';
  const lbl = margen > 10 ? 'Rentable' : margen >= 0 ? 'Ajustado' : 'Deficitario';
  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="80" viewBox="0 0 140 80">
        <path d="M 14 70 A 56 56 0 0 1 126 70" fill="none" stroke="#1e293b" strokeWidth="12" strokeLinecap="round"/>
        <path d="M 14 70 A 56 56 0 0 1 70 14"  fill="none" stroke="#7f1d1d" strokeWidth="12" strokeLinecap="round"/>
        <path d="M 70 14 A 56 56 0 0 1 113 31" fill="none" stroke="#78350f" strokeWidth="12" strokeLinecap="round"/>
        <path d="M 113 31 A 56 56 0 0 1 126 70" fill="none" stroke="#14532d" strokeWidth="12" strokeLinecap="round"/>
        <line x1="70" y1="70" x2={x} y2={y} stroke={col} strokeWidth="3" strokeLinecap="round"/>
        <circle cx="70" cy="70" r="4" fill={col}/>
      </svg>
      <span className="text-2xl font-black" style={{ color: col }}>{margen > 0 ? '+' : ''}{margen.toFixed(1)}%</span>
      <span className="text-xs font-medium" style={{ color: col }}>{lbl}</span>
    </div>
  );
}

// ── Fila tabla resumen (expandible) ─────────────────────────────────────
function FilaResumen({ pl, activo }: { pl: PLData; activo: boolean }) {
  const [exp, setExp] = useState(false);
  const mc = pl.margenPct > 10 ? 'text-emerald-400' : pl.margenPct >= 0 ? 'text-amber-400' : 'text-red-400';
  return (
    <>
      <tr
        className={`border-b border-slate-800 cursor-pointer hover:bg-slate-800/40 transition-colors ${activo ? 'bg-slate-800/30' : ''}`}
        onClick={() => setExp(v => !v)}
      >
        <td className="py-3 px-4 font-semibold" style={{ color: pl.color }}>{pl.label}</td>
        <td className="py-3 px-4 text-right text-slate-300">{fmtUYU(pl.ingresosMes)}</td>
        <td className="py-3 px-4 text-right text-slate-400">{fmtUYU(pl.costosMes)}</td>
        <td className={`py-3 px-4 text-right font-bold ${pl.plNeto >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtUYU(pl.plNeto)}</td>
        <td className={`py-3 px-4 text-right font-bold ${mc}`}>{pl.margenPct > 0 ? '+' : ''}{pl.margenPct.toFixed(1)}%</td>
        <td className="py-3 px-4 text-center"><ChevronDown size={14} className={`text-slate-500 transition-transform ${exp ? 'rotate-180' : ''}`}/></td>
      </tr>
      {exp && (
        <tr className="bg-slate-950/50 border-b border-slate-800">
          <td colSpan={6} className="px-6 py-3">
            <div className="grid grid-cols-3 gap-2 text-xs">
              {Object.entries({ Laboral: pl.costos.laboral, Combustible: pl.costos.combustible,
                Amortización: pl.costos.amortizacion, Mantenimiento: pl.costos.mantenimiento,
                Seguro: pl.costos.seguro, 'Admin 12%': pl.costos.admin }).map(([k, v]) => (
                <div key={k} className="flex justify-between bg-slate-900 rounded-lg px-3 py-2">
                  <span className="text-slate-500">{k}</span>
                  <span className="text-slate-300">{fmtUYU(v)}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Componente principal ──────────────────────────────────────────────────
export default function PLPorOperador() {
  const { user }  = useAuth();
  const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
  const esSA      = (user?.role ?? '').toUpperCase() === 'SUPERADMIN';
  const plTodas   = useMemo(() => EMPRESAS_OPCIONES.map(e => calcPL(e.codigo)), []);
  const pl        = useMemo(() => plTodas.find(p => p.codigo === empresaPropia) ?? plTodas[0]!, [empresaPropia, plTodas]);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 space-y-6">
      {/* Banner de alertas críticas de tráfico — Módulo 10 */}
      <TrafficAlertsBanner />

      {/* Glow ambiental */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-700/8 rounded-full blur-[160px]"/>
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-orange-500/6 rounded-full blur-[140px]"/>
      </div>

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-200">P&L por Operador</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Período mensual · <span className="text-slate-300 font-semibold">UYU</span> · Tarifa STM {fmtUYU(TARIFA_STM.valor)}/boleto · ocupación {(OCUPACION*100).toFixed(0)}% · {DIAS_MES} días laborables/mes
          </p>
        </div>
        {esSA && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 uppercase tracking-widest">Operador:</span>
            <div className="flex gap-1.5">
              {EMPRESAS_OPCIONES.map(e => (
                <button key={e.codigo} onClick={() => setEmpresaPropia(e.codigo)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    empresaPropia === e.codigo
                      ? 'border-transparent text-white'
                      : 'border-slate-700 text-slate-400 hover:text-white bg-slate-900'
                  }`}
                  style={empresaPropia === e.codigo ? { background: e.color } : {}}>
                  {e.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Aviso de estimación */}
      <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
        <AlertCircle size={16} className="text-amber-400 mt-0.5 shrink-0"/>
        <p className="text-xs text-amber-300 leading-relaxed">
          <strong>Ingresos estimados sin integración STM Card</strong> — calculados con ocupación promedio {(OCUPACION*100).toFixed(0)}%
          y tarifa STM oficial. Calibrar con datos reales de boletaje cuando estén disponibles.
        </p>
      </div>

      {/* KPIs */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold px-2.5 py-1 rounded-full text-white" style={{ background: empresaCfg.color }}>
            {empresaCfg.label}
          </span>
          <span className="text-xs text-slate-500">{pl.coches} coches operativos</span>
          {pl.plNeto >= 0
            ? <TrendingUp size={15} className="text-emerald-400"/>
            : <TrendingDown size={15} className="text-red-400"/>}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { t: 'Ingresos estimados', v: fmtUYU(pl.ingresosMes), s: `≈ ${fmtUSD(pl.ingresosMes)}/mes` },
            { t: 'Costos totales',     v: fmtUYU(pl.costosMes),   s: 'Laboral + operativo + admin' },
            { t: 'P&L neto',           v: fmtUYU(pl.plNeto),       s: fmtUSD(pl.plNeto), pos: pl.plNeto >= 0 },
          ].map(({ t, v, s, pos }) => (
            <div key={t} className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 flex flex-col gap-1">
              <span className="text-xs text-slate-500 uppercase tracking-widest">{t}</span>
              <span className={`text-2xl font-black ${pos === undefined ? 'text-white' : pos ? 'text-emerald-400' : 'text-red-400'}`}>{v}</span>
              <span className="text-xs text-slate-500">{s}</span>
            </div>
          ))}
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 flex flex-col items-center justify-center">
            <span className="text-xs text-slate-500 uppercase tracking-widest mb-1">Margen operativo</span>
            <GaugeMargen margen={pl.margenPct}/>
          </div>
        </div>
      </div>

      {/* Desglose de costos */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">Desglose de costos — {empresaCfg.label}</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {([
            ['👷', 'Laboral',       pl.costos.laboral],
            ['⛽', 'Combustible',   pl.costos.combustible],
            ['🚌', 'Amortización',  pl.costos.amortizacion],
            ['🔧', 'Mantenimiento', pl.costos.mantenimiento],
            ['🛡', 'Seguro',        pl.costos.seguro],
            ['📋', 'Admin',         pl.costos.admin],
          ] as [string,string,number][]).map(([ic, k, v]) => (
            <div key={k} className="bg-slate-800/50 rounded-lg p-3 text-center">
              <span className="text-lg">{ic}</span>
              <p className="text-xs text-slate-500 mt-1">{k}</p>
              <p className="text-sm font-bold text-slate-200 mt-0.5">{fmtUYU(v)}</p>
              <p className="text-xs text-slate-500">
                {pl.costosMes > 0 ? ((v / pl.costosMes) * 100).toFixed(1) : 0}%
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabla multi-operador — solo SUPERADMIN */}
      {esSA && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-slate-300">Resumen sistema — 4 operadores</h2>
            <p className="text-xs text-slate-500 mt-0.5">Hacer clic en fila para desglose de costos</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-widest">
                  <th className="py-3 px-4 text-left">Operador</th>
                  <th className="py-3 px-4 text-right">Ingresos</th>
                  <th className="py-3 px-4 text-right">Costos</th>
                  <th className="py-3 px-4 text-right">P&L</th>
                  <th className="py-3 px-4 text-right">Margen</th>
                  <th/>
                </tr>
              </thead>
              <tbody>
                {plTodas.map(p => <FilaResumen key={p.codigo} pl={p} activo={p.codigo === empresaPropia}/>)}
                <tr className="bg-slate-800/30 border-t-2 border-slate-700 font-semibold text-sm">
                  <td className="py-3 px-4 text-slate-300">Total sistema</td>
                  <td className="py-3 px-4 text-right text-slate-200">{fmtUYU(plTodas.reduce((s,p) => s+p.ingresosMes,0))}</td>
                  <td className="py-3 px-4 text-right text-slate-400">{fmtUYU(plTodas.reduce((s,p) => s+p.costosMes,0))}</td>
                  <td className="py-3 px-4 text-right text-emerald-400">{fmtUYU(plTodas.reduce((s,p) => s+p.plNeto,0))}</td>
                  <td className="py-3 px-4 text-right text-emerald-400">
                    {(() => { const i=plTodas.reduce((s,p)=>s+p.ingresosMes,0), c=plTodas.reduce((s,p)=>s+p.costosMes,0);
                      const m=i>0?(((i-c)/i)*100).toFixed(1):'0'; return `${Number(m)>0?'+':''}${m}%`; })()}
                  </td>
                  <td/>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Parámetros del modelo */}
      <details className="bg-slate-900/50 border border-slate-800 rounded-xl">
        <summary className="px-5 py-3 text-xs text-slate-500 cursor-pointer hover:text-slate-400 select-none">
          Ver parámetros del modelo
        </summary>
        <div className="px-5 pb-4 pt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          {([
            ['Tarifa STM',           `${fmtUYU(TARIFA_STM.valor)}/boleto`,               TARIFA_STM.confidence],
            ['Ocupación promedio',   `${(OCUPACION*100).toFixed(0)}% de asientos`,        'estimado'],
            ['Días laborables/mes',  `${DIAS_MES} días`,                                  'oficial'],
            ['Costo conductor/día',  fmtUYU(COSTO_CONDUCTOR_DIA.valor),                  COSTO_CONDUCTOR_DIA.confidence],
            ['Costo combustible/km', fmtUYU(COSTO_COMBUSTIBLE_KM.valor),                 COSTO_COMBUSTIBLE_KM.confidence],
            ['Amortización/día',     fmtUYU(AMORT_DIA),                                  'estimado'],
            ['Overhead admin',       `${(FACTOR_ADMIN*100).toFixed(0)}%`,                 'estimado'],
            ['Tipo de cambio',       `${fmtUYU(TIPO_CAMBIO_UYU_USD.valor)}/USD`,          TIPO_CAMBIO_UYU_USD.confidence],
          ] as [string,string,string][]).map(([k,v,c]) => {
            const badge: Record<string,string> = {
              oficial: 'bg-emerald-500/10 text-emerald-400', calibrado: 'bg-blue-500/10 text-blue-400',
              estimado: 'bg-amber-500/10 text-amber-400',    hardcoded: 'bg-red-500/10 text-red-400',
            };
            return (
              <div key={k} className="flex items-center justify-between bg-slate-900 rounded-lg px-3 py-2 gap-2">
                <span className="text-slate-500 truncate">{k}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-slate-300">{v}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${badge[c] ?? ''}`}>{c}</span>
                </div>
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}
