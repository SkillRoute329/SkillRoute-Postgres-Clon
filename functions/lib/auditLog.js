"use strict";
/**
 * auditLog.ts — Sistema general de auditoría de cambios en Firestore
 * =====================================================================
 * Triggers onWrite sobre las colecciones críticas. Cada cambio escribe un
 * documento inmutable en `audit_log/{auto}` con:
 *   - ts            (Timestamp)
 *   - uid           (string | null)        — del request.auth.uid si disponible
 *   - email         (string | null)
 *   - action        ('create' | 'update' | 'delete')
 *   - collection    (string)
 *   - docId         (string)
 *   - before        (object | null)        — payload pre-cambio
 *   - after         (object | null)        — payload post-cambio
 *   - diff          (string[])             — keys que cambiaron
 *
 * NOTA: Firestore onWrite triggers en v1 NO traen request.auth (solo HTTP
 * onCall lo trae). Para registrar el uid del editor, los call sites deben
 * incluir un campo `_lastEditedBy: uid` en el doc — el trigger lo lee de
 * `after.data()._lastEditedBy`. Si no está, se marca como 'system'.
 *
 * Las colecciones que se auditan se listan en `MONITORED_COLLECTIONS`.
 * Para agregar una colección nueva: append a la lista + redeploy.
 *
 * Las reglas Firestore deben:
 *   - permitir read de audit_log sólo a admins
 *   - prohibir write/delete (los registros son inmutables)
 */
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
exports.auditLogQuery = exports.auditLogServiceMatrices = exports.auditLogServiceDefinitions = exports.auditLogReglasRotacion = exports.auditLogUsers = exports.auditLogVehiculos = exports.auditLogVehicles = exports.auditLogLineas = exports.auditLogLineasUcot = exports.auditLogParametrosOperativosHistorial = exports.auditLogParametrosOperativos = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length)
    admin.initializeApp();
const db = admin.firestore();
const COLLECTION = 'audit_log';
// Colecciones monitoreadas — agregar acá las que requieren trazabilidad.
// Cada entrada genera un trigger separado en el deploy.
const MONITORED_COLLECTIONS = [
    'parametros_operativos',
    'parametros_operativos_historial',
    'lineas_ucot',
    'lineas',
    'vehicles',
    'vehiculos',
    'users',
    'reglas_rotacion',
    'service_definitions',
    'service_matrices',
];
// ─── Helpers ─────────────────────────────────────────────────────────────
/** Calcula las keys que cambiaron entre before y after. Útil para diff. */
function computeDiff(before, after) {
    var _a, _b;
    if (!before && !after)
        return [];
    if (!before)
        return Object.keys(after !== null && after !== void 0 ? after : {});
    if (!after)
        return Object.keys(before !== null && before !== void 0 ? before : {});
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changed = [];
    for (const k of keys) {
        const a = JSON.stringify((_a = before[k]) !== null && _a !== void 0 ? _a : null);
        const b = JSON.stringify((_b = after[k]) !== null && _b !== void 0 ? _b : null);
        if (a !== b)
            changed.push(k);
    }
    return changed.sort();
}
/** Reduce un payload para storage: descarta campos pesados/binarios y trunca strings >5KB. */
function sanitize(data) {
    if (!data)
        return null;
    const out = {};
    for (const [k, v] of Object.entries(data)) {
        if (k.startsWith('_lastEditedBy'))
            continue; // metadata interna
        if (v === undefined)
            continue;
        if (typeof v === 'string' && v.length > 5000) {
            out[k] = v.slice(0, 5000) + `…[truncated ${v.length - 5000} chars]`;
        }
        else {
            out[k] = v;
        }
    }
    return out;
}
/**
 * Registra un evento de cambio en audit_log.
 * Idempotent: usa un docId determinístico ${collection}_${docId}_${changeMs}
 * para evitar dobles escrituras en caso de retries del trigger.
 */
async function logChange(collection, docId, before, after, context) {
    var _a, _b, _c, _d;
    const action = !before
        ? 'create'
        : !after
            ? 'delete'
            : 'update';
    const diff = computeDiff(before, after);
    if (action === 'update' && diff.length === 0) {
        // Update sin cambios reales (puede pasar con merge:true mismos valores)
        return;
    }
    const editorUid = (_c = (_b = (_a = after === null || after === void 0 ? void 0 : after._lastEditedBy) !== null && _a !== void 0 ? _a : after === null || after === void 0 ? void 0 : after.actualizadoPor) !== null && _b !== void 0 ? _b : after === null || after === void 0 ? void 0 : after.lastEditedBy) !== null && _c !== void 0 ? _c : null;
    // Resolver email del uid si está disponible
    let email = null;
    if (editorUid) {
        try {
            const userDoc = await db.collection('users').doc(editorUid).get();
            if (userDoc.exists) {
                const u = userDoc.data();
                email = (_d = u === null || u === void 0 ? void 0 : u.email) !== null && _d !== void 0 ? _d : null;
            }
        }
        catch (_e) {
            /* ignorar — no bloquear el log si users colección falla */
        }
    }
    const eventId = context.eventId;
    await db.collection(COLLECTION).doc(eventId).set({
        ts: admin.firestore.FieldValue.serverTimestamp(),
        uid: editorUid,
        email,
        action,
        collection,
        docId,
        before: sanitize(before),
        after: sanitize(after),
        diff,
        eventId,
    });
}
// ─── Generador de triggers ────────────────────────────────────────────────
/**
 * Crea un Cloud Function onWrite trigger para una colección específica.
 * Devuelve la función exportable.
 */
function makeAuditTrigger(collectionName) {
    return functions
        .runWith({ memory: '256MB', timeoutSeconds: 30 })
        .firestore.document(`${collectionName}/{docId}`)
        .onWrite(async (change, context) => {
        var _a, _b;
        try {
            const before = change.before.exists ? ((_a = change.before.data()) !== null && _a !== void 0 ? _a : null) : null;
            const after = change.after.exists ? ((_b = change.after.data()) !== null && _b !== void 0 ? _b : null) : null;
            await logChange(collectionName, context.params.docId, before, after, context);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Error desconocido';
            console.error(`[auditLog] Falló registro de ${collectionName}/${context.params.docId}:`, msg);
            // No re-throw — el log es secundario, no debe romper el write principal
        }
    });
}
// ─── Exports — un trigger por colección monitoreada ──────────────────────
exports.auditLogParametrosOperativos = makeAuditTrigger('parametros_operativos');
exports.auditLogParametrosOperativosHistorial = makeAuditTrigger('parametros_operativos_historial');
exports.auditLogLineasUcot = makeAuditTrigger('lineas_ucot');
exports.auditLogLineas = makeAuditTrigger('lineas');
exports.auditLogVehicles = makeAuditTrigger('vehicles');
exports.auditLogVehiculos = makeAuditTrigger('vehiculos');
exports.auditLogUsers = makeAuditTrigger('users');
exports.auditLogReglasRotacion = makeAuditTrigger('reglas_rotacion');
exports.auditLogServiceDefinitions = makeAuditTrigger('service_definitions');
exports.auditLogServiceMatrices = makeAuditTrigger('service_matrices');
// ─── HTTP endpoint para query del log ────────────────────────────────────
/**
 * GET /auditLogQuery?collection=X&days=N&uid=Y&limit=Z
 * Devuelve eventos de audit_log filtrados. Sólo accesible por admins.
 *
 * NOTA: la auth real se hace en firestore.rules (lectura sólo isAdminNorm).
 * Este endpoint es atajo HTTP para la página AdminAuditLog que hace una
 * query con orderBy + filters via SDK directamente.
 */
exports.auditLogQuery = functions
    .runWith({ memory: '256MB', timeoutSeconds: 30 })
    .https.onRequest(async (req, res) => {
    var _a, _b, _c, _d;
    res.set('Access-Control-Allow-Origin', '*');
    try {
        const collection = (_a = req.query.collection) !== null && _a !== void 0 ? _a : '';
        const days = Math.min(Math.max(parseInt((_b = req.query.days) !== null && _b !== void 0 ? _b : '7', 10), 1), 90);
        const uid = (_c = req.query.uid) !== null && _c !== void 0 ? _c : '';
        const limitN = Math.min(Math.max(parseInt((_d = req.query.limit) !== null && _d !== void 0 ? _d : '200', 10), 1), 1000);
        const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
        let q = db.collection(COLLECTION)
            .where('ts', '>=', admin.firestore.Timestamp.fromMillis(sinceMs))
            .orderBy('ts', 'desc')
            .limit(limitN);
        if (collection)
            q = q.where('collection', '==', collection);
        if (uid)
            q = q.where('uid', '==', uid);
        const snap = await q.get();
        const events = snap.docs.map((d) => {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            const data = d.data();
            return {
                id: d.id,
                ts: (_e = (_d = (_c = (_b = (_a = data.ts) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) === null || _c === void 0 ? void 0 : _c.toISOString) === null || _d === void 0 ? void 0 : _d.call(_c)) !== null && _e !== void 0 ? _e : null,
                uid: (_f = data.uid) !== null && _f !== void 0 ? _f : null,
                email: (_g = data.email) !== null && _g !== void 0 ? _g : null,
                action: data.action,
                collection: data.collection,
                docId: data.docId,
                diff: (_h = data.diff) !== null && _h !== void 0 ? _h : [],
            };
        });
        res.json({ ok: true, total: events.length, events });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        console.error('[auditLogQuery] Error:', msg);
        res.status(500).json({ ok: false, error: msg });
    }
});
