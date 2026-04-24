/**
 * gtfsRealtime.ts — GTFS-Realtime VehiclePositions Publisher
 * ==========================================================
 * Fase 1 #5 (2026-04-23)
 *
 * Expone las posiciones GPS en vivo de todos los buses de Montevideo
 * (UCOT + CUTCSA + COETC + COME) como feed GTFS-Realtime estándar.
 *
 * Habilita integración con:
 *   - Google Maps Transit
 *   - Moovit
 *   - Citymapper
 *   - Transit App
 *   - Cualquier agregador MaaS que consuma GTFS-RT
 *
 * SPEC: https://gtfs.org/realtime/
 *
 * Endpoints:
 *   GET /vehicle-positions.pb    → protobuf (producción)
 *   GET /vehicle-positions.json  → JSON (debug + inspección humana)
 *   GET /feed-info               → metadata del publisher
 *   GET /health                  → readiness check
 *
 * Cache: 15 segundos (GTFS-RT recomienda refresh 15-30s).
 *
 * Limitaciones reconocidas de esta versión (documentadas en GTFS_RT_PUBLISHER.md):
 *   - Solo VehiclePositions. TripUpdates y ServiceAlerts requieren
 *     schedule estático publicado (GTFS-static), aún no disponible.
 *   - trip.trip_id es aproximado (sub_linea + destino) porque IMM no
 *     expone trip_id oficial en su snapshot en vivo.
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import express = require('express');
import cors = require('cors');
import axios = require('axios');

const getDbRt = () => admin.firestore();

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

const STM_URL = 'https://www.montevideo.gub.uy/buses/rest/stm-online';

const STM_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Referer: 'https://www.montevideo.gub.uy/buses/',
  Origin: 'https://www.montevideo.gub.uy',
};

/** codigoEmpresa IMM → agency_id GTFS */
const AGENCIES: Record<number, { id: string; name: string }> = {
  10: { id: 'coetc',  name: 'COETC' },
  20: { id: 'come',   name: 'COME' },
  50: { id: 'cutcsa', name: 'CUTCSA' },
  70: { id: 'ucot',   name: 'UCOT' },
};

/** Cache TTL: 15s — GTFS-RT consumers recargan cada 15-30s. */
const CACHE_TTL_MS = 15_000;

// ─── CACHE IN-MEMORY ─────────────────────────────────────────────────────────

interface FeedCache {
  rawBuses: ParsedBus[];
  fetchedAt: number;
}
let feedCache: FeedCache | null = null;

// ─── TIPOS ───────────────────────────────────────────────────────────────────

interface ParsedBus {
  codigoBus: string;
  codigoEmpresa: number;
  empresaId: string;       // agency_id GTFS
  empresaNombre: string;
  linea: string | null;    // route_id
  sublinea: string | null;
  destino: string | null;
  variante: number | null;
  lat: number;
  lng: number;
  velocidadKmh: number;
  timestampObservado: number; // unix seconds
}

// ─── FETCH + PARSE STM ───────────────────────────────────────────────────────

async function fetchAllBuses(): Promise<ParsedBus[]> {
  const now = Date.now();
  if (feedCache && now - feedCache.fetchedAt < CACHE_TTL_MS) {
    return feedCache.rawBuses;
  }

  const res = await (axios as any).default.post(
    STM_URL,
    { empresa: '-1' },
    { headers: STM_HEADERS, timeout: 20_000 },
  );

  const geojson: any = res.data;
  const buses: ParsedBus[] = [];
  const tsObservado = Math.floor(now / 1000);

  for (const f of geojson?.features ?? []) {
    const p = f?.properties ?? {};
    const coords = f?.geometry?.coordinates ?? [];
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    // GPS válido = lat/lng en Uruguay (ambos negativos)
    if (!(lat < 0 && lng < 0)) continue;

    const codEmp = Number(p.codigoEmpresa) || 0;
    const agency = AGENCIES[codEmp];
    if (!agency) continue; // ignorar empresas desconocidas

    buses.push({
      codigoBus: String(p.codigoBus ?? 'SN'),
      codigoEmpresa: codEmp,
      empresaId: agency.id,
      empresaNombre: agency.name,
      linea: p.linea ? String(p.linea) : null,
      sublinea: p.sublinea ? String(p.sublinea) : null,
      destino: p.destinoDesc ? String(p.destinoDesc) : null,
      variante: typeof p.variante === 'number' ? p.variante : null,
      lat,
      lng,
      velocidadKmh: Number(p.velocidad) || 0,
      timestampObservado: tsObservado,
    });
  }

  feedCache = { rawBuses: buses, fetchedAt: now };
  return buses;
}

// ─── CONSTRUCCIÓN GTFS-RT FEED ───────────────────────────────────────────────

/**
 * Construye el FeedMessage GTFS-Realtime con VehiclePositions.
 * Usa la lib oficial `gtfs-realtime-bindings` (wrapping de protobufjs).
 *
 * Returns: FeedMessage como instancia (para serializar a .pb o .json).
 */
async function buildFeedMessage(opts: { agencyFilter?: string } = {}) {
  // Import dinámico para no romper el startup cuando la dep no está instalada todavía
  const gtfsRt = require('gtfs-realtime-bindings');
  const { FeedMessage, FeedEntity, FeedHeader, VehiclePosition, TripDescriptor, Position } =
    gtfsRt.transit_realtime;

  const buses = await fetchAllBuses();
  const tsUnix = Math.floor(Date.now() / 1000);

  const filtered = opts.agencyFilter
    ? buses.filter((b) => b.empresaId === opts.agencyFilter)
    : buses;

  const entities = filtered.map((b) => {
    // trip_id aproximado: concatenamos linea + sublinea + variante. El consumidor
    // GTFS-static deberá cruzar por route_id+headsign. Documentado como limitación.
    const tripIdAprox = [b.linea, b.sublinea ?? '', b.variante ?? ''].join('|');

    return FeedEntity.create({
      id: `${b.empresaId}-${b.codigoBus}`,
      vehicle: VehiclePosition.create({
        trip: TripDescriptor.create({
          routeId: b.linea ?? '',
          tripId: tripIdAprox,
          scheduleRelationship: TripDescriptor.ScheduleRelationship.SCHEDULED,
        }),
        vehicle: {
          id: `${b.empresaId}-${b.codigoBus}`,
          label: `${b.empresaNombre} ${b.codigoBus}`,
        },
        position: Position.create({
          latitude: b.lat,
          longitude: b.lng,
          // GTFS-RT expects speed in m/s
          speed: b.velocidadKmh > 0 ? b.velocidadKmh * 0.277778 : undefined,
        }),
        timestamp: b.timestampObservado,
        currentStatus: VehiclePosition.VehicleStopStatus.IN_TRANSIT_TO,
      }),
    });
  });

  const feed = FeedMessage.create({
    header: FeedHeader.create({
      gtfsRealtimeVersion: '2.0',
      incrementality: FeedHeader.Incrementality.FULL_DATASET,
      timestamp: tsUnix,
    }),
    entity: entities,
  });

  return { feed, FeedMessage, totalEntities: entities.length, fetchedBuses: buses.length };
}

// ─── EXPRESS APP ─────────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: true }));

/**
 * Health check — no toca STM, solo confirma que la función está viva.
 */
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    publisher: 'UCOT SkillRoute GTFS-RT Publisher',
    gtfsRealtimeVersion: '2.0',
    incrementality: 'FULL_DATASET',
    cacheMaxAgeSec: Math.floor(CACHE_TTL_MS / 1000),
    endpoints: {
      protobuf: '/vehicle-positions.pb',
      json: '/vehicle-positions.json',
      feedInfo: '/feed-info',
    },
  });
});

/**
 * Feed info — metadata para el consumidor (agencies publicadas, límites, etc.).
 */
app.get('/feed-info', (_req, res) => {
  res.json({
    publisher: 'UCOT SkillRoute',
    publisherUrl: 'https://ucot-gestor-cloud.web.app',
    language: 'es',
    defaultLanguage: 'es',
    feedVersion: '1.0.0',
    agencies: Object.values(AGENCIES),
    feedContents: {
      vehiclePositions: { supported: true, cadenceSeconds: 15 },
      tripUpdates: { supported: false, reason: 'Pendiente GTFS-static + schedule por trip_id' },
      serviceAlerts: { supported: false, reason: 'Pendiente integración con alertas_regulacion' },
    },
    documentation: 'https://ucot-gestor-cloud.web.app/docs/gtfs-rt',
  });
});

/**
 * Endpoint principal — protobuf (producción).
 * Consumido por: Google Maps, Moovit, Citymapper, Transit App.
 */
app.get('/vehicle-positions.pb', async (req, res) => {
  try {
    const agencyFilter = (req.query.agency as string | undefined)?.toLowerCase();
    const { feed, FeedMessage, totalEntities } = await buildFeedMessage({ agencyFilter });
    const buffer = FeedMessage.encode(feed).finish();

    res.setHeader('Content-Type', 'application/x-protobuf');
    res.setHeader('Cache-Control', `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}`);
    res.setHeader('X-Feed-Entities', String(totalEntities));
    res.setHeader('X-Gtfs-Realtime-Version', '2.0');
    res.status(200).send(Buffer.from(buffer));
  } catch (err: any) {
    console.error('[gtfsRealtime /vehicle-positions.pb] Error:', err?.message || err);
    res.status(502).json({
      ok: false,
      error: err?.message || String(err),
      hint:
        'Si falla por require("gtfs-realtime-bindings"), correr "npm install" en functions/',
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TRIP UPDATES (Trim+ #2, 2026-04-23)
// ═══════════════════════════════════════════════════════════════════════════
// Emite delays estimados por vehículo. V1: usamos `velocidad` como proxy —
// bus detenido (<= 5 km/h) en zona no-parada → probable retraso.
// V2 (pendiente): cruzar con scheduleComplianceEngine.desviacionMin real.

async function buildTripUpdatesFeed() {
  const gtfsRt = require('gtfs-realtime-bindings');
  const { FeedMessage, FeedEntity, FeedHeader, TripUpdate, TripDescriptor } = gtfsRt.transit_realtime;

  const buses = await fetchAllBuses();
  const tsUnix = Math.floor(Date.now() / 1000);

  // V1: solo emitimos TripUpdate para buses con velocidad muy baja (potencial retraso)
  // para no saturar el feed con 0-delay de todos los 300+ buses.
  const entities = buses
    .filter((b) => b.velocidadKmh >= 0 && b.velocidadKmh <= 5)
    .slice(0, 500)
    .map((b) => {
      const tripIdAprox = [b.linea, b.sublinea ?? '', b.variante ?? ''].join('|');
      // Proxy de delay: bus detenido ≈ 60s+ de retraso acumulado.
      // Pendiente v2: delay real desde scheduleComplianceEngine.
      const delaySec = 60;
      return FeedEntity.create({
        id: `tu-${b.empresaId}-${b.codigoBus}`,
        tripUpdate: TripUpdate.create({
          trip: TripDescriptor.create({
            routeId: b.linea ?? '',
            tripId: tripIdAprox,
            scheduleRelationship: TripDescriptor.ScheduleRelationship.SCHEDULED,
          }),
          vehicle: {
            id: `${b.empresaId}-${b.codigoBus}`,
            label: `${b.empresaNombre} ${b.codigoBus}`,
          },
          delay: delaySec,
          timestamp: b.timestampObservado,
        }),
      });
    });

  const feed = FeedMessage.create({
    header: FeedHeader.create({
      gtfsRealtimeVersion: '2.0',
      incrementality: FeedHeader.Incrementality.FULL_DATASET,
      timestamp: tsUnix,
    }),
    entity: entities,
  });
  return { feed, FeedMessage, totalEntities: entities.length };
}

app.get('/trip-updates.pb', async (_req, res) => {
  try {
    const { feed, FeedMessage, totalEntities } = await buildTripUpdatesFeed();
    const buffer = FeedMessage.encode(feed).finish();
    res.setHeader('Content-Type', 'application/x-protobuf');
    res.setHeader('Cache-Control', `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}`);
    res.setHeader('X-Feed-Entities', String(totalEntities));
    res.setHeader('X-Gtfs-Realtime-Version', '2.0');
    res.status(200).send(Buffer.from(buffer));
  } catch (err: any) {
    console.error('[gtfsRealtime /trip-updates.pb] Error:', err?.message || err);
    res.status(502).json({ ok: false, error: err?.message || String(err) });
  }
});

app.get('/trip-updates.json', async (_req, res) => {
  try {
    const { feed, FeedMessage, totalEntities } = await buildTripUpdatesFeed();
    const obj = FeedMessage.toObject(feed, { longs: Number, enums: String });
    res.setHeader('Cache-Control', `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}`);
    res.json({
      meta: {
        totalEntities,
        notice:
          'V1 placeholder. Pendiente cruce con scheduleComplianceEngine para delays precisos.',
      },
      feed: obj,
    });
  } catch (err: any) {
    console.error('[gtfsRealtime /trip-updates.json] Error:', err?.message || err);
    res.status(502).json({ ok: false, error: err?.message || String(err) });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE ALERTS (Trim+ #3, 2026-04-23)
// ═══════════════════════════════════════════════════════════════════════════
// Mapea `desvios_activos` + `alertas_regulacion` (alta severidad) a Alert
// entities GTFS-RT. Consumido por apps MaaS que muestran interrupciones de
// servicio al pasajero.

async function buildServiceAlertsFeed() {
  const gtfsRt = require('gtfs-realtime-bindings');
  const { FeedMessage, FeedEntity, FeedHeader, Alert, TimeRange, EntitySelector, TranslatedString } =
    gtfsRt.transit_realtime;

  const db = getDbRt();
  const entities: any[] = [];
  const tsUnix = Math.floor(Date.now() / 1000);

  // 1) Desvíos activos — `desvios_activos` no expirados
  try {
    const nowTs = admin.firestore.Timestamp.now();
    const snap = await db
      .collection('desvios_activos')
      .where('expirado', '==', false)
      .where('expire_at', '>', nowTs)
      .limit(200)
      .get();
    snap.forEach((d) => {
      const data = d.data() as Record<string, any>;
      const lineaId = String(data.linea_id ?? data.lineaId ?? '');
      if (!lineaId) return;
      entities.push(
        FeedEntity.create({
          id: `alert-desvio-${d.id}`,
          alert: Alert.create({
            activePeriod: [
              TimeRange.create({
                start: tsUnix,
                end: data.expire_at?.seconds ?? tsUnix + 3600,
              }),
            ],
            informedEntity: [
              EntitySelector.create({ routeId: lineaId }),
            ],
            cause: Alert.Cause.OTHER_CAUSE,
            effect: Alert.Effect.DETOUR,
            headerText: TranslatedString.create({
              translation: [{ text: `Desvío línea ${lineaId}`, language: 'es' }],
            }),
            descriptionText: TranslatedString.create({
              translation: [
                {
                  text: String(data.descripcion ?? data.motivo ?? 'Desvío activo'),
                  language: 'es',
                },
              ],
            }),
          }),
        }),
      );
    });
  } catch (err) {
    console.warn('[gtfsRealtime service-alerts] desvios_activos no disponible:', err);
  }

  // 2) Alertas de regulación críticas — `alertas_regulacion` no leídas en últimos 15 min
  try {
    const since = admin.firestore.Timestamp.fromMillis(Date.now() - 15 * 60 * 1000);
    const snap = await db
      .collection('alertas_regulacion')
      .where('timestamp', '>=', since)
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();
    snap.forEach((d) => {
      const data = d.data() as Record<string, any>;
      const lineaId = String(data.linea_id ?? data.lineaId ?? '');
      if (!lineaId) return;
      const tipo = String(data.tipo ?? 'REGULACION');
      // Solo emitir a consumidores si el impacto es al pasajero
      // (saltamos alertas tácticas puramente internas como DISPARO_MANUAL)
      if (tipo === 'DISPARO_MANUAL') return;
      entities.push(
        FeedEntity.create({
          id: `alert-reg-${d.id}`,
          alert: Alert.create({
            activePeriod: [
              TimeRange.create({ start: data.timestamp?.seconds ?? tsUnix, end: tsUnix + 900 }),
            ],
            informedEntity: [EntitySelector.create({ routeId: lineaId })],
            cause: Alert.Cause.OTHER_CAUSE,
            effect: Alert.Effect.SIGNIFICANT_DELAYS,
            headerText: TranslatedString.create({
              translation: [{ text: `Demora en línea ${lineaId}`, language: 'es' }],
            }),
            descriptionText: TranslatedString.create({
              translation: [
                {
                  text: String(data.mensaje_chofer ?? `Irregularidad de frecuencia (${tipo})`),
                  language: 'es',
                },
              ],
            }),
          }),
        }),
      );
    });
  } catch (err) {
    console.warn('[gtfsRealtime service-alerts] alertas_regulacion no disponible:', err);
  }

  const feed = FeedMessage.create({
    header: FeedHeader.create({
      gtfsRealtimeVersion: '2.0',
      incrementality: FeedHeader.Incrementality.FULL_DATASET,
      timestamp: tsUnix,
    }),
    entity: entities,
  });
  return { feed, FeedMessage, totalEntities: entities.length };
}

app.get('/service-alerts.pb', async (_req, res) => {
  try {
    const { feed, FeedMessage, totalEntities } = await buildServiceAlertsFeed();
    const buffer = FeedMessage.encode(feed).finish();
    res.setHeader('Content-Type', 'application/x-protobuf');
    res.setHeader('Cache-Control', 'public, max-age=60'); // Alerts cachean más que positions
    res.setHeader('X-Feed-Entities', String(totalEntities));
    res.setHeader('X-Gtfs-Realtime-Version', '2.0');
    res.status(200).send(Buffer.from(buffer));
  } catch (err: any) {
    console.error('[gtfsRealtime /service-alerts.pb] Error:', err?.message || err);
    res.status(502).json({ ok: false, error: err?.message || String(err) });
  }
});

app.get('/service-alerts.json', async (_req, res) => {
  try {
    const { feed, FeedMessage, totalEntities } = await buildServiceAlertsFeed();
    const obj = FeedMessage.toObject(feed, { longs: Number, enums: String });
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({ meta: { totalEntities }, feed: obj });
  } catch (err: any) {
    console.error('[gtfsRealtime /service-alerts.json] Error:', err?.message || err);
    res.status(502).json({ ok: false, error: err?.message || String(err) });
  }
});

/**
 * Endpoint JSON — debug humano (mismo contenido del feed pero legible).
 * NO usar para producción — protobuf es 5-10× más compacto.
 */
app.get('/vehicle-positions.json', async (req, res) => {
  try {
    const agencyFilter = (req.query.agency as string | undefined)?.toLowerCase();
    const { feed, FeedMessage, totalEntities, fetchedBuses } = await buildFeedMessage({
      agencyFilter,
    });
    const obj = FeedMessage.toObject(feed, {
      longs: Number,
      enums: String,
      bytes: String,
    });
    res.setHeader('Cache-Control', `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}`);
    res.json({
      meta: {
        totalEntities,
        fetchedBusesFromIMM: fetchedBuses,
        cachedFromIMMAt: feedCache?.fetchedAt ?? null,
        notice:
          'Formato JSON para debugging. Producción debe consumir /vehicle-positions.pb (protobuf).',
      },
      feed: obj,
    });
  } catch (err: any) {
    console.error('[gtfsRealtime /vehicle-positions.json] Error:', err?.message || err);
    res.status(502).json({ ok: false, error: err?.message || String(err) });
  }
});


// ─── EXPORT CLOUD FUNCTION ───────────────────────────────────────────────────

export const gtfsRealtime = functions
  .runWith({ timeoutSeconds: 60, memory: '256MB' })
  .https.onRequest(app);
