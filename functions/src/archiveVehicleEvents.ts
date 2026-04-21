/**
 * archiveVehicleEvents.ts
 * =======================
 * Sistema de archivo rotativo para ahorrar costos de Firestore.
 *
 * ESTRATEGIA:
 *   - Firestore solo guarda los últimos 7 días (barato, lectura rápida)
 *   - Cada domingo a medianoche: exporta la semana vieja a Firebase Storage
 *     como archivo JSON comprimido (~100-500KB por semana)
 *   - Borra los registros exportados de Firestore
 *   - Firebase Storage: 5GB gratis, archivos históricos ilimitados
 *
 * Resultado: Firestore nunca acumula más de ~50k docs (7d × 5min × 4 empresas × ~40 buses)
 * costo estimado: < $0.10/mes en Firestore + ~0.01/mes en Storage
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import * as zlib from 'zlib';
import { promisify } from 'util';

const db = admin.firestore();
const storage = admin.storage();
const gzip = promisify(zlib.gzip);

const COLLECTION = 'vehicle_events';
const BUCKET_PATH = 'archives/vehicle_events';
const RETENTION_DAYS = 7;

// ── Exportar y purgar ────────────────────────────────────────────────────────

async function archiveAndPurge(): Promise<{ exported: number; deleted: number; file: string }> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  // 1. Leer docs antiguos (en lotes para no saturar memoria)
  const records: any[] = [];
  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  const PAGE = 500;

  while (true) {
    let q = db.collection(COLLECTION)
      .where('expiresAt', '<', cutoff)
      .orderBy('expiresAt')
      .limit(PAGE);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const d = doc.data();
      records.push({
        id: doc.id,
        idBus: d.idBus, agencyId: d.agencyId, empresa: d.empresa,
        linea: d.linea, lat: d.lat, lon: d.lon, velocidad: d.velocidad,
        estado: d.estadoCumplimiento, desviacion: d.desviacionMin,
        parada: d.proximaParada, ts: d.timestampGPS,
      });
    }
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }

  if (records.length === 0) {
    console.log('[Archive] Nada que archivar');
    return { exported: 0, deleted: 0, file: '' };
  }

  // 2. Comprimir y subir a Storage
  const weekTag = cutoff.toISOString().slice(0, 10); // "2026-04-14"
  const fileName = `${BUCKET_PATH}/${weekTag}.json.gz`;
  const jsonBuf = Buffer.from(JSON.stringify(records), 'utf8');
  const compressed = await gzip(jsonBuf);

  const bucket = storage.bucket();
  const file = bucket.file(fileName);
  await file.save(compressed, {
    metadata: {
      contentType: 'application/json',
      contentEncoding: 'gzip',
      metadata: { records: String(records.length), week: weekTag },
    },
  });

  console.log(`[Archive] Subido ${fileName} (${records.length} registros, ${compressed.length} bytes)`);

  // 3. Borrar de Firestore en batches de 400
  const ids = records.map(r => r.id);
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 400) {
    const batch = db.batch();
    for (const id of ids.slice(i, i + 400)) {
      batch.delete(db.collection(COLLECTION).doc(id));
    }
    await batch.commit();
    deleted += Math.min(400, ids.length - i);
  }

  console.log(`[Archive] Eliminados ${deleted} docs de Firestore`);

  // 4. Registrar en audit log
  await db.collection('archive_log').add({
    week: weekTag,
    exported: records.length,
    deleted,
    file: fileName,
    sizeBytes: compressed.length,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { exported: records.length, deleted, file: fileName };
}

// ── Listar archivos disponibles ──────────────────────────────────────────────

async function listArchives(): Promise<Array<{ file: string; week: string; sizeKb: number }>> {
  const bucket = storage.bucket();
  const [files] = await bucket.getFiles({ prefix: BUCKET_PATH });
  return files.map(f => ({
    file: f.name,
    week: f.name.replace(`${BUCKET_PATH}/`, '').replace('.json.gz', ''),
    sizeKb: Math.round(Number(f.metadata.size ?? 0) / 1024),
  }));
}

// ── Exports ──────────────────────────────────────────────────────────────────

/** Cron semanal (domingos a medianoche): exporta a Storage y purga Firestore */
export const archiveVehicleEventsTick = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .pubsub.schedule('0 0 * * 0')
  .timeZone('America/Montevideo')
  .onRun(async () => {
    try {
      const result = await archiveAndPurge();
      console.log('[Archive] Cron OK:', JSON.stringify(result));
    } catch (err: any) {
      console.error('[Archive] Error cron:', err?.message);
    }
    return null;
  });

/** HTTP: forzar archivo manual (para tests o purga urgente) */
export const archiveVehicleEventsNow = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .https.onRequest(async (_req, res) => {
    try {
      const result = await archiveAndPurge();
      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  });

/** HTTP: listar archivos históricos disponibles en Storage */
export const listVehicleArchives = functions.https.onRequest(async (_req, res) => {
  try {
    const archives = await listArchives();
    res.json({ ok: true, archives, total: archives.length });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});
