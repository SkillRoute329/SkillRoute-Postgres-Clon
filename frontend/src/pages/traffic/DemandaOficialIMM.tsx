/**
 * DemandaOficialIMM — dashboard de validaciones STM oficiales IMM.
 *
 * FASE 5.15 (2026-05-14): muestra el dataset oficial (catalogodatos.gub.uy)
 * que el clon ingesta mensualmente. Permite al operador y al auditor
 * cruzar la operativa GPS con la demanda real declarada por IMM.
 *
 * Secciones:
 *  - KPIs del mes seleccionado (totales, cuota UCOT, comparación M-1)
 *  - Cuota por operador
 *  - Top líneas UCOT + heatmap hora×dow
 *  - Consulta por parada (quién la carga, evolución)
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw, Bus, BarChart3, MapPin, TrendingUp, TrendingDown, Minus,
  Calendar, Search, Database, Info, ChevronRight,
} from 'lucide-react';
import DetalleLineaIMM from './DetalleLineaIMM';
import { OPERADORES as OPERADORES_CANON } from '../../utils/operadores';
import {
  fetchMesesIngestados,
  fetchOperadores,
  fetchTopLineas,
  fetchHoraDow,
  fetchParadaDemanda,
  fetchCompetidoresParada,
  type MesIngestado,
  type DemandaOperadorMes,
  type DemandaLineaMes,
  type DemandaHoraDow,
  type DemandaParadaMes,
  type DemandaCompetidor,
} from '../../services/stmDemandaService';

// FASE 5.16: fuente única utils/operadores.ts.
const OPERADORES = OPERADORES_CANON.map((o) => ({ id: o.id, nombre: o.nombre, color: o.colorHex }));
const DOW_LBL = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];

function fmtMes(iso: string): string {
  // "2026-03-01T..." → "Mar 2026"
  const d = new Date(iso);
  return d.toLocaleDateString('es-UY', { month: 'short', year: 'numeric' });
}
function mesQuery(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

const DemandaOficialIMM: React.FC = () => {
  const [meses, setMeses] = useState<MesIngestado[]>([]);
  const [mesSel, setMesSel] = useState<string>('');
  const [opSel, setOpSel] = useState<string>('70');
  const [operadores, setOperadores] = useState<DemandaOperadorMes[]>([]);
  const [topLineas, setTopLineas] = useState<DemandaLineaMes[]>([]);
  const [horaDow, setHoraDow] = useState<DemandaHoraDow[]>([]);
  const [paradaInput, setParadaInput] = useState<string>('');
  const [paradaSel, setParadaSel] = useState<string>('');
  const [paradaInfo, setParadaInfo] = useState<DemandaParadaMes[]>([]);
  const [competidores, setCompetidores] = useState<DemandaCompetidor[]>([]);
  const [loading, setLoading] = useState(true);
  // FASE 5.15: drill-down de línea
  const [drillLinea, setDrillLinea] = useState<string | null>(null);

  // Cargar lista de meses al inicio
  useEffect(() => {
    fetchMesesIngestados().then((m) => {
      setMeses(m);
      if (m.length > 0 && !mesSel) setMesSel(mesQuery(m[0].mes));
    });
  }, []);

  // Cargar datos cuando cambia mes / operador
  useEffect(() => {
    if (!mesSel) return;
    setLoading(true);
    Promise.all([
      fetchOperadores(mesSel),
      fetchTopLineas(opSel, mesSel, 15),
      fetchHoraDow(opSel, mesSel),
    ])
      .then(([ops, lin, hd]) => {
        setOperadores(ops);
        setTopLineas(lin);
        setHoraDow(hd);
      })
      .finally(() => setLoading(false));
  }, [mesSel, opSel]);

  const totalSistema = useMemo(
    () => operadores.reduce((s, o) => s + o.validaciones, 0),
    [operadores],
  );
  const opSeleccionado = operadores.find((o) => String(o.codEmpresa) === opSel);
  const cuotaSel = opSeleccionado && totalSistema > 0
    ? (opSeleccionado.validaciones / totalSistema) * 100
    : 0;

  // Heatmap matrix
  const heatMat = useMemo(() => {
    const m: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    let max = 0;
    for (const r of horaDow) {
      if (r.dow >= 0 && r.dow < 7 && r.hora >= 0 && r.hora < 24) {
        m[r.dow][r.hora] = r.validaciones;
        if (r.validaciones > max) max = r.validaciones;
      }
    }
    return { m, max };
  }, [horaDow]);

  function colorHeat(v: number, max: number): string {
    if (max === 0 || v === 0) return 'bg-slate-800';
    const pct = v / max;
    if (pct < 0.1) return 'bg-blue-900/40';
    if (pct < 0.3) return 'bg-blue-700/60';
    if (pct < 0.5) return 'bg-emerald-700/70';
    if (pct < 0.7) return 'bg-yellow-600/80';
    if (pct < 0.85) return 'bg-orange-600/90';
    return 'bg-red-600';
  }

  const buscarParada = async () => {
    if (!paradaInput.trim()) return;
    const cod = paradaInput.trim();
    setParadaSel(cod);
    setParadaInfo([]);
    setCompetidores([]);
    const [info, comp] = await Promise.all([
      fetchParadaDemanda(cod),
      fetchCompetidoresParada(cod),
    ]);
    setParadaInfo(info);
    setCompetidores(comp);
  };

  return (
    <div className="bg-slate-950 min-h-screen text-slate-100 p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-3">
          <Database className="w-7 h-7 text-amber-400 mt-1" />
          <div>
            <h1 className="text-2xl font-bold">Demanda oficial IMM</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Validaciones STM agregadas del dataset oficial · catalogodatos.gub.uy ·
              ingestadas mensualmente al clon
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Info className="w-3.5 h-3.5" />
          <span>{meses.length} mes{meses.length === 1 ? '' : 'es'} cargado{meses.length === 1 ? '' : 's'}</span>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-6 bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-500 uppercase tracking-wider">Mes</span>
          <select
            value={mesSel}
            onChange={(e) => setMesSel(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm"
            disabled={meses.length === 0}
          >
            {meses.length === 0 && <option>(sin datos)</option>}
            {meses.map((m) => (
              <option key={m.mes} value={mesQuery(m.mes)}>{fmtMes(m.mes)}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Bus className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-500 uppercase tracking-wider">Operador</span>
          <div className="flex gap-1">
            {OPERADORES.map((op) => (
              <button
                key={op.id}
                onClick={() => setOpSel(op.id)}
                className={`text-xs font-semibold px-3 py-1 rounded ${
                  opSel === op.id ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {op.nombre}
              </button>
            ))}
          </div>
        </div>
        {loading && <RefreshCw className="w-4 h-4 text-slate-400 animate-spin ml-auto" />}
      </div>

      {meses.length === 0 && (
        <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-4 text-sm text-amber-300 mb-6">
          Todavía no hay datos ingestados. Corre <code>backend/scripts/ingest_stm_fast.sh</code> con los ZIP descargados.
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Total sistema</p>
          <p className="text-3xl font-black text-slate-100">{totalSistema.toLocaleString()}</p>
          <p className="text-[10px] text-slate-500 mt-1">validaciones del mes</p>
        </div>
        <div className="bg-slate-900 border border-amber-500/40 rounded-xl p-4">
          <p className="text-[10px] text-amber-400 uppercase tracking-wider mb-1">
            {OPERADORES.find((o) => o.id === opSel)?.nombre}
          </p>
          <p className="text-3xl font-black text-amber-300">
            {opSeleccionado?.validaciones.toLocaleString() ?? '—'}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">validaciones</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Cuota</p>
          <p className="text-3xl font-black text-emerald-400">{cuotaSel.toFixed(2)}%</p>
          <p className="text-[10px] text-slate-500 mt-1">del total del mes</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Líneas con datos</p>
          <p className="text-3xl font-black text-blue-400">{topLineas.length}</p>
          <p className="text-[10px] text-slate-500 mt-1">en {OPERADORES.find((o) => o.id === opSel)?.nombre}</p>
        </div>
      </div>

      {/* Cuota por operador */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider">Cuota por operador</h2>
        </div>
        <div className="space-y-2">
          {OPERADORES.map((op) => {
            const row = operadores.find((o) => String(o.codEmpresa) === op.id);
            const v = row?.validaciones ?? 0;
            const pct = totalSistema > 0 ? (v / totalSistema) * 100 : 0;
            return (
              <div key={op.id} className="flex items-center gap-3">
                <span className="w-16 text-xs font-semibold" style={{ color: op.color }}>{op.nombre}</span>
                <div className="flex-1 bg-slate-800 rounded h-5 overflow-hidden">
                  <div
                    className="h-full transition-all duration-500"
                    style={{ width: `${pct.toFixed(2)}%`, backgroundColor: op.color }}
                  />
                </div>
                <span className="text-xs font-mono w-24 text-right text-slate-300">{v.toLocaleString()}</span>
                <span className="text-xs font-bold w-14 text-right" style={{ color: op.color }}>
                  {pct.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Top líneas */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            Top 15 líneas {OPERADORES.find((o) => o.id === opSel)?.nombre}
          </h2>
          {topLineas.length === 0 && <p className="text-xs text-slate-500">Sin datos</p>}
          {topLineas.length > 0 && (
            <div className="space-y-1">
              {topLineas.map((l, i) => {
                const max = topLineas[0].validaciones;
                const pct = (l.validaciones / max) * 100;
                return (
                  <button
                    key={l.linea}
                    onClick={() => setDrillLinea(l.linea)}
                    className="w-full flex items-center gap-2 text-xs hover:bg-slate-800/50 px-1 py-0.5 rounded transition-colors group cursor-pointer"
                    title={`Ver detalle L${l.linea}`}
                  >
                    <span className="text-slate-500 w-6 text-right">{i + 1}.</span>
                    <span className="font-bold w-14 text-left">L{l.linea}</span>
                    <div className="flex-1 bg-slate-800 rounded h-3 overflow-hidden">
                      <div className="bg-amber-500 h-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-mono w-20 text-right text-slate-300">{l.validaciones.toLocaleString()}</span>
                    <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-amber-400" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Heatmap hora × dow */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-slate-400" />
            Demanda por hora × día (heatmap)
          </h2>
          <div className="overflow-x-auto">
            <table className="text-[9px] font-mono w-full">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left pr-1">h</th>
                  {DOW_LBL.map((d) => <th key={d} className="text-center px-1">{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 24 }, (_, h) => (
                  <tr key={h}>
                    <td className="text-slate-500 pr-1">{String(h).padStart(2, '0')}</td>
                    {DOW_LBL.map((_, dow) => {
                      const v = heatMat.m[dow][h];
                      return (
                        <td
                          key={dow}
                          className={`text-center w-8 h-4 text-[8px] ${colorHeat(v, heatMat.max)}`}
                          title={`${DOW_LBL[dow]} ${h}:00 — ${v.toLocaleString()} viajes`}
                        >
                          {v > 0 && v >= heatMat.max * 0.3 ? Math.round(v / 1000) + 'k' : ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-600 mt-2">
            Cada celda: total mensual de validaciones en esa hora-día para {OPERADORES.find((o) => o.id === opSel)?.nombre}.
          </p>
        </div>
      </div>

      {/* Consulta por parada */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-slate-400" />
          Demanda por parada (código IMM)
        </h2>
        <div className="flex items-center gap-2 mb-4">
          <input
            type="text"
            value={paradaInput}
            onChange={(e) => setParadaInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') buscarParada(); }}
            placeholder="ej. 2521 (Ruta 8 / Sta Dumont)"
            className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm flex-1 max-w-xs"
          />
          <button
            onClick={buscarParada}
            className="bg-amber-500 text-slate-900 px-4 py-1.5 rounded text-sm font-bold flex items-center gap-1"
          >
            <Search className="w-3.5 h-3.5" />Consultar
          </button>
        </div>

        {paradaSel && (
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Evolución de la parada por operador */}
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                Validaciones parada {paradaSel} — todos los operadores
              </p>
              {paradaInfo.length === 0 && <p className="text-xs text-slate-500">Sin datos para esa parada.</p>}
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 text-left">
                    <th className="py-1">Mes</th>
                    <th className="py-1">Operador</th>
                    <th className="py-1 text-right">Validaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paradaInfo.map((r, i) => (
                    <tr key={i} className="border-t border-slate-800/60">
                      <td className="py-1 text-slate-400">{fmtMes(r.mes)}</td>
                      <td className="py-1 font-semibold">{r.operador}</td>
                      <td className="py-1 text-right font-mono">{r.validaciones.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Competidores concretos por línea */}
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                Líneas que cargan esta parada (ordenadas por último mes)
              </p>
              {competidores.length === 0 && <p className="text-xs text-slate-500">Sin datos.</p>}
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 text-left">
                    <th className="py-1">Op</th>
                    <th className="py-1">Línea</th>
                    <th className="py-1 text-right">Último mes</th>
                    <th className="py-1 text-right">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {competidores.slice(0, 12).map((c, i) => {
                    const Icon = c.delta > 0 ? TrendingUp : c.delta < 0 ? TrendingDown : Minus;
                    const color = c.delta > 0 ? 'text-emerald-400' : c.delta < 0 ? 'text-red-400' : 'text-slate-500';
                    return (
                      <tr key={i} className="border-t border-slate-800/60">
                        <td className="py-1 font-semibold">{c.operador}</td>
                        <td className="py-1 font-mono">L{c.linea}</td>
                        <td className="py-1 text-right font-mono">{c.ultimoMes.toLocaleString()}</td>
                        <td className={`py-1 text-right ${color}`}>
                          <Icon className="w-3 h-3 inline" /> {c.delta >= 0 ? '+' : ''}{c.delta.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-600 mt-6 max-w-3xl">
        <strong>Fuente:</strong> Intendencia de Montevideo — Departamento de Movilidad ·
        <code> catalogodatos.gub.uy/dataset/viajes-realizados-en-los-omnibus-del-sistema-de-transporte-metropolitano-stm</code> ·
        Publicación mensual a mes vencido. Granularidad: 1 fila = 1 validación de máquina (viaje real).
        Datos agregados al clon en <code>stm_validaciones_mensual</code>.
      </p>

      {/* FASE 5.15: drill-down de línea (modal) */}
      {drillLinea && (
        <DetalleLineaIMM
          op={opSel}
          opNombre={OPERADORES.find((o) => o.id === opSel)?.nombre ?? opSel}
          linea={drillLinea}
          mes={mesSel}
          onClose={() => setDrillLinea(null)}
        />
      )}
    </div>
  );
};

export default DemandaOficialIMM;
