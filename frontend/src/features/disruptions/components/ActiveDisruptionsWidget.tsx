/**
 * ActiveDisruptionsWidget — Widget compacto para dashboards
 * Trim+ #70 (2026-04-23)
 *
 * Muestra disrupciones activas con severidad, útil para CEODashboard
 * o cualquier vista ejecutiva. Click lleva a la página completa.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronRight, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { subscribeActiveDisruptions } from '../services/disruptionsService';
import {
  type Disruption,
  type DisruptionSeverity,
  severityEmoji,
} from '../schemas/disruption';
import { formatRelativoMvd } from '../../../utils/formatTimestamp';

const SEV_ORDER: Record<DisruptionSeverity, number> = {
  CRITICAL: 0,
  MAJOR: 1,
  MODERATE: 2,
  MINOR: 3,
};

const SEV_BG: Record<DisruptionSeverity, string> = {
  CRITICAL: 'bg-red-500/15 border-red-500/40 text-red-400',
  MAJOR: 'bg-orange-500/15 border-orange-500/40 text-orange-400',
  MODERATE: 'bg-amber-500/15 border-amber-500/40 text-amber-400',
  MINOR: 'bg-slate-500/10 border-slate-500/30 text-slate-400',
};

interface Props {
  /** Máximo de disrupciones visibles (default 5) */
  max?: number;
  /** Operador para filtrar (multi-tenant futuro). Vacío = todos. */
  operadorId?: string;
  /** Clase Tailwind extra para el contenedor */
  className?: string;
}

export default function ActiveDisruptionsWidget({ max = 5, operadorId, className = '' }: Props) {
  const [list, setList] = useState<Disruption[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = subscribeActiveDisruptions(
      (data) => {
        // Ordenar por severidad primero, luego por fecha (más reciente primero)
        const sorted = [...data].sort((a, b) => {
          const sev = SEV_ORDER[a.severidad] - SEV_ORDER[b.severidad];
          if (sev !== 0) return sev;
          const toMs = (x: any) =>
            typeof x?.toMillis === 'function' ? x.toMillis() : typeof x?.seconds === 'number' ? x.seconds * 1000 : 0;
          return toMs(b.createdAt) - toMs(a.createdAt);
        });
        setList(sorted);
        setLoading(false);
      },
      { operadorId, maxItems: 50 },
    );
    return () => unsub();
  }, [operadorId]);

  const critical = list.filter((d) => d.severidad === 'CRITICAL').length;
  const displayed = list.slice(0, max);

  if (loading) {
    return (
      <div
        className={`rounded-2xl border border-white/[0.06] bg-slate-900/60 p-4 ${className}`}
        role="status"
      >
        <div className="animate-pulse h-5 bg-slate-800/70 rounded w-32 mb-3" />
        <div className="animate-pulse h-4 bg-slate-800/50 rounded w-48" />
      </div>
    );
  }

  // Estado operación normal — sin disrupciones
  if (list.length === 0) {
    return (
      <button
        onClick={() => navigate('/dashboard/admin/disruptions')}
        className={`w-full text-left rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 hover:border-emerald-500/40 transition-colors ${className}`}
        aria-label="Sin disrupciones activas"
      >
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <div className="flex-1">
            <p className="text-sm font-bold text-emerald-300">Operación normal</p>
            <p className="text-xs text-emerald-400/70 mt-0.5">Sin disrupciones activas</p>
          </div>
          <ChevronRight className="w-4 h-4 text-emerald-400/50" />
        </div>
      </button>
    );
  }

  return (
    <div className={`rounded-2xl border border-white/[0.06] bg-slate-900/60 overflow-hidden ${className}`}>
      <button
        onClick={() => navigate('/dashboard/admin/disruptions')}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className={`w-5 h-5 ${critical > 0 ? 'text-red-500' : 'text-amber-400'}`} />
          <div className="text-left">
            <p className="text-sm font-bold text-white">
              {list.length} disrupción{list.length !== 1 ? 'es' : ''} activa{list.length !== 1 ? 's' : ''}
            </p>
            {critical > 0 && (
              <p className="text-xs text-red-400 font-bold mt-0.5">
                {critical} crítica{critical !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-500" />
      </button>
      <div className="border-t border-white/[0.04] divide-y divide-white/[0.04]">
        {displayed.map((d) => (
          <button
            key={d.id}
            onClick={() => navigate('/dashboard/admin/disruptions')}
            className={`w-full text-left px-4 py-2.5 hover:bg-white/[0.02] transition-colors border-l-2 ${SEV_BG[d.severidad]}`}
          >
            <div className="flex items-start gap-2">
              <span className="text-base leading-none mt-0.5">{severityEmoji(d.severidad)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">{d.titulo}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {d.lineasAfectadas?.length ? `L${d.lineasAfectadas.join(', L')}` : 'Toda la red'}
                  {' · '}
                  {formatRelativoMvd(d.createdAt)}
                </p>
              </div>
            </div>
          </button>
        ))}
        {list.length > max && (
          <button
            onClick={() => navigate('/dashboard/admin/disruptions')}
            className="w-full text-xs text-slate-500 hover:text-primary-400 py-2 text-center"
          >
            Ver todas ({list.length - max} más)
          </button>
        )}
      </div>
    </div>
  );
}
