/**
 * CentroComando — Recomendaciones + Proyección (FASE 5.18).
 *
 * Responde a la observación del centro de comando: el sistema ya NO solo
 * muestra datos — RECOMIENDA acciones (por operador y globales cross-
 * operador) y PROYECTA demanda (predictivo, no defensivo). Carga sola.
 */
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertTriangle, Lightbulb, TrendingUp, Globe2, Bus } from 'lucide-react';
import {
  getRecomendaciones,
  getProyeccion,
  type RecomendacionesResultado,
  type ProyeccionResultado,
} from '../../services/comandoService';

const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' });
const MANANA = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', {
  timeZone: 'America/Montevideo',
});

const PRIO: Record<number, string> = {
  5: 'text-red-300 bg-red-500/15 border-red-500/40',
  4: 'text-red-400 bg-red-500/10 border-red-500/30',
  3: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  2: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
  1: 'text-slate-400 bg-slate-700/30 border-slate-600/40',
};

export default function CentroComando() {
  const [recs, setRecs] = useState<RecomendacionesResultado | null>(null);
  const [proy, setProy] = useState<ProyeccionResultado | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [r, p] = await Promise.all([getRecomendaciones(HOY), getProyeccion(MANANA)]);
      setRecs(r);
      setProy(p);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const alertasProy = (proy?.proyeccion ?? []).filter((p) => p.accionAnticipada);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-400" />
            Centro de Comando — Recomendaciones & Proyección
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            El sistema recomienda acciones (por operador y globales cross-operador) y proyecta la
            demanda. Datos 100% reales (GPS, STM oficial, DRO geométrico). Carga automática.
          </p>
        </div>
        <button
          onClick={cargar}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm font-semibold rounded-md"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {err && (
        <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm mb-4">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {err}
        </div>
      )}
      {loading && !recs && (
        <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
          Generando recomendaciones y proyección…
        </div>
      )}

      {recs && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            <Kpi label="Recomendaciones" value={recs.resumen.total} tone="text-white" />
            <Kpi label="Críticas" value={recs.resumen.criticas} tone="text-red-400" />
            <Kpi label="Por operador" value={recs.resumen.porOperador} tone="text-sky-400" />
            <Kpi label="Globales (cross-op)" value={recs.resumen.globales} tone="text-violet-400" />
            <Kpi
              label="Alertas proyección"
              value={proy?.resumen.alertasAnticipadas ?? 0}
              tone="text-amber-400"
            />
          </div>

          {/* RECOMENDACIONES */}
          <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
            <Lightbulb className="w-4 h-4 text-amber-400" /> Recomendaciones (ranqueadas por
            prioridad)
          </h3>
          <div className="border border-slate-800 rounded-lg overflow-hidden mb-7">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left">Prio</th>
                  <th className="px-3 py-2 text-left">Ámbito</th>
                  <th className="px-3 py-2 text-left">Operador / Línea</th>
                  <th className="px-3 py-2 text-left">Situación</th>
                  <th className="px-3 py-2 text-left">Acción recomendada</th>
                </tr>
              </thead>
              <tbody>
                {recs.recomendaciones.slice(0, 40).map((r, i) => (
                  <tr key={i} className={i % 2 ? 'bg-slate-900/40' : 'bg-slate-900/20'}>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${PRIO[r.prioridad]}`}>
                        P{r.prioridad}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1 text-xs text-slate-300">
                        {r.ambito === 'GLOBAL' ? (
                          <Globe2 className="w-3.5 h-3.5 text-violet-400" />
                        ) : (
                          <Bus className="w-3.5 h-3.5 text-sky-400" />
                        )}
                        {r.ambito}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-300 text-xs">
                      {r.operador ?? '—'}
                      {r.linea ? ` · L${r.linea}` : ''}
                    </td>
                    <td className="px-3 py-2.5 text-slate-200">{r.titulo}</td>
                    <td className="px-3 py-2.5 text-slate-400 text-xs max-w-md leading-snug">
                      {r.accion}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* PROYECCIÓN */}
          <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" /> Proyección de demanda —{' '}
            {proy?.fechaObjetivo} ({proy?.tipoDia}) · base {proy?.baseHistorica.desde}→
            {proy?.baseHistorica.hasta} ({proy?.baseHistorica.meses} meses STM)
          </h3>
          <div className="border border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left">Señal</th>
                  <th className="px-3 py-2 text-left">Operador / Línea</th>
                  <th className="px-3 py-2 text-center">Franja</th>
                  <th className="px-3 py-2 text-center">Demanda esperada</th>
                  <th className="px-3 py-2 text-center">Tendencia</th>
                  <th className="px-3 py-2 text-left">Acción anticipada</th>
                </tr>
              </thead>
              <tbody>
                {alertasProy.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                      Sin alertas anticipadas para esa fecha.
                    </td>
                  </tr>
                )}
                {alertasProy.slice(0, 30).map((p, i) => (
                  <tr key={i} className={i % 2 ? 'bg-slate-900/40' : 'bg-slate-900/20'}>
                    <td className="px-3 py-2.5">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          p.señal === 'CRECIENTE_ALTA'
                            ? 'text-red-400 bg-red-500/10 border-red-500/30'
                            : p.señal === 'DECRECIENTE'
                              ? 'text-slate-400 bg-slate-700/30 border-slate-600/40'
                              : 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                        }`}
                      >
                        {p.señal}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-300 text-xs">
                      {p.operador} · L{p.linea}
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-300">
                      {String(p.hora).padStart(2, '0')}h
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-emerald-300">
                      {p.demandaEsperada.toLocaleString()}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-center font-mono ${
                        p.tendenciaPctMes > 0
                          ? 'text-emerald-400'
                          : p.tendenciaPctMes < 0
                            ? 'text-red-400'
                            : 'text-slate-500'
                      }`}
                    >
                      {p.tendenciaPctMes > 0 ? '+' : ''}
                      {p.tendenciaPctMes}%/mes
                    </td>
                    <td className="px-3 py-2.5 text-slate-400 text-xs max-w-md leading-snug">
                      {p.accionAnticipada}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-600 mt-3">
            Recomendaciones y proyección generadas por el sistema sobre datos reales (GPS 4
            operadores, STM oficial {proy?.baseHistorica.meses} meses, corridor_overlap geométrico).
            Sin cifras fabricadas.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2.5">
      <div className="text-[10px] text-slate-500 uppercase tracking-widest">{label}</div>
      <div className={`text-2xl font-black ${tone}`}>{value}</div>
    </div>
  );
}
