/**
 * gtfsImporter — Importa shapes oficiales desde GTFS de la API IMM.
 *
 * Fuente:  GET /buses/gtfs/static/latest/google_transit.zip (autenticado OAuth)
 * Destino: shapes_cross_operator/{agencyId}_{routeShortName}_{directionId}
 *          con fuente: 'GTFS_OFICIAL'
 *
 * La IMM publica el GTFS bajo una única agencia 'STM-MVD' para todo el sistema.
 * Para recuperar el agencyId (empresa) de cada línea, cruzamos con los docs
 * ya en shapes_cross_operator (GPS-derivados, que sí tienen agencyId correcto).
 * Líneas sin cruces GPS conocidos se almacenan con agencyId '0' (STM genérico).
 *
 * Jerarquía de fuentes (diseñada para coexistir sin conflictos):
 *   GTFS_OFICIAL → cubre TODAS las líneas desde el día 1.
 *   GPS (shapeBuilder, cada 1 h) → reemplaza shapes GTFS con recorridos reales.
 *   Si la API IMM cae → los shapes GPS en Firestore siguen activos.
 *   Si el GPS aún no acumuló pings → los shapes GTFS sirven de respaldo.
 *
 * Cron: semanal (lunes 03:00 UTC).
 * HTTP: POST /gtfsImportRun (reimport manual).
 * GET:  /gtfsDebug (inspección sin escribir).
 */

import * as https from 'https';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { getImmToken, IMM_API_BASE } from './immTokenService';

const db = admin.firestore();
const SHAPES_COL = 'shapes_cross_operator';
const HEALTH_DOC = 'ingesta_health/gtfs_importer';
const GTFS_PATH = '/buses/gtfs/static/latest/google_transit.zip';

const AGENCY_NAMES: Record<number, string> = {
  70: 'UCOT', 50: 'CUTCSA', 20: 'COME', 10: 'COETC',
};

// ─── GTFS row types ───────────────────────────────────────────────────────────

interface GtfsRoute {
  route_id: string;
  agency_id: string;
  route_short_name: string;
  route_long_name: string;
}

interface GtfsTrip {
  route_id: string;
  trip_id: string;
  shape_id: string;
  direction_id: string;
}

interface GtfsShapePoint {
  shape_id: string;
  shape_pt_lat: string;
  shape_pt_lon: string;
  shape_pt_sequence: string;
}

// ─── Download ─────────────────────────────────────────────────────────────────

function fetchGtfsZip(token: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const url = new URL(IMM_API_BASE + GTFS_PATH);
    const req = https.request(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} al descargar GTFS ZIP`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.end();
  });
}

function parseCsv<T>(text: string): T[] {
  const result = Papa.parse<T>(text, { header: true, skipEmptyLines: true });
  return result.data;
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

/**
 * Lee shapes_cross_operator y construye un mapa linea (lowercase) → agencyNumId.
 * Así sabemos qué empresa opera cada línea, sin depender del GTFS agencyId.
 */
async function buildLineaAgencyMap(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const snap = await db.collection(SHAPES_COL).get();
  for (const d of snap.docs) {
    const data = d.data() as { linea?: string; agencyId?: string };
    if (!data.linea || !data.agencyId) continue;
    const agencyNum = parseInt(data.agencyId, 10);
    if (!agencyNum) continue;
    map.set(data.linea.trim().toLowerCase(), agencyNum);
  }
  logger.info('[GTFS] Líneas conocidas en GPS shapes:', map.size);
  return map;
}

// ─── Core import ──────────────────────────────────────────────────────────────

interface ImportResult {
  shapesEscritos: number;
  shapesIgnorados: number;
  routesCargadas: number;
  empresaResumen: Record<string, number>;
  elapsedMs: number;
}

async function runImport(): Promise<ImportResult> {
  const start = Date.now();

  const token = await getImmToken();
  if (!token) throw new Error('Sin token IMM — configurar IMM_CLIENT_ID e IMM_CLIENT_SECRET');

  // Cross-reference linea → empresa desde GPS shapes existentes
  const lineaAgencyMap = await buildLineaAgencyMap();

  logger.info('[GTFS] Descargando ZIP...');
  const zipBuffer = await fetchGtfsZip(token);
  logger.info('[GTFS] ZIP descargado:', zipBuffer.length, 'bytes');

  const zip = await JSZip.loadAsync(zipBuffer);

  // routes.txt → routeId : routeShortName (aceptamos TODAS las rutas, sin filtro de empresa)
  const routesTxt = await zip.file('routes.txt')?.async('text');
  if (!routesTxt) throw new Error('routes.txt no encontrado en ZIP');
  const routeMap = new Map<string, string>(); // routeId → routeShortName
  for (const r of parseCsv<GtfsRoute>(routesTxt)) {
    if (!r.route_id || !r.route_short_name) continue;
    routeMap.set(r.route_id, r.route_short_name.trim());
  }
  logger.info('[GTFS] Rutas totales en GTFS:', routeMap.size);

  // trips.txt → shapeId : { routeId, directionId } (primer trip por shape)
  const tripsTxt = await zip.file('trips.txt')?.async('text');
  if (!tripsTxt) throw new Error('trips.txt no encontrado en ZIP');
  const shapeToRoute = new Map<string, { routeId: string; directionId: number }>();
  for (const t of parseCsv<GtfsTrip>(tripsTxt)) {
    if (!t.shape_id || shapeToRoute.has(t.shape_id)) continue;
    shapeToRoute.set(t.shape_id, {
      routeId: t.route_id,
      directionId: parseInt(t.direction_id ?? '0', 10),
    });
  }
  logger.info('[GTFS] shape_ids en trips:', shapeToRoute.size);

  // shapes.txt → shapeId : points[]
  const shapesTxt = await zip.file('shapes.txt')?.async('text');
  if (!shapesTxt) throw new Error('shapes.txt no encontrado en ZIP');
  const shapeGroups = new Map<string, Array<{ lat: number; lng: number; seq: number }>>();
  for (const s of parseCsv<GtfsShapePoint>(shapesTxt)) {
    if (!s.shape_id) continue;
    if (!shapeGroups.has(s.shape_id)) shapeGroups.set(s.shape_id, []);
    shapeGroups.get(s.shape_id)!.push({
      lat: parseFloat(s.shape_pt_lat),
      lng: parseFloat(s.shape_pt_lon),
      seq: parseInt(s.shape_pt_sequence, 10),
    });
  }
  logger.info('[GTFS] shape_ids únicos:', shapeGroups.size);

  // Build list of docs to write
  interface ShapeDoc { id: string; data: Record<string, unknown> }
  const docs: ShapeDoc[] = [];
  let shapesIgnorados = 0;
  const empresaResumen: Record<string, number> = {};
  const generadoEn = admin.firestore.FieldValue.serverTimestamp();

  for (const [shapeId, rawPoints] of shapeGroups.entries()) {
    const tripInfo = shapeToRoute.get(shapeId);
    if (!tripInfo) { shapesIgnorados++; continue; }

    const routeShortName = routeMap.get(tripInfo.routeId);
    if (!routeShortName) { shapesIgnorados++; continue; }

    const { directionId } = tripInfo;

    rawPoints.sort((a, b) => a.seq - b.seq);
    const points = rawPoints.map(({ lat, lng }) => ({ lat, lng }));
    if (points.length < 3) { shapesIgnorados++; continue; }

    // Cruzar con GPS para obtener agencyId
    const agencyNumId = lineaAgencyMap.get(routeShortName.toLowerCase()) ?? 0;
    const empresa = agencyNumId ? (AGENCY_NAMES[agencyNumId] ?? `EMP_${agencyNumId}`) : 'STM';

    const docId = `${agencyNumId}_${routeShortName}_${directionId}`;

    docs.push({
      id: docId,
      data: {
        agencyId: String(agencyNumId),
        empresa,
        linea: routeShortName,
        variante: directionId,
        sentido: directionId === 0 ? 'IDA' : 'VUELTA',
        points,
        puntosOriginales: points.length,
        puntosSimplificados: points.length,
        shapeId,
        generadoEn,
        fuente: 'GTFS_OFICIAL',
      },
    });

    empresaResumen[empresa] = (empresaResumen[empresa] ?? 0) + 1;
  }

  // Write in batches of 490 (Firestore limit = 500)
  const BATCH_SIZE = 490;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const doc of docs.slice(i, i + BATCH_SIZE)) {
      batch.set(db.collection(SHAPES_COL).doc(doc.id), doc.data);
    }
    await batch.commit();
    logger.info(`[GTFS] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(docs.length / BATCH_SIZE)} → ${Math.min(i + BATCH_SIZE, docs.length)} shapes`);
  }

  const elapsedMs = Date.now() - start;
  const shapesEscritos = docs.length;

  logger.info('[GTFS] Importación completa:', shapesEscritos, 'shapes escritas,', shapesIgnorados, 'ignoradas,', elapsedMs, 'ms');
  logger.info('[GTFS] Por empresa:', JSON.stringify(empresaResumen));

  await db.doc(HEALTH_DOC).set({
    status: shapesEscritos > 0 ? 'OK' : 'EMPTY',
    shapes_escritas: shapesEscritos,
    shapes_ignoradas: shapesIgnorados,
    routes_cargadas: routeMap.size,
    empresa_resumen: empresaResumen,
    elapsed_ms: elapsedMs,
    last_run_at: admin.firestore.FieldValue.serverTimestamp(),
    zip_bytes: zipBuffer.length,
  }, { merge: true });

  return { shapesEscritos, shapesIgnorados, routesCargadas: routeMap.size, empresaResumen, elapsedMs };
}

// ─── Cloud Function exports ───────────────────────────────────────────────────

/** Cron semanal: lunes 03:00 UTC (00:00 Uruguay). */
export const gtfsImportTick = onSchedule(
  { schedule: 'every monday 03:00', region: 'us-central1', timeoutSeconds: 540, memory: '1GiB' },
  async () => {
    try {
      const result = await runImport();
      logger.info('[GTFS] Tick OK:', result.shapesEscritos, 'shapes');
    } catch (err) {
      logger.error('[GTFS] Tick falló:', err instanceof Error ? err.message : String(err));
    }
  },
);

/**
 * POST /gtfsImportRun — dispara la importación manual.
 * No requiere body. Responde con el resultado completo.
 */
export const gtfsImportRun = onRequest(
  { region: 'us-central1', cors: true, timeoutSeconds: 540, memory: '1GiB' },
  async (_req, res) => {
    try {
      const result = await runImport();
      res.json({ ok: true, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[GTFS] Run HTTP falló:', msg);
      res.status(500).json({ ok: false, error: msg });
    }
  },
);

/**
 * GET /gtfsDebug — inspecciona el ZIP sin escribir nada.
 * Devuelve archivos del ZIP + primeras filas de agency/routes para diagnóstico.
 */
export const gtfsDebug = onRequest(
  { region: 'us-central1', cors: true, timeoutSeconds: 120, memory: '512MiB' },
  async (_req, res) => {
    try {
      const token = await getImmToken();
      if (!token) { res.status(500).json({ ok: false, error: 'Sin token IMM' }); return; }

      const zipBuffer = await fetchGtfsZip(token);
      const zip = await JSZip.loadAsync(zipBuffer);
      const files = Object.keys(zip.files);

      const routesTxt = await zip.file('routes.txt')?.async('text') ?? '';
      const agencyTxt = await zip.file('agency.txt')?.async('text') ?? '';
      const routesPreview = parseCsv<GtfsRoute>(routesTxt).slice(0, 20);
      const agencyPreview = parseCsv<Record<string, string>>(agencyTxt).slice(0, 20);

      res.json({
        ok: true,
        zip_bytes: zipBuffer.length,
        files,
        agency_preview: agencyPreview,
        routes_preview: routesPreview,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  },
);
