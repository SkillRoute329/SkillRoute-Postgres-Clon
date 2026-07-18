/**
 * TrafficAlertsBanner.tsx — Módulo 10: Motor de Alertas de Tráfico Vacante
 * ─────────────────────────────────────────────────────────────────────────
 * Banner de alta prioridad para el panel del despachador.
 * Consulta /api/traffic-alerts cada 30 segundos.
 * Si hay alertas CRITICO no resueltas → muestra banner rojo parpadeante.
 *
 * Se puede incrustar en cualquier layout de tráfico:
 *   <TrafficAlertsBanner />
 */

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, X, CheckCircle, RefreshCw, Radio } from 'lucide-react';
import api from '../services/api';
import clsx from 'clsx';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface TrafficAlert {
  id: string;
  agency_id: string;
  linea_id: string | null;
  servicio_id: string | null;
  tipo_alerta: string;
  nivel_gravedad: 'CRITICO' | 'ALTO' | 'MEDIO' | 'INFO';
  mensaje: string;
  driver_ausente_id: string | null;
  reten_asignado_id: string | null;
  resuelta: boolean;
  created_at: string;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000; // polling cada 30 s

// ── Componente ────────────────────────────────────────────────────────────────

const TrafficAlertsBanner = () => {
  const [alertas, setAlertas]       = useState<TrafficAlert[]>([]);
  const [loading, setLoading]       = useState(false);
  const [lastPoll, setLastPoll]     = useState<Date | null>(null);
  const [collapsed, setCollapsed]   = useState(false);
  const [resolviendo, setResolviendo] = useState<Set<string>>(new Set());

  const fetchAlertas = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<{ ok: boolean; alertas: TrafficAlert[] }>(
        '/api/traffic-alerts?resuelta=false'
      );
      const data = (res.data as any)?.alertas ?? (res as any)?.alertas ?? [];
      setAlertas(data);
      setLastPoll(new Date());
    } catch (err) {
      console.error('[TrafficAlertsBanner] Error al consultar alertas:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll inicial + periódico
  useEffect(() => {
    fetchAlertas();
    const interval = setInterval(fetchAlertas, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchAlertas]);

  const resolverAlerta = async (id: string) => {
    setResolviendo((prev) => new Set(prev).add(id));
    try {
      await api.patch(`/api/traffic-alerts/${id}/resolver`, {});
      setAlertas((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error('[TrafficAlertsBanner] Error al resolver alerta:', err);
    } finally {
      setResolviendo((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // Si no hay alertas, no renderizar nada
  if (alertas.length === 0) return null;

  const criticas = alertas.filter((a) => a.nivel_gravedad === 'CRITICO');
  const hayCriticas = criticas.length > 0;

  return (
    <div
      className={clsx(
        'fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-2xl px-4',
        'transition-all duration-300'
      )}
      role="alert"
      aria-live="assertive"
    >
      {/* ── Barra de título parpadeante ─────────────────────────────────── */}
      <div
        className={clsx(
          'rounded-t-xl border px-4 py-3 flex items-center justify-between cursor-pointer select-none',
          hayCriticas
            ? 'bg-red-950 border-red-500 animate-pulse'
            : 'bg-amber-950 border-amber-500'
        )}
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-3">
          <Radio
            className={clsx(
              'w-5 h-5 shrink-0',
              hayCriticas ? 'text-red-400 animate-ping' : 'text-amber-400'
            )}
          />
          <span
            className={clsx(
              'font-bold text-sm uppercase tracking-wider',
              hayCriticas ? 'text-red-300' : 'text-amber-300'
            )}
          >
            {hayCriticas
              ? `⚠ ${criticas.length} VACANTE${criticas.length > 1 ? 'S' : ''} CRÍTICA${criticas.length > 1 ? 'S' : ''} SIN RETÉN`
              : `${alertas.length} Alerta${alertas.length > 1 ? 's' : ''} de Tráfico`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {loading && <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />}
          {lastPoll && (
            <span className="text-xs text-slate-500 hidden sm:block">
              {lastPoll.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            className="text-slate-400 hover:text-white transition-colors ml-2"
            onClick={(e) => { e.stopPropagation(); setCollapsed((c) => !c); }}
            aria-label={collapsed ? 'Expandir alertas' : 'Colapsar alertas'}
          >
            {collapsed ? '▼' : '▲'}
          </button>
        </div>
      </div>

      {/* ── Lista de alertas ────────────────────────────────────────────── */}
      {!collapsed && (
        <div className="rounded-b-xl border-x border-b border-red-900/60 bg-slate-950/95 backdrop-blur-sm divide-y divide-slate-800 max-h-72 overflow-y-auto shadow-2xl shadow-red-950/50">
          {alertas.map((alerta) => {
            const esCritica = alerta.nivel_gravedad === 'CRITICO';
            return (
              <div
                key={alerta.id}
                className={clsx(
                  'px-4 py-3 flex items-start gap-3',
                  esCritica ? 'bg-red-950/40' : 'bg-slate-900/50'
                )}
              >
                <AlertTriangle
                  className={clsx(
                    'w-5 h-5 shrink-0 mt-0.5',
                    esCritica ? 'text-red-400' : 'text-amber-400'
                  )}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={clsx(
                        'text-xs font-bold px-2 py-0.5 rounded-full border',
                        esCritica
                          ? 'bg-red-500/20 text-red-300 border-red-500/40'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      )}
                    >
                      {alerta.nivel_gravedad}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      {alerta.tipo_alerta}
                    </span>
                    {alerta.linea_id && (
                      <span className="text-xs text-blue-400 font-semibold">
                        Línea {alerta.linea_id}
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                    {alerta.mensaje}
                  </p>

                  <p className="text-xs text-slate-600 mt-1">
                    {new Date(alerta.created_at).toLocaleString('es-UY')}
                  </p>
                </div>

                {/* Botón Resolver */}
                <button
                  onClick={() => resolverAlerta(alerta.id)}
                  disabled={resolviendo.has(alerta.id)}
                  className={clsx(
                    'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold',
                    'border transition-all',
                    resolviendo.has(alerta.id)
                      ? 'opacity-50 cursor-not-allowed border-slate-700 text-slate-500'
                      : 'border-emerald-600 text-emerald-400 hover:bg-emerald-500/10'
                  )}
                  title="Marcar como gestionada"
                >
                  {resolviendo.has(alerta.id)
                    ? <RefreshCw className="w-3 h-3 animate-spin" />
                    : <CheckCircle className="w-3 h-3" />
                  }
                  {resolviendo.has(alerta.id) ? 'Resolviendo…' : 'Gestionar'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TrafficAlertsBanner;
