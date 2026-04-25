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

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();
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
] as const;

type MonitoredCollection = (typeof MONITORED_COLLECTIONS)[number];

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Calcula las keys que cambiaron entre before y after. Útil para diff. */
function computeDiff(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string[] {
  if (!before && !after) return [];
  if (!before) return Object.keys(after ?? {});
  if (!after) return Object.keys(before ?? {});
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const k of keys) {
    const a = JSON.stringify(before[k] ?? null);
    const b = JSON.stringify(after[k] ?? null);
    if (a !== b) changed.push(k);
  }
  return changed.sort();
}

/** Reduce un payload para storage: descarta campos pesados/binarios y trunca strings >5KB. */
function sanitize(data: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!data) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith('_lastEditedBy')) continue; // metadata interna
    if (v === undefined) continue;
    if (typeof v === 'string' && v.length > 5000) {
      out[k] = v.slice(0, 5000) + `…[truncated ${v.length - 5000} chars]`;
    } else {
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
async function logChange(
  collection: MonitoredCollection,
  docId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  context: functions.EventContext,
): Promise<void> {
  const action: 'create' | 'update' | 'delete' = !before
    ? 'create'
    : !after
      ? 'delete'
      : 'update';

  const diff = computeDiff(before, after);
  if (action === 'update' && diff.length === 0) {
    // Update sin cambios reales (puede pasar con merge:true mismos valores)
    return;
  }

  const editorUid = (after?._lastEditedBy as string | undefined)
    ?? (after?.actualizadoPor as string | undefined)
    ?? (after?.lastEditedBy as string | undefined)
    ?? null;

  // Resolver email del uid si está disponible
  let email: string | null = null;
  if (editorUid) {
    try {
      const userDoc = await db.collection('users').doc(editorUid).get();
      if (userDoc.exists) {
        const u = userDoc.data();
        email = (u?.email as string | undefined) ?? null;
      }
    } catch {
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
function makeAuditTrigger(collectionName: MonitoredCollection) {
  return functions
    .runWith({ memory: '256MB', timeoutSeconds: 30 })
    .firestore.document(`${collectionName}/{docId}`)
    .onWrite(async (change, context) => {
      try {
        const before = change.before.exists ? (change.before.data() ?? null) : null;
        const after = change.after.exists ? (change.after.data() ?? null) : null;
        await logChange(
          collectionName,
          context.params.docId as string,
          before as Record<string, unknown> | null,
          after as Record<string, unknown> | null,
          context,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        console.error(`[auditLog] Falló registro de ${collectionName}/${context.params.docId}:`, msg);
        // No re-throw — el log es secundario, no debe romper el write principal
      }
    });
}

// ─── Exports — un trigger por colección monitoreada ──────────────────────

export const auditLogParametrosOperativos = makeAuditTrigger('parametros_operativos');
export const auditLogParametrosOperativosHistorial = makeAuditTrigger('parametros_operativos_historial');
export const auditLogLineasUcot = makeAuditTrigger('lineas_ucot');
export const auditLogLineas = makeAuditTrigger('lineas');
export const auditLogVehicles = makeAuditTrigger('vehicles');
export const auditLogVehiculos = makeAuditTrigger('vehiculos');
export const auditLogUsers = makeAuditTrigger('users');
export const auditLogReglasRotacion = makeAuditTrigger('reglas_rotacion');
export const auditLogServiceDefinitions = makeAuditTrigger('service_definitions');
export const auditLogServiceMatrices = makeAuditTrigger('service_matrices');

// ─── HTTP endpoint para query del log ────────────────────────────────────

/**
 * GET /auditLogQuery?collection=X&days=N&uid=Y&limit=Z
 * Devuelve eventos de audit_log filtrados. Sólo accesible por admins.
 *
 * NOTA: la auth real se hace en firestore.rules (lectura sólo isAdminNorm).
 * Este endpoint es atajo HTTP para la página AdminAuditLog que hace una
 * query con orderBy + filters via SDK directamente.
 */
export const auditLogQuery = functions
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    try {
      const collection = (req.query.collection as string) ?? '';
      const days = Math.min(Math.max(parseInt((req.query.days as string) ?? '7', 10), 1), 90);
      const uid = (req.query.uid as string) ?? '';
      const limitN = Math.min(Math.max(parseInt((req.query.limit as string) ?? '200', 10), 1), 1000);

      const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
      let q: FirebaseFirestore.Query = db.collection(COLLECTION)
        .where('ts', '>=', admin.firestore.Timestamp.fromMillis(sinceMs))
        .orderBy('ts', 'desc')
        .limit(limitN);
      if (collection) q = q.where('collection', '==', collection);
      if (uid) q = q.where('uid', '==', uid);

      const snap = await q.get();
      const events = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ts: data.ts?.toDate?.()?.toISOString?.() ?? null,
          uid: data.uid ?? null,
          email: data.email ?? null,
          action: data.action,
          collection: data.collection,
          docId: data.docId,
          diff: data.diff ?? [],
        };
      });
      res.json({ ok: true, total: events.length, events });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      console.error('[auditLogQuery] Error:', msg);
      res.status(500).json({ ok: false, error: msg });
    }
  });
