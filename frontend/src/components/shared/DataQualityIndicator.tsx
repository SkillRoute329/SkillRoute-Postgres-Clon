// Indicador de calidad de datos GPS — variant banner o inline
// SPEC_CUMPLIMIENTO_V2_FRONTEND_2026_05.md §5.3

import { AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Props {
  coverage: number;           // 0..100
  n?: number;
  excludedDays?: string[];
  threshold?: number;         // default 70
  variant?: 'inline' | 'banner';
  className?: string;
}

export default function DataQualityIndicator({
  coverage,
  n,
  excludedDays = [],
  threshold = 70,
  variant = 'banner',
  className = '',
}: Props) {
  const pct = Math.round(coverage);
  const ok = pct >= threshold;
  const filled = Math.round((pct / 100) * 10);

  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs ${ok ? 'text-emerald-400' : 'text-amber-400'} ${className}`}>
        {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
        Cobertura GPS: {pct} %
      </span>
    );
  }

  return (
    <div className={`rounded-xl border px-4 py-3 space-y-2 ${ok ? 'border-slate-700/50 bg-slate-900/60' : 'border-amber-500/30 bg-amber-500/5'} ${className}`}>
      <div className="flex items-center gap-2">
        {ok
          ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          : <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        }
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Barra de progreso */}
          <div className="flex gap-0.5">
            {Array.from({ length: 10 }, (_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-sm ${i < filled ? (ok ? 'bg-emerald-500' : 'bg-amber-500') : 'bg-slate-700'}`}
              />
            ))}
          </div>
          <span className={`font-bold text-sm tabular-nums ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>
            Cobertura GPS: {pct} %
          </span>
          <span className="text-xs text-slate-500">(umbral mínimo {threshold} %)</span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500 pl-6">
        {n != null && <span>n = {n.toLocaleString('es-UY')} eventos</span>}
        {excludedDays.length > 0 && (
          <span>
            {excludedDays.length} día{excludedDays.length > 1 ? 's' : ''} excluido{excludedDays.length > 1 ? 's' : ''} (paro{excludedDays.length > 1 ? 's' : ''})
          </span>
        )}
      </div>

      {!ok && (
        <p className="text-xs text-amber-400/80 pl-6">
          ⚠ Cobertura por debajo del umbral — las métricas de este período pueden no ser publicables.
        </p>
      )}
    </div>
  );
}
