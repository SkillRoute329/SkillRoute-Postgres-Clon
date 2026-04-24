/**
 * siriRealtime.ts — SIRI-Lite Publisher (VM + SM)
 * ================================================
 * Trim+ #68 (2026-04-23)
 *
 * SIRI (Service Interface for Real Time Information) es el estándar europeo
 * paralelo a GTFS-Realtime. Publicarlo abre el mercado UE / UK a SkillRoute
 * sin tocar GTFS-RT.
 *
 * Spec: https://www.transmodel-cen.eu/standards/siri/
 *
 * V1 (esta implementación — SIRI-Lite JSON, no XML):
 *   - VehicleMonitoring (VM): posiciones en vivo de todos los vehículos
 *   - StopMonitoring (SM):     próximas llegadas para una parada dada
 *
 * SIRI-Lite (perfil CEN ligero) acepta JSON en lugar del XML tradicional —
 * mucho más fácil de consumir para MaaS modernos. Los agregadores europeos
 * (Transdev, Kisio, Hafas) aceptan ambos formatos.
 *
 * Endpoints:
 *   GET /siriRealtime/vm.json         → VehicleMonitoring (todos los buses)
 *   GET /siriRealtime/vm.json?MonitoringRef=linea-300  → filtrado por línea
 *   GET /siriRealtime/sm.json?MonitoringRef=<stopId>   → próximas llegadas parada
 *   GET /siriRealtime/discovery.json  → descubrimiento de servicios disponibles
 *   GET /siriRealtime/health
 *
 * Limitación v1 (documentada):
 *   - Solo JSON. XML canónico pendiente para procurement público UK/FR.
 *   - StopMonitoring requiere schedule — devuelve array vacío hasta que
 *     tengamos stop_times.txt poblados.
 */

import * as functions from 'firebase-functions/v1';
import express = require('express');
import cors = require('cors');
import axios = require('axios');

const app = express();
app.use(cors({ origin: true }));

// ─── Constantes ──────────────────────────────────────────────────────────────

const STM_URL = 'https://www.montevideo.gub.uy/buses/rest/stm-online';
const STM_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Referer: 'https://www.montevideo.gub.uy/buses/',
  Origin: 'https://www.montevideo.gub.uy',
};

const AGENCIES: Record<number, { id: string; name: string }> = {
  10: { id: 'coetc',  name: 'COETC' },
  20: { id: 'come',   name: 'COME' },
  50: { id: 'cutcsa', name: 'CUTCSA' },
  70: { id: 'ucot',   name: 'UCOT' },
};

const CACHE_TTL_MS = 15_000;

// ─── Cache in-memory ─────────────────────────────────────────────────────────

interface Cached {
  buses: ParsedBus[];
  fetchedAt: number;
}
let cache: Cached | null = null;

interface ParsedBus {
  vehicleRef: string;
  operatorRef: string;
  operatorName: string;
  lineRef: string | null;
  destinationName: string | null;
  variante: number | null;
  lat: number;
  lng: number;
  bearing?: number;
  speedMps?: number;
  recordedAtIso: string;
}

async function fetchAllBuses(): Promise<ParsedBus[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.buses;

  const res = await (axios as any).default.post(
    STM_URL,
    { empresa: '-1' },
    { headers: STM_HEADERS, timeout: 20_000 },
  );
  const geojson: any = res.data;
  const buses: ParsedBus[] = [];
  const iso = new Date().toISOString();

  for (const f of geojson?.features ?? []) {
    const p = f?.properties ?? {};
    const coords = f?.geometry?.coordinates ?? [];
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!(lat < 0 && lng < 0)) continue;

    const codEmp = Number(p.codigoEmpresa) || 0;
    const agency = AGENCIES[codEmp];
    if (!agency) continue;

    buses.push({
      vehicleRef: `${agency.id}:${p.codigoBus ?? 'SN'}`,
      operatorRef: agency.id,
      operatorName: agency.name,
      lineRef: p.linea ? `${agency.id}:${p.linea}` : null,
      destinationName: p.destinoDesc ? String(p.destinoDesc) : null,
      variante: typeof p.variante === 'number' ? p.variante : null,
      lat,
      lng,
      // GTFS-RT expects m/s, SIRI también
      speedMps: Number(p.velocidad) > 0 ? Number(p.velocidad) * 0.277778 : undefined,
      recordedAtIso: iso,
    });
  }
  cache = { buses, fetchedAt: now };
  return buses;
}

// ─── SIRI payload builders ───────────────────────────────────────────────────

/**
 * VehicleMonitoringDelivery — un buses activities array con posiciones.
 * Estructura simplificada SIRI-Lite (ver spec completo en transmodel-cen.eu).
 */
function buildVmDelivery(buses: ParsedBus[], lineFilter?: string) {
  const activities = buses
    .filter((b) => !lineFilter || b.lineRef === lineFilter || b.lineRef?.endsWith(`:${lineFilter}`))
    .map((b) => ({
      RecordedAtTime: b.recordedAtIso,
      ItemIdentifier: b.vehicleRef,
      MonitoredVehicleJourney: {
        LineRef: b.lineRef ?? 'UNKNOWN',
        DirectionRef: b.variante ?? 0,
        FramedVehicleJourneyRef: {
          DataFrameRef: b.recordedAtIso.slice(0, 10),
          DatedVehicleJourneyRef: `${b.vehicleRef}:${b.recordedAtIso}`,
        },
        OperatorRef: b.operatorRef,
        OriginName: b.operatorName,
        DestinationName: b.destinationName ?? 'Desconocido',
        VehicleRef: b.vehicleRef,
        VehicleLocation: {
          Longitude: b.lng,
          Latitude: b.lat,
        },
        ...(b.speedMps !== undefined ? { Velocity: b.speedMps } : {}),
        ProgressBetweenStops: {},
        MonitoredCall: {
          StopPointRef: '',
          VehicleAtStop: false,
        },
      },
    }));

  return {
    ServiceDelivery: {
      ResponseTimestamp: new Date().toISOString(),
      ProducerRef: 'SkillRoute',
      VehicleMonitoringDelivery: [
        {
          version: '2.0',
          ResponseTimestamp: new Date().toISOString(),
          VehicleActivity: activities,
        },
      ],
    },
    Siri: {
      version: '2.0',
    },
  };
}

function buildSmDelivery() {
  // V1: placeholder vacío. Requiere schedule por stop_id + arrivals calculadas.
  return {
    ServiceDelivery: {
      ResponseTimestamp: new Date().toISOString(),
      ProducerRef: 'SkillRoute',
      StopMonitoringDelivery: [
        {
          version: '2.0',
          ResponseTimestamp: new Date().toISOString(),
          MonitoredStopVisit: [],
          Note: 'StopMonitoring pendiente v2 — requiere stop_times normalizados.',
        },
      ],
    },
    Siri: { version: '2.0' },
  };
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    publisher: 'SkillRoute SIRI-Lite',
    siriVersion: '2.0',
    profile: 'SIRI-Lite JSON (CEN)',
    cacheMaxAgeSec: Math.floor(CACHE_TTL_MS / 1000),
    endpoints: {
      vehicleMonitoring: '/siriRealtime/vm.json',
      stopMonitoring: '/siriRealtime/sm.json',
      discovery: '/siriRealtime/discovery.json',
    },
  });
});

app.get('/discovery.json', (_req, res) => {
  res.json({
    Siri: { version: '2.0' },
    ServiceDelivery: {
      ResponseTimestamp: new Date().toISOString(),
      ProducerRef: 'SkillRoute',
      CapabilitiesResponse: {
        Capability: {
          VehicleMonitoringCapability: { supports: true, refreshInterval: 'PT15S' },
          StopMonitoringCapability: { supports: false, reason: 'pending stop_times' },
          ServiceAlertsCapability: { supports: false, reason: 'use GTFS-RT ServiceAlerts' },
          LinesDeliveryCapability: { supports: false, reason: 'use GTFS-static routes' },
        },
      },
    },
  });
});

app.get('/vm.json', async (req, res) => {
  try {
    const monitoringRef = (req.query.MonitoringRef ?? req.query.LineRef) as string | undefined;
    const buses = await fetchAllBuses();
    const payload = buildVmDelivery(buses, monitoringRef);
    res.setHeader('Cache-Control', `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}`);
    res.setHeader('X-Siri-Version', '2.0');
    res.setHeader(
      'X-Feed-Activities',
      String(payload.ServiceDelivery.VehicleMonitoringDelivery[0].VehicleActivity.length),
    );
    res.json(payload);
  } catch (err: any) {
    console.error('[siriRealtime /vm.json] Error:', err?.message || err);
    res.status(502).json({ Siri: { version: '2.0' }, error: err?.message || String(err) });
  }
});

app.get('/sm.json', async (_req, res) => {
  res.setHeader('Cache-Control', `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}`);
  res.json(buildSmDelivery());
});

export const siriRealtime = functions
  .runWith({ timeoutSeconds: 60, memory: '256MB' })
  .https.onRequest(app);
