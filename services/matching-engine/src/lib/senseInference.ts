// Algoritmo §5 SPEC_CUMPLIMIENTO_V2_BACKEND_2026_05.md
// Snap-to-shape + bayesiano (bearing + destinoDesc) + histéresis
import { Feature, LineString } from '@turf/helpers';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import { point } from '@turf/helpers';

import { GpsEvent, Shape, Sentido, Confianza, SnapCandidate, SenseInferResult } from '../types';
import {
  angularDiff,
  computeTangentAtSnap,
  pointsToGeoJSON,
  fuzzyMatch,
} from './turfHelpers';

export const ALGO_VERSION = 'matching-v1.0.0';

const SNAP_MAX_M = 80;
const HYSTERESIS_SCORE_THRESHOLD = 0.75;
const HYSTERESIS_WINDOW_MIN = 3;

// ── Paso 1: snap-to-shape ────────────────────────────────────────────────────

function buildSnapCandidates(
  event: GpsEvent,
  shapes: Shape[],
  geoLines: Map<string, Feature<LineString>>
): SnapCandidate[] {
  const pt = point([event.lng, event.lat]);
  const candidates: SnapCandidate[] = [];

  for (const shape of shapes) {
    const geoLine = geoLines.get(shape.docId);
    if (!geoLine) continue;

    const snap = nearestPointOnLine(geoLine, pt, { units: 'kilometers' });
    const distM = (snap.properties?.dist ?? Infinity) * 1000;
    const distAlongKm = snap.properties?.location ?? 0;

    if (distM <= SNAP_MAX_M) {
      candidates.push({ shape, snapDistanceM: distM, snapDistAlongKm: distAlongKm });
    }
  }

  return candidates;
}

// ── Paso 2: prior por bearing ────────────────────────────────────────────────

function priorByBearing(
  bearingBus: number | null,
  candidatos: SnapCandidate[],
  geoLines: Map<string, Feature<LineString>>
): Record<Sentido, number> {
  const priors: Record<Sentido, number> = { IDA: 0.5, VUELTA: 0.5 };
  if (bearingBus === null) return priors;

  for (const c of candidatos) {
    const geoLine = geoLines.get(c.shape.docId);
    if (!geoLine) continue;

    const tangente = computeTangentAtSnap(geoLine, c.snapDistAlongKm);
    if (tangente === null) continue;

    const diff = angularDiff(bearingBus, tangente);
    let prior: number;
    if (diff < 30) prior = 0.85;
    else if (diff < 60) prior = 0.65;
    else if (diff < 120) prior = 0.35;
    else prior = 0.15; // bus apunta opuesto → descarta este sentido

    priors[c.shape.sentido] = prior;
  }

  const total = priors.IDA + priors.VUELTA;
  if (total > 0) {
    priors.IDA /= total;
    priors.VUELTA /= total;
  }
  return priors;
}

// ── Paso 3: prior por destinoDesc ────────────────────────────────────────────

function priorByDestinoDesc(
  destinoDesc: string | null,
  candidatos: SnapCandidate[]
): Record<Sentido, number> {
  const priors: Record<Sentido, number> = { IDA: 0.5, VUELTA: 0.5 };
  if (!destinoDesc) return priors;

  let matched = false;
  for (const c of candidatos) {
    // El cartel del bus muestra el DESTINO final del viaje:
    // Si el bus va en sentido IDA → su destino es el terminal de VUELTA (fin del shape IDA)
    // Si va en VUELTA → su destino es el terminal de IDA (fin del shape VUELTA)
    const terminal = c.shape.sentido === 'IDA' ? c.shape.terminalVuelta : c.shape.terminalIda;
    if (terminal && fuzzyMatch(destinoDesc, terminal)) {
      priors[c.shape.sentido] = 0.90;
      matched = true;
    }
  }

  if (matched) {
    const total = priors.IDA + priors.VUELTA;
    if (total > 0) {
      priors.IDA /= total;
      priors.VUELTA /= total;
    }
  }
  return priors;
}

// ── Paso 4: combinación de posteriors ────────────────────────────────────────

function combinarPosteriors(
  candidatos: SnapCandidate[],
  priorBearing: Record<Sentido, number>,
  priorDestino: Record<Sentido, number>
): Record<Sentido, number> {
  const posteriors: Record<Sentido, number> = { IDA: 0, VUELTA: 0 };

  for (const c of candidatos) {
    const s = c.shape.sentido;
    // likelihood: mayor proximidad al shape → mayor probabilidad
    const likelihood = 1 / (1 + c.snapDistanceM);
    posteriors[s] = likelihood * priorBearing[s] * priorDestino[s];
  }

  const total = posteriors.IDA + posteriors.VUELTA;
  if (total > 0) {
    posteriors.IDA /= total;
    posteriors.VUELTA /= total;
  }
  return posteriors;
}

// ── Paso 5: histéresis ───────────────────────────────────────────────────────

// Sentido mayoritario en los últimos N eventos del mismo bus (ya enriquecidos)
function sentidoMayoritario(
  windowEvents: Array<GpsEvent & { sentidoV2?: Sentido | null }>
): Sentido | null {
  let ida = 0, vuelta = 0;
  for (const e of windowEvents) {
    if (e.sentidoV2 === 'IDA') ida++;
    else if (e.sentidoV2 === 'VUELTA') vuelta++;
  }
  if (ida === 0 && vuelta === 0) return null;
  return ida >= vuelta ? 'IDA' : 'VUELTA';
}

// ── API pública ──────────────────────────────────────────────────────────────

export function inferirSentido(
  event: GpsEvent,
  shapesForLinea: Shape[],
  windowEvents: Array<GpsEvent & { sentidoV2?: Sentido | null }>
): SenseInferResult {
  // Sin shapes → no se puede inferir
  if (shapesForLinea.length === 0) {
    return { sentido: null, confianza: 'ZERO', score: 0, snapDistanceM: null, snapDistanceTraveledM: null };
  }

  // Pre-computar GeoJSON de cada shape (reutilizable en los pasos siguientes)
  const geoLines = new Map<string, Feature<LineString>>();
  for (const s of shapesForLinea) {
    const geo = pointsToGeoJSON(s.points);
    if (geo) geoLines.set(s.docId, geo);
  }

  // Paso 1: snap y filtro por distancia
  const candidatos = buildSnapCandidates(event, shapesForLinea, geoLines);

  if (candidatos.length === 0) {
    return { sentido: null, confianza: 'ZERO', score: 0, snapDistanceM: null, snapDistanceTraveledM: null };
  }

  // Solo un candidato (línea unidireccional o snap muy claro)
  if (candidatos.length === 1) {
    const c = candidatos[0];
    return {
      sentido: c.shape.sentido,
      confianza: 'HIGH',
      score: 1.0,
      snapDistanceM: c.snapDistanceM,
      snapDistanceTraveledM: c.snapDistAlongKm * 1000,
    };
  }

  // Pasos 2-4: priors y posteriors
  const priorBearing = priorByBearing(event.bearing, candidatos, geoLines);
  const priorDestino = priorByDestinoDesc(event.destinoDesc, candidatos);
  const posteriors = combinarPosteriors(candidatos, priorBearing, priorDestino);

  let ganador: Sentido = posteriors.IDA >= posteriors.VUELTA ? 'IDA' : 'VUELTA';
  let scoreGanador = Math.max(posteriors.IDA, posteriors.VUELTA);

  // Paso 5: histéresis — evita oscilación en tramos compartidos
  if (windowEvents.length >= HYSTERESIS_WINDOW_MIN) {
    const ultimoSentido = sentidoMayoritario(windowEvents);
    if (ultimoSentido && ultimoSentido !== ganador && scoreGanador < HYSTERESIS_SCORE_THRESHOLD) {
      ganador = ultimoSentido;
      // scoreGanador se mantiene para reflejar la incertidumbre real
    }
  }

  // Paso 6: clasificar confianza
  let confianza: Confianza;
  if (scoreGanador >= 0.85) confianza = 'HIGH';
  else if (scoreGanador >= 0.70) confianza = 'MEDIUM';
  else if (scoreGanador >= 0.60) confianza = 'LOW';
  else confianza = 'ZERO';

  // score < 0.60 → no reportar sentido (no contar en estadísticas)
  if (scoreGanador < 0.60) {
    return { sentido: null, confianza, score: scoreGanador, snapDistanceM: null, snapDistanceTraveledM: null };
  }

  const winnerCandidate = candidatos.find(c => c.shape.sentido === ganador);
  return {
    sentido: ganador,
    confianza,
    score: scoreGanador,
    snapDistanceM: winnerCandidate?.snapDistanceM ?? null,
    snapDistanceTraveledM: winnerCandidate ? winnerCandidate.snapDistAlongKm * 1000 : null,
  };
}
