/**
 * complianceAlertsTick — detecta líneas con cumplimiento degradado y
 * persiste alertas en la colección `compliance_alerts`.
 *
 * Corre cada 6 horas. Por cada línea con ≥5 eventos en las últimas 24h:
 *   - pct < 50% → nivel CRITICO
 *   - 50% ≤ pct < 65% → nivel BAJO
 *   - pct ≥ 65% → elimina alerta preexistente (línea recuperada)
 *
 * Además envía FCM a todos los usuarios ADMIN/TRAFFIC con token registrado
 * cuando hay alertas CRITICO nuevas o actualizadas.
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const UMBRAL_CRITICO = 50;
const UMBRAL_BAJO = 65;
const MIN_EVENTOS = 5;

const NOMBRE_EMPRESA: Record<string, string> = {
  '70': 'UCOT',
  '50': 'CUTCSA',
  '20': 'COME',
  '10': 'COETC',
};

export const complianceAlertsTick = functions.pubsub
  .schedule('every 6 hours')
  .timeZone('America/Montevideo')
  .onRun(async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const hace24h = admin.firestore.Timestamp.fromMillis(
      now.toMillis() - 24 * 60 * 60 * 1000,
    );

    /* ── 1. Leer eventos de las últimas 24h ─────────────── */
    const eventosSnap = await db
      .collection('vehicle_events')
      .where('timestamp', '>=', hace24h)
      .get();

    type LinData = { total: number; enTiempo: number; empresa: string };
    const porLinea: Record<string, LinData> = {};

    for (const doc of eventosSnap.docs) {
      const d = doc.data();
      const linea: string = String(d.linea ?? '?');
      const empresa: string = String(d.codigoEmpresa ?? d.empresa ?? '?');
      const key = `${empresa}_${linea}`;
      if (!porLinea[key]) porLinea[key] = { total: 0, enTiempo: 0, empresa };
      porLinea[key].total++;
      if (d.estadoCumplimiento === 'EN_TIEMPO') porLinea[key].enTiempo++;
    }

    /* ── 2. Calcular y escribir alertas ─────────────────── */
    const batch = db.batch();
    const nuevasCriticas: string[] = [];

    for (const [key, data] of Object.entries(porLinea)) {
      if (data.total < MIN_EVENTOS) continue;

      const pct = Math.round((data.enTiempo / data.total) * 100);
      const [empresa, linea] = key.split('_');
      const ref = db.collection('compliance_alerts').doc(key);

      if (pct < UMBRAL_BAJO) {
        const nivel: 'CRITICO' | 'BAJO' = pct < UMBRAL_CRITICO ? 'CRITICO' : 'BAJO';
        batch.set(
          ref,
          {
            linea,
            empresa,
            empresaNombre: NOMBRE_EMPRESA[empresa] ?? empresa,
            pctEnTiempo: pct,
            totalEventos: data.total,
            nivel,
            updatedAt: now,
            dismissed: false,
            dismissedBy: null,
            dismissedAt: null,
          },
          { merge: true },
        );
        if (nivel === 'CRITICO') {
          nuevasCriticas.push(
            `Línea ${linea} (${NOMBRE_EMPRESA[empresa] ?? empresa}) — ${pct}%`,
          );
        }
      } else {
        // Línea recuperada: eliminar alerta preexistente
        batch.delete(ref);
      }
    }

    await batch.commit();

    /* ── 3. FCM a supervisores si hay alertas CRITICO ───── */
    if (nuevasCriticas.length > 0) {
      const usersSnap = await db
        .collection('users')
        .where('role', 'in', ['ADMIN', 'TRAFFIC'])
        .where('fcmToken', '!=', null)
        .get();

      const tokens = usersSnap.docs
        .map((d) => d.data().fcmToken as string)
        .filter(Boolean);

      if (tokens.length > 0) {
        const titulo = `⚠️ ${nuevasCriticas.length} línea${nuevasCriticas.length > 1 ? 's' : ''} con cumplimiento crítico`;
        const cuerpo = nuevasCriticas.slice(0, 3).join(' · ');

        await admin.messaging().sendEachForMulticast({
          tokens,
          notification: { title: titulo, body: cuerpo },
          data: {
            type: 'compliance_alert',
            count: String(nuevasCriticas.length),
            url: '/dashboard/traffic/diagnostico',
          },
          android: { priority: 'high' },
        });
      }
    }

    functions.logger.info(
      `complianceAlertsTick: ${Object.keys(porLinea).length} líneas analizadas, ` +
      `${nuevasCriticas.length} alertas CRITICO`,
    );
  });
