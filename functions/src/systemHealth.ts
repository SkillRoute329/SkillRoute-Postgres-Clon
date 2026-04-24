/**
 * systemHealth.ts — Endpoint consolidado de salud del sistema
 * ============================================================
 * Trim+ #72 (2026-04-23)
 *
 * Agrega el estado de todas las piezas del sistema en un solo JSON:
 *   - IMM GPS API (fuente de datos)
 *   - Firestore (persistencia)
 *   - GTFS-Realtime publisher
 *   - GTFS-Static publisher
 *   - SIRI-Lite publisher
 *   - Schedulers (competidores, horarios, ingesta IMM)
 *
 * Útil para monitoreo operacional: uno solo endpoint para saber si
 * todo el pipeline está corriendo. Puede ir a dashboards tipo
 * Grafana / Datadog / status page pública.
 *
 * GET /systemHealth            → JSON con estado completo (cache 30s)
 * GET /systemHealth?fresh=1    → fuerza re-check sin cache
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import express = require('express');
import cors = require('cors');
import axios = require('axios');

const app = express();
app.use(cors({ origin: true }));

const getDb = () => admin.firestore();

// ─── TIPOS ───────────────────────────────────────────────────────────────────

type Status = 'OK' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';

interface ComponentHealth {
  name: string;
  status: Status;
  latencyMs?: number;
  detail?: string;
  lastCheckedAt: string;
  metadata?: Record<string, unknown>;
}

interface SystemHealth {
  overall: Status;
  checkedAt: string;
  components: ComponentHealth[];
  summary: {
    ok: number;
    degraded: number;
    down: number;
    unknown: number;
  };
}

// ─── CACHE IN-MEMORY ─────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30_000;
let cached: SystemHealth | null = null;
let cachedAt = 0;

// ─── CHECKS INDIVIDUALES ─────────────────────────────────────────────────────

async function checkImmGps(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const res = await (axios as any).default.post(
      'https://www.montevideo.gub.uy/buses/rest/stm-online',
      { empresa: '70' },
      {
        timeout: 8000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Referer: 'https://www.montevideo.gub.uy/buses/',
          Origin: 'https://www.montevideo.gub.uy',
        },
      },
    );
    const latencyMs = Date.now() - start;
    const buses = res.data?.features?.length ?? 0;
    // Si devuelve < 5 buses UCOT, probablemente está en horario nocturno (OK) o cayó (DEGRADED).
    // Usamos umbral de horario: entre 03:00 y 05:00 AR los buses son escasos, eso es OK.
    const hour = new Date().getUTCHours() - 3; // aprox Montevideo
    const isNight = hour < 5 || hour > 23;
    const status: Status = buses > 0 ? 'OK' : isNight ? 'OK' : 'DEGRADED';
    return {
      name: 'IMM GPS API',
      status,
      latencyMs,
      detail: `${buses} buses reportando`,
      lastCheckedAt: new Date().toISOString(),
      metadata: { buses },
    };
  } catch (err: any) {
    return {
      name: 'IMM GPS API',
      status: 'DOWN',
      latencyMs: Date.now() - start,
      detail: err?.message || 'No respondió',
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

async function checkFirestore(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    // Read liviano: colección de parámetros (pocos docs)
    const snap = await getDb().collection('parametros_operativos').limit(1).get();
    return {
      name: 'Firestore',
      status: 'OK',
      latencyMs: Date.now() - start,
      detail: `${snap.size} parámetro(s) confirmado(s)`,
      lastCheckedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      name: 'Firestore',
      status: 'DOWN',
      latencyMs: Date.now() - start,
      detail: err?.message || 'Error al leer',
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

async function checkIngestaRecency(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    // vehicle_events más reciente — si no hay nada en 10 min, la ingesta IMM está caída
    const snap = await getDb()
      .collection('vehicle_events')
      .where('agencyId', '==', '70')
      .orderBy('timestampGPS', 'desc')
      .limit(1)
      .get();
    if (snap.empty) {
      return {
        name: 'Ingesta IMM (vehicle_events)',
        status: 'DEGRADED',
        latencyMs: Date.now() - start,
        detail: 'Sin documentos en vehicle_events',
        lastCheckedAt: new Date().toISOString(),
      };
    }
    const doc = snap.docs[0].data() as any;
    const tsStr = doc?.timestampGPS;
    const ageMs = tsStr ? Date.now() - new Date(tsStr).getTime() : Infinity;
    const ageMin = Math.round(ageMs / 60000);
    const status: Status = ageMin <= 3 ? 'OK' : ageMin <= 10 ? 'DEGRADED' : 'DOWN';
    return {
      name: 'Ingesta IMM (vehicle_events)',
      status,
      latencyMs: Date.now() - start,
      detail: `Último GPS hace ${ageMin} min`,
      lastCheckedAt: new Date().toISOString(),
      metadata: { ageMin },
    };
  } catch (err: any) {
    return {
      name: 'Ingesta IMM (vehicle_events)',
      status: 'UNKNOWN',
      latencyMs: Date.now() - start,
      detail: err?.message || 'Índice o permisos',
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

async function checkCompetidores(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const snap = await getDb()
      .collection('competidores')
      .orderBy('ultimaActualizacion', 'desc')
      .limit(1)
      .get();
    if (snap.empty) {
      return {
        name: 'Scheduler competidores',
        status: 'DEGRADED',
        latencyMs: Date.now() - start,
        detail: 'Sin datos de competidores',
        lastCheckedAt: new Date().toISOString(),
      };
    }
    const data = snap.docs[0].data() as any;
    const last = data?.ultimaActualizacion?.toDate?.() ?? null;
    const ageMin = last ? Math.round((Date.now() - last.getTime()) / 60000) : 9999;
    const status: Status = ageMin <= 15 ? 'OK' : ageMin <= 60 ? 'DEGRADED' : 'DOWN';
    return {
      name: 'Scheduler competidores',
      status,
      latencyMs: Date.now() - start,
      detail: `Último refresh hace ${ageMin} min`,
      lastCheckedAt: new Date().toISOString(),
      metadata: { ageMin },
    };
  } catch (err: any) {
    return {
      name: 'Scheduler competidores',
      status: 'UNKNOWN',
      latencyMs: Date.now() - start,
      detail: err?.message || 'Error',
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

async function checkGtfsRtPublisher(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const res = await (axios as any).default.get(
      'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/gtfsRealtime/feed-info',
      { timeout: 5000 },
    );
    return {
      name: 'GTFS-Realtime publisher',
      status: 'OK',
      latencyMs: Date.now() - start,
      detail: res.data?.publisher ?? 'responde',
      lastCheckedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    const status = err?.response?.status;
    return {
      name: 'GTFS-Realtime publisher',
      status: status === 404 ? 'DOWN' : 'DEGRADED',
      latencyMs: Date.now() - start,
      detail: err?.message || 'No respondió',
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

async function checkGtfsStaticPublisher(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const res = await (axios as any).default.get(
      'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/gtfsStatic/feed-info',
      { timeout: 5000 },
    );
    return {
      name: 'GTFS-Static publisher',
      status: 'OK',
      latencyMs: Date.now() - start,
      detail: `routes: ${res.data?.meta?.routes ?? '?'}, stops: ${res.data?.meta?.stops ?? '?'}`,
      lastCheckedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    const status = err?.response?.status;
    return {
      name: 'GTFS-Static publisher',
      status: status === 404 ? 'DOWN' : 'DEGRADED',
      latencyMs: Date.now() - start,
      detail: err?.message || 'No respondió',
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

async function checkSiriPublisher(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const res = await (axios as any).default.get(
      'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/siriRealtime/discovery.json',
      { timeout: 5000 },
    );
    const cap = res.data?.ServiceDelivery?.CapabilitiesResponse?.Capability;
    return {
      name: 'SIRI-Lite publisher',
      status: cap?.VehicleMonitoringCapability?.supports ? 'OK' : 'DEGRADED',
      latencyMs: Date.now() - start,
      detail: 'VM disponible',
      lastCheckedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    const status = err?.response?.status;
    return {
      name: 'SIRI-Lite publisher',
      status: status === 404 ? 'DOWN' : 'DEGRADED',
      latencyMs: Date.now() - start,
      detail: err?.message || 'No respondió',
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

// ─── AGREGACIÓN ──────────────────────────────────────────────────────────────

function aggregateOverall(components: ComponentHealth[]): Status {
  if (components.some((c) => c.status === 'DOWN')) return 'DOWN';
  if (components.some((c) => c.status === 'DEGRADED')) return 'DEGRADED';
  if (components.every((c) => c.status === 'OK')) return 'OK';
  return 'UNKNOWN';
}

async function runAllChecks(): Promise<SystemHealth> {
  const components = await Promise.all([
    checkImmGps(),
    checkFirestore(),
    checkIngestaRecency(),
    checkCompetidores(),
    checkGtfsRtPublisher(),
    checkGtfsStaticPublisher(),
    checkSiriPublisher(),
  ]);

  const overall = aggregateOverall(components);
  return {
    overall,
    checkedAt: new Date().toISOString(),
    components,
    summary: {
      ok: components.filter((c) => c.status === 'OK').length,
      degraded: components.filter((c) => c.status === 'DEGRADED').length,
      down: components.filter((c) => c.status === 'DOWN').length,
      unknown: components.filter((c) => c.status === 'UNKNOWN').length,
    },
  };
}

// ─── ENDPOINTS ───────────────────────────────────────────────────────────────

app.get('/', async (req, res) => {
  try {
    const fresh = req.query.fresh === '1' || req.query.fresh === 'true';
    const now = Date.now();
    if (!fresh && cached && now - cachedAt < CACHE_TTL_MS) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.json(cached);
      return;
    }
    const health = await runAllChecks();
    cached = health;
    cachedAt = now;
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', 'public, max-age=30');
    // HTTP status code refleja el estado general
    const httpCode =
      health.overall === 'OK' ? 200 : health.overall === 'DEGRADED' ? 200 : 503;
    res.status(httpCode).json(health);
  } catch (err: any) {
    console.error('[systemHealth] Error:', err?.message || err);
    res.status(500).json({ overall: 'UNKNOWN', error: err?.message || String(err) });
  }
});

export const systemHealth = functions
  .runWith({ timeoutSeconds: 60, memory: '256MB' })
  .https.onRequest(app);
