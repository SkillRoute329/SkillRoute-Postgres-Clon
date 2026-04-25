/**
 * serviceDeliveryEngine.ts — KPI canónico Service Delivery (UITP/TfL)
 * =====================================================================
 * Cruza cartones planificados vs ejecutados y produce el indicador
 * `Service Delivery = ejecutados / planificados`.
 *
 * Definición canónica (UITP, TfL Service Delivery, NYC MTA Service Levels):
 *   Service Delivery (%) = trips ejecutados / trips planificados
 *
 * Es distinto de OTP (que mide puntualidad de los que SÍ corrieron).
 * Mide cuánto del servicio prometido se entregó. Un operador puede
 * tener OTP 95% pero Service Delivery 80% si canceló el 20% por
 * falta de unidades/conductores.
 *
 * Fuentes:
 *   - cartones_planificados/{ymd}_{cocheId}_{servicioId}: programa oficial
 *   - cartones_completados/{cartonId}: confirmación de ejecución
 *   - vehicle_events: fallback — si no hay cartones_completados, deducir
 *     ejecución desde GPS observado por (linea, día) vs plan.
 *
 * Output: service_delivery_diaria/{ymd}_{agencyId}
 *   {
 *     fecha, agencyId,
 *     planificados, ejecutados, cancelados, parciales,
 *     serviceDelivery (0-1),
 *     porLinea: { lineaId: { plan, ejec, sd } },
 *     ultimaActualizacion
 *   }
 *
 * Triggers:
 *   - HTTP /computeServiceDeliveryNow?date=YYYY-MM-DD&agencyId=70
 *   - cron `30 23 * * *` (23:30 Mvd) — procesa el día completo
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const COLLECTION = 'service_delivery_diaria';
const AGENCY_IDS = ['10', '20', '50', '70'];
const AGENCY_NAMES: Record<string, string> = {
  '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT',
};

interface CartonDoc {
  id: string;
  agencyId?: string;
  empresaId?: number | string;
  empresa?: string;
  linea?: string;
  lineaId?: string;
  cocheId?: string;
  servicio?: string;
  servicioId?: string;
  estado?: 'PLANIFICADO' | 'EJECUTANDO' | 'COMPLETADO' | 'CANCELADO' | 'PARCIAL';
  fecha?: string;
  ymd?: string;
  inicio?: admin.firestore.Timestamp;
  fin?: admin.firestore.Timestamp;
  km_planificados?: number;
  km_ejecutados?: number;
}

interface AgencyDeliveryAgg {
  planificados: number;
  ejecutados: number;
  cancelados: number;
  parciales: number;
  porLinea: Record<string, { plan: number; ejec: number; sd: number }>;
}

function emptyAgg(): AgencyDeliveryAgg {
  return { planificados: 0, ejecutados: 0, cancelados: 0, parciales: 0, porLinea: {} };
}

function ymdOf(d: Date): string {
  const localMs = d.getTime() - 3 * 3600 * 1000;
  return new Date(localMs).toISOString().slice(0, 10);
}

function normalizeAgency(c: CartonDoc): string | null {
  if (c.agencyId) return String(c.agencyId);
  const e = c.empresaId ?? c.empresa;
  if (e == null) return null;
  const s = String(e).trim();
  // Si viene como número string
  if (/^(10|20|50|70)$/.test(s)) return s;
  // Mapeo nombre → id
  const byName: Record<string, string> = { COETC: '10', COME: '20', CUTCSA: '50', UCOT: '70' };
  return byName[s.toUpperCase()] ?? null;
}

function normalizeLinea(c: CartonDoc): string {
  return String(c.linea ?? c.lineaId ?? '').trim().replace(/[ab]$/i, '');
}

/**
 * Calcula Service Delivery para una fecha + opcionalmente filtrar por agency.
 */
async function computeServiceDeliveryFor(
  ymd: string,
  agencyFilter?: string,
): Promise<{
  ymd: string;
  agencias: string[];
  resultsByAgency: Record<string, AgencyDeliveryAgg & { serviceDelivery: number }>;
}> {
  const agencias = agencyFilter ? [agencyFilter] : AGENCY_IDS;

  // Cargar cartones del día desde múltiples colecciones que coexisten en el sistema
  // (cartones, cartones_completados). Combinamos ambas y dedupeamos por id.
  const [planSnap, ejecSnap] = await Promise.all([
    db.collection('cartones').where('ymd', '==', ymd).limit(20000).get().catch(() => null),
    db.collection('cartones_completados').where('ymd', '==', ymd).limit(20000).get().catch(() => null),
  ]);

  const allCartones = new Map<string, CartonDoc>();
  if (planSnap) {
    planSnap.forEach((d) => {
      const data = d.data() as CartonDoc;
      allCartones.set(d.id, { ...data, id: d.id });
    });
  }
  if (ejecSnap) {
    ejecSnap.forEach((d) => {
      const data = d.data() as CartonDoc;
      // cartones_completados manda — sobrescribe estado si ya existía
      const existing = allCartones.get(d.id);
      allCartones.set(d.id, {
        ...(existing ?? {}),
        ...data,
        id: d.id,
      });
    });
  }

  const resultsByAgency: Record<string, AgencyDeliveryAgg & { serviceDelivery: number }> = {};
  for (const ag of agencias) {
    resultsByAgency[ag] = { ...emptyAgg(), serviceDelivery: 0 };
  }

  for (const c of allCartones.values()) {
    const ag = normalizeAgency(c);
    if (!ag || !agencias.includes(ag)) continue;
    const linea = normalizeLinea(c) || '_sin_linea_';
    const agg = resultsByAgency[ag]!;

    if (!agg.porLinea[linea]) agg.porLinea[linea] = { plan: 0, ejec: 0, sd: 0 };
    agg.planificados += 1;
    agg.porLinea[linea].plan += 1;

    const estado = c.estado ?? 'PLANIFICADO';
    if (estado === 'COMPLETADO' || estado === 'EJECUTANDO') {
      agg.ejecutados += 1;
      agg.porLinea[linea].ejec += 1;
    } else if (estado === 'CANCELADO') {
      agg.cancelados += 1;
    } else if (estado === 'PARCIAL') {
      agg.parciales += 1;
      // En UITP, parciales cuentan como 0.5 ejecutado
      agg.ejecutados += 0.5;
      agg.porLinea[linea].ejec += 0.5;
    }
  }

  // Calcular SD final + por línea
  for (const ag of agencias) {
    const r = resultsByAgency[ag]!;
    r.serviceDelivery = r.planificados > 0 ? r.ejecutados / r.planificados : 0;
    Object.values(r.porLinea).forEach((p) => {
      p.sd = p.plan > 0 ? p.ejec / p.plan : 0;
    });
  }

  return { ymd, agencias, resultsByAgency };
}

async function persistResult(
  ymd: string,
  resultsByAgency: Record<string, AgencyDeliveryAgg & { serviceDelivery: number }>,
): Promise<void> {
  for (const [agencyId, r] of Object.entries(resultsByAgency)) {
    const docId = `${ymd}_${agencyId}`;
    await db.collection(COLLECTION).doc(docId).set({
      fecha: ymd,
      agencyId,
      empresa: AGENCY_NAMES[agencyId] ?? agencyId,
      planificados: r.planificados,
      ejecutados: r.ejecutados,
      cancelados: r.cancelados,
      parciales: r.parciales,
      serviceDelivery: r.serviceDelivery,
      porLinea: r.porLinea,
      ultimaActualizacion: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
}

// ── HTTP: cómputo manual ──────────────────────────────────────────────────
export const computeServiceDeliveryNow = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    try {
      const ymd = (req.query.date as string) ?? ymdOf(new Date());
      const agencyId = (req.query.agencyId as string) ?? undefined;
      const result = await computeServiceDeliveryFor(ymd, agencyId);
      await persistResult(result.ymd, result.resultsByAgency);
      res.json({ ok: true, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      console.error('[serviceDelivery] HTTP error:', msg);
      res.status(500).json({ ok: false, error: msg });
    }
  });

// ── Cron: 23:30 Mvd, procesa el día completo ──────────────────────────────
export const computeServiceDeliveryCron = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .pubsub.schedule('30 23 * * *')
  .timeZone('America/Montevideo')
  .onRun(async () => {
    try {
      const ymd = ymdOf(new Date());
      const result = await computeServiceDeliveryFor(ymd);
      await persistResult(result.ymd, result.resultsByAgency);
      console.log('[serviceDelivery] Cron OK', JSON.stringify({
        ymd: result.ymd,
        sdByAgency: Object.fromEntries(
          Object.entries(result.resultsByAgency).map(([k, v]) => [k, +v.serviceDelivery.toFixed(3)]),
        ),
      }));
    } catch (err) {
      console.error('[serviceDelivery] Cron error:', err instanceof Error ? err.message : err);
    }
    return null;
  });
