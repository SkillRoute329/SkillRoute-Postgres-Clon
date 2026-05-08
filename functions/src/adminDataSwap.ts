// adminDataSwap — función HTTP temporal para Sprint 3.5
// Backup vehicle_events → legacy + swap vehicle_events_v2 → vehicle_events
// Soporta resume: guarda cursor (lastDocId) en Firestore entre invocaciones.
// ELIMINAR después de verificar Sprint 3.5.

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const SWAP_SECRET = 'sprint35-swap-2026-05-08';
const SRC_COL     = 'vehicle_events_v2';
const DST_COL     = 'vehicle_events';
const BCK_COL     = 'vehicle_events_legacy_pre_swap_2026_05_07';
const JOB_DOC     = 'system/swap_sprint35';
const PAGE_SIZE   = 400;

const db = () => admin.firestore();

interface BulkResult {
  copied: number;
  lastDocId: string | null; // null cuando llegó al final
}

// Copia en batches desde srcCol → dstCol.
// resumeFromId: si se especifica, pagina a partir de ese doc ID.
// Corre por máximo maxMs milisegundos y devuelve el lastDocId para resume.
async function bulkCopy(
  srcCol: string,
  dstCol: string,
  progressKey: string,
  resumeFromId: string | null,
  maxMs: number,
): Promise<BulkResult> {
  const firestore = db();
  const deadline  = Date.now() + maxMs;
  let copied      = 0;
  let lastDocSnap: admin.firestore.DocumentSnapshot | null = null;
  let lastDocId: string | null = null;

  // Cargar cursor si se indicó
  if (resumeFromId) {
    lastDocSnap = await firestore.collection(srcCol).doc(resumeFromId).get();
  }

  while (Date.now() < deadline) {
    let q: admin.firestore.Query = firestore
      .collection(srcCol)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (lastDocSnap) q = q.startAfter(lastDocSnap);

    const snap = await q.get();
    if (snap.empty) { lastDocId = null; break; } // llegó al final

    const batch = firestore.batch();
    for (const docSnap of snap.docs) {
      batch.set(firestore.collection(dstCol).doc(docSnap.id), docSnap.data());
    }
    await batch.commit();

    copied      += snap.docs.length;
    lastDocSnap  = snap.docs[snap.docs.length - 1];
    lastDocId    = lastDocSnap.id;

    await firestore.doc(JOB_DOC).update({
      [progressKey]: admin.firestore.FieldValue.increment(snap.docs.length),
      [`${progressKey}Cursor`]: lastDocId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (snap.docs.length < PAGE_SIZE) { lastDocId = null; break; } // última página
  }

  return { copied, lastDocId };
}

// GET/POST /adminDataSwap
// Parámetros:
//   secret      — requerido
//   step        — status | backup | swap | all  (default: all)
//   resume      — true|false (default: false); si true, lee cursors del Firestore doc
// La función bloquea ~480s máx, guarda cursor, devuelve:
//   { status: 'DONE' | 'PARTIAL', step, backupCopied, swapCopied,
//     backupCursor, swapCursor, message }
export const adminDataSwap = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .https.onRequest(async (req, res) => {
    const secret = (req.query['secret'] ?? req.body?.secret) as string | undefined;
    if (secret !== SWAP_SECRET) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    const step   = String(req.query['step']   ?? req.body?.step   ?? 'all');
    const resume = String(req.query['resume'] ?? req.body?.resume ?? 'false') === 'true';
    const firestore = db();

    // ── STATUS ──────────────────────────────────────────────────────────────
    if (step === 'status') {
      const [v2Snap, v1Snap, bckSnap, jobDoc] = await Promise.all([
        firestore.collection(SRC_COL).limit(1).get(),
        firestore.collection(DST_COL).limit(1).get(),
        firestore.collection(BCK_COL).limit(1).get(),
        firestore.doc(JOB_DOC).get(),
      ]);
      res.json({
        collections: {
          [SRC_COL]:  { hasData: !v2Snap.empty },
          [DST_COL]:  { hasData: !v1Snap.empty },
          [BCK_COL]:  { hasData: !bckSnap.empty },
        },
        lastJob: jobDoc.exists ? jobDoc.data() : null,
      });
      return;
    }

    // ── Leer cursors previos si resume=true ─────────────────────────────────
    let backupCursorStart: string | null = null;
    let swapCursorStart:   string | null = null;

    if (resume) {
      const jobDoc = await firestore.doc(JOB_DOC).get();
      if (jobDoc.exists) {
        const d = jobDoc.data()!;
        backupCursorStart = d['backupCopiedCursor'] ?? null;
        swapCursorStart   = d['swapCopiedCursor']   ?? null;
      }
    }

    // ── Inicializar / actualizar doc de progreso ────────────────────────────
    const initData: Record<string, unknown> = {
      step,
      resume,
      status: 'RUNNING',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      error: null,
    };
    if (!resume) {
      initData['backupCopied'] = 0;
      initData['swapCopied']   = 0;
      initData['startedAt']    = admin.firestore.FieldValue.serverTimestamp();
    }
    await firestore.doc(JOB_DOC).set(initData, { merge: true });

    // ── TRABAJO SÍNCRONO con deadline interno ───────────────────────────────
    // Dejamos 60s de margen al timeout de 540s para hacer commit del resultado
    const MAX_WORK_MS = 460_000;

    try {
      let backupResult: BulkResult = { copied: 0, lastDocId: null };
      let swapResult:   BulkResult = { copied: 0, lastDocId: null };

      if (step === 'backup' || step === 'all') {
        console.log(`[adminDataSwap] Backup ${BCK_COL} resume=${resume} cursor=${backupCursorStart}`);
        backupResult = await bulkCopy(
          DST_COL, BCK_COL, 'backupCopied', backupCursorStart,
          (step === 'all') ? MAX_WORK_MS / 2 : MAX_WORK_MS,
        );
        if (backupResult.lastDocId === null) {
          await firestore.doc(JOB_DOC).update({ backupDone: true });
          console.log(`[adminDataSwap] Backup completo: ${backupResult.copied} docs esta invocación`);
        } else {
          console.log(`[adminDataSwap] Backup PARCIAL: ${backupResult.copied} docs, cursor=${backupResult.lastDocId}`);
        }
      }

      if (step === 'swap' || step === 'all') {
        console.log(`[adminDataSwap] Swap ${SRC_COL} → ${DST_COL} resume=${resume} cursor=${swapCursorStart}`);
        swapResult = await bulkCopy(
          SRC_COL, DST_COL, 'swapCopied', swapCursorStart,
          (step === 'all') ? MAX_WORK_MS / 2 : MAX_WORK_MS,
        );
        if (swapResult.lastDocId === null) {
          await firestore.doc(JOB_DOC).update({ swapDone: true });
          console.log(`[adminDataSwap] Swap completo: ${swapResult.copied} docs esta invocación`);
        } else {
          console.log(`[adminDataSwap] Swap PARCIAL: ${swapResult.copied} docs, cursor=${swapResult.lastDocId}`);
        }
      }

      const isDone = backupResult.lastDocId === null && swapResult.lastDocId === null;
      await firestore.doc(JOB_DOC).update({
        status: isDone ? 'DONE' : 'PARTIAL',
        ...(isDone && { finishedAt: admin.firestore.FieldValue.serverTimestamp() }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({
        status:         isDone ? 'DONE' : 'PARTIAL',
        step,
        backupCopied:   backupResult.copied,
        swapCopied:     swapResult.copied,
        backupCursor:   backupResult.lastDocId,
        swapCursor:     swapResult.lastDocId,
        message:        isDone
          ? 'Swap completado. Proceder con cambios de código.'
          : 'Swap parcial. Llamar con &resume=true para continuar.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[adminDataSwap] ERROR:', msg);
      await firestore.doc(JOB_DOC).update({
        status: 'ERROR',
        error: msg,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      res.status(500).json({ status: 'ERROR', error: msg });
    }
  });
