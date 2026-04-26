/**
 * gpsHistoryAccumulator — Cron 60s que acumula pings GPS por línea+variante.
 * ===========================================================================
 * COMPLEMENTA (no reemplaza) `ingestaIMMTick` que solo guarda posición ACTUAL
 * sobreescrita. Este cron persiste TODOS los pings con timestamp en
 * `gps_pings_raw/{auto-id}` con TTL 7 días. Es la fuente para
 * `shapeBuilder` que reconstruye los shapes oficiales desde GPS real.
 *
 * Por qué hace falta:
 *   - El Navegador (estilo Waze para conductores) necesita shape oficial.
 *   - La página IMM solo muestra posición en vivo, NO expone shapes.
 *   - El proxy STM /recorrido/{linea} devuelve 403 (endpoint legacy).
 *   - routeCache.json hardcodeado solo cubre 8 líneas UCOT y para 6 de ellas
 *     la VUELTA está duplicada de la IDA (puede ser correcto o incorrecto).
 *
 * Estrategia: muestrear cada bus del sistema 1 vez por minuto. Después de
 * 24-72 h tenemos cientos de puntos por línea+variante cubriendo todo el
 * recorrido real. shapeBuilder simplifica con Douglas-Peucker y materializa.
 *
 * Independencia de externos en runtime: una vez que shapeBuilder generó
 * shapes en Firestore, el Navegador funciona aunque la API IMM caiga.
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import axios from 'axios';

const db = admin.firestore();

const STM_ONLINE_URL = 'https://www.montevideo.gub.uy/buses/rest/stm-online';
const STM_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Referer: 'https://www.montevideo.gub.uy/buses/',
  Origin: 'https://www.montevideo.gub.uy',
};

const PINGS_COL = 'gps_pings_raw';
const TTL_DAYS = 7;

interface STMFeature {
  type: 'Feature';
  properties: {
    id?: string;
    codigoEmpresa: number;
    codigoBus: number;
    linea: string;
    variante?: number;
    sublinea?: string;
    destinoDesc?: string;
    velocidad?: number;
  };
  geometry: { type: 'Point'; coordinates: [number, number] }; // [lng, lat]
}

interface STMResponse {
  type: 'FeatureCollection';
  features: STMFeature[];
}

function dentroMontevideo(lat: number, lng: number): boolean {
  return (
    lat >= -35.2 &&
    lat <= -34.5 &&
    lng >= -56.5 &&
    lng <= -55.8 &&
    !(lat === 0 && lng === 0)
  );
}

async function fetchSnapshot(): Promise<STMResponse | null> {
  try {
    const res = await axios.post<STMResponse>(
      STM_ONLINE_URL,
      { empresa: '-1' },
      { headers: STM_HEADERS, timeout: 15000 },
    );
    return res.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[gpsHistoryAccumulator] Error fetch IMM:', msg);
    return null;
  }
}

async function persistirPings(snapshot: STMResponse): Promise<{ persisted: number }> {
  const ahora = admin.firestore.Timestamp.now();
  const ttlAt = admin.firestore.Timestamp.fromMillis(
    ahora.toMillis() + TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  // Firestore batch limit = 500. Particionamos.
  const batches: FirebaseFirestore.WriteBatch[] = [db.batch()];
  let opsInBatch = 0;
  let persisted = 0;

  for (const f of snapshot.features ?? []) {
    const p = f.properties;
    if (!p?.linea || !p?.codigoEmpresa) continue;
    if (!f.geometry || f.geometry.type !== 'Point') continue;
    const [lng, lat] = f.geometry.coordinates;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (!dentroMontevideo(lat, lng)) continue;

    if (opsInBatch >= 490) {
      batches.push(db.batch());
      opsInBatch = 0;
    }

    const ref = db.collection(PINGS_COL).doc();
    batches[batches.length - 1].set(ref, {
      empresa: p.codigoEmpresa,
      linea: String(p.linea),
      variante: typeof p.variante === 'number' ? p.variante : null,
      codigoBus: p.codigoBus ?? null,
      destinoDesc: p.destinoDesc ?? null,
      velocidad: typeof p.velocidad === 'number' ? p.velocidad : null,
      lat,
      lng,
      ts: ahora,
      ttl: ttlAt,
    });
    opsInBatch++;
    persisted++;
  }

  for (const b of batches) {
    try {
      await b.commit();
    } catch (err) {
      console.error(
        '[gpsHistoryAccumulator] Error commit batch:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { persisted };
}

/**
 * Borra pings con TTL vencido (>7 días). Corre dentro del mismo tick
 * para no necesitar otro cron y mantener la colección acotada.
 */
async function limpiarVencidos(): Promise<number> {
  const ahora = admin.firestore.Timestamp.now();
  const q = db
    .collection(PINGS_COL)
    .where('ttl', '<', ahora)
    .limit(500);
  const snap = await q.get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}

export const gpsHistoryAccumulatorTick = functions
  .runWith({ timeoutSeconds: 90, memory: '512MB' })
  .pubsub.schedule('every 1 minutes')
  .onRun(async () => {
    const start = Date.now();

    const snapshot = await fetchSnapshot();
    if (!snapshot || !snapshot.features) {
      console.warn('[gpsHistoryAccumulator] sin snapshot, salgo del tick');
      return;
    }

    const { persisted } = await persistirPings(snapshot);
    let purgados = 0;
    try {
      purgados = await limpiarVencidos();
    } catch (err) {
      console.warn(
        '[gpsHistoryAccumulator] Cleanup falló (no crítico):',
        err instanceof Error ? err.message : err,
      );
    }

    const elapsed = Date.now() - start;
    console.log(
      `[gpsHistoryAccumulator] OK ${persisted} pings, purgados ${purgados}, ${elapsed}ms`,
    );

    // Health doc para dashboards
    await db
      .collection('ingesta_health')
      .doc('gps_history')
      .set(
        {
          status: persisted > 0 ? 'OK' : 'EMPTY',
          last_persisted: persisted,
          last_purged: purgados,
          last_run_at: admin.firestore.FieldValue.serverTimestamp(),
          elapsed_ms: elapsed,
        },
        { merge: true },
      );
  });
