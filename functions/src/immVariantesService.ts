/**
 * immVariantesService — Ingesta de variantes de línea desde la API pública de la IMM.
 *
 * Endpoint sin autenticación: GET https://www.montevideo.gub.uy/buses/rest/variantes
 * Devuelve 2204 variantes con origen, destino y sublinea para todas las empresas.
 *
 * Uso en frontend: leer imm_variantes/{varianteCodigo} o consultar por linea
 * para enriquecer la vista de GPS con origen/destino legibles.
 *
 * Cron: diario a las 4:00 AM (datos estáticos, cambian raramente).
 * HTTP manual: POST /seedVariantes (admin).
 */
import * as https from 'https';
import * as logger from 'firebase-functions/logger';
import { getFirestore, WriteBatch, Timestamp } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';

const VARIANTES_URL = 'https://www.montevideo.gub.uy/buses/rest/variantes';
const COLLECTION    = 'imm_variantes';
const META_DOC      = 'imm_config/variantes_meta';

interface Variante {
  varianteCodigo: number;
  linea:          string;
  lineaCodigo:    number;
  origen:         string;
  destino:        string;
  sublinea:       string;
  especial:       boolean;
}

function fetchVariantesRaw(): Promise<Variante[]> {
  return new Promise((resolve, reject) => {
    https.get(VARIANTES_URL, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d) as Variante[]); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

export async function ingestarVariantes(): Promise<{ total: number }> {
  const variantes = await fetchVariantesRaw();
  const db        = getFirestore();
  const updatedAt = Timestamp.now();

  let batch: WriteBatch = db.batch();
  let count = 0;

  for (const v of variantes) {
    batch.set(
      db.collection(COLLECTION).doc(String(v.varianteCodigo)),
      { ...v, updatedAt },
      { merge: true },
    );
    count++;
    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (count % 400 !== 0) await batch.commit();

  // Índice por linea (string) → lista de variantes para join rápido desde GPS
  const byLinea: Record<string, Variante[]> = {};
  for (const v of variantes) {
    (byLinea[v.linea] ??= []).push(v);
  }
  await db.doc(META_DOC).set({
    totalVariantes: count,
    totalLineas:    Object.keys(byLinea).length,
    updatedAt,
  }, { merge: true });

  logger.info('[IMM Variantes] Ingresadas', count, 'variantes,', Object.keys(byLinea).length, 'líneas únicas');
  return { total: count };
}

// ─── Cron diario ──────────────────────────────────────────────────────────────

export const refreshVariantesTick = onSchedule(
  { schedule: '0 4 * * *', region: 'us-central1', timeZone: 'America/Montevideo' },
  async () => { await ingestarVariantes(); },
);

// ─── Trigger manual (admin) ───────────────────────────────────────────────────

export const seedVariantes = onRequest(
  { region: 'us-central1', cors: false },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }
    try {
      const result = await ingestarVariantes();
      res.json({ ok: true, ...result, timestamp: new Date().toISOString() });
    } catch (e) {
      logger.error('[IMM Variantes] Error:', e);
      res.status(500).json({ ok: false, error: String(e) });
    }
  },
);
