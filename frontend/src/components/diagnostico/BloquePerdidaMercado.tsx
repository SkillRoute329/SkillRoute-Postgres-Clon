import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { Bloque1Result, CorredorRiesgo } from '../../services/diagnosticoEjecutivoService';

interface Props { data: Bloque1Result; }

function TendenciaIcon({ t }: { t: CorredorRiesgo['tendencia'] }) {
  if (t === 'perdiendo') return <TrendingDown className="w-4 h-4 text-red-400" />;
  if (t === 'ganando') return <TrendingUp className="w-4 h-4 text-emerald-400" />;
  return <Minus className="w-4 h-4 text-slate-400" />;
}

function CorredorRow({ c, modo }: { c: CorredorRiesgo; modo: 'riesgo' | 'oportunidad' }) {
  const deltaColor = modo === 'riesgo' ? 'text-red-400' : 'text-emerald-400';
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-800 last:border-0">
      <TendenciaIcon t={c.tendencia} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200">
          L{c.lineaPropia} <span className="text-slate-500">{c.sentidoPropio}</span>
          <span className="text-slate-500 mx-1">vs</span>
          {c.empresaRival} L{c.lineaRival}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
          <span className="text-xs text-slate-400">
            Share: <span className="font-semibold text-slate-200">{c.shareActual}%</span>
            {c.shareAnterior !== null && (
              <span className={`ml-1 font-bold ${deltaColor}`}>
                ({c.delta !== null && c.delta > 0 ? '+' : ''}{c.delta ?? '—'} pts)
              </span>
            )}
          </span>
          <span className="text-xs text-slate-400">{c.sharedKm.toFixed(1)} km compartidos</span>
          {c.pasajerosEstimados !== null && (
            <span className="text-xs text-orange-400">
              ~{c.pasajerosEstimados} pas/día estimados
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BloquePerdidaMercado({ data }: Props) {
  if (data.sinDatos) {
    return (
      <p className="text-sm text-slate-400 italic py-4">
        Sin datos de corredores compartidos disponibles aún.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-300 leading-relaxed">{data.conclusion}</p>

      {data.enRiesgo.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-red-400 uppercase tracking-widest mb-2">
            Top {data.enRiesgo.length} corredores en riesgo
          </h4>
          <div className="bg-red-500/5 border border-red-500/20 rounded-lg px-4">
            {data.enRiesgo.map((c, i) => (
              <CorredorRow key={i} c={c} modo="riesgo" />
            ))}
          </div>
        </div>
      )}

      {data.ganando.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-2">
            Oportunidades (corredores ganando)
          </h4>
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-4">
            {data.ganando.map((c, i) => (
              <CorredorRow key={i} c={c} modo="oportunidad" />
            ))}
          </div>
        </div>
      )}

      {data.enRiesgo.length === 0 && data.ganando.length === 0 && (
        <p className="text-xs text-slate-500 italic">
          No se detectaron variaciones significativas (&gt;5 pts) en el período analizado.
        </p>
      )}
    </div>
  );
}
