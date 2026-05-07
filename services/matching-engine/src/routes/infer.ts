import { Router, Request, Response } from 'express';
import * as crypto from 'crypto';
import { db } from '../lib/firestore';
import { getShapesForLinea } from '../lib/shapeCache';
import { inferirSentido, ALGO_VERSION } from '../lib/senseInference';
import { matchPasadaToTrip } from '../lib/tripMatching';
import { updateLastInferAt } from './health';
import { GpsEvent, InferResult, InferError, Sentido } from '../types';

const router = Router();

const V2_COL = 'vehicle_events_v2';
const WINDOW_SIZE_DEFAULT = 6;
const MIN_CONFIDENCE_DEFAULT = 0.6;

// ── Persistencia en vehicle_events_v2 ────────────────────────────────────────

function buildInputHash(event: GpsEvent, algoVersion: string): string {
  const payload = JSON.stringify({ event, algoVersion });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

async function persistEnrichedEvents(
  events: GpsEvent[],
  results: InferResult[]
): Promise<void> {
  const batch = db.batch();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // TTL 90 días

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const r = results[i];
    const docRef = db.collection(V2_COL).doc();
    batch.set(docRef, {
      // Campos legacy preservados (sin tocar)
      idBus: e.idBus,
      agencyId: e.agencyId,
      linea: e.linea,
      lat: e.lat,
      lon: e.lng, // vehicle_events usa 'lon'
      velocidad: e.velocidad,
      bearing: e.bearing,
      destinoDesc: e.destinoDesc,
      variante: e.variante,
      timestampGPS: e.timestampGPS,
      // Campos V2 enriquecidos
      sentidoV2: r.sentido,
      confianzaV2: r.confianza,
      scoreV2: r.score,
      tripIdV2: r.tripId,
      snapDistanceMV2: r.snapDistanceM,
      algoVersion: r.algoVersion,
      inputHash: buildInputHash(e, r.algoVersion),
      // Metadata
      createdAt: now,
      expiresAt,
    });
  }

  await batch.commit();
}

// ── Handler POST /infer ──────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const { events, options } = req.body as {
    events?: GpsEvent[];
    options?: { windowSize?: number; minConfidence?: number };
  };

  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: 'events[] es requerido y no puede estar vacío' });
  }

  const windowSize = options?.windowSize ?? WINDOW_SIZE_DEFAULT;
  const minConfidence = options?.minConfidence ?? MIN_CONFIDENCE_DEFAULT;
  const matchedAt = new Date().toISOString();
  updateLastInferAt(matchedAt);

  const results: InferResult[] = [];
  const errors: InferError[] = [];

  // Agrupar eventos por bus para histéresis
  const windowByBus = new Map<string, Array<GpsEvent & { sentidoV2?: Sentido | null }>>();

  for (const event of events) {
    // Validación mínima del evento
    if (!event.idBus || !event.agencyId || !event.linea ||
        typeof event.lat !== 'number' || typeof event.lng !== 'number') {
      errors.push({
        idBus: event.idBus ?? 'UNKNOWN',
        code: 'INVALID_EVENT',
        message: 'Faltan campos requeridos: idBus, agencyId, linea, lat, lng',
        fallback: { sentido: null, confianza: 'ZERO', tripId: null },
      });
      continue;
    }

    // Cargar shapes para esta línea (usa cache)
    const shapes = await getShapesForLinea(event.agencyId, event.linea);

    if (shapes.length === 0) {
      errors.push({
        idBus: event.idBus,
        code: 'SHAPE_NOT_FOUND',
        message: `No hay shapes en shapes_cross_operator para agencyId=${event.agencyId} linea=${event.linea}`,
        fallback: { sentido: null, confianza: 'ZERO', tripId: null },
      });
      results.push({
        idBus: event.idBus,
        sentido: null,
        confianza: 'ZERO',
        score: 0,
        tripId: null,
        snapDistanceM: null,
        snapDistanceTraveledM: null,
        matchedAt,
        algoVersion: ALGO_VERSION,
      });
      continue;
    }

    // Ventana de histéresis para este bus (últimos windowSize eventos ya procesados)
    const window = (windowByBus.get(event.idBus) ?? []).slice(-windowSize);

    // Inferir sentido (snap + bayesiano + histéresis)
    const senseResult = inferirSentido(event, shapes, window);

    // Trip matching (solo si hay sentido con confianza HIGH o MEDIUM)
    let tripId: string | null = null;
    if (senseResult.sentido && (senseResult.confianza === 'HIGH' || senseResult.confianza === 'MEDIUM')) {
      const matchedShape = shapes.find(s => s.sentido === senseResult.sentido);
      const terminalInicio = matchedShape?.terminalIda ?? null;
      const tripMatch = await matchPasadaToTrip(
        [event], // batch mínimo; en producción se pasa el batch completo del bus
        event.agencyId,
        event.linea,
        senseResult.sentido,
        terminalInicio
      );
      tripId = tripMatch?.tripId ?? null;
    }

    const result: InferResult = {
      idBus: event.idBus,
      sentido: senseResult.sentido,
      confianza: senseResult.confianza,
      score: senseResult.score,
      tripId,
      snapDistanceM: senseResult.snapDistanceM,
      snapDistanceTraveledM: senseResult.snapDistanceTraveledM,
      matchedAt,
      algoVersion: ALGO_VERSION,
    };
    results.push(result);

    // Actualizar ventana de histéresis
    const enriched = { ...event, sentidoV2: senseResult.sentido };
    const busWindow = windowByBus.get(event.idBus) ?? [];
    busWindow.push(enriched);
    if (busWindow.length > windowSize) busWindow.splice(0, busWindow.length - windowSize);
    windowByBus.set(event.idBus, busWindow);
  }

  // Persistir eventos enriquecidos (solo los que tienen result, no errores de validación)
  if (results.length > 0) {
    const validEvents = events.filter((_, i) => results[i] !== undefined);
    try {
      await persistEnrichedEvents(validEvents, results);
    } catch (err) {
      console.error('[infer] Error persistiendo en vehicle_events_v2:', err);
      // No falla el request — persistencia es best-effort en streaming
    }
  }

  return res.json({ results, errors });
});

export default router;
