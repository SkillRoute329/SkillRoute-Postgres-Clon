import { Router, Request, Response } from 'express';
import * as crypto from 'crypto';
import { db } from '../lib/firestore';
import { getShapesForLinea, clearCache } from '../lib/shapeCache';
import { inferirSentido, ALGO_VERSION } from '../lib/senseInference';
import { GpsEvent, InferResult, Sentido } from '../types';

const router = Router();

const V1_COL = 'vehicle_events';
const V2_COL = 'vehicle_events_v2';
const JOBS_COL = 'system/reprocess_jobs';
const BATCH_SIZE = 500;

function buildInputHash(event: GpsEvent): string {
  return crypto.createHash('sha256').update(JSON.stringify({ event, algoVersion: ALGO_VERSION })).digest('hex');
}

function makeJobId(): string {
  return `reprocess-${Math.floor(Date.now() / 1000)}-${crypto.randomBytes(3).toString('hex')}`;
}

// ── Background job runner ────────────────────────────────────────────────────

async function runReprocess(
  jobId: string,
  from: string,
  to: string,
  agencyId: string | null,
  linea: string | null,
  writeTarget: string
): Promise<void> {
  const jobRef = db.doc(`system/reprocess_jobs/${jobId}`);

  try {
    let query: FirebaseFirestore.Query = db.collection(V1_COL)
      .where('timestampGPS', '>=', from)
      .where('timestampGPS', '<=', to);

    if (agencyId) query = query.where('agencyId', '==', agencyId);
    if (linea) query = query.where('linea', '==', linea);

    // Contar estimado (costoso en Firestore, solo si hay índice)
    let processedDocs = 0;

    // Leer en batches usando startAfter paginación
    let lastDoc: FirebaseFirestore.DocumentSnapshot | null = null;
    let hasMore = true;

    // Ventana de histéresis por bus (persiste durante todo el reprocess)
    const windowByBus = new Map<string, Array<GpsEvent & { sentidoV2?: Sentido | null }>>();

    while (hasMore) {
      let pageQuery = query.orderBy('timestampGPS').limit(BATCH_SIZE);
      if (lastDoc) pageQuery = pageQuery.startAfter(lastDoc);

      const snap = await pageQuery.get();
      if (snap.empty) { hasMore = false; break; }

      const writeBatch = db.batch();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

      for (const docSnap of snap.docs) {
        const d = docSnap.data();
        const event: GpsEvent = {
          idBus: String(d.idBus ?? ''),
          agencyId: String(d.agencyId ?? ''),
          linea: String(d.linea ?? ''),
          lat: typeof d.lat === 'number' ? d.lat : 0,
          lng: typeof d.lon === 'number' ? d.lon : (typeof d.lng === 'number' ? d.lng : 0),
          bearing: typeof d.bearing === 'number' ? d.bearing : null,
          velocidad: typeof d.velocidad === 'number' ? d.velocidad : 0,
          destinoDesc: d.destinoDesc ?? null,
          variante: d.variante ?? null,
          timestampGPS: d.timestampGPS ?? now.toISOString(),
        };

        if (!event.agencyId || !event.linea) continue;

        const shapes = await getShapesForLinea(event.agencyId, event.linea);
        const window = (windowByBus.get(event.idBus) ?? []).slice(-6);
        const senseResult = inferirSentido(event, shapes, window);

        const docRef = db.collection(writeTarget).doc(docSnap.id);
        writeBatch.set(docRef, {
          ...d,
          sentidoV2: senseResult.sentido,
          confianzaV2: senseResult.confianza,
          scoreV2: senseResult.score,
          tripIdV2: null, // trip matching en batch sería muy costoso; se hace on-demand
          snapDistanceMV2: senseResult.snapDistanceM,
          algoVersion: ALGO_VERSION,
          inputHash: buildInputHash(event),
          reprocessedAt: now,
          expiresAt,
        }, { merge: true });

        // Actualizar ventana
        const enriched = { ...event, sentidoV2: senseResult.sentido };
        const busWindow = windowByBus.get(event.idBus) ?? [];
        busWindow.push(enriched);
        if (busWindow.length > 6) busWindow.splice(0, busWindow.length - 6);
        windowByBus.set(event.idBus, busWindow);

        processedDocs++;
      }

      await writeBatch.commit();
      lastDoc = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < BATCH_SIZE) hasMore = false;

      // Actualizar progreso cada batch
      await jobRef.update({ processedDocs, updatedAt: new Date() });
    }

    await jobRef.update({ status: 'DONE', processedDocs, updatedAt: new Date() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[reprocess] Job ${jobId} falló:`, msg);
    await jobRef.update({ status: 'ERROR', error: msg, updatedAt: new Date() });
  }
}

// ── Handler POST /reprocess ──────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const { from, to, agencyId, linea, writeTarget } = req.body as {
    from?: string;
    to?: string;
    agencyId?: string;
    linea?: string;
    writeTarget?: string;
  };

  if (!from || !to) {
    return res.status(400).json({ error: 'from y to son requeridos (ISO 8601)' });
  }

  const target = writeTarget ?? V2_COL;
  if (target !== V2_COL) {
    return res.status(400).json({ error: `writeTarget debe ser ${V2_COL}` });
  }

  const jobId = makeJobId();
  const now = new Date();

  // Estimar docs (heurística: ~10000 eventos/hora/operador)
  const durationH = (new Date(to).getTime() - new Date(from).getTime()) / 3600000;
  const estimatedDocs = Math.round(durationH * 10000 * (agencyId ? 1 : 4));

  // Guardar job en Firestore
  await db.doc(`system/reprocess_jobs/${jobId}`).set({
    jobId, agencyId: agencyId ?? null, linea: linea ?? null,
    from, to, writeTarget: target,
    status: 'QUEUED', processedDocs: 0, estimatedDocs,
    createdAt: now, updatedAt: now,
  });

  // Limpiar cache de shapes para que el reprocess lea datos frescos
  clearCache();

  // Arrancar en background (no await)
  setImmediate(() => {
    runReprocess(jobId, from, to, agencyId ?? null, linea ?? null, target);
  });

  return res.json({
    jobId,
    estimatedDurationS: Math.round(estimatedDocs / 50), // ~50 docs/s con batches
    estimatedDocs,
    statusUrl: `/reprocess/status/${jobId}`,
  });
});

// GET /reprocess/status/:jobId — polling de progreso
router.get('/status/:jobId', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const snap = await db.doc(`system/reprocess_jobs/${jobId}`).get();
  if (!snap.exists) return res.status(404).json({ error: 'Job no encontrado' });
  return res.json(snap.data());
});

export default router;
