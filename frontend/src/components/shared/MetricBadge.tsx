// Badge reutilizable de política de mínimos — Decisión 2
// SPEC_CUMPLIMIENTO_V2_FRONTEND_2026_05.md §5.1

import { Info } from 'lucide-react';
import type { MetricBadge as BadgeType, MetricUnit } from '../../types/compliance';

interface Props {
  value: number | null;
  unit: MetricUnit;
  n: number;
  ic95?: [number, number] | null;
  cobertura: number;         // 0..100
  badge: BadgeType;
  fuente?: 'MEDIDO' | 'ESTIMADO' | 'CALIBRADO' | 'REF';
  meta?: number;
  higherIsBetter?: boolean;
  showInline?: boolean;
  className?: string;
}

function fmt(val: number, unit: MetricUnit): string {
  if (unit === 'pct')   return `${val.toFixed(1)} %`;
  if (unit === 'min')   return `${val.toFixed(1)} min`;
  if (unit === 'ratio') return val.toFixed(3);
  if (unit === 'score') return val.toFixed(1);
  return String(Math.round(val));
}

function fmtIC(lo: number, hi: number, unit: MetricUnit): string {
  // ic95 vienen en 0-1 para pct → convertir a porcentaje
  if (unit === 'pct') return `IC95 ${(lo * 100).toFixed(1)}–${(hi * 100).toFixed(1)}`;
  return `IC95 ${lo.toFixed(2)}–${hi.toFixed(2)}`;
}

const BADGE_LABELS: Record<string, string> = {
  MEDIDO: 'MEDIDO',
  ESTIMADO: 'ESTIMADO',
  CALIBRADO: 'CALIBRADO',
  REF: 'REF.',
};

function fueneteColor(f?: string): string {
  if (f === 'MEDIDO')    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  if (f === 'ESTIMADO')  return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  if (f === 'CALIBRADO') return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
}

export default function MetricBadge({
  value, unit, n, ic95, cobertura, badge, fuente,
  meta, higherIsBetter = true, showInline = false, className = '',
}: Props) {

  // --- Estado insuficiente / cobertura baja ---
  if (badge === 'NO_COVERAGE') {
    return (
      <span className={`inline-flex items-center gap-1 text-slate-500 text-xs ${className}`}>
        <Info className="w-3 h-3" />
        Cobertura insuficiente ({Math.round(cobertura)} %)
      </span>
    );
  }

  if (badge === 'INSUFFICIENT') {
    return (
      <span className={`inline-flex items-center gap-1 text-slate-500 text-xs ${className}`}>
        <Info className="w-3 h-3" />
        Datos insuficientes (n={n})
      </span>
    );
  }

  if (value === null) {
    return <span className={`text-slate-500 text-xs ${className}`}>—</span>;
  }

  // --- Color según meta ---
  let valColor = 'text-white';
  if (meta != null) {
    const meets = higherIsBetter ? value >= meta : value <= meta;
    valColor = meets ? 'text-emerald-400' : 'text-red-400';
  } else if (badge === 'IC_VISIBLE') {
    valColor = 'text-amber-300';
  }

  const formatted = fmt(value, unit);
  const icStr = ic95 ? fmtIC(ic95[0], ic95[1], unit) : null;

  if (showInline) {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        <span className={`font-bold tabular-nums ${valColor}`}>{formatted}</span>
        {badge === 'IC_VISIBLE' && icStr && (
          <span className="text-xs text-slate-500">{icStr}</span>
        )}
        {fuente && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${fueneteColor(fuente)}`}>
            {BADGE_LABELS[fuente] ?? fuente}
          </span>
        )}
      </span>
    );
  }

  // Modo card grande
  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className={`text-2xl font-black tabular-nums ${valColor}`}>{formatted}</span>
        {fuente && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${fueneteColor(fuente)}`}>
            {BADGE_LABELS[fuente] ?? fuente}
          </span>
        )}
      </div>
      {icStr && badge !== 'OK' && (
        <p className="text-xs text-amber-400/80">{icStr}</p>
      )}
      {icStr && badge === 'OK' && (
        <p className="text-xs text-slate-500">{icStr}</p>
      )}
      <p className="text-xs text-slate-600">
        n = {n.toLocaleString('es-UY')} · cob {Math.round(cobertura)} %
      </p>
      {meta != null && (
        <p className="text-xs text-slate-500">Meta: {fmt(meta, unit)}</p>
      )}
    </div>
  );
}
