// Política de mínimos — Decisión 2 del documento arquitectural
// SPEC_CUMPLIMIENTO_V2_BACKEND_2026_05.md §7
import { wilsonIC95 } from './wilsonIC95';

export type Badge = 'OK' | 'IC_VISIBLE' | 'INSUFFICIENT' | 'NO_COVERAGE';

export interface MetricValue {
  value: number | null;
  displayValue: string;
  unit: 'pct' | 'min' | 'ratio' | 'score' | 'km' | 'count';
  n: number;
  ic95Low: number | null;
  ic95High: number | null;
  coverageGps: number | null;
  badge: Badge;
  tipoDato: 'medido' | 'estimado' | 'calibrado' | 'referencial';
  fuente: string;
  formula: string;
  estandar: string;
}

export interface PoliticaMinimosParams {
  valorRaw: number | null;
  n: number;
  cobertura: number;
  nMinimo: number;
  cobMinima: number;
  unit: MetricValue['unit'];
  tipoDato: MetricValue['tipoDato'];
  fuente: string;
  formula: string;
  estandar: string;
}

function formatValue(val: number, unit: MetricValue['unit']): string {
  if (unit === 'pct') return `${val.toFixed(1)}%`;
  if (unit === 'min') return `${val.toFixed(1)} min`;
  if (unit === 'ratio') return val.toFixed(3);
  if (unit === 'score') return val.toFixed(1);
  return String(Math.round(val));
}

export function aplicarPoliticaMinimos(p: PoliticaMinimosParams): MetricValue {
  const base = {
    unit: p.unit,
    tipoDato: p.tipoDato,
    fuente: p.fuente,
    formula: p.formula,
    estandar: p.estandar,
  };

  if (p.cobertura < p.cobMinima) {
    return {
      ...base,
      value: null,
      displayValue: '—',
      n: p.n,
      ic95Low: null,
      ic95High: null,
      coverageGps: p.cobertura,
      badge: 'NO_COVERAGE',
    };
  }

  if (p.n < p.nMinimo) {
    return {
      ...base,
      value: null,
      displayValue: '—',
      n: p.n,
      ic95Low: null,
      ic95High: null,
      coverageGps: p.cobertura,
      badge: 'INSUFFICIENT',
    };
  }

  const val = p.valorRaw ?? 0;
  const ic = p.unit === 'pct' ? wilsonIC95(val, p.n) : null;

  if (p.n < 200) {
    return {
      ...base,
      value: val,
      displayValue: formatValue(val, p.unit),
      n: p.n,
      ic95Low: ic?.lo ?? null,
      ic95High: ic?.hi ?? null,
      coverageGps: p.cobertura,
      badge: 'IC_VISIBLE',
    };
  }

  return {
    ...base,
    value: val,
    displayValue: formatValue(val, p.unit),
    n: p.n,
    ic95Low: ic?.lo ?? null,
    ic95High: ic?.hi ?? null,
    coverageGps: p.cobertura,
    badge: 'OK',
  };
}
