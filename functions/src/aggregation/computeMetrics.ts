// Cálculo de las 12 métricas por grupo (agencyId, linea, sentido, periodo)
// Lee vehicle_events_v2 ya clasificados por el matching-engine
// SPEC_CUMPLIMIENTO_V2_BACKEND_2026_05.md §1.2, §1.3, §7
import { aplicarPoliticaMinimos, MetricValue } from './aplicarPoliticaMinimos';

export interface RawEvent {
  idBus: string;
  linea: string;
  timestampGPS: string;
  estadoCumplimiento: string | null;
  desviacionMin: number | null;
  confianzaV2: string;
  sentidoV2: string | null;
  snapDistanceMV2: number | null;
  velocidad: number;
}

export interface ScheduledTrip {
  departure_time: string; // "HH:MM:SS"
}

export interface ComputedMetrics {
  otp_low_freq: MetricValue | null;
  ewt_high_freq: MetricValue | null;
  service_delivered: MetricValue | null;
  headway_cv: MetricValue | null;
  bunching_index: MetricValue | null;
  gps_coverage: MetricValue | null;
  mdbf: MetricValue | null;
  cumpl_cronograma_coche: MetricValue | null;
  cumpl_cronograma_conductor: MetricValue | null;
  fleet_availability: MetricValue | null;
  service_reliability_score: MetricValue | null;
  dro_coverage: MetricValue | null;
}

const FUENTE_GPS = 'GPS feed STM + GTFS IMM';
const SNAP_MAX_M = 80;

// ── Helpers ───────────────────────────────────────────────────────────────────

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function medianSorted(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Secuencia de headways aproximada: primera aparición de cada bus en (linea, sentido),
// ordenada por timestamp → deltas = headways al terminal. Filtra gaps > 90 min.
function computeHeadways(events: RawEvent[]): number[] {
  const firstByBus = new Map<string, number>();
  for (const ev of events) {
    const ts = new Date(ev.timestampGPS).getTime();
    if (!isNaN(ts)) {
      const prev = firstByBus.get(ev.idBus);
      if (prev === undefined || ts < prev) firstByBus.set(ev.idBus, ts);
    }
  }
  const times = Array.from(firstByBus.values()).sort((a, b) => a - b);
  const headways: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const h = (times[i] - times[i - 1]) / 60000;
    if (h > 0 && h < 90) headways.push(h);
  }
  return headways;
}

// Convierte "HH:MM:SS" a minutos desde medianoche
function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (isNaN(h) || isNaN(m)) ? NaN : h * 60 + m;
}

// AWT: E[W] = sum(h²) / (2·sum(h)) — UITP / TfL EWT methodology
function awt(headways: number[]): number {
  if (headways.length === 0) return 0;
  const sumH = headways.reduce((a, b) => a + b, 0);
  const sumH2 = headways.reduce((a, b) => a + b * b, 0);
  return sumH > 0 ? sumH2 / (2 * sumH) : 0;
}

// ── Función principal ─────────────────────────────────────────────────────────

export function computeMetrics(
  events: RawEvent[],
  scheduledTrips: ScheduledTrip[],
  coverageGps: number,           // % cobertura GPS global de la línea-sentido-día
  totalTripsScheduled?: number,  // viajes programados según GTFS (opcional)
): ComputedMetrics {

  const n = events.length;

  // ── gps_coverage ────────────────────────────────────────────────────────────
  const validSnap = events.filter(
    e => e.confianzaV2 !== 'ZERO' && e.snapDistanceMV2 !== null && e.snapDistanceMV2 <= SNAP_MAX_M,
  );
  const gpsCovPct = n > 0 ? (validSnap.length / n) * 100 : 0;

  const gps_coverage: MetricValue = aplicarPoliticaMinimos({
    valorRaw: gpsCovPct,
    n,
    cobertura: 100,
    nMinimo: 1,
    cobMinima: 0,
    unit: 'pct',
    tipoDato: 'medido',
    fuente: 'GPS feed STM',
    formula: 'count(confianzaV2≠ZERO && snapDist≤80m) / totalEventos * 100',
    estandar: 'TfL Data Quality Indicator',
  });

  // ── otp_low_freq ────────────────────────────────────────────────────────────
  const evConHorario = events.filter(
    e => e.estadoCumplimiento &&
         !['SIN_HORARIO', 'FUERA_DE_SERVICIO', 'SIN_MATCH'].includes(e.estadoCumplimiento),
  );
  const evATiempo = evConHorario.filter(
    e => e.desviacionMin !== null && Math.abs(e.desviacionMin) <= 4,
  );
  const nOtp = evConHorario.length;
  const otpPct = nOtp > 0 ? (evATiempo.length / nOtp) * 100 : 0;

  const otp_low_freq: MetricValue = aplicarPoliticaMinimos({
    valorRaw: nOtp > 0 ? otpPct : null,
    n: nOtp,
    cobertura: coverageGps,
    nMinimo: 30,
    cobMinima: 70,
    unit: 'pct',
    tipoDato: 'medido',
    fuente: FUENTE_GPS,
    formula: 'count(|desvMin|≤4 && estadoCumpl∉{SIN_HORARIO,FUERA_DE_SERVICIO}) / n * 100',
    estandar: 'TCRP 165 §4.4.2 / POLITICA_OTP_UNIFICADA.md',
  });

  // ── headways observados ─────────────────────────────────────────────────────
  const headwaysObs = computeHeadways(events);
  const meanHobs = headwaysObs.length > 0
    ? headwaysObs.reduce((a, b) => a + b, 0) / headwaysObs.length
    : 0;

  // isHighFreq: usar GTFS como fuente primaria (>= 5 viajes/hora equivale a headway ≤ 12 min)
  // Fallback: headway observado cuando hay suficiente datos GPS
  const gtfsHeadwayMin = scheduledTrips.length >= 2
    ? (() => {
        const times = scheduledTrips
          .map(t => { const [h, m] = t.departure_time.split(':').map(Number); return isNaN(h) ? NaN : h * 60 + m; })
          .filter(t => !isNaN(t))
          .sort((a, b) => a - b);
        const gaps = times.slice(1).map((t, i) => t - times[i]).filter(g => g > 0 && g < 90);
        return gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : Infinity;
      })()
    : Infinity;
  const isHighFreq = gtfsHeadwayMin <= 12 || (meanHobs > 0 && meanHobs <= 12);

  // ── headway_cv ──────────────────────────────────────────────────────────────
  let headway_cv: MetricValue | null = null;
  if (headwaysObs.length >= 5) {
    const cv = meanHobs > 0 ? stddev(headwaysObs) / meanHobs : 0;
    headway_cv = aplicarPoliticaMinimos({
      valorRaw: cv,
      n: headwaysObs.length,
      cobertura: coverageGps,
      nMinimo: 5,
      cobMinima: 70,
      unit: 'ratio',
      tipoDato: 'medido',
      fuente: FUENTE_GPS,
      formula: 'stdev(headways_obs) / mean(headways_obs)',
      estandar: 'TCRP 88 / TCRP 165 §4',
    });
  }

  // ── bunching_index ──────────────────────────────────────────────────────────
  let bunching_index: MetricValue | null = null;
  if (headwaysObs.length >= 5) {
    const sorted = [...headwaysObs].sort((a, b) => a - b);
    const medH = medianSorted(sorted);
    const bunched = headwaysObs.filter(h => h < 0.5 * medH).length;
    const bunchPct = (bunched / headwaysObs.length) * 100;
    bunching_index = aplicarPoliticaMinimos({
      valorRaw: bunchPct,
      n: headwaysObs.length,
      cobertura: coverageGps,
      nMinimo: 5,
      cobMinima: 70,
      unit: 'pct',
      tipoDato: 'medido',
      fuente: FUENTE_GPS,
      formula: 'count(h_i < 0.5·mediana_h) / n * 100',
      estandar: 'NYC MTA Bunching Index / Transport Reviews 2024',
    });
  }

  // ── ewt_high_freq (solo líneas alta frecuencia) ─────────────────────────────
  let ewt_high_freq: MetricValue | null = null;
  if (isHighFreq && headwaysObs.length >= 5 && scheduledTrips.length >= 3) {
    const depTimes = scheduledTrips
      .map(t => timeToMin(t.departure_time))
      .filter(m => !isNaN(m))
      .sort((a, b) => a - b);

    const headwaysProg = depTimes.length > 1
      ? depTimes.slice(1).map((t, i) => t - depTimes[i]).filter(h => h > 0 && h < 90)
      : [];

    if (headwaysProg.length >= 3) {
      const ewt = Math.max(0, awt(headwaysObs) - awt(headwaysProg));
      ewt_high_freq = aplicarPoliticaMinimos({
        valorRaw: ewt,
        n: headwaysObs.length,
        cobertura: coverageGps,
        nMinimo: 5,
        cobMinima: 70,
        unit: 'min',
        tipoDato: 'medido',
        fuente: FUENTE_GPS,
        formula: 'max(0, AWT_obs − AWT_prog)  [AWT = sum(h²)/(2·sum(h))]',
        estandar: 'TfL EWT methodology / UITP',
      });
    }
  }

  // ── service_reliability_score (composite — cuando OTP + CV + GPS disponibles) ─
  let service_reliability_score: MetricValue | null = null;
  const otpVal = otp_low_freq?.value;
  const cvVal = headway_cv?.value;
  const gpsVal = gps_coverage?.value;

  if (otpVal !== null && otpVal !== undefined &&
      cvVal !== null && cvVal !== undefined &&
      gpsVal !== null && gpsVal !== undefined) {
    const cvNorm = Math.max(0, 100 - Math.min(1, cvVal) * 100);
    const score = 0.40 * otpVal + 0.25 * cvNorm + 0.35 * gpsVal;
    const nComp = Math.min(nOtp, headwaysObs.length);

    service_reliability_score = aplicarPoliticaMinimos({
      valorRaw: score,
      n: nComp,
      cobertura: coverageGps,
      nMinimo: 5,
      cobMinima: 70,
      unit: 'score',
      tipoDato: 'calibrado',
      fuente: 'Composite SkillRoute (TfL Service Delivery method)',
      formula: '0.40·OTP + 0.25·(100−norm(CV)) + 0.35·GPSCov',
      estandar: 'TfL Service Delivery composite',
    });
  }

  // ── service_delivered (aproximación: eventos no FUERA_DE_SERVICIO / viajes programados) ─
  let service_delivered: MetricValue | null = null;
  if (totalTripsScheduled && totalTripsScheduled > 0) {
    const evOperados = events.filter(
      e => e.estadoCumplimiento && e.estadoCumplimiento !== 'FUERA_DE_SERVICIO',
    );
    // Aproximación: un viaje ~= 1 bus circulando en la ventana del día
    const uniqueBuses = new Set(evOperados.map(e => e.idBus)).size;
    const pctDel = Math.min(100, (uniqueBuses / totalTripsScheduled) * 100);
    service_delivered = aplicarPoliticaMinimos({
      valorRaw: pctDel,
      n: uniqueBuses,
      cobertura: coverageGps,
      nMinimo: 1,
      cobMinima: 70,
      unit: 'pct',
      tipoDato: 'estimado',
      fuente: FUENTE_GPS,
      formula: 'buses_únicos_operados / viajes_programados_GTFS * 100 (aprox.)',
      estandar: 'TCRP 165 §4.3 — Service Delivery',
    });
  }

  return {
    otp_low_freq,
    ewt_high_freq,
    service_delivered,
    headway_cv,
    bunching_index,
    gps_coverage,
    mdbf: null,                       // Requiere mantenimiento_logs (Sprint 4)
    cumpl_cronograma_coche: null,     // UCOT-only, requiere cartones (Sprint 4)
    cumpl_cronograma_conductor: null, // UCOT-only, requiere cartones (Sprint 4)
    fleet_availability: null,         // Requiere vehiculos declarados (Sprint 4)
    service_reliability_score,
    dro_coverage: null,               // Precomputado en corridor_overlap (Sprint 3)
  };
}
