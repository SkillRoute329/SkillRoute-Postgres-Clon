/**
 * CocheEventosModal — Modal con eventos individuales de cumplimiento de
 * un coche en una fecha (FASE 5.38, 2026-05-22).
 *
 * Resuelve la queja: "el Panel marca atrasos pero no detalla en qué fecha
 * realizó cada línea". Acá vemos uno por uno cada evento problemático con
 * fecha, hora, línea, parada y desviación real.
 *
 * Source: GET /api/cumplimiento/coche/:idBus/eventos?fecha=YYYY-MM-DD
 */

import { useEffect, useState } from 'react';
import { X, Bus, AlertTriangle, Clock, MapPin, Activity, Filter } from 'lucide-react';
import { apiClient } from '../clients/apiClient';

interface EventoCumplimiento {
  id: number;
  timestamp: string;
  linea: string | null;
  agencyId: string;
  sentido?: string | null;
  destino?: string | null;
  proximaParada?: string | null;
  estado: string | null;
  desviacionMin: number | null;
  velocidad?: number | null;
}

interface ResumenLinea {
  linea: string;
  eventos: number;
  desviacionMaxMin: number;
  estadoMasFrecuente: string;
  ultimaParada: string | null;
}

interface FeedResponse {
  ok: boolean;
  idBus: string;
  fecha: string;
  total: number;
  estados: string[] | string;
  resumenPorLinea: ResumenLinea[];
  eventos: EventoCumplimiento[];
}

const ESTADO_COLOR: Record<string, string> = {
  EN_TIEMPO: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  ATRASADO: 'bg-red-500/15 text-red-300 border-red-500/40',
  ADELANTADO: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  FUERA_DE_SERVICIO: 'bg-red-700/30 text-red-200 border-red-500/60',
  SIN_HORARIO: 'bg-slate-700/40 text-slate-300 border-slate-600',
};

function fmtHora(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch {
    return iso.slice(11, 19);
  }
}

interface Props {
  idBus: string | null;
  fecha: string;
  onClose: () => void;
}

export default function CocheEventosModal({ idBus, fecha, onClose }: Props) {
  const [data, setData] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<string>('problemáticos');
  const [filtroLinea, setFiltroLinea] = useState<string>('');

  useEffect(() => {
    if (!idBus) return;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const estadosParam = filtroEstado === 'todos' ? 'todos' : '';
        const res = await apiClient.get<FeedResponse>(
          `/api/cumplimiento/coche/${encodeURIComponent(idBus)}/eventos`,
          { query: { fecha, ...(estadosParam ? { estados: estadosParam } : {}) } },
        );
        const d = (res as unknown as FeedResponse) ?? res.data;
        setData(d ?? null);
      } catch (e) {
        setError('No se pudo cargar el detalle: ' + String(e).slice(0, 120));
      } finally {
        setLoading(false);
      }
    })();
  }, [idBus, fecha, filtroEstado]);

  if (!idBus) return null;

  const eventos = (data?.eventos ?? []).filter((e) => {
    if (filtroLinea && String(e.linea ?? '') !== filtroLinea) return false;
    return true;
  });

  const lineasUnicas = Array.from(new Set((data?.eventos ?? []).map((e) => e.linea ?? '—')));

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[2100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-purple-500/40 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl shadow-purple-900/30"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-start justify-between bg-gradient-to-r from-purple-950/40 to-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <Bus className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                Detalle de atrasos · Coche {idBus}
              </h2>
              <p className="text-xs text-slate-400">
                Fecha: <span className="font-mono">{fecha}</span> · {data?.total ?? 0} eventos · {lineasUnicas.length} línea(s)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-1.5 rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filtros */}
        <div className="px-6 py-3 border-b border-slate-800 bg-slate-950/40 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-500">Eventos:</span>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white"
            >
              <option value="problemáticos">Solo ATRASADO / ADELANTADO / FDS</option>
              <option value="todos">Todos los pings GPS del día</option>
            </select>
          </div>
          {lineasUnicas.length > 1 && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500">Línea:</span>
              <select
                value={filtroLinea}
                onChange={(e) => setFiltroLinea(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white"
              >
                <option value="">Todas</option>
                {lineasUnicas.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
          {loading && (
            <div className="text-center text-slate-500 py-8">
              <Activity className="w-5 h-5 animate-spin mx-auto mb-2" />
              Cargando eventos del coche…
            </div>
          )}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {error}
            </div>
          )}

          {!loading && data && (
            <>
              {/* Resumen por línea */}
              {data.resumenPorLinea.length > 0 && (
                <div>
                  <h3 className="text-xs uppercase tracking-wide text-slate-400 font-bold mb-2">
                    Resumen por línea operada
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {data.resumenPorLinea.map((r) => (
                      <div
                        key={r.linea}
                        onClick={() => setFiltroLinea((p) => (p === r.linea ? '' : r.linea))}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${filtroLinea === r.linea ? 'bg-purple-500/15 border-purple-500/40' : 'bg-slate-800/40 border-slate-700 hover:bg-slate-800/70'}`}
                        title="Click para filtrar por esta línea"
                      >
                        <div className="text-xs text-slate-500">Línea</div>
                        <div className="text-2xl font-bold text-white">L{r.linea}</div>
                        <div className="text-[10px] text-slate-400 mt-1 space-y-0.5">
                          <div><span className="text-purple-300 font-bold">{r.eventos}</span> eventos</div>
                          <div>Desv máx: <span className="text-red-300 font-mono">{r.desviacionMaxMin} min</span></div>
                          <div className="truncate">Estado: <span className="text-amber-300">{r.estadoMasFrecuente}</span></div>
                          {r.ultimaParada && (
                            <div className="truncate text-[9px] text-slate-500" title={r.ultimaParada}>
                              ↳ {r.ultimaParada}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tabla cronológica de eventos */}
              <div>
                <h3 className="text-xs uppercase tracking-wide text-slate-400 font-bold mb-2 flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  Cronología detallada ({eventos.length} mostrados)
                </h3>
                {eventos.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    Sin eventos en el rango/filtros actuales.
                  </div>
                ) : (
                  <div className="bg-slate-950/40 rounded-lg overflow-hidden border border-slate-800">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-900 text-slate-500 uppercase text-[10px]">
                        <tr>
                          <th className="px-3 py-2 text-left">Hora</th>
                          <th className="px-3 py-2 text-left">Línea</th>
                          <th className="px-3 py-2 text-left">Sentido</th>
                          <th className="px-3 py-2 text-left">Parada / destino</th>
                          <th className="px-3 py-2 text-left">Estado</th>
                          <th className="px-3 py-2 text-right">Desv. (min)</th>
                          <th className="px-3 py-2 text-right">Vel. (km/h)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {eventos.map((e) => (
                          <tr key={e.id} className="hover:bg-slate-800/30">
                            <td className="px-3 py-1.5 font-mono text-white">{fmtHora(e.timestamp)}</td>
                            <td className="px-3 py-1.5 font-bold text-blue-300">L{e.linea ?? '—'}</td>
                            <td className="px-3 py-1.5 text-slate-400 text-[10px]">{e.sentido ?? '—'}</td>
                            <td className="px-3 py-1.5 text-slate-300 max-w-xs truncate flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                              <span title={e.proximaParada ?? e.destino ?? ''}>
                                {e.proximaParada ?? e.destino ?? '—'}
                              </span>
                            </td>
                            <td className="px-3 py-1.5">
                              <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded border ${ESTADO_COLOR[e.estado ?? ''] ?? 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                                {e.estado ?? '?'}
                              </span>
                            </td>
                            <td className={`px-3 py-1.5 text-right font-mono font-bold ${e.desviacionMin == null ? 'text-slate-500' : Math.abs(e.desviacionMin) <= 3 ? 'text-emerald-400' : Math.abs(e.desviacionMin) <= 8 ? 'text-amber-300' : 'text-red-400'}`}>
                              {e.desviacionMin == null ? '—' : `${e.desviacionMin > 0 ? '+' : ''}${Number(e.desviacionMin).toFixed(1)}`}
                            </td>
                            <td className="px-3 py-1.5 text-right text-slate-400 font-mono">{e.velocidad == null ? '—' : Number(e.velocidad).toFixed(0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500 bg-slate-950/40">
          <span>Fuente: <code className="bg-slate-800 px-1.5 py-0.5 rounded">vehicle_events</code> · GPS oficial IMM</span>
          <button onClick={onClose} className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold border border-slate-700">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
