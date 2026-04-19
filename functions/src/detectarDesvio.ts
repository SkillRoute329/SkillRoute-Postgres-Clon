import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const db = admin.firestore();
const messaging = admin.messaging();

// ─── Fórmula de Haversine ─────────────────────────────────────────────────────
function haversineMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanciaMinAlTrazado(
  lat: number,
  lng: number,
  recorrido: Array<{ lat: number; lng: number }>
): number {
  if (!recorrido || recorrido.length === 0) return 0;
  return Math.min(...recorrido.map((p) => haversineMetros(lat, lng, p.lat, p.lng)));
}

// ─── Caja geográfica de Montevideo (anti-Zombie GPS) ─────────────────────────
const GEO_BOUNDS = { latMin: -34.95, latMax: -34.70, lngMin: -56.35, lngMax: -56.00 };

// ─── GPS Webhook V2: Posición + Detección de Desvío + Notificación FCM ────────
// POST /gpsWebhookV2 — Body: { vehicleId, lat, lng, speed?, heading?, lineaId? }
export const gpsWebhookV2 = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { vehicleId, lat, lng, speed, heading, lineaId } = req.body as {
      vehicleId: string;
      lat: number;
      lng: number;
      speed?: number;
      heading?: number;
      lineaId?: string;
    };

    if (!vehicleId || lat == null || lng == null) {
      res.status(400).json({ error: 'vehicleId, lat y lng son requeridos' });
      return;
    }

    const latN = Number(lat);
    const lngN = Number(lng);

    // 1. Validación anti-Zombie GPS
    if (
      latN < GEO_BOUNDS.latMin || latN > GEO_BOUNDS.latMax ||
      lngN < GEO_BOUNDS.lngMin || lngN > GEO_BOUNDS.lngMax
    ) {
      console.warn(`[GPS-ZOMBIE] Coche ${vehicleId} fuera de Montevideo: ${latN},${lngN}`);
      res.json({ ok: false, motivo: 'COORDENADAS_FUERA_DE_RANGO_OPERATIVO' });
      return;
    }

    const cocheId = String(vehicleId);
    const UMBRAL_DESVIO_METROS = 30;

    // 2. Actualizar posición en viajes_activos
    const viajeRef = db.collection('viajes_activos').doc(cocheId);
    await viajeRef.set(
      {
        cocheId,
        posicion: new admin.firestore.GeoPoint(latN, lngN),
        velocidad: speed ?? null,
        rumbo: heading ?? null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        estado: 'en_servicio',
        fuente: 'webhook_v2',
      },
      { merge: true }
    );

    // 3. Resolver lineaId desde el payload o desde el documento existente
    const linea = lineaId || (await viajeRef.get()).data()?.lineaId as string | undefined;
    if (!linea) {
      res.json({ ok: true, desvio: false, motivo: 'sin_linea_asignada' });
      return;
    }

    // 4. Leer trazado oficial (1 sola lectura — paradas_embed desnormalizadas)
    const lineaDoc = await db.collection('lineas_ucot').doc(linea).get();
    if (!lineaDoc.exists) {
      res.json({ ok: true, desvio: false, motivo: 'linea_no_encontrada' });
      return;
    }
    const lineaData = lineaDoc.data()!;
    const recorrido: Array<{ lat: number; lng: number }> = lineaData.recorrido || [];

    // 5. Verificar desvío activo vigente (índice compuesto requerido en firestore.indexes.json)
    const desvioSnap = await db
      .collection('desvios_activos')
      .where('linea_id', '==', linea)
      .where('expire_at', '>', admin.firestore.Timestamp.now())
      .where('expirado', '==', false)
      .limit(1)
      .get();

    let trazadoEfectivo = recorrido;
    let modoDesvio = false;
    let desvioActivoId: string | null = null;

    if (!desvioSnap.empty) {
      const desvioDoc = desvioSnap.docs[0];
      trazadoEfectivo = desvioDoc.data().polilinea || recorrido;
      modoDesvio = true;
      desvioActivoId = desvioDoc.id;
    }

    // 6. Calcular distancia mínima al trazado efectivo
    const distanciaMetros = distanciaMinAlTrazado(latN, lngN, trazadoEfectivo);
    const hayDesvio = distanciaMetros > UMBRAL_DESVIO_METROS;

    if (hayDesvio) {
      // 7. Registrar evento de desvío
      const eventoRef = await db.collection('eventos_desvio').add({
        coche_id: cocheId,
        linea_id: linea,
        tipo: modoDesvio ? 'FUERA_DE_DESVIO_OFICIAL' : 'FUERA_DE_RUTA',
        lat: latN,
        lng: lngN,
        metros_fuera: Math.round(distanciaMetros),
        desvio_activo_id: desvioActivoId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        notificado: false,
        resuelto: false,
      });

      // 8. Actualizar viajes_activos con flag de desvío
      await viajeRef.update({
        en_desvio_no_autorizado: true,
        ultimo_evento_desvio: eventoRef.id,
        metros_fuera_ruta: Math.round(distanciaMetros),
      });

      // 9. FCM → Inspectores del corredor
      const inspectoresSnap = await db
        .collection('personal')
        .where('rol', '==', 'inspector')
        .where('estado', '==', 'activo')
        .where('corredor_asignado', '==', linea)
        .get();

      const tokens: string[] = [];
      inspectoresSnap.forEach((doc) => {
        const tk = doc.data().fcm_token as string | undefined;
        if (tk) tokens.push(tk);
      });

      if (tokens.length > 0) {
        await messaging.sendEachForMulticast({
          tokens,
          notification: {
            title: `🚨 Desvío No Autorizado — Coche ${cocheId}`,
            body: `Unidad ${cocheId} a ${Math.round(distanciaMetros)}m del trazado${modoDesvio ? ' del desvío oficial' : ''}. Línea ${linea}.`,
          },
          data: {
            tipo: 'DESVIO_NO_AUTORIZADO',
            coche_id: cocheId,
            linea_id: linea,
            metros: String(Math.round(distanciaMetros)),
            evento_id: eventoRef.id,
            lat: String(latN),
            lng: String(lngN),
          },
          android: { priority: 'high' },
          apns: { payload: { aps: { sound: 'default', badge: 1 } } },
        });
        await eventoRef.update({ notificado: true, tokens_notificados: tokens.length });
      }

      console.log(`[desvio] Coche ${cocheId} a ${Math.round(distanciaMetros)}m. Evento: ${eventoRef.id}`);
      res.json({
        ok: true,
        desvio: true,
        metros_fuera: Math.round(distanciaMetros),
        evento_id: eventoRef.id,
        inspectores_notificados: tokens.length,
        modo_desvio_oficial: modoDesvio,
      });
    } else {
      // Sin desvío — limpiar flag si estaba activo
      const viajeData = (await viajeRef.get()).data();
      if (viajeData?.en_desvio_no_autorizado) {
        await viajeRef.update({ en_desvio_no_autorizado: false, metros_fuera_ruta: 0 });
      }
      res.json({ ok: true, desvio: false, metros_al_trazado: Math.round(distanciaMetros) });
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error interno';
    console.error('[gpsWebhookV2] Error:', msg);
    res.status(500).json({ error: msg });
  }
});

// ─── CRON: Expiración automática de desvíos puntuales ────────────────────────
export const expirarDesvios = functions
  .runWith({ timeoutSeconds: 60 })
  .pubsub.schedule('every 15 minutes')
  .onRun(async () => {
    const ahora = admin.firestore.Timestamp.now();
    const snap = await db
      .collection('desvios_activos')
      .where('expire_at', '<', ahora)
      .where('expirado', '==', false)
      .get();

    if (snap.empty) return;

    const batch = db.batch();
    snap.forEach((doc) => {
      batch.update(doc.ref, {
        expirado: true,
        expirado_en: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
    console.log(`[expirarDesvios] ${snap.size} desvíos expirados.`);
  });

// ─── CRON: Alertas de Vencimiento Documental (Carné / Libreta) ───────────────
// Skill 16 — Ejecuta diariamente 06:00 AM (Montevideo)
export const alertasVencimientosDocumentales = functions
  .runWith({ timeoutSeconds: 120 })
  .pubsub.schedule('0 6 * * *')
  .timeZone('America/Montevideo')
  .onRun(async () => {
    const hoy = new Date();
    const d60 = new Date(hoy); d60.setDate(hoy.getDate() + 60);
    const d15 = new Date(hoy); d15.setDate(hoy.getDate() + 15);

    const fichasSnap = await db.collection('fichas_medicas').get();
    const batch = db.batch();
    let bloqueados = 0;
    let alertados = 0;

    fichasSnap.forEach((doc) => {
      const data = doc.data();
      const vencSalud: Date = data.venc_carne_salud?.toDate?.() ?? new Date(0);
      const vencLibreta: Date = data.venc_libreta?.toDate?.() ?? new Date(0);
      const menorVenc = vencSalud <= vencLibreta ? vencSalud : vencLibreta;
      const updates: Record<string, unknown> = {};

      if (menorVenc <= hoy) {
        updates['isEligible'] = false;
        updates['motivo_bloqueo'] = 'DOCUMENTACION_VENCIDA';
        bloqueados++;
        // Propagar bloqueo al perfil de personal
        const personalRef = db.collection('personal').doc(data.chofer_id as string);
        batch.update(personalRef, { isEligible: false });
      } else if (menorVenc <= d15) {
        updates['alerta_nivel'] = 'CRITICO_D15';
        alertados++;
      } else if (menorVenc <= d60) {
        updates['alerta_nivel'] = 'PREVENTIVO_D60';
        alertados++;
      }

      if (Object.keys(updates).length > 0) {
        batch.update(doc.ref, updates);
      }
    });

    await batch.commit();
    console.log(`[vencimientos] ${bloqueados} bloqueados, ${alertados} alertados.`);
  });

// ─── TRIGGER: SoC < 20% → GROUNDED + Notificación Admin ─────────────────────
// Skill 14 (Electromovilidad)
export const alertaSoCBajo = functions.firestore
  .document('ev_carga_programada/{cocheId}')
  .onUpdate(async (change, context) => {
    const { cocheId } = context.params;
    const nuevo = change.after.data();
    const anterior = change.before.data();

    const socActual: number = nuevo?.soc_actual ?? 100;
    const socAnterior: number = anterior?.soc_actual ?? 100;
    const UMBRAL_SOC = 20;

    if (socActual < UMBRAL_SOC && socAnterior >= UMBRAL_SOC) {
      const shiftSnap = await db
        .collection('shifts')
        .where('vehicleId', '==', cocheId)
        .where('status', '==', 'PENDING')
        .get();

      if (!shiftSnap.empty) {
        await db.collection('ev_carga_programada').doc(cocheId).update({
          grounded: true,
          motivo_grounded: `SoC insuficiente: ${socActual}%`,
        });
        await db.collection('viajes_activos').doc(cocheId).set(
          { grounded: true, soc_critico: true, soc_actual: socActual },
          { merge: true }
        );

        const adminSnap = await db
          .collection('personal')
          .where('rol', '==', 'administrador')
          .get();

        const tokens: string[] = [];
        adminSnap.forEach((d) => {
          const tk = d.data().fcm_token as string | undefined;
          if (tk) tokens.push(tk);
        });

        if (tokens.length > 0) {
          await messaging.sendEachForMulticast({
            tokens,
            notification: {
              title: `⚡ Coche ${cocheId} sin batería suficiente`,
              body: `SoC al ${socActual}%. Tiene ${shiftSnap.size} servicio(s) asignado(s). Requiere reasignación urgente.`,
            },
            data: { tipo: 'SOC_CRITICO', coche_id: cocheId, soc: String(socActual) },
            android: { priority: 'high' },
          });
        }

        console.log(`[SoC] Coche ${cocheId} GROUNDED. SoC=${socActual}%. Servicios: ${shiftSnap.size}`);
      }
    }
  });
