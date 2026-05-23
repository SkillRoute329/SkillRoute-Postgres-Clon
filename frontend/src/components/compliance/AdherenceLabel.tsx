/**
 * AdherenceLabel — etiqueta de schedule adherence
 *
 * FASE 5.14 (2026-05-13): standard internacional (TCRP 165 / WMATA /
 * LA Metro / Swiftly Onboard App) — un valor de adherencia SIEMPRE se
 * muestra con label literal ("Adelantado X min" / "Atrasado X min" /
 * "En tiempo"), no como un numero con signo aislado.
 *
 * Convencion de signo: positiva = ATRASADO, negativa = ADELANTADO.
 * Ventana on-time por defecto: [-1, +5] min (WMATA / LA Metro).
 */

import React from 'react';

export interface AdherenceLabelProps {
  /** Desviacion en minutos. POSITIVA = atrasado, NEGATIVA = adelantado. null = sin horario. */
  desviacionMin: number | null | undefined;
  /** Ventana on-time inferior (default -1). */
  earlyThreshold?: number;
  /** Ventana on-time superior (default +5). */
  lateThreshold?: number;
  /** Mostrar tambien el numero (default true). */
  showValue?: boolean;
  /** Compacto (sin label texto, solo numero coloreado). */
  compact?: boolean;
}

function fmtMin(absMin: number): string {
  if (absMin < 1) return '< 1 min';
  if (absMin < 60) return `${Math.round(absMin)} min`;
  const h = Math.floor(absMin / 60);
  const m = Math.round(absMin % 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export function classifyAdherence(
  desviacionMin: number | null | undefined,
  earlyThreshold = -1,
  lateThreshold = 5,
): 'sinHorario' | 'adelantado' | 'enTiempo' | 'atrasado' {
  if (desviacionMin == null || !isFinite(desviacionMin)) return 'sinHorario';
  if (desviacionMin > lateThreshold) return 'atrasado';
  if (desviacionMin < earlyThreshold) return 'adelantado';
  return 'enTiempo';
}

const STYLES = {
  sinHorario: { color: 'text-slate-500',   label: 'Sin horario' },
  adelantado: { color: 'text-amber-400',   label: 'Adelantado'  },
  enTiempo:   { color: 'text-emerald-400', label: 'En tiempo'   },
  atrasado:   { color: 'text-red-400',     label: 'Atrasado'    },
} as const;

const AdherenceLabel: React.FC<AdherenceLabelProps> = ({
  desviacionMin,
  earlyThreshold = -1,
  lateThreshold = 5,
  showValue = true,
  compact = false,
}) => {
  const cls = classifyAdherence(desviacionMin, earlyThreshold, lateThreshold);
  const s = STYLES[cls];
  const abs = desviacionMin != null && isFinite(desviacionMin) ? Math.abs(desviacionMin) : null;

  if (cls === 'sinHorario') {
    return <span className={`${s.color} text-xs`}>{s.label}</span>;
  }

  if (compact) {
    return (
      <span className={`${s.color} text-xs font-semibold`} title={`${s.label}${abs != null ? ` ${fmtMin(abs)}` : ''}`}>
        {cls === 'adelantado' ? '−' : cls === 'atrasado' ? '+' : ''}
        {abs != null ? fmtMin(abs) : '—'}
      </span>
    );
  }

  return (
    <span className={`${s.color} text-xs font-semibold inline-flex items-center gap-1`}>
      <span>{s.label}</span>
      {showValue && abs != null && cls !== 'enTiempo' && (
        <span className="font-normal opacity-80">{fmtMin(abs)}</span>
      )}
    </span>
  );
};

export default AdherenceLabel;
