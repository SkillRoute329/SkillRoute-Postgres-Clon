"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.siriRealtime = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const app = express();
app.use(cors({ origin: true }));
// ─── Constantes ──────────────────────────────────────────────────────────────
const STM_URL = 'https://www.montevideo.gub.uy/buses/rest/stm-online';
const STM_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Referer: 'https://www.montevideo.gub.uy/buses/',
    Origin: 'https://www.montevideo.gub.uy',
};
const AGENCIES = {
    10: { id: 'coetc', name: 'COETC' },
    20: { id: 'come', name: 'COME' },
    50: { id: 'cutcsa', name: 'CUTCSA' },
    70: { id: 'ucot', name: 'UCOT' },
};
const CACHE_TTL_MS = 15000;
let cache = null;
async function fetchAllBuses() {
    var _a, _b, _c, _d, _e;
    const now = Date.now();
    if (cache && now - cache.fetchedAt < CACHE_TTL_MS)
        return cache.buses;
    const res = await axios.default.post(STM_URL, { empresa: '-1' }, { headers: STM_HEADERS, timeout: 20000 });
    const geojson = res.data;
    const buses = [];
    const iso = new Date().toISOString();
    for (const f of (_a = geojson === null || geojson === void 0 ? void 0 : geojson.features) !== null && _a !== void 0 ? _a : []) {
        const p = (_b = f === null || f === void 0 ? void 0 : f.properties) !== null && _b !== void 0 ? _b : {};
        const coords = (_d = (_c = f === null || f === void 0 ? void 0 : f.geometry) === null || _c === void 0 ? void 0 : _c.coordinates) !== null && _d !== void 0 ? _d : [];
        const lng = Number(coords[0]);
        const lat = Number(coords[1]);
        if (!(lat < 0 && lng < 0))
            continue;
        const codEmp = Number(p.codigoEmpresa) || 0;
        const agency = AGENCIES[codEmp];
        if (!agency)
            continue;
        buses.push({
            vehicleRef: `${agency.id}:${(_e = p.codigoBus) !== null && _e !== void 0 ? _e : 'SN'}`,
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
function buildVmDelivery(buses, lineFilter) {
    const activities = buses
        .filter((b) => { var _a; return !lineFilter || b.lineRef === lineFilter || ((_a = b.lineRef) === null || _a === void 0 ? void 0 : _a.endsWith(`:${lineFilter}`)); })
        .map((b) => {
        var _a, _b, _c;
        return ({
            RecordedAtTime: b.recordedAtIso,
            ItemIdentifier: b.vehicleRef,
            MonitoredVehicleJourney: Object.assign(Object.assign({ LineRef: (_a = b.lineRef) !== null && _a !== void 0 ? _a : 'UNKNOWN', DirectionRef: (_b = b.variante) !== null && _b !== void 0 ? _b : 0, FramedVehicleJourneyRef: {
                    DataFrameRef: b.recordedAtIso.slice(0, 10),
                    DatedVehicleJourneyRef: `${b.vehicleRef}:${b.recordedAtIso}`,
                }, OperatorRef: b.operatorRef, OriginName: b.operatorName, DestinationName: (_c = b.destinationName) !== null && _c !== void 0 ? _c : 'Desconocido', VehicleRef: b.vehicleRef, VehicleLocation: {
                    Longitude: b.lng,
                    Latitude: b.lat,
                } }, (b.speedMps !== undefined ? { Velocity: b.speedMps } : {})), { ProgressBetweenStops: {}, MonitoredCall: {
                    StopPointRef: '',
                    VehicleAtStop: false,
                } }),
        });
    });
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
    var _a;
    try {
        const monitoringRef = ((_a = req.query.MonitoringRef) !== null && _a !== void 0 ? _a : req.query.LineRef);
        const buses = await fetchAllBuses();
        const payload = buildVmDelivery(buses, monitoringRef);
        res.setHeader('Cache-Control', `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}`);
        res.setHeader('X-Siri-Version', '2.0');
        res.setHeader('X-Feed-Activities', String(payload.ServiceDelivery.VehicleMonitoringDelivery[0].VehicleActivity.length));
        res.json(payload);
    }
    catch (err) {
        console.error('[siriRealtime /vm.json] Error:', (err === null || err === void 0 ? void 0 : err.message) || err);
        res.status(502).json({ Siri: { version: '2.0' }, error: (err === null || err === void 0 ? void 0 : err.message) || String(err) });
    }
});
app.get('/sm.json', async (_req, res) => {
    res.setHeader('Cache-Control', `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}`);
    res.json(buildSmDelivery());
});
exports.siriRealtime = functions
    .runWith({ timeoutSeconds: 60, memory: '256MB' })
    .https.onRequest(app);
