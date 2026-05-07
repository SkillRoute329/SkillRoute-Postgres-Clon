// Endpoint /api/compliance/regulador — datos para Vista Regulador
// SPEC_CUMPLIMIENTO_V2_FRONTEND_2026_05.md §2.7
// Lee compliance_aggregates, agrega por operador, devuelve OperatorSummary[]

import * as admin from 'firebase-admin';
import { Express } from 'express';

const getDb = () => admin.firestore();

type Granularidad = 'DAILY' | 'WEEKLY' | 'MONTHLY';

const AGENCY_NAMES: Record<string, string> = {
  '70': 'UCOT',
  '50': 'CUTCSA',
  '20': 'COME',
  '10': 'COETC',
};

type MetricBadge = 'OK' | 'IC_VISIBLE' | 'INSUFFICIENT' | 'NO_COVERAGE';

interface MetricValue {
  value: number | null;
  n: number;
  ic95Low?: number | null;
  ic95High?: number | null;
  badge: MetricBadge;
  coverageGps?: number | null;
}

interface AggregateDoc {
  agencyId: string;
  linea: string;
  sentido: string;
  periodo: string;
  granularidad: Granularidad;
  globalCoverageGps: number;
  totalEventsObserved: number;
  totalTripsScheduled: number;
  isHighFreq: boolean;
  metrics: Record<string, MetricValue | null | undefined>;
}

function parsedGranularidad(g: string): Granularidad {
  if (g === 'mensual') return 'MONTHLY';
  if (g === 'semanal') return 'WEEKLY';
  return 'DAILY';
}

function isValidMetric(m: MetricValue | null | undefined): m is MetricValue & { value: number } {
  return m != null && m.value != null && m.badge !== 'INSUFFICIENT' && m.badge !== 'NO_COVERAGE';
}

function weightedAvg(
  docs: AggregateDoc[],
  key: string,
): { value: number | null; n: number; badge: MetricBadge } {
  const valid = docs.filter(d => isValidMetric(d.metrics[key]));
  if (valid.length === 0) return { value: null, n: 0, badge: 'INSUFFICIENT' };

  const totalN = valid.reduce((s, d) => s + (d.metrics[key]?.n ?? 0), 0);
  if (totalN === 0) return { value: null, n: 0, badge: 'INSUFFICIENT' };

  const wavg = valid.reduce(
    (s, d) => s + ((d.metrics[key]?.value ?? 0) * (d.metrics[key]?.n ?? 0)),
    0,
  ) / totalN;

  const badge: MetricBadge = totalN >= 200 ? 'OK' : 'IC_VISIBLE';
  return { value: Math.round(wavg * 100) / 100, n: totalN, badge };
}

async function queryDocs(
  agencyId: string,
  gran: Granularidad,
  desde: string,
  hasta: string,
): Promise<AggregateDoc[]> {
  const db = getDb();
  let q: admin.firestore.Query = db.collection('compliance_aggregates')
    .where('agencyId', '==', agencyId)
    .where('granularidad', '==', gran);

  if (gran === 'DAILY') {
    q = q.where('periodo', '>=', desde).where('periodo', '<=', hasta);
  } else if (gran === 'MONTHLY') {
    const month = desde.slice(0, 7);
    q = q.where('periodo', '==', month);
  } else {
    // WEEKLY: ordenar y limitar
    q = q.orderBy('periodo').limit(50);
  }

  const snap = await q.get();
  return snap.docs.map(d => d.data() as AggregateDoc);
}

export function registerComplianceReguladorRoutes(app: Express): void {

  // ── GET /api/compliance/regulador ────────────────────────────────────────
  app.get('/api/compliance/regulador', async (req, res) => {
    try {
      const empresa     = String(req.query.empresa    ?? 'all');
      const desde       = String(req.query.desde      ?? '');
      const hasta       = String(req.query.hasta      ?? '');
      const granParam   = String(req.query.granularidad ?? 'diaria');
      const gran        = parsedGranularidad(granParam);

      const agencies = empresa === 'all'
        ? ['70', '50', '20', '10']
        : [empresa];

      // Leer docs de todas las empresas
      const allDocs: AggregateDoc[] = [];
      await Promise.all(agencies.map(async agencyId => {
        const docs = await queryDocs(agencyId, gran, desde, hasta);
        allDocs.push(...docs);
      }));

      // Cobertura global del sistema
      const totalEventsAll = allDocs.reduce((s, d) => s + (d.totalEventsObserved ?? 0), 0);
      const systemGps = totalEventsAll > 0
        ? allDocs.reduce(
            (s, d) => s + (d.globalCoverageGps ?? 0) * (d.totalEventsObserved ?? 0),
            0,
          ) / totalEventsAll
        : 0;

      // Agrupar por empresa
      const byAgency = new Map<string, AggregateDoc[]>();
      for (const doc of allDocs) {
        if (!byAgency.has(doc.agencyId)) byAgency.set(doc.agencyId, []);
        byAgency.get(doc.agencyId)!.push(doc);
      }

      // Construir resumen por operador
      const operators = agencies.map(agencyId => {
        const agDocs = byAgency.get(agencyId) ?? [];
        const totalEvents = agDocs.reduce((s, d) => s + (d.totalEventsObserved ?? 0), 0);

        const coverageGps = totalEvents > 0
          ? agDocs.reduce(
              (s, d) => s + (d.globalCoverageGps ?? 0) * (d.totalEventsObserved ?? 0),
              0,
            ) / totalEvents
          : 0;

        const totalTrips = agDocs.reduce((s, d) => s + (d.totalTripsScheduled ?? 0), 0);
        const uniqueLines = new Set(agDocs.map(d => d.linea)).size;

        const otp  = weightedAvg(agDocs, 'otp_low_freq');
        const ewt  = weightedAvg(agDocs, 'ewt_high_freq');
        const sd   = weightedAvg(agDocs, 'service_delivered');
        const srs  = weightedAvg(agDocs, 'service_reliability_score');

        return {
          agencyId,
          name: AGENCY_NAMES[agencyId] ?? agencyId,
          totalEvents,
          totalLines: uniqueLines,
          lineCount: agDocs.length,
          coverageGps: Math.round(coverageGps * 10) / 10,
          services: { value: totalTrips, type: 'medido' },
          otp:  otp.value  != null ? { ...otp,  applicable: true  } : null,
          ewt:  ewt.value  != null ? { ...ewt,  applicable: true  } : null,
          serviceDelivered: sd.value  != null ? sd  : null,
          srs:  srs.value  != null ? srs : null,
        };
      });

      const byOperatorCov: Record<string, number> = {};
      for (const op of operators) {
        byOperatorCov[op.agencyId] = op.coverageGps;
      }

      return res.json({
        meta: {
          period: { desde, hasta, granularidad: granParam },
          generatedAt: new Date().toISOString(),
          source: 'GPS oficial IMM (POST stm-online) + GTFS oficial',
        },
        coverage: {
          systemGps: Math.round(systemGps * 10) / 10,
          byOperator: byOperatorCov,
        },
        operators,
      });
    } catch (err: any) {
      console.error('[compliance/regulador] Error:', err);
      return res.status(500).json({ error: err?.message ?? String(err) });
    }
  });

  // ── POST /api/compliance/regulador/export — stub Sprint 3 ────────────────
  app.post('/api/compliance/regulador/export', async (_req, res) => {
    // Stub — generación de PDF implementada en Sprint 4
    return res.status(501).json({
      error: 'Exportación PDF pendiente de implementación (Sprint 4)',
      stub: true,
    });
  });
}
