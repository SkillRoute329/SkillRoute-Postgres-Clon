// Hook de política de mínimos — Decisión 2 del spec
// SPEC_CUMPLIMIENTO_V2_FRONTEND_2026_05.md §7.2

import { useMemo } from 'react';

export type ThresholdState = 'OK' | 'OK_PROVISIONAL' | 'INSUFICIENTE' | 'COBERTURA_BAJA';
export type BadgeColor = 'green' | 'amber' | 'red' | 'gray';

export interface MetricThresholdResult {
  state: ThresholdState;
  badgeColor: BadgeColor;
  showValue: boolean;
  showIC: boolean;
  message: string;
}

interface Params {
  value: number | null;
  n: number;
  coverage: number;    // 0..1
  meta?: number;       // umbral contractual (mismo unit que value)
  higherIsBetter?: boolean; // true para OTP/SD, false para EWT
}

export function useMetricThreshold(p: Params): MetricThresholdResult {
  return useMemo(() => {
    if (p.coverage < 0.7) {
      return {
        state: 'COBERTURA_BAJA',
        badgeColor: 'gray',
        showValue: false,
        showIC: false,
        message: `Cobertura GPS insuficiente (${Math.round(p.coverage * 100)} %)`,
      };
    }

    if (p.n < 30) {
      return {
        state: 'INSUFICIENTE',
        badgeColor: 'gray',
        showValue: false,
        showIC: false,
        message: `Datos insuficientes (n=${p.n})`,
      };
    }

    if (p.n < 200) {
      return {
        state: 'OK_PROVISIONAL',
        badgeColor: 'amber',
        showValue: true,
        showIC: true,
        message: `n=${p.n.toLocaleString('es-UY')} — IC95 visible`,
      };
    }

    // n >= 200
    if (p.meta != null && p.value != null) {
      const meetsTarget = p.higherIsBetter !== false
        ? p.value >= p.meta
        : p.value <= p.meta;

      return {
        state: 'OK',
        badgeColor: meetsTarget ? 'green' : 'red',
        showValue: true,
        showIC: true,
        message: meetsTarget
          ? `Cumple meta (${p.meta})`
          : `No cumple meta (${p.meta})`,
      };
    }

    return {
      state: 'OK',
      badgeColor: 'gray',
      showValue: true,
      showIC: true,
      message: `n=${p.n.toLocaleString('es-UY')}`,
    };
  }, [p.value, p.n, p.coverage, p.meta, p.higherIsBetter]);
}
