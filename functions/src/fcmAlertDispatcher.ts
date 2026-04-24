/**
 * fcmAlertDispatcher.ts — FCM universal para alertas_regulacion + ACK loop
 * ==========================================================================
 * DIRECTRIZ 2026-04-24: producto nivel internacional. Cierra el loop
 * operacional que Swiftly/Optibus tienen: alerta generada → push al
 * conductor → ACK del conductor → tracking de response time.
 *
 * Dos responsabilidades:
 *   1. `onAlertaCreated` — trigger onCreate de alertas_regulacion. Mira
 *      el coche_id, busca el fcm_token del conductor asignado a ese
 *      coche en viajes_activos/cartones, y envía FCM. Marca el doc con
 *      fcmSent + fcmSentAt (o fcmError si falló).
 *
 *      Idempotente: si el doc ya tiene fcmSent:true, no reenvía. Eso
 *      evita dobles push si el trigger se redispara por un update.
 *
 *   2. `acknowledgeAlerta` — HTTP endpoint que el app del conductor
 *      invoca cuando toca "OK" en la notificación. Marca ack_at +
 *      ack_response_time_sec + ack_by_coche_id.
 *
 * Ambos complementan el shadowDispatcher.ts existente (que envía FCM
 * sólo para alertas creadas por SU propio cron). Con este, cualquier
 * alerta — venga del backend cron, del frontend ShadowRadar, o de
 * disparo manual — dispara push de la misma forma.
 *
 * Métricas canónicas TCRP 100/165:
 *   - response_time_sec: segundos entre alerta emitida y ACK del chofer.
 *   - ack_rate: % de alertas reconocidas (kpi para v6 analytics).
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const db = admin.firestore();
const messaging = admin.messaging();

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Busca el fcm_token del conductor que opera el coche_id indicado.
 * Estrategia (en orden, primero que matchee):
 *   1. viajes_activos/{cocheId}.conductor_fcm_token (frontend chofer lo sube)
 *   2. viajes_activos/{cocheId}.conductor_snapshot.fcm_token
 *   3. cartones_activos/{cocheId}.chofer_snapshot.fcm_token (backend)
 *   4. users donde coche_id == {cocheId} AND fcmToken IS NOT NULL
 */
async function findDriverFcmToken(cocheId: string): Promise<string | null> {
  if (!cocheId) return null;

  // 1. viajes_activos por ID directo del coche
  try {
    const va = await db.collection('viajes_activos').doc(cocheId).get();
    if (va.exists) {
      const d = va.data();
      const t1 = d?.conductor_fcm_token;
      if (typeof t1 === 'string' && t1.length > 20) return t1;
      const t2 = d?.conductor_snapshot?.fcm_token;
      if (typeof t2 === 'string' && t2.length > 20) return t2;
    }
  } catch (err) {
    console.warn(`[fcmDispatcher] viajes_activos lookup fallo para ${cocheId}:`, err);
  }

  // 2. cartones_activos (documento heredado del backend)
  try {
    const ca = await db.collection('cartones_activos').doc(cocheId).get();
    if (ca.exists) {
      const t = ca.data()?.chofer_snapshot?.fcm_token;
      if (typeof t === 'string' && t.length > 20) return t;
    }
  } catch (err) {
    console.warn(`[fcmDispatcher] cartones_activos lookup fallo para ${cocheId}:`, err);
  }

  // 3. users con coche_id matching
  try {
    const uSnap = await db
      .collection('users')
      .where('coche_id', '==', cocheId)
      .where('fcmToken', '!=', null)
      .limit(1)
      .get();
    if (!uSnap.empty) {
      const t = uSnap.docs[0]!.data().fcmToken;
      if (typeof t === 'string' && t.length > 20) return t;
    }
  } catch (err) {
    // fcmToken != null necesita índice; fallback a buscar por coche_id sin ese filtro
    try {
      const uSnap = await db.collection('users').where('coche_id', '==', cocheId).limit(5).get();
      for (const doc of uSnap.docs) {
        const t = doc.data().fcmToken;
        if (typeof t === 'string' && t.length > 20) return t;
      }
    } catch (err2) {
      console.warn(`[fcmDispatcher] users lookup fallo para ${cocheId}:`, err2);
    }
  }

  return null;
}

/**
 * Construye el payload FCM según el tipo de alerta.
 * Respeta formato canónico: alert + data. Data usada por el service
 * worker / foreground handler para construir UI.
 */
function buildFcmMessage(alerta: admin.firestore.DocumentData, token: string, alertaId: string) {
  const tipo = String(alerta.tipo ?? 'SHADOW');
  const distM = Number(alerta.distancia_metros ?? 0);
  const titleByTipo: Record<string, string> = {
    RIVAL_PISANDO_TURNO: '🚨 Rival pisando tu turno',
    PELIGRO_BUNCHING: '⚠️ Rival cerca',
    GANAR_SALIDA: '🏁 Ganar salida',
    DISPARO_MANUAL: '📢 Disparo táctico',
  };
  const title = titleByTipo[tipo] ?? 'Alerta de regulación';
  const body = String(alerta.mensaje_chofer ?? `Atención coche ${alerta.coche_id ?? ''}`);

  return {
    token,
    notification: { title, body },
    data: {
      tipo,
      alertaId,
      coche_id: String(alerta.coche_id ?? ''),
      linea_id: String(alerta.linea_id ?? ''),
      rival_empresa: String(alerta.rival_empresa ?? ''),
      rival_linea: String(alerta.rival_linea ?? ''),
      distancia_metros: String(distM),
      instruccion: String(alerta.instruccion ?? 'REGULACION_MARCHA'),
      createdAt: String(Date.now()),
    },
    android: {
      priority: 'high' as const,
      notification: {
        channelId: 'regulacion_marcha',
        sound: 'default',
        vibrateTimingsMillis: [0, 300, 100, 400],
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
        },
      },
    },
  };
}

// ─── 1) Trigger onCreate ───────────────────────────────────────────────────

export const onAlertaCreated = functions.firestore
  .document('alertas_regulacion/{alertaId}')
  .onCreate(async (snap, context) => {
    const alertaId = context.params.alertaId as string;
    const alerta = snap.data();
    if (!alerta) return null;

    // Idempotencia básica (si el backend ya envió FCM antes — ver shadowDispatcher.ts)
    if (alerta.fcmSent === true) return null;

    const cocheId = String(alerta.coche_id ?? '');
    if (!cocheId) {
      await snap.ref.update({
        fcmSent: false,
        fcmError: 'missing_coche_id',
        fcmErrorAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return null;
    }

    const token = await findDriverFcmToken(cocheId);
    if (!token) {
      await snap.ref.update({
        fcmSent: false,
        fcmError: 'no_driver_token',
        fcmErrorAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return null;
    }

    try {
      const message = buildFcmMessage(alerta, token, alertaId);
      const response = await messaging.send(message);
      await snap.ref.update({
        fcmSent: true,
        fcmSentAt: admin.firestore.FieldValue.serverTimestamp(),
        fcmMessageId: response,
      });
      console.log(`[fcmDispatcher] Push enviada a ${cocheId} (${alertaId}): ${response}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await snap.ref.update({
        fcmSent: false,
        fcmError: msg.slice(0, 200),
        fcmErrorAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.warn(`[fcmDispatcher] Error enviando push a ${cocheId}:`, msg);
    }
    return null;
  });

// ─── 2) HTTP endpoint para ACK ─────────────────────────────────────────────

/**
 * Endpoint que el app del conductor invoca al tocar "OK" en la push.
 *   POST /acknowledgeAlerta
 *   body: { alertaId: string, cocheId?: string }
 *
 * Valida que el doc exista y no esté ya reconocido. Calcula
 * response_time_sec = ahora - timestamp de emisión. Escribe:
 *   ack_at: serverTimestamp
 *   ack_response_time_sec: number
 *   ack_by_coche_id: string (si venía en el body)
 *   leido: true
 */
export const acknowledgeAlerta = functions.https.onRequest(async (req, res) => {
  // CORS básico (el app móvil y la web del chofer pueden llamar este endpoint)
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const alertaId = String(body.alertaId ?? req.query.alertaId ?? '').trim();
    const cocheId = body.cocheId ? String(body.cocheId) : undefined;

    if (!alertaId) {
      res.status(400).json({ ok: false, error: 'alertaId_required' });
      return;
    }

    const ref = db.collection('alertas_regulacion').doc(alertaId);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).json({ ok: false, error: 'alerta_not_found' });
      return;
    }

    const data = snap.data()!;
    if (data.ack_at) {
      // Ya fue reconocida antes — respuesta idempotente
      res.json({
        ok: true,
        already_acknowledged: true,
        ack_at: data.ack_at,
        ack_response_time_sec: data.ack_response_time_sec ?? null,
      });
      return;
    }

    const createdAtMs =
      (data.timestamp?.toMillis?.() as number | undefined) ??
      (data.timestamp?.seconds ? data.timestamp.seconds * 1000 : null);
    const nowMs = Date.now();
    const responseTimeSec = createdAtMs ? Math.round((nowMs - createdAtMs) / 1000) : null;

    await ref.update({
      ack_at: admin.firestore.FieldValue.serverTimestamp(),
      ack_response_time_sec: responseTimeSec,
      ...(cocheId ? { ack_by_coche_id: cocheId } : {}),
      leido: true,
    });

    res.json({
      ok: true,
      alertaId,
      ack_response_time_sec: responseTimeSec,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[acknowledgeAlerta] Error:', msg);
    res.status(500).json({ ok: false, error: msg });
  }
});
