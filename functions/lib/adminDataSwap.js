"use strict";
// adminDataSwap — función HTTP temporal para Sprint 3.5
// Backup vehicle_events → legacy + swap vehicle_events_v2 → vehicle_events
// Soporta resume: guarda cursor (lastDocId) en Firestore entre invocaciones.
// ELIMINAR después de verificar Sprint 3.5.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminDataSwap = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const SWAP_SECRET = 'sprint35-swap-2026-05-08';
const SRC_COL = 'vehicle_events_v2';
const DST_COL = 'vehicle_events';
const BCK_COL = 'vehicle_events_legacy_pre_swap_2026_05_07';
const JOB_DOC = 'system/swap_sprint35';
const PAGE_SIZE = 400;
const db = () => admin.firestore();
// Copia en batches desde srcCol → dstCol.
// resumeFromId: si se especifica, pagina a partir de ese doc ID.
// Corre por máximo maxMs milisegundos y devuelve el lastDocId para resume.
async function bulkCopy(srcCol, dstCol, progressKey, resumeFromId, maxMs) {
    const firestore = db();
    const deadline = Date.now() + maxMs;
    let copied = 0;
    let lastDocSnap = null;
    let lastDocId = null;
    // Cargar cursor si se indicó
    if (resumeFromId) {
        lastDocSnap = await firestore.collection(srcCol).doc(resumeFromId).get();
    }
    while (Date.now() < deadline) {
        let q = firestore
            .collection(srcCol)
            .orderBy(admin.firestore.FieldPath.documentId())
            .limit(PAGE_SIZE);
        if (lastDocSnap)
            q = q.startAfter(lastDocSnap);
        const snap = await q.get();
        if (snap.empty) {
            lastDocId = null;
            break;
        } // llegó al final
        const batch = firestore.batch();
        for (const docSnap of snap.docs) {
            batch.set(firestore.collection(dstCol).doc(docSnap.id), docSnap.data());
        }
        await batch.commit();
        copied += snap.docs.length;
        lastDocSnap = snap.docs[snap.docs.length - 1];
        lastDocId = lastDocSnap.id;
        await firestore.doc(JOB_DOC).update({
            [progressKey]: admin.firestore.FieldValue.increment(snap.docs.length),
            [`${progressKey}Cursor`]: lastDocId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        if (snap.docs.length < PAGE_SIZE) {
            lastDocId = null;
            break;
        } // última página
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
exports.adminDataSwap = functions
    .runWith({ timeoutSeconds: 540, memory: '512MB' })
    .https.onRequest(async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const secret = ((_a = req.query['secret']) !== null && _a !== void 0 ? _a : (_b = req.body) === null || _b === void 0 ? void 0 : _b.secret);
    if (secret !== SWAP_SECRET) {
        res.status(401).json({ error: 'No autorizado' });
        return;
    }
    const step = String((_e = (_c = req.query['step']) !== null && _c !== void 0 ? _c : (_d = req.body) === null || _d === void 0 ? void 0 : _d.step) !== null && _e !== void 0 ? _e : 'all');
    const resume = String((_h = (_f = req.query['resume']) !== null && _f !== void 0 ? _f : (_g = req.body) === null || _g === void 0 ? void 0 : _g.resume) !== null && _h !== void 0 ? _h : 'false') === 'true';
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
                [SRC_COL]: { hasData: !v2Snap.empty },
                [DST_COL]: { hasData: !v1Snap.empty },
                [BCK_COL]: { hasData: !bckSnap.empty },
            },
            lastJob: jobDoc.exists ? jobDoc.data() : null,
        });
        return;
    }
    // ── Leer cursors previos si resume=true ─────────────────────────────────
    let backupCursorStart = null;
    let swapCursorStart = null;
    if (resume) {
        const jobDoc = await firestore.doc(JOB_DOC).get();
        if (jobDoc.exists) {
            const d = jobDoc.data();
            backupCursorStart = (_j = d['backupCopiedCursor']) !== null && _j !== void 0 ? _j : null;
            swapCursorStart = (_k = d['swapCopiedCursor']) !== null && _k !== void 0 ? _k : null;
        }
    }
    // ── Inicializar / actualizar doc de progreso ────────────────────────────
    const initData = {
        step,
        resume,
        status: 'RUNNING',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        error: null,
    };
    if (!resume) {
        initData['backupCopied'] = 0;
        initData['swapCopied'] = 0;
        initData['startedAt'] = admin.firestore.FieldValue.serverTimestamp();
    }
    await firestore.doc(JOB_DOC).set(initData, { merge: true });
    // ── TRABAJO SÍNCRONO con deadline interno ───────────────────────────────
    // Dejamos 60s de margen al timeout de 540s para hacer commit del resultado
    const MAX_WORK_MS = 460000;
    try {
        let backupResult = { copied: 0, lastDocId: null };
        let swapResult = { copied: 0, lastDocId: null };
        if (step === 'backup' || step === 'all') {
            console.log(`[adminDataSwap] Backup ${BCK_COL} resume=${resume} cursor=${backupCursorStart}`);
            backupResult = await bulkCopy(DST_COL, BCK_COL, 'backupCopied', backupCursorStart, (step === 'all') ? MAX_WORK_MS / 2 : MAX_WORK_MS);
            if (backupResult.lastDocId === null) {
                await firestore.doc(JOB_DOC).update({ backupDone: true });
                console.log(`[adminDataSwap] Backup completo: ${backupResult.copied} docs esta invocación`);
            }
            else {
                console.log(`[adminDataSwap] Backup PARCIAL: ${backupResult.copied} docs, cursor=${backupResult.lastDocId}`);
            }
        }
        if (step === 'swap' || step === 'all') {
            console.log(`[adminDataSwap] Swap ${SRC_COL} → ${DST_COL} resume=${resume} cursor=${swapCursorStart}`);
            swapResult = await bulkCopy(SRC_COL, DST_COL, 'swapCopied', swapCursorStart, (step === 'all') ? MAX_WORK_MS / 2 : MAX_WORK_MS);
            if (swapResult.lastDocId === null) {
                await firestore.doc(JOB_DOC).update({ swapDone: true });
                console.log(`[adminDataSwap] Swap completo: ${swapResult.copied} docs esta invocación`);
            }
            else {
                console.log(`[adminDataSwap] Swap PARCIAL: ${swapResult.copied} docs, cursor=${swapResult.lastDocId}`);
            }
        }
        const isDone = backupResult.lastDocId === null && swapResult.lastDocId === null;
        await firestore.doc(JOB_DOC).update(Object.assign(Object.assign({ status: isDone ? 'DONE' : 'PARTIAL' }, (isDone && { finishedAt: admin.firestore.FieldValue.serverTimestamp() })), { updatedAt: admin.firestore.FieldValue.serverTimestamp() }));
        res.json({
            status: isDone ? 'DONE' : 'PARTIAL',
            step,
            backupCopied: backupResult.copied,
            swapCopied: swapResult.copied,
            backupCursor: backupResult.lastDocId,
            swapCursor: swapResult.lastDocId,
            message: isDone
                ? 'Swap completado. Proceder con cambios de código.'
                : 'Swap parcial. Llamar con &resume=true para continuar.',
        });
    }
    catch (err) {
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
