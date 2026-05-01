"use strict";
/**
 * gtfsImporter — Importa shapes, horarios, calendario y tarifas desde GTFS de la API IMM.
 *
 * Fuente:  GET /buses/gtfs/static/latest/google_transit.zip (autenticado OAuth)
 * Destino: shapes_cross_operator, gtfs_horarios, gtfs_calendar, gtfs_fares
 *
 * Cron: semanal (lunes 03:00 UTC). HTTP: POST /gtfsImportRun. GET: /gtfsDebug.
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.gtfsDebug = exports.gtfsImportRun = exports.gtfsImportTick = void 0;
const https = __importStar(require("https"));
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const jszip_1 = __importDefault(require("jszip"));
const papaparse_1 = __importDefault(require("papaparse"));
const immTokenService_1 = require("./immTokenService");
const db = admin.firestore();
const SHAPES_COL = 'shapes_cross_operator';
const HORARIOS_COL = 'gtfs_horarios';
const CALENDAR_COL = 'gtfs_calendar';
const FARES_COL = 'gtfs_fares';
const STOPS_COL = 'gtfs_stops';
const TIMETABLE_COL = 'gtfs_timetable';
const HEALTH_DOC = 'ingesta_health/gtfs_importer';
const GTFS_PATH = '/buses/gtfs/static/latest/google_transit.zip';
const AGENCY_NAMES = {
    70: 'UCOT', 50: 'CUTCSA', 20: 'COME', 10: 'COETC',
};
// ─── Download ─────────────────────────────────────────────────────────────────
function fetchGtfsZip(token) {
    return new Promise((resolve, reject) => {
        const url = new URL(immTokenService_1.IMM_API_BASE + GTFS_PATH);
        const req = https.request(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
        }, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode} al descargar GTFS ZIP`));
                return;
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.end();
    });
}
function parseCsv(text) {
    const result = papaparse_1.default.parse(text, { header: true, skipEmptyLines: true });
    return result.data;
}
// Lee un archivo del ZIP forzando decodificación UTF-8 explícita.
// JSZip.async('text') a veces decodifica como Latin-1 cuando el ZIP
// no tiene el flag UTF-8 en su metadata — produce "Ã±" en vez de "ñ".
async function readZipText(zip, filename) {
    const file = zip.file(filename);
    if (!file)
        return undefined;
    const buf = await file.async('uint8array');
    return new TextDecoder('utf-8').decode(buf);
}
// ─── Firestore helpers ────────────────────────────────────────────────────────
async function buildLineaAgencyMap() {
    const map = new Map();
    const snap = await db.collection(SHAPES_COL).get();
    for (const d of snap.docs) {
        const data = d.data();
        if (!data.linea || !data.agencyId)
            continue;
        const agencyNum = parseInt(data.agencyId, 10);
        if (!agencyNum)
            continue;
        map.set(data.linea.trim().toLowerCase(), agencyNum);
    }
    logger.info('[GTFS] Líneas conocidas en GPS shapes:', map.size);
    return map;
}
async function runImport() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5;
    const start = Date.now();
    const token = await (0, immTokenService_1.getImmToken)();
    if (!token)
        throw new Error('Sin token IMM — configurar IMM_CLIENT_ID e IMM_CLIENT_SECRET');
    const lineaAgencyMap = await buildLineaAgencyMap();
    logger.info('[GTFS] Descargando ZIP...');
    const zipBuffer = await fetchGtfsZip(token);
    logger.info('[GTFS] ZIP descargado:', zipBuffer.length, 'bytes');
    const zip = await jszip_1.default.loadAsync(zipBuffer);
    // routes.txt → routeId : { shortName, longName }
    const routesTxt = await readZipText(zip, 'routes.txt');
    if (!routesTxt)
        throw new Error('routes.txt no encontrado en ZIP');
    const routeMap = new Map();
    for (const r of parseCsv(routesTxt)) {
        if (!r.route_id || !r.route_short_name)
            continue;
        routeMap.set(r.route_id, {
            shortName: r.route_short_name.trim(),
            longName: ((_a = r.route_long_name) !== null && _a !== void 0 ? _a : '').trim(),
        });
    }
    logger.info('[GTFS] Rutas totales en GTFS:', routeMap.size);
    // trips.txt → shapeToRoute + tripToRoute + routeToServiceIds
    const tripsTxt = await readZipText(zip, 'trips.txt');
    if (!tripsTxt)
        throw new Error('trips.txt no encontrado en ZIP');
    const shapeToRoute = new Map();
    const tripToRoute = new Map();
    const routeToServiceIds = new Map();
    const shapeToFirstTrip = new Map(); // shapeId → primer trip_id
    const tripToServiceId = new Map(); // tripId → service_id
    for (const t of parseCsv(tripsTxt)) {
        if (t.shape_id && !shapeToRoute.has(t.shape_id)) {
            shapeToRoute.set(t.shape_id, { routeId: t.route_id, directionId: parseInt((_b = t.direction_id) !== null && _b !== void 0 ? _b : '0', 10) });
        }
        if (t.shape_id && t.trip_id && !shapeToFirstTrip.has(t.shape_id)) {
            shapeToFirstTrip.set(t.shape_id, t.trip_id);
        }
        if (t.trip_id) {
            tripToRoute.set(t.trip_id, { routeId: t.route_id, directionId: parseInt((_c = t.direction_id) !== null && _c !== void 0 ? _c : '0', 10) });
        }
        if (t.service_id && t.route_id) {
            if (!routeToServiceIds.has(t.route_id))
                routeToServiceIds.set(t.route_id, new Set());
            routeToServiceIds.get(t.route_id).add(t.service_id);
        }
        if (t.trip_id && t.service_id)
            tripToServiceId.set(t.trip_id, t.service_id);
    }
    const targetTripIds = new Set(shapeToFirstTrip.values());
    logger.info('[GTFS] shape_ids:', shapeToRoute.size, '| trips:', tripToRoute.size, '| target trips:', targetTripIds.size);
    // shapes.txt → shapeId : points[]
    const shapesTxt = await readZipText(zip, 'shapes.txt');
    if (!shapesTxt)
        throw new Error('shapes.txt no encontrado en ZIP');
    const shapeGroups = new Map();
    for (const s of parseCsv(shapesTxt)) {
        if (!s.shape_id)
            continue;
        if (!shapeGroups.has(s.shape_id))
            shapeGroups.set(s.shape_id, []);
        shapeGroups.get(s.shape_id).push({
            lat: parseFloat(s.shape_pt_lat),
            lng: parseFloat(s.shape_pt_lon),
            seq: parseInt(s.shape_pt_sequence, 10),
        });
    }
    logger.info('[GTFS] shape_ids únicos:', shapeGroups.size);
    // Usamos Map para deduplicar: cuando hay varias shapes para la misma
    // (agencyId, linea, directionId), conservamos la de mayor longitud real,
    // no la última que aparece en shapes.txt (que podría ser una variante corta).
    const docsMap = new Map();
    let shapesIgnorados = 0;
    const empresaResumen = {};
    const generadoEn = admin.firestore.FieldValue.serverTimestamp();
    for (const [shapeId, rawPoints] of shapeGroups.entries()) {
        const tripInfo = shapeToRoute.get(shapeId);
        if (!tripInfo) {
            shapesIgnorados++;
            continue;
        }
        const routeInfo = routeMap.get(tripInfo.routeId);
        if (!routeInfo) {
            shapesIgnorados++;
            continue;
        }
        const { shortName: routeShortName, longName: routeLongName } = routeInfo;
        const { directionId } = tripInfo;
        rawPoints.sort((a, b) => a.seq - b.seq);
        const points = rawPoints.map(({ lat, lng }) => ({ lat, lng }));
        if (points.length < 3) {
            shapesIgnorados++;
            continue;
        }
        // Calcular longitud real del recorrido (haversine acumulado, en metros)
        let lengthMeters = 0;
        for (let i = 1; i < points.length; i++) {
            const R = 6371000;
            const dLat = ((points[i].lat - points[i - 1].lat) * Math.PI) / 180;
            const dLng = ((points[i].lng - points[i - 1].lng) * Math.PI) / 180;
            const a = Math.sin(dLat / 2) ** 2 +
                Math.cos((points[i - 1].lat * Math.PI) / 180) *
                    Math.cos((points[i].lat * Math.PI) / 180) *
                    Math.sin(dLng / 2) ** 2;
            lengthMeters += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }
        lengthMeters = Math.round(lengthMeters);
        const agencyNumId = (_d = lineaAgencyMap.get(routeShortName.toLowerCase())) !== null && _d !== void 0 ? _d : 0;
        const empresa = agencyNumId ? ((_e = AGENCY_NAMES[agencyNumId]) !== null && _e !== void 0 ? _e : `EMP_${agencyNumId}`) : 'STM';
        const docId = `${agencyNumId}_${routeShortName}_${directionId}`;
        const docData = {
            agencyId: String(agencyNumId), empresa, linea: routeShortName,
            variante: directionId, sentido: directionId === 0 ? 'IDA' : 'VUELTA',
            points, puntosOriginales: points.length, puntosSimplificados: points.length,
            lengthMeters,
            shapeId, generadoEn, fuente: 'GTFS_OFICIAL',
        };
        if (routeLongName)
            docData['routeLongName'] = routeLongName;
        // Deduplicar: conservar la shape con mayor longitud real (recorrido completo vs. variante corta)
        const existing = docsMap.get(docId);
        if (!existing || existing.data['lengthMeters'] < lengthMeters) {
            docsMap.set(docId, { id: docId, data: docData });
            if (!existing)
                empresaResumen[empresa] = ((_f = empresaResumen[empresa]) !== null && _f !== void 0 ? _f : 0) + 1;
        }
    }
    const docs = Array.from(docsMap.values());
    const BATCH_SIZE = 490;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = db.batch();
        for (const doc of docs.slice(i, i + BATCH_SIZE)) {
            batch.set(db.collection(SHAPES_COL).doc(doc.id), doc.data);
        }
        await batch.commit();
        logger.info(`[GTFS] Shapes batch ${Math.floor(i / BATCH_SIZE) + 1} → ${Math.min(i + BATCH_SIZE, docs.length)}`);
    }
    const shapesEscritos = docs.length;
    logger.info('[GTFS] Shapes:', shapesEscritos, 'escritas,', shapesIgnorados, 'ignoradas');
    // ─── Horarios (stop_times.txt) ─────────────────────────────────────────────
    let horariosEscritos = 0;
    let timetableEscritos = 0;
    const shapeToStopIds = new Map();
    try {
        const stopTimesTxt = await readZipText(zip, 'stop_times.txt');
        if (stopTimesTxt) {
            logger.info('[GTFS] Procesando stop_times.txt...');
            const depToMin = (t) => { const p = t.split(':'); if (p.length < 2)
                return -1; const h = parseInt(p[0], 10), m = parseInt(p[1], 10); return isNaN(h) || isNaN(m) ? -1 : h * 60 + m; };
            const tripFirstDep = new Map();
            const tripOrderedStops = new Map();
            const tripFullTimes = new Map();
            for (const st of parseCsv(stopTimesTxt)) {
                if (!st.trip_id || !st.departure_time)
                    continue;
                const seq = parseInt(st.stop_sequence, 10);
                const prev = tripFirstDep.get(st.trip_id);
                if (!prev || seq < prev.seq)
                    tripFirstDep.set(st.trip_id, { time: st.departure_time, seq });
                // Captura paradas ordenadas para los trips representativos de cada shape
                if (st.stop_id && targetTripIds.has(st.trip_id)) {
                    if (!tripOrderedStops.has(st.trip_id))
                        tripOrderedStops.set(st.trip_id, []);
                    tripOrderedStops.get(st.trip_id).push({ stopId: st.stop_id, seq });
                }
                // Captura tiempos completos para todos los trips de rutas conocidas (para timetable)
                if (st.stop_id && tripToRoute.has(st.trip_id)) {
                    const depMin = depToMin(st.departure_time);
                    if (depMin >= 0) {
                        if (!tripFullTimes.has(st.trip_id))
                            tripFullTimes.set(st.trip_id, []);
                        tripFullTimes.get(st.trip_id).push({ stopId: st.stop_id, depMin, seq });
                    }
                }
            }
            // shapeToStopIds: shapeId → [stop_id, ...] en orden de secuencia
            for (const [shapeId, tripId] of shapeToFirstTrip) {
                const stops = tripOrderedStops.get(tripId);
                if (stops && stops.length > 0) {
                    stops.sort((a, b) => a.seq - b.seq);
                    shapeToStopIds.set(shapeId, stops.map(s => s.stopId));
                }
            }
            logger.info('[GTFS] Viajes con primera salida:', tripFirstDep.size, '| Shapes con stopIds:', shapeToStopIds.size);
            const horarioGrupos = new Map();
            for (const [tripId, dep] of tripFirstDep.entries()) {
                const ti = tripToRoute.get(tripId);
                if (!ti)
                    continue;
                const ri = routeMap.get(ti.routeId);
                if (!ri)
                    continue;
                const key = `${ri.shortName}|${ti.directionId}`;
                if (!horarioGrupos.has(key))
                    horarioGrupos.set(key, []);
                horarioGrupos.get(key).push(dep.time);
            }
            const horarioDocs = [];
            for (const [key, salidas] of horarioGrupos.entries()) {
                const [shortName, dirStr] = key.split('|');
                const directionId = parseInt(dirStr, 10);
                const agencyNumId = (_g = lineaAgencyMap.get(shortName.toLowerCase())) !== null && _g !== void 0 ? _g : 0;
                const empresa = agencyNumId ? ((_h = AGENCY_NAMES[agencyNumId]) !== null && _h !== void 0 ? _h : `EMP_${agencyNumId}`) : 'STM';
                const normalizados = salidas.map(t => t.trim()).filter(Boolean).sort();
                const deduplicated = [...new Set(normalizados)];
                let frecuenciaPromMin = 0;
                if (deduplicated.length >= 2) {
                    const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
                    const diffs = [];
                    const mins = deduplicated.map(toMin);
                    for (let i = 1; i < mins.length; i++) {
                        const d = mins[i] - mins[i - 1];
                        if (d > 0 && d < 180)
                            diffs.push(d);
                    }
                    frecuenciaPromMin = diffs.length > 0 ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length) : 0;
                }
                horarioDocs.push({
                    id: `${agencyNumId}_${shortName}_${directionId}`,
                    data: {
                        agencyId: String(agencyNumId), empresa, linea: shortName, directionId,
                        sentido: directionId === 0 ? 'IDA' : 'VUELTA',
                        salidas: deduplicated, frecuenciaPromMin,
                        primerSalida: (_j = deduplicated[0]) !== null && _j !== void 0 ? _j : '', ultimaSalida: (_k = deduplicated[deduplicated.length - 1]) !== null && _k !== void 0 ? _k : '',
                        totalViajes: deduplicated.length, generadoEn, fuente: 'GTFS_OFICIAL',
                    },
                });
            }
            for (let i = 0; i < horarioDocs.length; i += BATCH_SIZE) {
                const batch = db.batch();
                for (const doc of horarioDocs.slice(i, i + BATCH_SIZE)) {
                    batch.set(db.collection(HORARIOS_COL).doc(doc.id), doc.data);
                }
                await batch.commit();
            }
            horariosEscritos = horarioDocs.length;
            logger.info('[GTFS] Horarios escritos:', horariosEscritos);
            // Actualizar shapes con stopIds (merge — añade el campo sin sobrescribir el resto)
            if (shapeToStopIds.size > 0) {
                const stopIdsUpdates = docs
                    .filter(d => shapeToStopIds.has(d.data['shapeId']))
                    .map(d => ({ id: d.id, stopIds: shapeToStopIds.get(d.data['shapeId']) }));
                for (let i = 0; i < stopIdsUpdates.length; i += BATCH_SIZE) {
                    const batch = db.batch();
                    for (const { id, stopIds } of stopIdsUpdates.slice(i, i + BATCH_SIZE)) {
                        batch.update(db.collection(SHAPES_COL).doc(id), { stopIds });
                    }
                    await batch.commit();
                }
                logger.info('[GTFS] Shapes actualizados con stopIds:', stopIdsUpdates.length);
            }
            // ─── gtfs_timetable ─────────────────────────────────────────────────────
            if (shapeToStopIds.size > 0 && tripFullTimes.size > 0) {
                // Tipo de servicio por service_id desde calendar.txt (es pequeño, se relee)
                const svcTypes = new Map();
                const calRaw = await readZipText(zip, 'calendar.txt');
                if (calRaw) {
                    for (const row of parseCsv(calRaw)) {
                        if (!row.service_id)
                            continue;
                        const s = new Set();
                        if (row.monday === '1' || row.tuesday === '1' || row.wednesday === '1' ||
                            row.thursday === '1' || row.friday === '1')
                            s.add('HABIL');
                        if (row.saturday === '1')
                            s.add('SABADO');
                        if (row.sunday === '1')
                            s.add('DOMINGO');
                        if (s.size > 0)
                            svcTypes.set(row.service_id, s);
                    }
                }
                logger.info('[GTFS] Tipos de servicio:', svcTypes.size, '| Trips con tiempos:', tripFullTimes.size);
                // Orden canónico de paradas por ruta/dirección (del trip representativo)
                const routeKeyToCanonical = new Map();
                for (const [shapeId, stopIds] of shapeToStopIds) {
                    const info = shapeToRoute.get(shapeId);
                    if (!info)
                        continue;
                    const key = `${info.routeId}|${info.directionId}`;
                    if (!routeKeyToCanonical.has(key))
                        routeKeyToCanonical.set(key, stopIds);
                }
                const groups = new Map();
                for (const [tripId, times] of tripFullTimes) {
                    const ti = tripToRoute.get(tripId);
                    if (!ti)
                        continue;
                    const ri = routeMap.get(ti.routeId);
                    if (!ri)
                        continue;
                    const rKey = `${ti.routeId}|${ti.directionId}`;
                    const canonical = routeKeyToCanonical.get(rKey);
                    if (!canonical || canonical.length < 2)
                        continue;
                    const svcId = tripToServiceId.get(tripId);
                    const typeSet = svcId ? ((_l = svcTypes.get(svcId)) !== null && _l !== void 0 ? _l : new Set(['HABIL'])) : new Set(['HABIL']);
                    const agencyNumId = (_m = lineaAgencyMap.get(ri.shortName.toLowerCase())) !== null && _m !== void 0 ? _m : 0;
                    // Alinear tiempos al orden canónico
                    times.sort((a, b) => a.seq - b.seq);
                    const posMap = new Map();
                    canonical.forEach((stopId, i) => posMap.set(stopId, i));
                    const tArr = new Array(canonical.length).fill(-1);
                    for (const { stopId, depMin } of times) {
                        const pos = posMap.get(stopId);
                        if (pos !== undefined && tArr[pos] === -1)
                            tArr[pos] = depMin;
                    }
                    const firstMin = tArr.find(m => m >= 0);
                    if (firstMin === undefined)
                        continue;
                    const s = `${String(Math.floor(firstMin / 60)).padStart(2, '0')}:${String(firstMin % 60).padStart(2, '0')}`;
                    for (const svcType of typeSet) {
                        const gKey = `${agencyNumId}|${ti.routeId}|${ti.directionId}|${svcType}`;
                        if (!groups.has(gKey)) {
                            groups.set(gKey, { agencyNumId, linea: ri.shortName, directionId: ti.directionId, serviceType: svcType, stops: canonical, viajes: [] });
                        }
                        groups.get(gKey).viajes.push({ s, t: tArr });
                    }
                }
                const tDocs = [];
                for (const [, g] of groups) {
                    g.viajes.sort((a, b) => { var _a, _b; return ((_a = a.t.find(m => m >= 0)) !== null && _a !== void 0 ? _a : 9999) - ((_b = b.t.find(m => m >= 0)) !== null && _b !== void 0 ? _b : 9999); });
                    const empresa = g.agencyNumId ? ((_o = AGENCY_NAMES[g.agencyNumId]) !== null && _o !== void 0 ? _o : `EMP_${g.agencyNumId}`) : 'STM';
                    tDocs.push({
                        id: `${g.agencyNumId}_${g.linea}_${g.directionId}_${g.serviceType}`,
                        data: {
                            agencyId: String(g.agencyNumId), empresa, linea: g.linea,
                            directionId: g.directionId, serviceType: g.serviceType,
                            stops: g.stops, viajes: g.viajes,
                            totalViajes: g.viajes.length,
                            primeraS: (_q = (_p = g.viajes[0]) === null || _p === void 0 ? void 0 : _p.s) !== null && _q !== void 0 ? _q : '',
                            ultimaS: (_s = (_r = g.viajes[g.viajes.length - 1]) === null || _r === void 0 ? void 0 : _r.s) !== null && _s !== void 0 ? _s : '',
                            generadoEn, fuente: 'GTFS_OFICIAL',
                        },
                    });
                }
                for (let i = 0; i < tDocs.length; i += BATCH_SIZE) {
                    const batch = db.batch();
                    for (const d of tDocs.slice(i, i + BATCH_SIZE)) {
                        batch.set(db.collection(TIMETABLE_COL).doc(d.id), d.data);
                    }
                    await batch.commit();
                    logger.info(`[GTFS] Timetable batch ${Math.floor(i / BATCH_SIZE) + 1} → ${Math.min(i + BATCH_SIZE, tDocs.length)}`);
                }
                timetableEscritos = tDocs.length;
                logger.info('[GTFS] Timetable escritos:', timetableEscritos);
            }
        }
    }
    catch (err) {
        logger.warn('[GTFS] Error en horarios:', err instanceof Error ? err.message : String(err));
    }
    // ─── Calendar (calendar.txt + calendar_dates.txt) ─────────────────────────
    let calendarEscritos = 0;
    try {
        const calendarTxt = await readZipText(zip, 'calendar.txt');
        const calendarDatesTxt = await readZipText(zip, 'calendar_dates.txt');
        if (calendarTxt) {
            logger.info('[GTFS] Procesando calendar.txt...');
            const servicePatterns = new Map();
            for (const row of parseCsv(calendarTxt)) {
                if (!row.service_id)
                    continue;
                servicePatterns.set(row.service_id, {
                    habil: row.monday === '1' || row.tuesday === '1' || row.wednesday === '1' ||
                        row.thursday === '1' || row.friday === '1',
                    sabado: row.saturday === '1',
                    domingo: row.sunday === '1',
                    start: (_t = row.start_date) !== null && _t !== void 0 ? _t : '',
                    end: (_u = row.end_date) !== null && _u !== void 0 ? _u : '',
                });
            }
            // calendar_dates: exceptions (informativo — guardadas en el doc)
            const exceptionDates = new Map(); // date → count servicios afectados
            if (calendarDatesTxt) {
                for (const row of parseCsv(calendarDatesTxt)) {
                    if (row.date)
                        exceptionDates.set(row.date, ((_v = exceptionDates.get(row.date)) !== null && _v !== void 0 ? _v : 0) + 1);
                }
            }
            const calDocs = new Map();
            for (const [routeId, serviceIds] of routeToServiceIds.entries()) {
                const ri = routeMap.get(routeId);
                if (!ri)
                    continue;
                const agencyNumId = (_w = lineaAgencyMap.get(ri.shortName.toLowerCase())) !== null && _w !== void 0 ? _w : 0;
                const empresa = agencyNumId ? ((_x = AGENCY_NAMES[agencyNumId]) !== null && _x !== void 0 ? _x : `EMP_${agencyNumId}`) : 'STM';
                const docId = `${agencyNumId}_${ri.shortName}`;
                let tieneHabil = false, tieneSabado = false, tieneDomingo = false;
                let vigenciaDesde = '', vigenciaHasta = '';
                for (const sid of serviceIds) {
                    const pat = servicePatterns.get(sid);
                    if (!pat)
                        continue;
                    if (pat.habil)
                        tieneHabil = true;
                    if (pat.sabado)
                        tieneSabado = true;
                    if (pat.domingo)
                        tieneDomingo = true;
                    if (!vigenciaDesde || pat.start < vigenciaDesde)
                        vigenciaDesde = pat.start;
                    if (!vigenciaHasta || pat.end > vigenciaHasta)
                        vigenciaHasta = pat.end;
                }
                const servicios = [];
                if (tieneHabil)
                    servicios.push('HABIL');
                if (tieneSabado)
                    servicios.push('SABADO');
                if (tieneDomingo)
                    servicios.push('DOMINGO');
                calDocs.set(docId, {
                    id: docId,
                    data: { agencyId: String(agencyNumId), empresa, linea: ri.shortName,
                        tieneHabil, tieneSabado, tieneDomingo, servicios, vigenciaDesde, vigenciaHasta,
                        generadoEn, fuente: 'GTFS_OFICIAL' },
                });
            }
            const calDocArr = [...calDocs.values()];
            for (let i = 0; i < calDocArr.length; i += BATCH_SIZE) {
                const batch = db.batch();
                for (const doc of calDocArr.slice(i, i + BATCH_SIZE)) {
                    batch.set(db.collection(CALENDAR_COL).doc(doc.id), doc.data);
                }
                await batch.commit();
            }
            calendarEscritos = calDocArr.length;
            logger.info('[GTFS] Calendar escritos:', calendarEscritos);
        }
    }
    catch (err) {
        logger.warn('[GTFS] Error en calendar:', err instanceof Error ? err.message : String(err));
    }
    // ─── Fares (fare_attributes.txt + fare_rules.txt) ─────────────────────────
    let faresEscritos = 0;
    try {
        const fareAttrTxt = await readZipText(zip, 'fare_attributes.txt');
        const fareRulesTxt = await readZipText(zip, 'fare_rules.txt');
        if (fareAttrTxt) {
            logger.info('[GTFS] Procesando fares...');
            const fareAttrs = new Map();
            for (const row of parseCsv(fareAttrTxt)) {
                if (!row.fare_id)
                    continue;
                fareAttrs.set(row.fare_id, {
                    price: parseFloat(row.price) || 0,
                    currency: (_y = row.currency_type) !== null && _y !== void 0 ? _y : 'UYU',
                    payMethod: parseInt((_z = row.payment_method) !== null && _z !== void 0 ? _z : '0', 10),
                    transfers: parseInt((_0 = row.transfers) !== null && _0 !== void 0 ? _0 : '-1', 10),
                });
            }
            const fareRoutes = new Map();
            if (fareRulesTxt) {
                for (const row of parseCsv(fareRulesTxt)) {
                    if (!row.fare_id || !row.route_id)
                        continue;
                    if (!fareRoutes.has(row.fare_id))
                        fareRoutes.set(row.fare_id, new Set());
                    fareRoutes.get(row.fare_id).add(row.route_id);
                }
            }
            const fareDocs = [];
            for (const [fareId, attr] of fareAttrs.entries()) {
                const routeIds = (_1 = fareRoutes.get(fareId)) !== null && _1 !== void 0 ? _1 : new Set();
                const lineas = [];
                const agencyIdsSet = new Set();
                const empresasSet = new Set();
                for (const routeId of routeIds) {
                    const ri = routeMap.get(routeId);
                    if (!ri)
                        continue;
                    lineas.push(ri.shortName);
                    const aid = (_2 = lineaAgencyMap.get(ri.shortName.toLowerCase())) !== null && _2 !== void 0 ? _2 : 0;
                    if (aid) {
                        agencyIdsSet.add(String(aid));
                        empresasSet.add((_3 = AGENCY_NAMES[aid]) !== null && _3 !== void 0 ? _3 : `EMP_${aid}`);
                    }
                }
                fareDocs.push({
                    id: fareId,
                    data: {
                        fareId, precio: attr.price, moneda: attr.currency,
                        metodoPago: attr.payMethod === 0 ? 'A_BORDO' : 'PREVIO',
                        transferencias: attr.transfers,
                        lineas: lineas.sort(), agencyIds: [...agencyIdsSet].sort(),
                        empresas: [...empresasSet].sort(), generadoEn, fuente: 'GTFS_OFICIAL',
                    },
                });
            }
            for (let i = 0; i < fareDocs.length; i += BATCH_SIZE) {
                const batch = db.batch();
                for (const doc of fareDocs.slice(i, i + BATCH_SIZE)) {
                    batch.set(db.collection(FARES_COL).doc(doc.id), doc.data);
                }
                await batch.commit();
            }
            faresEscritos = fareDocs.length;
            logger.info('[GTFS] Fares escritos:', faresEscritos);
        }
    }
    catch (err) {
        logger.warn('[GTFS] Error en fares:', err instanceof Error ? err.message : String(err));
    }
    // ─── Paradas (stops.txt) ──────────────────────────────────────────────────
    let stopsEscritos = 0;
    try {
        const stopsTxt = await readZipText(zip, 'stops.txt');
        if (stopsTxt) {
            logger.info('[GTFS] Procesando stops.txt...');
            const stopDocs = [];
            for (const row of parseCsv(stopsTxt)) {
                if (!row.stop_id || !row.stop_lat || !row.stop_lon)
                    continue;
                const lat = parseFloat(row.stop_lat);
                const lng = parseFloat(row.stop_lon);
                if (isNaN(lat) || isNaN(lng))
                    continue;
                stopDocs.push({
                    id: row.stop_id,
                    data: {
                        stopId: row.stop_id,
                        codigo: ((_4 = row.stop_code) !== null && _4 !== void 0 ? _4 : '').trim(),
                        nombre: ((_5 = row.stop_name) !== null && _5 !== void 0 ? _5 : '').trim(),
                        lat, lng,
                        accesible: row.wheelchair_boarding === '1',
                        generadoEn, fuente: 'GTFS_OFICIAL',
                    },
                });
            }
            for (let i = 0; i < stopDocs.length; i += BATCH_SIZE) {
                const batch = db.batch();
                for (const doc of stopDocs.slice(i, i + BATCH_SIZE)) {
                    batch.set(db.collection(STOPS_COL).doc(doc.id), doc.data);
                }
                await batch.commit();
                logger.info(`[GTFS] Stops batch ${Math.floor(i / BATCH_SIZE) + 1} → ${Math.min(i + BATCH_SIZE, stopDocs.length)}`);
            }
            stopsEscritos = stopDocs.length;
            logger.info('[GTFS] Paradas escritas:', stopsEscritos);
        }
    }
    catch (err) {
        logger.warn('[GTFS] Error en stops:', err instanceof Error ? err.message : String(err));
    }
    const elapsedMs = Date.now() - start;
    logger.info('[GTFS] Completo:', shapesEscritos, 'shapes', horariosEscritos, 'horarios', calendarEscritos, 'calendar', faresEscritos, 'fares', stopsEscritos, 'stops', timetableEscritos, 'timetable', elapsedMs, 'ms');
    await db.doc(HEALTH_DOC).set({
        status: shapesEscritos > 0 ? 'OK' : 'EMPTY',
        shapes_escritas: shapesEscritos, shapes_ignoradas: shapesIgnorados,
        horarios_escritos: horariosEscritos, calendar_escritos: calendarEscritos, fares_escritos: faresEscritos,
        stops_escritas: stopsEscritos, timetable_escritos: timetableEscritos,
        routes_cargadas: routeMap.size, empresa_resumen: empresaResumen,
        elapsed_ms: elapsedMs, last_run_at: admin.firestore.FieldValue.serverTimestamp(), zip_bytes: zipBuffer.length,
    }, { merge: true });
    return { shapesEscritos, shapesIgnorados, routesCargadas: routeMap.size, empresaResumen, horariosEscritos, calendarEscritos, faresEscritos, stopsEscritos, timetableEscritos, elapsedMs };
}
// ─── Cloud Function exports ───────────────────────────────────────────────────
exports.gtfsImportTick = (0, scheduler_1.onSchedule)({ schedule: 'every monday 03:00', region: 'us-central1', timeoutSeconds: 540, memory: '2GiB' }, async () => {
    try {
        const result = await runImport();
        logger.info('[GTFS] Tick OK:', result.shapesEscritos, 'shapes,', result.calendarEscritos, 'calendar,', result.faresEscritos, 'fares');
    }
    catch (err) {
        logger.error('[GTFS] Tick falló:', err instanceof Error ? err.message : String(err));
    }
});
exports.gtfsImportRun = (0, https_1.onRequest)({ region: 'us-central1', cors: true, timeoutSeconds: 540, memory: '2GiB' }, async (_req, res) => {
    try {
        const result = await runImport();
        res.json(Object.assign({ ok: true }, result));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('[GTFS] Run HTTP falló:', msg);
        res.status(500).json({ ok: false, error: msg });
    }
});
exports.gtfsDebug = (0, https_1.onRequest)({ region: 'us-central1', cors: true, timeoutSeconds: 120, memory: '512MiB' }, async (_req, res) => {
    var _a, _b, _c, _d, _e;
    try {
        const token = await (0, immTokenService_1.getImmToken)();
        if (!token) {
            res.status(500).json({ ok: false, error: 'Sin token IMM' });
            return;
        }
        const zipBuffer = await fetchGtfsZip(token);
        const zip = await jszip_1.default.loadAsync(zipBuffer);
        const files = Object.keys(zip.files);
        const routesTxt = (_a = await readZipText(zip, 'routes.txt')) !== null && _a !== void 0 ? _a : '';
        const agencyTxt = (_b = await readZipText(zip, 'agency.txt')) !== null && _b !== void 0 ? _b : '';
        const calendarTxt = (_c = await readZipText(zip, 'calendar.txt')) !== null && _c !== void 0 ? _c : '';
        const fareAttrTxt = (_d = await readZipText(zip, 'fare_attributes.txt')) !== null && _d !== void 0 ? _d : '';
        const stopsTxt = (_e = await readZipText(zip, 'stops.txt')) !== null && _e !== void 0 ? _e : '';
        res.json({
            ok: true, zip_bytes: zipBuffer.length, files,
            agency_preview: parseCsv(agencyTxt).slice(0, 5),
            routes_preview: parseCsv(routesTxt).slice(0, 10),
            stops_preview: parseCsv(stopsTxt).slice(0, 5),
            calendar_preview: parseCsv(calendarTxt).slice(0, 5),
            fares_preview: parseCsv(fareAttrTxt).slice(0, 5),
        });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});
