/**
 * immParadasService — Ingesta de paradas oficiales desde la API IMM (OAuth).
 *
 * 4938 paradas con coordenadas + calles cruzadas. Refresh semanal (datos estáticos).
 * También expone el endpoint HTTP de ETA para que el frontend consulte tiempo de arribo.
 *
 * Colecciones Firestore:
 *   imm_paradas/{busstopId} — paradas con coordenadas y calles
 *   imm_config/paradas_meta — meta (total, updatedAt)
 */
import * as logger from 'firebase-functions/logger';
import { getFirestore, WriteBatch, Timestamp } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { getImmToken, immApiGet } from './immTokenService';

const COLLECTION = 'imm_paradas';
const META_DOC   = 'imm_config/paradas_meta';

interface BusStop {
  busstopId: number;
  street1:   string;
  street2:   string;
  street1Id: number;
  street2Id: number;
  location:  { type: string; coordinates: [number, number] };
}

interface EtaItem {
  busId:        number;
  companyName:  string;
  line:         string;
  lineVariantId: string;
  origin:       string;
  destination:  string;
  subline:      string;
  special:      boolean;
  access:       string;
  thermalConfort: string;
  emissions:    string;
  eta:          number;   // segundos hasta arribo
  distance:     number;   // metros al bus
  position:     number;
  location:     { type: string; coordinates: [number, number] };
}

// ─── Ingesta de paradas ───────────────────────────────────────────────────────

export async function ingestarParadas(): Promise<{ total: number }> {
  const token = await getImmToken();
  if (!token) throw new Error('Sin token IMM — credenciales no configuradas');

  const paradas = await immApiGet<BusStop[]>('/buses/busstops', token);
  if (!paradas) throw new Error('API IMM no devolvió paradas');

  const db        = getFirestore();
  const updatedAt = Timestamp.now();
  let   batch: WriteBatch = db.batch();
  let   count = 0;

  for (const p of paradas) {
    batch.set(
      db.collection(COLLECTION).doc(String(p.busstopId)),
      { ...p, updatedAt },
      { merge: true },
    );
    count++;
    if (count % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  if (count % 400 !== 0) await batch.commit();

  await db.doc(META_DOC).set({ totalParadas: count, updatedAt }, { merge: true });
  logger.info('[IMM Paradas] Ingresadas', count, 'paradas');
  return { total: count };
}

// ─── ETA endpoint (para el frontend) ─────────────────────────────────────────

/**
 * GET /immEta?busstopId=546&lines=300,17&amountPerLine=3
 * Devuelve buses próximos a una parada con ETA en segundos.
 */
export const immEta = onRequest(
  { region: 'us-central1', cors: true },
  async (req, res) => {
    const busstopId    = Number(req.query.busstopId);
    const linesRaw     = typeof req.query.lines === 'string' ? req.query.lines : '';
    const amountPerLine = Number(req.query.amountPerLine ?? 3);

    if (!busstopId || isNaN(busstopId)) {
      res.status(400).json({ ok: false, error: 'busstopId requerido' });
      return;
    }

    const token = await getImmToken();
    if (!token) {
      res.status(503).json({ ok: false, error: 'API IMM sin token. Credenciales no configuradas.' });
      return;
    }

    const lines = linesRaw ? linesRaw.split(',').map(l => l.trim()).filter(Boolean) : [];
    let path = `/buses/busstops/${busstopId}/upcomingbuses?amountperline=${amountPerLine}`;
    if (lines.length) path += '&' + lines.map(l => `lines=${encodeURIComponent(l)}`).join('&');

    const data = await immApiGet<EtaItem[]>(path, token);
    if (!data) {
      res.status(502).json({ ok: false, error: 'API IMM no disponible' });
      return;
    }

    res.json({
      ok: true,
      busstopId,
      lines,
      count: data.length,
      buses: data.map(b => ({
        busId:       b.busId,
        company:     b.companyName,
        line:        b.line,
        origin:      b.origin,
        destination: b.destination,
        etaSeg:      b.eta,
        etaMin:      Math.round(b.eta / 60),
        distanciaM:  b.distance,
        acceso:      b.access,
        climatizacion: b.thermalConfort,
        emisiones:   b.emissions,
      })),
    });
  },
);

// ─── Cron semanal ─────────────────────────────────────────────────────────────

export const refreshParadasTick = onSchedule(
  { schedule: '0 3 * * 0', region: 'us-central1', timeZone: 'America/Montevideo' },
  async () => { await ingestarParadas(); },
);

// ─── Trigger manual ───────────────────────────────────────────────────────────

export const seedParadas = onRequest(
  { region: 'us-central1', cors: false },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }
    try {
      const result = await ingestarParadas();
      res.json({ ok: true, ...result, timestamp: new Date().toISOString() });
    } catch (e) {
      logger.error('[IMM Paradas] Error:', e);
      res.status(500).json({ ok: false, error: String(e) });
    }
  },
);
