/**
 * incidenciaDispatcher.ts — Notificaciones FCM al crear incidencias
 * =================================================================
 * Trigger Firestore: incidencias/{incidenciaId}.onCreate
 *
 * Al crear una incidencia, envía push:
 *   - A supervisores y despachantes (role: TRAFFIC | ADMIN) — siempre
 *   - A conductores activos en la línea afectada — solo si priority es
 *     'ALTA' o 'CRITICA' (evita spam por incidencias menores)
 *
 * Usa sendMulticast para enviar a múltiples tokens en una sola llamada.
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const db = admin.firestore();
const messaging = admin.messaging();

const SUPERVISOR_ROLES = ['traffic', 'admin', 'superadmin', 'inspector'];

/** Obtiene tokens FCM de supervisores y despachantes activos */
async function getSupervisorTokens(): Promise<string[]> {
  const snap = await db.collection('users')
    .where('fcmToken', '!=', null)
    .get();

  const tokens: string[] = [];
  snap.docs.forEach((doc) => {
    const data = doc.data();
    const role = (data.role ?? data.rol ?? '').toString().toLowerCase();
    if (SUPERVISOR_ROLES.includes(role) && data.fcmToken) {
      tokens.push(data.fcmToken as string);
    }
  });
  return tokens;
}

/** Obtiene tokens FCM de conductores activos en una línea */
async function getConductorTokensForLine(lineaCodigo: string): Promise<string[]> {
  if (!lineaCodigo) return [];

  // 1. Buscar viajes activos en esa línea
  const viajesSnap = await db.collection('viajes_activos')
    .where('linea_id', '==', lineaCodigo)
    .get();

  if (viajesSnap.empty) return [];

  // 2. Para cada viaje, buscar token en users por conductor_id o coche_id
  const tokens: string[] = [];
  for (const doc of viajesSnap.docs) {
    const data = doc.data();
    const conductorId = data.conductor_id ?? data.chofer_id;
    if (!conductorId) continue;

    // Buscar token directamente en viaje
    if (data.conductor_fcm_token) {
      tokens.push(data.conductor_fcm_token as string);
      continue;
    }

    // Buscar en users
    const userDoc = await db.collection('users').doc(conductorId).get();
    if (userDoc.exists && userDoc.data()?.fcmToken) {
      tokens.push(userDoc.data()!.fcmToken as string);
    }
  }

  return tokens;
}

/** Deduplica y filtra tokens vacíos */
function uniqueTokens(tokens: string[]): string[] {
  return [...new Set(tokens.filter((t) => t && t.length > 10))];
}

// ─── Trigger onCreate ─────────────────────────────────────────────────────────

export const onIncidenciaCreated = functions.firestore
  .document('incidencias/{incidenciaId}')
  .onCreate(async (snap, context) => {
    const incidenciaId = context.params.incidenciaId as string;
    const inc = snap.data();
    if (!inc) return null;

    // No reenviar si ya fue procesada (p.ej. por un retry del trigger)
    if (inc.fcmSent === true) return null;

    const tipo = String(inc.type ?? inc.tipo ?? 'INCIDENCIA');
    const descripcion = String(inc.description ?? inc.descripcion ?? 'Nueva incidencia reportada');
    const lineaCodigo = String(inc.lineaCodigo ?? inc.linea ?? '');
    const priority = String(inc.priority ?? inc.prioridad ?? 'MEDIA').toUpperCase();
    const isUrgent = priority === 'ALTA' || priority === 'CRITICA';

    // Recopilar tokens según prioridad
    const [supervisorTokens, conductorTokens] = await Promise.all([
      getSupervisorTokens(),
      isUrgent ? getConductorTokensForLine(lineaCodigo) : Promise.resolve([] as string[]),
    ]);

    const allTokens = uniqueTokens([...supervisorTokens, ...conductorTokens]);

    if (allTokens.length === 0) {
      await snap.ref.update({
        fcmSent: false,
        fcmError: 'no_tokens_found',
        fcmErrorAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.warn(`[incidenciaDispatcher] Sin tokens FCM para incidencia ${incidenciaId}`);
      return null;
    }

    const lineaLabel = lineaCodigo ? ` — Línea ${lineaCodigo}` : '';
    const notification: admin.messaging.MulticastMessage = {
      tokens: allTokens,
      notification: {
        title: `🚨 ${tipo}${lineaLabel}`,
        body: descripcion.slice(0, 160),
      },
      data: {
        incidenciaId,
        tipo,
        lineaCodigo,
        priority,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        route: '/dashboard/traffic/incidents',
      },
      android: {
        priority: isUrgent ? 'high' : 'normal',
        notification: { sound: isUrgent ? 'default' : 'silent', channelId: 'incidencias' },
      },
      apns: {
        payload: { aps: { sound: isUrgent ? 'default' : undefined, badge: 1 } },
      },
    };

    try {
      const response = await messaging.sendEachForMulticast(notification);
      const sent = response.responses.filter((r) => r.success).length;
      const failed = response.failureCount;

      await snap.ref.update({
        fcmSent: true,
        fcmSentAt: admin.firestore.FieldValue.serverTimestamp(),
        fcmTokensSent: sent,
        fcmTokensFailed: failed,
        fcmSupervisores: supervisorTokens.length,
        fcmConductores: conductorTokens.length,
      });

      console.log(`[incidenciaDispatcher] ${incidenciaId}: ${sent} pushes OK, ${failed} fallidas`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await snap.ref.update({
        fcmSent: false,
        fcmError: msg.slice(0, 200),
        fcmErrorAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.warn(`[incidenciaDispatcher] Error enviando push:`, msg);
    }

    return null;
  });
