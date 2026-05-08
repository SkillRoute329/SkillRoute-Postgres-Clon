// Tipos compartidos — Módulo Cumplimiento V2
// SPEC_CUMPLIMIENTO_V2_FRONTEND_2026_05.md

export type MetricBadge = 'OK' | 'IC_VISIBLE' | 'INSUFFICIENT' | 'NO_COVERAGE';
export type MetricUnit  = 'pct' | 'min' | 'ratio' | 'score' | 'km' | 'count';
export type TipoDato    = 'medido' | 'estimado' | 'calibrado' | 'referencial';
export type Granularidad = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface MetricValue {
  value: number | null;
  displayValue: string;
  unit: MetricUnit;
  n: number;
  ic95Low: number | null;
  ic95High: number | null;
  coverageGps: number | null;
  badge: MetricBadge;
  tipoDato: TipoDato;
  fuente: string;
  formula: string;
  estandar: string;
}

export interface LineMetrics {
  otp_low_freq?: MetricValue | null;
  ewt_high_freq?: MetricValue | null;
  service_delivered?: MetricValue | null;
  headway_cv?: MetricValue | null;
  bunching_index?: MetricValue | null;
  gps_coverage?: MetricValue | null;
  service_reliability_score?: MetricValue | null;
  mdbf?: MetricValue | null;
  dro_coverage?: MetricValue | null;
}

export interface LineAggregate {
  id: string;
  agencyId: string;
  linea: string;
  sentido: string;
  periodo: string;
  granularidad: Granularidad;
  globalCoverageGps: number;
  totalEventsObserved: number;
  totalTripsScheduled: number;
  isHighFreq: boolean;
  metrics: LineMetrics;
  computedAt?: any;
}

export interface OperatorMetricSummary {
  value: number | null;
  n: number;
  ic95?: [number, number];
  badge: MetricBadge;
  applicable: boolean;
}

export interface OperatorSummary {
  agencyId: string;
  name: string;
  totalEvents: number;
  totalLines: number;
  lineCount: number;
  coverageGps: number;
  services: { value: number; type: TipoDato };
  otp: OperatorMetricSummary | null;
  ewt: OperatorMetricSummary | null;
  serviceDelivered: OperatorMetricSummary | null;
  srs: OperatorMetricSummary | null;
}

export interface RegulatoryData {
  meta: {
    period: { desde: string; hasta: string; granularidad: string };
    generatedAt: string;
    source: string;
  };
  coverage: {
    systemGps: number;
    byOperator: Record<string, number>;
  };
  operators: OperatorSummary[];
}

export interface PeriodRange {
  from: Date;
  to: Date;
  granularity: Granularidad;
}

// Labels de operadores
export const OPERATOR_NAMES: Record<string, string> = {
  '70': 'UCOT',
  '50': 'CUTCSA',
  '20': 'COME',
  '10': 'COETC',
};

export const OPERATOR_IDS = ['70', '50', '20', '10'] as const;

// Tipo de badge de cumplimiento (asimétrico por diseño)
export type CumplimientoBadge = 'PLENO' | 'GPS';

// ── Sprint 4: Vista Operador ──────────────────────────────────────────────

export type LineEstado = 'OK' | 'OK_PROVISIONAL' | 'INSUFICIENTE' | 'COBERTURA_BAJA';

export interface LineMetricSummary {
  value: number | null;
  n: number;
  badge: MetricBadge;
}

export interface LineResult {
  linea: string;
  sentido: string;
  totalEventsObserved: number;
  totalTripsScheduled: number;
  globalCoverageGps: number;
  isHighFreq: boolean;
  estado: LineEstado;
  metrics: {
    otp: LineMetricSummary | null;
    ewt: LineMetricSummary | null;
    serviceDelivered: LineMetricSummary | null;
    srs: LineMetricSummary | null;
  };
}

export interface OperatorData {
  meta: {
    agencyId: string;
    agencyName: string;
    period: { desde: string; hasta: string; granularidad: string };
    generatedAt: string;
    source: string;
  };
  coverage: {
    operatorGps: number;
    totalEvents: number;
  };
  lines: LineResult[];
}
