/**
 * CochesEnServicioHoy — panel de operativa diaria UCOT
 *
 * FASE 5.14 (2026-05-13): cruza GPS en vivo (bus_last_pos, poller IMM
 * stm-online cada 10s) contra el cartón asignado por Antigravity
 * (cartones_completados). Esto contesta la pregunta operativa diaria:
 *   "Qué coche está en la calle ahora mismo y qué cartón le tocaba?"
 *
 * Diferencial vs operadores que sólo miran su sistema interno: aquí
 * detectamos cuándo un coche está operando una línea distinta a la
 * asignada (reasignación informal).
 */

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Bus, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';

interface Item {
  coche: string;
  immLinea: string;
  ucotLinea: string | null;
  servicio: string | null;
  conductorId: string | null;
  velocidad: number;
  estadoCumplimiento: string;
  updatedAt: string;
  estadoCruce: 'match_directo' | 'match_prefijo_ucot' | 'no_match' | 'sin_carton';
}

interface Resumen {
  total: number;
  match_directo: number;
  match_prefijo_ucot: number;
  no_match: number;
  sin_carton: number;
}

interface Response {
  ok: boolean;
  agency: string;
  fuente: string;
  generadoEn: string;
  resumen: Resumen;
  items: Item[];
}

const BASE = (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:3001';

const ESTADO_LABEL: Record<Item['estadoCruce'], { label: string; color: string; bg: string; border: string }> = {
  match_directo:        { label: 'Cartón confirmado',        color: 'text-emerald-300', bg: 'bg-emerald-500/10',  border: 'border-emerald-500/30' },
  match_prefijo_ucot:   { label: 'Cartón confirmado (cód. corto)', color: 'text-emerald-300', bg: 'bg-emerald-500/10',  border: 'border-emerald-500/30' },
  no_match:             { label: 'Línea distinta al cartón', color: 'text-amber-300',   bg: 'bg-amber-500/10',    border: 'border-amber-500/40' },
  sin_carton:           { label: 'Sin cartón cargado',       color: 'text-slate-400',   bg: 'bg-slate-700/20',    border: 'border-slate-600/40' },
};

const CochesEnServicioHoy: React.FC<{ agency?: string }> = ({ agency = '70' }) => {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<Item['estadoCruce'] | 'todos'>('todos');

  const fetchData = React.useCallback(() => {
    setLoading(true);
    setError(null);
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('skillroute_jwt') : null;
    axios
      .get<Response>(`${BASE}/api/cartones/coches-en-servicio-hoy?agency=${agency}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      .then((r) => setData(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [agency]);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 30_000);
    return () => clearInterval(t);
  }, [fetchData]);

  const items = (data?.items ?? []).filter((it) =>
    filtroEstado === 'todos' ? true : it.estadoCruce === filtroEstado,
  );

  return (
    <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Bus className="w-5 h-5 text-blue-400" />
          <div className="text-left">
            <h3 className="text-sm font-bold text-slate-100">Coches en servicio hoy — UCOT</h3>
            <p className="text-[11px] text-slate-500">GPS en vivo cruzado con cartón asignado (Antigravity)</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {data && (
            <div className="hidden md:flex items-center gap-3 text-xs">
              <span className="text-slate-400">Total: <strong className="text-slate-200">{data.resumen.total}</strong></span>
              <span className="text-emerald-400">
                Con cartón: <strong>{data.resumen.match_directo + data.resumen.match_prefijo_ucot}</strong>
              </span>
              {data.resumen.no_match > 0 && (
                <span className="text-amber-400">Reasignados: <strong>{data.resumen.no_match}</strong></span>
              )}
              {data.resumen.sin_carton > 0 && (
                <span className="text-slate-500">Sin cartón: <strong>{data.resumen.sin_carton}</strong></span>
              )}
            </div>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-800 p-4">
          {/* Tarjetas resumen */}
          {data && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <button
                onClick={() => setFiltroEstado('todos')}
                className={`text-left p-3 rounded-xl border transition-all ${
                  filtroEstado === 'todos' ? 'bg-slate-800 border-slate-600' : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600'
                }`}
              >
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total activos</p>
                <p className="text-2xl font-black text-slate-100">{data.resumen.total}</p>
                <p className="text-[10px] text-slate-500">buses con GPS &lt; 5 min</p>
              </button>
              <button
                onClick={() => setFiltroEstado(filtroEstado === 'match_directo' ? 'todos' : 'match_directo')}
                className={`text-left p-3 rounded-xl border transition-all ${
                  filtroEstado === 'match_directo' ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-slate-800/40 border-slate-700/50 hover:border-emerald-500/30'
                }`}
              >
                <p className="text-[10px] text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />Cartón confirmado
                </p>
                <p className="text-2xl font-black text-emerald-300">{data.resumen.match_directo + data.resumen.match_prefijo_ucot}</p>
                <p className="text-[10px] text-slate-500">operando lo asignado</p>
              </button>
              <button
                onClick={() => setFiltroEstado(filtroEstado === 'no_match' ? 'todos' : 'no_match')}
                className={`text-left p-3 rounded-xl border transition-all ${
                  filtroEstado === 'no_match' ? 'bg-amber-500/10 border-amber-500/40' : 'bg-slate-800/40 border-slate-700/50 hover:border-amber-500/30'
                }`}
              >
                <p className="text-[10px] text-amber-400 uppercase tracking-wider flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />Línea distinta
                </p>
                <p className="text-2xl font-black text-amber-300">{data.resumen.no_match}</p>
                <p className="text-[10px] text-slate-500">reasignación operativa</p>
              </button>
              <button
                onClick={() => setFiltroEstado(filtroEstado === 'sin_carton' ? 'todos' : 'sin_carton')}
                className={`text-left p-3 rounded-xl border transition-all ${
                  filtroEstado === 'sin_carton' ? 'bg-slate-700/50 border-slate-500/60' : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-500'
                }`}
              >
                <p className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <HelpCircle className="w-3 h-3" />Sin cartón cargado
                </p>
                <p className="text-2xl font-black text-slate-400">{data.resumen.sin_carton}</p>
                <p className="text-[10px] text-slate-500">pendiente Antigravity</p>
              </button>
            </div>
          )}

          {loading && !data && <p className="text-sm text-slate-500">Cargando coches activos…</p>}
          {error && <p className="text-sm text-red-400">Error: {error}</p>}

          {data && items.length === 0 && (
            <p className="text-sm text-slate-500 italic">Sin coches en esta categoría.</p>
          )}

          {data && items.length > 0 && (
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto border border-slate-800 rounded-lg">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-900 z-10 border-b border-slate-700">
                  <tr className="text-left text-slate-400 uppercase tracking-wider">
                    <th className="px-3 py-2 font-semibold">Coche</th>
                    <th className="px-3 py-2 font-semibold">Línea IMM</th>
                    <th className="px-3 py-2 font-semibold">Línea UCOT</th>
                    <th className="px-3 py-2 font-semibold">Servicio</th>
                    <th className="px-3 py-2 font-semibold">Estado</th>
                    <th className="px-3 py-2 font-semibold">Vel.</th>
                    <th className="px-3 py-2 font-semibold">Actualizado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {items.map((it) => {
                    const s = ESTADO_LABEL[it.estadoCruce];
                    return (
                      <tr key={it.coche} className="text-slate-300 hover:bg-slate-800/30">
                        <td className="px-3 py-1.5 font-semibold">#{it.coche}</td>
                        <td className="px-3 py-1.5">L{it.immLinea}</td>
                        <td className="px-3 py-1.5">{it.ucotLinea ? `L${it.ucotLinea}` : <span className="text-slate-600">—</span>}</td>
                        <td className="px-3 py-1.5 font-mono text-[11px]">{it.servicio ?? <span className="text-slate-600">—</span>}</td>
                        <td className="px-3 py-1.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${s.bg} ${s.border} ${s.color}`}>
                            {s.label}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-slate-400">{it.velocidad} km/h</td>
                        <td className="px-3 py-1.5 font-mono text-[10px] text-slate-500">
                          {new Date(it.updatedAt).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between mt-3">
            <p className="text-[10px] text-slate-600">
              Fuente: <code>bus_last_pos</code> (poller IMM stm-online 10s) ⋈ <code>cartones_completados</code> (Antigravity).
              Mapeo IMM↔UCOT: códigos &lt;100 se prefijan con &quot;3&quot; (IMM 17 = UCOT 317). Auto-refresh 30 s.
            </p>
            <button
              onClick={fetchData}
              disabled={loading}
              className="text-[11px] flex items-center gap-1 text-slate-400 hover:text-slate-200 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CochesEnServicioHoy;
