/**
 * marketPenetration.ts — Snapshot diario de cuota de mercado por línea
 * ======================================================================
 * Cada día toma snapshot de los buses GPS observados en el sistema y
 * agrega por (linea_normalizada × agencyId). Persiste en
 * `penetracion_diaria/{ymd}_{linea}` con un objeto:
 *   {
 *     fecha, linea,
 *     totalBuses, agencias: {
 *       '70': { count, sharePct },
 *       '50': { count, sharePct },
 *       ...
 *     },
 *     dominante: { agencyId, label, sharePct },
 *     ultimaActualizacion
 *   }
 *
 * Permite reconstruir histórico de penetración por operador-corredor sin
 * tener que mantener cartones detallados. Fuente liviana, ideal para
 * tendencias diarias/semanales.
 *
 * Triggers:
 *   - cron `45 23 * * *` Mvd → snapshot del día actual
 *   - HTTP /computePenetrationNow?date=YYYY-MM-DD
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const COLLECTION = 'penetracion_diaria';
const AGENCY_NAMES: Record<string, string> = {
  '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT',
};

interface PenetracionLineaDoc {
  fecha: string;
  linea: string;
  totalBuses: number;
  agencias: Record<string, { count: number; sharePct: number; label: string }>;
  dominante: { agencyId: string; label: string; sharePct: number } | null;
  ultimaActualizacion: admin.firestore.FieldValue;
}

function ymdOf(d: Date): string {
  const localMs = d.getTime() - 3 * 3600 * 1000;
  return new Date(localMs).toISOString().slice(0, 10);
}

function normalizeLinea(raw: string | undefined): string {
  return String(raw ?? '').trim().replace(/[ab]$/i, '');
}

/**
 * Toma snapshot de penetración usando vehicle_events recientes (últimas 4h)
 * agregados por (línea × agencyId). Agrupa por bus único — un bus no se
 * cuenta dos veces aunque haya emitido múltiples eventos.
 */
async function snapshotPenetration(
  ymd: string,
  windowHours: number = 4,
): Promise<{
  ymd: string;
  lineas: number;
  totalBusesUnicos: number;
  porLinea: Record<string, PenetracionLineaDoc>;
}> {
  const sinceMs = Date.now() - windowHours * 3600 * 1000;
  const sinceTs = admin.firestore.Timestamp.fromMillis(sinceMs);

  // Iterar por agencia para evitar query masiva sin filtros
  type AgEntry = { agencyId: string; busId: string; linea: string };
  const allBuses: AgEntry[] = [];

  for (const ag of Object.keys(AGENCY_NAMES)) {
    const snap = await db
      .collection('vehicle_events')
      .where('agencyId', '==', ag)
      .where('createdAt', '>=', sinceTs)
      .orderBy('createdAt', 'desc')
      .limit(15000)
      .get();

    const seen = new Set<string>();
    snap.forEach((doc) => {
      const ev = doc.data();
      // Política unificada (docs/POLITICA_OTP_UNIFICADA.md): FUERA_DE_SERVICIO
      // excluido del denominador — un bus apagado no es "presencia operativa".
      if (ev.estadoCumplimiento === 'FUERA_DE_SERVICIO') return;
      const busId = String(ev.idBus ?? doc.id);
      if (seen.has(busId)) return;
      seen.add(busId);
      const linea = normalizeLinea(String(ev.linea ?? ''));
      if (!linea) return;
      allBuses.push({ agencyId: ag, busId, linea });
    });
  }

  // Agrupar por línea
  const byLinea: Record<
    string,
    { totalBuses: number; agencias: Record<string, number> }
  > = {};

  for (const b of allBuses) {
    if (!byLinea[b.linea]) byLinea[b.linea] = { totalBuses: 0, agencias: {} };
    byLinea[b.linea].totalBuses += 1;
    byLinea[b.linea].agencias[b.agencyId] = (byLinea[b.linea].agencias[b.agencyId] ?? 0) + 1;
  }

  // Construir docs y persistir
  const porLinea: Record<string, PenetracionLineaDoc> = {};
  for (const [linea, data] of Object.entries(byLinea)) {
    const agencias: PenetracionLineaDoc['agencias'] = {};
    let dom: PenetracionLineaDoc['dominante'] = null;
    for (const [ag, count] of Object.entries(data.agencias)) {
      const sharePct = data.totalBuses > 0 ? (count / data.totalBuses) * 100 : 0;
      agencias[ag] = { count, sharePct, label: AGENCY_NAMES[ag] ?? ag };
      if (!dom || sharePct > dom.sharePct) {
        dom = { agencyId: ag, label: AGENCY_NAMES[ag] ?? ag, sharePct };
      }
    }
    const docId = `${ymd}_${linea}`;
    const docData: PenetracionLineaDoc = {
      fecha: ymd,
      linea,
      totalBuses: data.totalBuses,
      agencias,
      dominante: dom,
      ultimaActualizacion: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection(COLLECTION).doc(docId).set(docData, { merge: true });
    porLinea[linea] = docData;
  }

  return {
    ymd,
    lineas: Object.keys(byLinea).length,
    totalBusesUnicos: allBuses.length,
    porLinea,
  };
}

// HTTP: snapshot manual
export const computePenetrationNow = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    try {
      const ymd = (req.query.date as string) ?? ymdOf(new Date());
      const windowH = parseInt((req.query.hours as string) ?? '4', 10);
      const result = await snapshotPenetration(ymd, windowH);
      res.json({
        ok: true,
        ymd: result.ymd,
        lineas: result.lineas,
        totalBusesUnicos: result.totalBusesUnicos,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      console.error('[penetracion] Error:', msg);
      res.status(500).json({ ok: false, error: msg });
    }
  });

// Cron diario: 23:45 Mvd
export const computePenetrationCron = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .pubsub.schedule('45 23 * * *')
  .timeZone('America/Montevideo')
  .onRun(async () => {
    try {
      const ymd = ymdOf(new Date());
      const result = await snapshotPenetration(ymd, 4);
      console.log('[penetracion] Cron OK:', JSON.stringify({
        ymd: result.ymd,
        lineas: result.lineas,
        totalBuses: result.totalBusesUnicos,
      }));
    } catch (err) {
      console.error('[penetracion] Cron error:', err instanceof Error ? err.message : err);
    }
    return null;
  });

/**
 * HTTP query para el dashboard frontend: devuelve serie histórica de
 * penetración de un operador para un rango de días.
 *
 * GET /penetrationHistoric?agencyId=70&days=30&topLineas=20
 */
export const penetrationHistoric = functions
  .runWith({ timeoutSeconds: 60, memory: '256MB' })
  .https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    try {
      const agencyId = (req.query.agencyId as string) ?? '70';
      const days = Math.min(Math.max(parseInt((req.query.days as string) ?? '30', 10), 1), 90);
      const topLineas = Math.min(parseInt((req.query.topLineas as string) ?? '20', 10), 100);

      const sinceMs = Date.now() - days * 24 * 3600 * 1000;
      const sinceYmd = ymdOf(new Date(sinceMs));

      // Query rango por fecha (string >= sinceYmd)
      const snap = await db
        .collection(COLLECTION)
        .where('fecha', '>=', sinceYmd)
        .orderBy('fecha', 'desc')
        .limit(20000)
        .get();

      // Agrupar por línea con la agencia solicitada
      const byLinea: Record<string, { fechas: Record<string, { count: number; sharePct: number }>; sumShare: number; samples: number }> = {};
      snap.forEach((d) => {
        const data = d.data() as PenetracionLineaDoc;
        const agData = data.agencias?.[agencyId];
        if (!agData) return;
        const linea = data.linea;
        if (!byLinea[linea]) byLinea[linea] = { fechas: {}, sumShare: 0, samples: 0 };
        byLinea[linea].fechas[data.fecha] = { count: agData.count, sharePct: agData.sharePct };
        byLinea[linea].sumShare += agData.sharePct;
        byLinea[linea].samples += 1;
      });

      // Top líneas por share promedio
      const sorted = Object.entries(byLinea)
        .map(([linea, info]) => ({
          linea,
          avgShare: info.samples > 0 ? info.sumShare / info.samples : 0,
          samples: info.samples,
          fechas: info.fechas,
        }))
        .sort((a, b) => b.avgShare - a.avgShare)
        .slice(0, topLineas);

      res.json({
        ok: true,
        agencyId,
        days,
        topLineas: sorted,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      console.error('[penetrationHistoric] Error:', msg);
      res.status(500).json({ ok: false, error: msg });
    }
  });
