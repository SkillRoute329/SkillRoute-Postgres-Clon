"use strict";
/**
 * gtfsStatic.ts — GTFS-Static Publisher
 * =====================================
 * Trim+ #1 (2026-04-23)
 *
 * Complementa el feed GTFS-Realtime (gtfsRealtime.ts) con el dataset
 * estático requerido por Google Maps Transit, Moovit, Citymapper, etc.
 *
 * El zip publicado contiene los archivos CSV mandatorios GTFS:
 *   - agency.txt         (1+ operadores: UCOT, CUTCSA, COETC, COME)
 *   - routes.txt         (rutas desde Firestore `lineas_ucot`)
 *   - stops.txt          (paradas desde Firestore `paradas_stm`)
 *   - trips.txt          (trips placeholder — un trip por ruta activa)
 *   - stop_times.txt     (tiempos planeados — vacío en v1, pendiente schedule)
 *   - calendar.txt       (servicios L-V / S / D)
 *   - shapes.txt         (recorridos de línea desde lineas_ucot.recorrido)
 *   - feed_info.txt      (metadata del feed)
 *
 * URL (tras deploy):
 *   GET  /gtfsStatic/feed.zip    → application/zip (producción)
 *   GET  /gtfsStatic/feed-info   → application/json (metadata sin descargar zip)
 *   GET  /gtfsStatic/health      → readiness check
 *
 * LIMITACIONES v1 reconocidas (ver GTFS_RT_PUBLISHER.md para contexto):
 *   - stop_times.txt queda placeholder/vacío porque el schedule por trip_id
 *     aún no está normalizado. Los consumidores pueden usar GTFS-RT para ETAs.
 *   - Un solo service_id (lunes a domingo) hasta que modelemos calendario real.
 *   - Los operadores distintos de UCOT heredan datos mínimos de las agencias
 *     (sin shapes propios). Multi-tenant completo es trabajo de otra fase.
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
exports.gtfsStatic = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const express = require("express");
const cors = require("cors");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const JSZip = require('jszip');
const getDb = () => admin.firestore();
const app = express();
app.use(cors({ origin: true }));
// ─── METADATA DEL FEED ───────────────────────────────────────────────────────
const FEED_VERSION = '1.0.0';
const FEED_PUBLISHER_NAME = 'UCOT SkillRoute';
const FEED_PUBLISHER_URL = 'https://ucot-gestor-cloud.web.app';
const FEED_LANG = 'es';
const AGENCIES = [
    { id: 'ucot', name: 'UCOT', url: 'https://www.ucot.com.uy', tz: 'America/Montevideo', phone: '' },
    { id: 'cutcsa', name: 'CUTCSA', url: 'https://cutcsa.com.uy', tz: 'America/Montevideo', phone: '' },
    { id: 'coetc', name: 'COETC', url: 'https://www.coetc.com.uy', tz: 'America/Montevideo', phone: '' },
    { id: 'come', name: 'COME', url: 'https://www.come.com.uy', tz: 'America/Montevideo', phone: '' },
];
// ─── HELPERS CSV ─────────────────────────────────────────────────────────────
/**
 * Escapa un valor para CSV según RFC 4180.
 * Si contiene coma, comillas o newline, envuelve en comillas y escapa comillas.
 */
function csvEscape(v) {
    if (v === null || v === undefined)
        return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}
/** Convierte un array de objetos a CSV con header (GTFS-compatible). */
function toCsv(header, rows) {
    const lines = [];
    lines.push(header.map((h) => csvEscape(h)).join(','));
    for (const row of rows) {
        lines.push(header.map((h) => csvEscape(row[h])).join(','));
    }
    return lines.join('\n') + '\n';
}
// ─── GENERADORES DE CADA ARCHIVO GTFS ────────────────────────────────────────
function generateAgencyTxt() {
    return toCsv(['agency_id', 'agency_name', 'agency_url', 'agency_timezone', 'agency_lang', 'agency_phone'], AGENCIES.map((a) => ({
        agency_id: a.id,
        agency_name: a.name,
        agency_url: a.url,
        agency_timezone: a.tz,
        agency_lang: FEED_LANG,
        agency_phone: a.phone,
    })));
}
function generateFeedInfoTxt() {
    const today = new Date();
    const yyyymmdd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    // feed_start = hoy, feed_end = 1 año adelante (se re-publica periódicamente)
    const endDate = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);
    return toCsv([
        'feed_publisher_name',
        'feed_publisher_url',
        'feed_lang',
        'default_lang',
        'feed_start_date',
        'feed_end_date',
        'feed_version',
        'feed_contact_email',
    ], [
        {
            feed_publisher_name: FEED_PUBLISHER_NAME,
            feed_publisher_url: FEED_PUBLISHER_URL,
            feed_lang: FEED_LANG,
            default_lang: FEED_LANG,
            feed_start_date: yyyymmdd(today),
            feed_end_date: yyyymmdd(endDate),
            feed_version: FEED_VERSION,
            feed_contact_email: '',
        },
    ]);
}
function generateCalendarTxt() {
    const today = new Date();
    const endDate = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);
    const yyyymmdd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return toCsv([
        'service_id',
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
        'start_date', 'end_date',
    ], [
        { service_id: 'HABIL', monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 0, sunday: 0, start_date: yyyymmdd(today), end_date: yyyymmdd(endDate) },
        { service_id: 'SABADO', monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 1, sunday: 0, start_date: yyyymmdd(today), end_date: yyyymmdd(endDate) },
        { service_id: 'DOMINGO', monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 1, start_date: yyyymmdd(today), end_date: yyyymmdd(endDate) },
    ]);
}
async function generateRoutesTxt() {
    const snap = await getDb().collection('lineas_ucot').get();
    const rows = [];
    const routeIds = [];
    snap.forEach((d) => {
        var _a, _b, _c, _d;
        const data = d.data();
        if (data.activa === false)
            return;
        const codigo = String((_a = data.codigo) !== null && _a !== void 0 ? _a : d.id);
        const nombre = String((_b = data.nombre) !== null && _b !== void 0 ? _b : `Línea ${codigo}`);
        const agencyId = String((_d = (_c = data.operador) !== null && _c !== void 0 ? _c : data.empresa) !== null && _d !== void 0 ? _d : 'UCOT').toLowerCase();
        const routeId = `${agencyId}-${codigo}`;
        routeIds.push(routeId);
        rows.push({
            route_id: routeId,
            agency_id: agencyId,
            route_short_name: codigo,
            route_long_name: nombre,
            route_type: 3, // 3 = Bus (GTFS-RT spec)
            route_url: '',
            route_color: '',
            route_text_color: '',
        });
    });
    const csv = toCsv(['route_id', 'agency_id', 'route_short_name', 'route_long_name', 'route_type', 'route_url', 'route_color', 'route_text_color'], rows);
    return { csv, routeIds };
}
async function generateStopsTxt() {
    const snap = await getDb().collection('paradas_stm').get();
    const rows = [];
    snap.forEach((d) => {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const data = d.data();
        const lat = Number((_b = (_a = data.lat) !== null && _a !== void 0 ? _a : data.latitude) !== null && _b !== void 0 ? _b : 0);
        const lon = Number((_e = (_d = (_c = data.lng) !== null && _c !== void 0 ? _c : data.lon) !== null && _d !== void 0 ? _d : data.longitude) !== null && _e !== void 0 ? _e : 0);
        if (!lat || !lon)
            return; // skip paradas sin coordenadas
        rows.push({
            stop_id: String((_f = data.id) !== null && _f !== void 0 ? _f : d.id),
            stop_code: String((_g = data.id) !== null && _g !== void 0 ? _g : d.id),
            stop_name: String((_h = data.nombre) !== null && _h !== void 0 ? _h : '(Sin nombre)'),
            stop_desc: '',
            stop_lat: lat,
            stop_lon: lon,
            zone_id: '',
            stop_url: '',
            location_type: 0, // 0 = stop/platform
            parent_station: '',
        });
    });
    return toCsv(['stop_id', 'stop_code', 'stop_name', 'stop_desc', 'stop_lat', 'stop_lon', 'zone_id', 'stop_url', 'location_type', 'parent_station'], rows);
}
function generateTripsTxt(routeIds) {
    // V1: un trip placeholder por ruta × service_id.
    // Esto permite que los consumidores reconozcan rutas activas sin schedule completo.
    // Pendiente: expandir con trips reales cuando tengamos `stop_times.txt` poblado.
    const rows = [];
    const services = ['HABIL', 'SABADO', 'DOMINGO'];
    for (const routeId of routeIds) {
        for (const svc of services) {
            rows.push({
                route_id: routeId,
                service_id: svc,
                trip_id: `${routeId}-${svc}-01`,
                trip_headsign: '',
                direction_id: 0,
                shape_id: '',
            });
        }
    }
    return toCsv(['route_id', 'service_id', 'trip_id', 'trip_headsign', 'direction_id', 'shape_id'], rows);
}
/**
 * v1: stop_times.txt vacío (solo header). GTFS spec permite feeds con trips sin
 * stop_times mientras tengan stop_times.txt presente (puede estar vacío).
 * Los consumidores usarán el feed GTFS-RT para ETAs.
 *
 * Pendiente v2: cargar horarios oficiales desde `horarios_oficiales` cuando
 * el scraper JSF esté poblando la colección.
 */
function generateStopTimesTxtPlaceholder() {
    return toCsv(['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence', 'pickup_type', 'drop_off_type'], []);
}
async function generateShapesTxt() {
    const snap = await getDb().collection('lineas_ucot').get();
    const rows = [];
    snap.forEach((d) => {
        var _a, _b, _c, _d;
        const data = d.data();
        const agencyId = String((_b = (_a = data.operador) !== null && _a !== void 0 ? _a : data.empresa) !== null && _b !== void 0 ? _b : 'UCOT').toLowerCase();
        const codigo = String((_d = (_c = data.codigoId) !== null && _c !== void 0 ? _c : data.codigo) !== null && _d !== void 0 ? _d : d.id);
        const shapeId = `${agencyId}-${codigo}`;
        const recorrido = Array.isArray(data.recorrido) ? data.recorrido : [];
        recorrido.forEach((pt, idx) => {
            var _a, _b, _c;
            const lat = Number((_a = pt === null || pt === void 0 ? void 0 : pt.lat) !== null && _a !== void 0 ? _a : pt === null || pt === void 0 ? void 0 : pt.latitude);
            const lon = Number((_c = (_b = pt === null || pt === void 0 ? void 0 : pt.lng) !== null && _b !== void 0 ? _b : pt === null || pt === void 0 ? void 0 : pt.lon) !== null && _c !== void 0 ? _c : pt === null || pt === void 0 ? void 0 : pt.longitude);
            if (!lat || !lon)
                return;
            rows.push({
                shape_id: shapeId,
                shape_pt_lat: lat,
                shape_pt_lon: lon,
                shape_pt_sequence: idx,
            });
        });
    });
    return toCsv(['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence'], rows);
}
let zipCache = null;
const ZIP_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — GTFS-static suele refrescar diario/semanal
async function buildZip() {
    var _a, _b, _c, _d;
    const now = Date.now();
    if (zipCache && now - zipCache.builtAt < ZIP_CACHE_TTL_MS)
        return zipCache;
    const agencyTxt = generateAgencyTxt();
    const { csv: routesTxt, routeIds } = await generateRoutesTxt();
    const stopsTxt = await generateStopsTxt();
    const tripsTxt = generateTripsTxt(routeIds);
    const stopTimesTxt = generateStopTimesTxtPlaceholder();
    const calendarTxt = generateCalendarTxt();
    const shapesTxt = await generateShapesTxt();
    const feedInfoTxt = generateFeedInfoTxt();
    const zip = new JSZip();
    zip.file('agency.txt', agencyTxt);
    zip.file('routes.txt', routesTxt);
    zip.file('stops.txt', stopsTxt);
    zip.file('trips.txt', tripsTxt);
    zip.file('stop_times.txt', stopTimesTxt);
    zip.file('calendar.txt', calendarTxt);
    zip.file('shapes.txt', shapesTxt);
    zip.file('feed_info.txt', feedInfoTxt);
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    zipCache = {
        buffer,
        builtAt: now,
        meta: {
            routes: routeIds.length,
            stops: ((_b = (_a = stopsTxt.match(/\n/g)) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 1) - 1,
            trips: routeIds.length * 3,
            shapes: Math.max(0, ((_d = (_c = shapesTxt.match(/\n/g)) === null || _c === void 0 ? void 0 : _c.length) !== null && _d !== void 0 ? _d : 1) - 1),
            sizeKB: Math.round(buffer.length / 1024),
        },
    };
    return zipCache;
}
// ─── ENDPOINTS ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({
        ok: true,
        publisher: FEED_PUBLISHER_NAME,
        kind: 'gtfs-static',
        cacheMaxAgeSec: Math.floor(ZIP_CACHE_TTL_MS / 1000),
        endpoints: {
            download: '/gtfsStatic/feed.zip',
            metadata: '/gtfsStatic/feed-info',
        },
    });
});
app.get('/feed-info', async (_req, res) => {
    try {
        const { meta, builtAt } = await buildZip();
        res.setHeader('Cache-Control', `public, max-age=${Math.floor(ZIP_CACHE_TTL_MS / 1000)}`);
        res.json({
            publisher: FEED_PUBLISHER_NAME,
            publisherUrl: FEED_PUBLISHER_URL,
            feedVersion: FEED_VERSION,
            builtAt: new Date(builtAt).toISOString(),
            meta,
            agencies: AGENCIES,
            limitations: {
                stop_times: 'placeholder (vacío) — pendiente normalización de horarios por trip_id',
                calendar: '3 servicios (HABIL/SABADO/DOMINGO) sin feriados',
                stops: 'requieren recarga periódica de paradas_stm (cron 03:30)',
            },
            notes: 'Complementa GTFS-RT de /gtfsRealtime/vehicle-positions.pb',
        });
    }
    catch (err) {
        console.error('[gtfsStatic /feed-info] Error:', (err === null || err === void 0 ? void 0 : err.message) || err);
        res.status(502).json({ ok: false, error: (err === null || err === void 0 ? void 0 : err.message) || String(err) });
    }
});
app.get('/feed.zip', async (_req, res) => {
    try {
        const { buffer } = await buildZip();
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="ucot_gtfs_static.zip"');
        res.setHeader('Cache-Control', `public, max-age=${Math.floor(ZIP_CACHE_TTL_MS / 1000)}`);
        res.setHeader('X-Feed-Version', FEED_VERSION);
        res.status(200).send(buffer);
    }
    catch (err) {
        console.error('[gtfsStatic /feed.zip] Error:', (err === null || err === void 0 ? void 0 : err.message) || err);
        res.status(502).json({ ok: false, error: (err === null || err === void 0 ? void 0 : err.message) || String(err) });
    }
});
// ─── EXPORT ──────────────────────────────────────────────────────────────────
exports.gtfsStatic = functions
    .runWith({ timeoutSeconds: 120, memory: '512MB' })
    .https.onRequest(app);
