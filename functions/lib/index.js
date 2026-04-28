"use strict";
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
exports.auditLogQuery = exports.auditLogServiceMatrices = exports.auditLogServiceDefinitions = exports.auditLogReglasRotacion = exports.auditLogUsers = exports.auditLogVehiculos = exports.auditLogVehicles = exports.auditLogLineas = exports.auditLogLineasUcot = exports.auditLogParametrosOperativosHistorial = exports.auditLogParametrosOperativos = exports.computeServiceDeliveryCron = exports.computeServiceDeliveryNow = exports.penetrationHistoric = exports.computePenetrationCron = exports.computePenetrationNow = exports.computeAdherenceCron = exports.computeAdherenceNow = exports.refreshAllStmHorariosTick = exports.refreshAllStmHorariosNow = exports.autoStatsCollectorNow = exports.autoStatsCollectorTick = exports.refreshCompetidoresNow = exports.refreshCompetidoresTick = exports.refreshHorariosUcotNow = exports.refreshHorariosUcotTick = exports.intelligenceApi = exports.stmHorariosProxy = exports.parseBulkTicketsStorage = exports.stmOnlineProxy = exports.testIngestaIMM = exports.ingestaIMMTick = exports.onAlertaRegulacion = exports.limpiarPingsRivales = exports.rivalPingIngestion = exports.shadowDispatcherTick = exports.alertaSoCBajo = exports.alertasVencimientosDocumentales = exports.expirarDesvios = exports.gpsWebhookV2 = exports.gpsWebhook = exports.discoverVariants = exports.syncVariantRoutes = exports.geoserverProxy = exports.seedUCOTData = exports.syncParadasSTMCron = exports.syncParadasSTM = exports.syncUCOTLinesCron = exports.syncUCOTLines = exports.montevideoProxy = void 0;
exports.complianceAlertsTick = exports.shapeBuilderRun = exports.shapeBuilderTick = exports.gpsHistoryAccumulatorTick = exports.netexEndpoint = exports.systemHealth = exports.siriRealtime = exports.gtfsStatic = exports.regulatorio = exports.refreshGtfsRtAlerts = exports.gtfsRealtime = exports.onIncidenciaCreated = exports.acknowledgeAlerta = exports.onAlertaCreated = exports.historicBunching = exports.historicOtp = exports.recomputeDroMatrixNow = exports.droMatrixTick = exports.reconstructShapesNow = exports.reconstructShapesTick = exports.listVehicleArchives = exports.archiveVehicleEventsNow = exports.archiveVehicleEventsTick = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const cors_1 = __importDefault(require("cors"));
const Papa = __importStar(require("papaparse"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
admin.initializeApp();
const db = admin.firestore();
const corsHandler = (0, cors_1.default)({ origin: true });
// ─── API Montevideo Base URL ──────────────────────────────────────────────────
const IMM_API = 'https://api.montevideo.gub.uy/api/publictransport';
// ─── PROXY: API Montevideo → Frontend ────────────────────────────────────────
// Resuelve el problema de CORS al llamar la API del gobierno desde el browser
exports.montevideoProxy = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        try {
            const endpoint = req.query.endpoint;
            if (!endpoint) {
                res.status(400).json({ error: 'endpoint requerido' });
                return;
            }
            const url = `${IMM_API}/${endpoint}`;
            console.log(`[proxy] GET ${url}`);
            const response = await axios_1.default.get(url, {
                timeout: 10000,
                headers: { 'Accept': 'application/json' },
            });
            res.json(response.data);
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : 'Error proxy';
            console.error('[proxy] Error:', msg);
            res.status(500).json({ error: msg });
        }
    });
});
// ─── Lógica interna de Sincronización UCOT ─────────────────────────────────────
const performSyncUCOTLines = async () => {
    const lineasUCOT = ['300', '306', '316', '317', '328', '329', '330', '370', 'CE1'];
    const resultados = {};
    const batch = db.batch();
    let sincronizadas = 0;
    for (const codigo of lineasUCOT) {
        try {
            for (const variante of ['a', 'b']) {
                const lineaId = codigo === 'CE1' ? 'CE1' : `${codigo}${variante}`;
                try {
                    const response = await axios_1.default.get(`${IMM_API}/getItineraries/${lineaId}`, { timeout: 8000 });
                    if (response.data) {
                        const data = response.data;
                        const paradas = extraerParadas(data);
                        const recorrido = extraerRecorrido(data);
                        const docRef = db.collection('lineas_ucot').doc(lineaId);
                        batch.set(docRef, {
                            id: lineaId,
                            codigo,
                            variante: codigo === 'CE1' ? '' : variante,
                            nombre: data.nombre || data.name || `Línea ${codigo} ${variante.toUpperCase()}`,
                            empresa: 'UCOT',
                            activa: true,
                            paradas,
                            recorrido,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                            fuente: 'api_montevideo',
                        }, { merge: true });
                        sincronizadas++;
                        resultados[lineaId] = `OK (${paradas.length} paradas)`;
                    }
                }
                catch (_a) {
                    resultados[lineaId] = 'No disponible en API';
                }
                if (codigo === 'CE1')
                    break;
            }
        }
        catch (err) {
            resultados[codigo] = `Error: ${err instanceof Error ? err.message : 'desconocido'}`;
        }
    }
    await batch.commit();
    return { sincronizadas, total: lineasUCOT.length, resultados };
};
// ─── SYNC: Sincronizar líneas UCOT desde API Montevideo → Firestore ───────────
// Ejecutar manualmente: POST /syncUCOTLines
exports.syncUCOTLines = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        try {
            const result = await performSyncUCOTLines();
            res.json(Object.assign(Object.assign({ ok: true }, result), { timestamp: new Date().toISOString() }));
        }
        catch (error) {
            res.status(500).json({ error: error instanceof Error ? error.message : 'Error' });
        }
    });
});
exports.syncUCOTLinesCron = functions.pubsub.schedule('0 3 * * *')
    .timeZone('America/Montevideo')
    .onRun(async (_context) => {
    // api.montevideo.gub.uy devuelve 403 — cron deshabilitado hasta que el endpoint sea accesible
    console.warn('[CRON] syncUCOTLinesCron: endpoint 403, skipping');
    return null;
});
// ─── Lógica interna de Sincronización Paradas ─────────────────────────────────
const performSyncParadasSTM = async () => {
    const response = await axios_1.default.get(`${IMM_API}/getStops`, { timeout: 15000 });
    const paradas = response.data;
    if (!Array.isArray(paradas))
        throw new Error('Formato inesperado de API');
    const batch = db.batch();
    let count = 0;
    for (const parada of paradas.slice(0, 500)) {
        const id = String(parada.stopId || parada.id || count);
        const ref = db.collection('paradas_stm').doc(id);
        batch.set(ref, {
            id,
            nombre: parada.stopName || parada.nombre || '',
            lat: Number(parada.lat || parada.latitude || 0),
            lng: Number(parada.lng || parada.longitude || parada.lon || 0),
            lineas: parada.routes || parada.lineas || [],
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        count++;
    }
    await batch.commit();
    return { count };
};
// ─── SYNC: Sincronizar paradas STM completas ──────────────────────────────────
exports.syncParadasSTM = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        try {
            const result = await performSyncParadasSTM();
            res.json({ ok: true, paradasSincronizadas: result.count });
        }
        catch (error) {
            res.status(500).json({ error: error instanceof Error ? error.message : 'Error' });
        }
    });
});
exports.syncParadasSTMCron = functions.pubsub.schedule('30 3 * * *')
    .timeZone('America/Montevideo')
    .onRun(async (_context) => {
    // api.montevideo.gub.uy devuelve 403 — cron deshabilitado hasta que el endpoint sea accesible
    console.warn('[CRON] syncParadasSTMCron: endpoint 403, skipping');
    return null;
});
// ─── SEED: Cargar datos base de UCOT en Firestore ────────────────────────────
// Usar cuando no hay datos reales disponibles todavía
exports.seedUCOTData = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        try {
            const batch = db.batch();
            // Vehículos UCOT
            const vehiculos = [
                { id: '115', numero: '115', tipo: 'diesel', modelo: 'Marcopolo G7', año: 2018, status: 'activo', empresa: 'UCOT' },
                { id: '118', numero: '118', tipo: 'diesel', modelo: 'Marcopolo G7', año: 2018, status: 'activo', empresa: 'UCOT' },
                { id: '201', numero: '201', tipo: 'electrico', modelo: 'Yutong E12LF', año: 2020, status: 'activo', empresa: 'UCOT' },
                { id: '202', numero: '202', tipo: 'electrico', modelo: 'Yutong E12LF', año: 2020, status: 'activo', empresa: 'UCOT' },
                { id: '203', numero: '203', tipo: 'electrico', modelo: 'Yutong E12LF', año: 2020, status: 'activo', empresa: 'UCOT' },
                { id: '204', numero: '204', tipo: 'electrico', modelo: 'Yutong E12 Pro', año: 2024, status: 'activo', empresa: 'UCOT' },
                { id: '205', numero: '205', tipo: 'electrico', modelo: 'Yutong E12 Pro', año: 2024, status: 'activo', empresa: 'UCOT' },
                { id: '206', numero: '206', tipo: 'electrico', modelo: 'Yutong E12 Pro', año: 2024, status: 'activo', empresa: 'UCOT' },
                { id: '120', numero: '120', tipo: 'diesel', modelo: 'Busscar Urbanuss', año: 2019, status: 'activo', empresa: 'UCOT' },
                { id: '125', numero: '125', tipo: 'diesel', modelo: 'Busscar Urbanuss', año: 2019, status: 'mantenimiento', empresa: 'UCOT' },
                { id: '130', numero: '130', tipo: 'diesel', modelo: 'Marcopolo Torino', año: 2017, status: 'activo', empresa: 'UCOT' },
                { id: '135', numero: '135', tipo: 'hibrido', modelo: 'Volvo 7900H', año: 2021, status: 'activo', empresa: 'UCOT' },
            ];
            for (const v of vehiculos) {
                batch.set(db.collection('vehicles').doc(v.id), Object.assign(Object.assign({}, v), { createdAt: admin.firestore.FieldValue.serverTimestamp() }), { merge: true });
            }
            // Personal / Conductores
            const personal = [
                { id: 'C001', legajo: '001', nombre: 'Carlos', apellido: 'García', rol: 'conductor', estado: 'activo', turno: 'mañana' },
                { id: 'C002', legajo: '002', nombre: 'María', apellido: 'López', rol: 'conductor', estado: 'activo', turno: 'tarde' },
                { id: 'C003', legajo: '003', nombre: 'Juan', apellido: 'Rodríguez', rol: 'conductor', estado: 'activo', turno: 'mañana' },
                { id: 'C004', legajo: '004', nombre: 'Ana', apellido: 'Martínez', rol: 'inspector', estado: 'activo', turno: 'rotativo' },
                { id: 'C005', legajo: '005', nombre: 'Pedro', apellido: 'Fernández', rol: 'conductor', estado: 'licencia', turno: 'noche' },
            ];
            for (const p of personal) {
                batch.set(db.collection('personal').doc(p.id), Object.assign(Object.assign({}, p), { nombreCompleto: `${p.nombre} ${p.apellido}`, createdAt: admin.firestore.FieldValue.serverTimestamp() }), { merge: true });
            }
            // Líneas UCOT base
            const lineas = [
                { id: '300a', codigo: '300', variante: 'a', nombre: 'Maroñas - Centro (Ida)', empresa: 'UCOT', activa: true },
                { id: '300b', codigo: '300', variante: 'b', nombre: 'Centro - Maroñas (Vuelta)', empresa: 'UCOT', activa: true },
                { id: '306a', codigo: '306', variante: 'a', nombre: 'La Unión - Pocitos (Ida)', empresa: 'UCOT', activa: true },
                { id: '316a', codigo: '316', variante: 'a', nombre: 'Piedras Blancas - Centro (Ida)', empresa: 'UCOT', activa: true },
                { id: '328a', codigo: '328', variante: 'a', nombre: 'Manga - Tres Cruces (Ida)', empresa: 'UCOT', activa: true },
                { id: '329a', codigo: '329', variante: 'a', nombre: 'Melilla - Centro (Ida)', empresa: 'UCOT', activa: true },
                { id: '330a', codigo: '330', variante: 'a', nombre: 'Peñarol - Centro (Ida)', empresa: 'UCOT', activa: true },
                { id: 'CE1', codigo: 'CE1', variante: '', nombre: 'Diferencial Ciudad Vieja', empresa: 'UCOT', activa: true },
            ];
            for (const l of lineas) {
                batch.set(db.collection('lineas_ucot').doc(l.id), Object.assign(Object.assign({}, l), { createdAt: admin.firestore.FieldValue.serverTimestamp() }), { merge: true });
            }
            await batch.commit();
            res.json({
                ok: true,
                mensaje: 'Datos base cargados en Firestore',
                vehiculos: vehiculos.length,
                personal: personal.length,
                lineas: lineas.length,
            });
        }
        catch (error) {
            res.status(500).json({ error: error instanceof Error ? error.message : 'Error' });
        }
    });
});
// ─── GEOSERVER PROXY: Acceso a rutas por variante del Geoserver IMM ──────────
// El Geoserver de Montevideo provee recorridos diferenciados por cod_variante.
// Desde el browser directo suele estar bloqueado por CORS/firewall, por eso
// usamos esta Cloud Function como proxy.
const GEOSERVER_BASE = 'https://geoserver.montevideo.gub.uy/geoserver/imm/ows';
exports.geoserverProxy = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        try {
            const codVariante = req.query.cod_variante;
            const typeName = req.query.typeName || 'imm:v_uptu_sentido_variante';
            if (!codVariante) {
                res.status(400).json({ error: 'cod_variante requerido' });
                return;
            }
            const url = `${GEOSERVER_BASE}?service=WFS&version=2.0.0&request=GetFeature&typeName=${typeName}&CQL_FILTER=cod_variante=${codVariante}&outputFormat=application/json&srsname=EPSG:4326`;
            console.log(`[geoProxy] GET ${url}`);
            const response = await axios_1.default.get(url, {
                timeout: 15000,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'UCOT-Gestor/2.0',
                },
            });
            res.json(response.data);
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : 'Error geoserver proxy';
            console.error('[geoProxy] Error:', msg);
            res.status(500).json({ error: msg });
        }
    });
});
// ─── UTM Zone 21S (EPSG:32721) → WGS84 (EPSG:4326) conversion ───────────────
// Implementación directa sin depender de proj4 para mantener el bundle ligero.
function utmToLatLng(easting, northing, zone = 21, southern = true) {
    const a = 6378137; // WGS84 semi-major axis
    const f = 1 / 298.257223563; // WGS84 flattening
    const k0 = 0.9996;
    const e = Math.sqrt(2 * f - f * f);
    const e2 = e * e;
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const x = easting - 500000;
    const y = southern ? northing - 10000000 : northing;
    const M = y / k0;
    const mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));
    const phi1 = mu + (3 * e1 / 2 - 27 * e1 * e1 * e1 / 32) * Math.sin(2 * mu)
        + (21 * e1 * e1 / 16 - 55 * e1 * e1 * e1 * e1 / 32) * Math.sin(4 * mu)
        + (151 * e1 * e1 * e1 / 96) * Math.sin(6 * mu);
    const sinPhi = Math.sin(phi1);
    const cosPhi = Math.cos(phi1);
    const tanPhi = sinPhi / cosPhi;
    const N1 = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
    const T1 = tanPhi * tanPhi;
    const C1 = (e2 / (1 - e2)) * cosPhi * cosPhi;
    const R1 = a * (1 - e2) / Math.pow(1 - e2 * sinPhi * sinPhi, 1.5);
    const D = x / (N1 * k0);
    const lat = phi1 - (N1 * tanPhi / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * (e2 / (1 - e2))) * D * D * D * D / 24
        + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * (e2 / (1 - e2)) - 3 * C1 * C1) * D * D * D * D * D * D / 720);
    const lng = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180
        + (D - (1 + 2 * T1 + C1) * D * D * D / 6
            + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * (e2 / (1 - e2)) + 24 * T1 * T1) * D * D * D * D * D / 120) / cosPhi;
    return {
        lat: Number((lat * 180 / Math.PI).toFixed(6)),
        lng: Number((lng * 180 / Math.PI).toFixed(6)),
    };
}
// ─── Mapeo de cod_variante del Geoserver para líneas UCOT ─────────────────────
// Estos IDs se obtienen de la página STM: https://www.montevideo.gub.uy/app/stm/horarios/
// Cada línea tiene N variantes (IDA, VUELTA, y a veces sub-variantes cortadas)
// Formato: { lineId: string, variants: { code: 'a'|'b', codVariante: number, sentido: 'IDA'|'VUELTA', desc: string }[] }
const UCOT_GEOSERVER_VARIANTS = [
    {
        lineId: '370',
        variants: [
            { code: 'a', codVariante: 3626, sentido: 'IDA', terminalOrigen: 'Portones', terminalDestino: 'Playa del Cerro' },
            { code: 'b', codVariante: 3627, sentido: 'VUELTA', terminalOrigen: 'Playa del Cerro', terminalDestino: 'Portones' },
        ],
    },
    // TODO: Agregar más líneas a medida que se descubren los cod_variante
    // Se pueden encontrar inspeccionando la página STM 
    // Los IDs se ven en el onclick de los botones de "Recorrido" en la tabla de horarios
];
// ─── SYNC VARIANT ROUTES: Sincroniza recorridos por variante desde Geoserver ──
exports.syncVariantRoutes = functions
    .runWith({ timeoutSeconds: 120 })
    .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        var _a, _b, _c, _d, _e;
        try {
            const lineFilter = req.query.line;
            const results = {};
            let synced = 0;
            const linesToSync = lineFilter
                ? UCOT_GEOSERVER_VARIANTS.filter(l => l.lineId === lineFilter)
                : UCOT_GEOSERVER_VARIANTS;
            for (const line of linesToSync) {
                for (const variant of line.variants) {
                    const docId = `${line.lineId}${variant.code}`;
                    try {
                        // Pedir al Geoserver en EPSG:4326 (lat/lng directo)
                        const url4326 = `${GEOSERVER_BASE}?service=WFS&version=2.0.0&request=GetFeature&typeName=imm:v_uptu_sentido_variante&CQL_FILTER=cod_variante=${variant.codVariante}&outputFormat=application/json&srsname=EPSG:4326`;
                        let geoData;
                        try {
                            const resp = await axios_1.default.get(url4326, { timeout: 15000, headers: { 'User-Agent': 'UCOT-Gestor/2.0' } });
                            geoData = resp.data;
                        }
                        catch (_f) {
                            // Fallback: pedir en UTM y convertir
                            const urlUtm = `${GEOSERVER_BASE}?service=WFS&version=2.0.0&request=GetFeature&typeName=imm:v_uptu_sentido_variante&CQL_FILTER=cod_variante=${variant.codVariante}&outputFormat=application/json&srsname=EPSG:32721`;
                            const resp = await axios_1.default.get(urlUtm, { timeout: 15000, headers: { 'User-Agent': 'UCOT-Gestor/2.0' } });
                            geoData = resp.data;
                            // Convertir UTM → WGS84
                            if ((_c = (_b = (_a = geoData.features) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.geometry) === null || _c === void 0 ? void 0 : _c.coordinates) {
                                geoData.features[0].geometry.coordinates = geoData.features[0].geometry.coordinates.map((coord) => {
                                    const { lat, lng } = utmToLatLng(coord[0], coord[1]);
                                    return [lng, lat];
                                });
                            }
                        }
                        if (!geoData.features || geoData.features.length === 0) {
                            results[docId] = 'Sin datos en Geoserver';
                            continue;
                        }
                        const feature = geoData.features[0];
                        const coords = ((_d = feature.geometry) === null || _d === void 0 ? void 0 : _d.coordinates) || [];
                        // Convertir GeoJSON [lng, lat] → recorrido [{lat, lng}]
                        const recorrido = [];
                        if (((_e = feature.geometry) === null || _e === void 0 ? void 0 : _e.type) === 'MultiLineString') {
                            // MultiLineString: array de arrays de coords
                            for (const lineString of coords) {
                                for (const coord of lineString) {
                                    recorrido.push({ lat: Number(coord[1]), lng: Number(coord[0]) });
                                }
                            }
                        }
                        else {
                            // LineString: array simple de coords
                            for (const coord of coords) {
                                if (Array.isArray(coord) && coord.length >= 2) {
                                    recorrido.push({ lat: Number(coord[1]), lng: Number(coord[0]) });
                                }
                            }
                        }
                        if (recorrido.length === 0) {
                            results[docId] = 'Recorrido vacío';
                            continue;
                        }
                        // Guardar en Firestore
                        const docRef = db.collection('lineas_ucot').doc(docId);
                        await docRef.set({
                            codigo: line.lineId,
                            nombre: `Línea ${line.lineId} ${variant.sentido}`,
                            numeroAPI: line.lineId,
                            varianteIdx: variant.code === 'a' ? 0 : 1,
                            sentido: variant.sentido,
                            origen: variant.terminalOrigen,
                            destino: variant.terminalDestino,
                            terminalSalida: variant.terminalOrigen,
                            terminalLlegada: variant.terminalDestino,
                            recorrido,
                            empresa: 'UCOT',
                            activa: true,
                            fuenteGeoserver: true,
                            codVarianteGeoserver: variant.codVariante,
                            ultimaActualizacion: admin.firestore.FieldValue.serverTimestamp(),
                        }, { merge: true });
                        synced++;
                        results[docId] = `OK (${recorrido.length} puntos, ${variant.sentido}: ${variant.terminalOrigen} → ${variant.terminalDestino})`;
                    }
                    catch (err) {
                        results[docId] = `Error: ${err instanceof Error ? err.message : 'desconocido'}`;
                    }
                }
            }
            res.json({
                ok: true,
                synced,
                results,
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            res.status(500).json({ error: error instanceof Error ? error.message : 'Error' });
        }
    });
});
// ─── DISCOVER VARIANTS: Busca todas las variantes de una línea en Geoserver ───
// Útil para descubrir los cod_variante de nuevas líneas
exports.discoverVariants = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        var _a;
        try {
            const lineNumber = req.query.line;
            if (!lineNumber) {
                res.status(400).json({ error: 'line requerido (ej: ?line=370)' });
                return;
            }
            // Buscar todas las variantes que contengan el número de línea en su descripción
            const url = `${GEOSERVER_BASE}?service=WFS&version=2.0.0&request=GetFeature&typeName=imm:v_uptu_sentido_variante&CQL_FILTER=desc_linea='${lineNumber}'&outputFormat=application/json&srsname=EPSG:4326&propertyName=cod_variante,desc_variante,desc_linea,sentido`;
            console.log(`[discover] GET ${url}`);
            const response = await axios_1.default.get(url, {
                timeout: 15000,
                headers: { 'User-Agent': 'UCOT-Gestor/2.0' },
            });
            const features = ((_a = response.data) === null || _a === void 0 ? void 0 : _a.features) || [];
            const variants = features.map((f) => f.properties);
            res.json({
                line: lineNumber,
                variantsFound: variants.length,
                variants,
            });
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : 'Error';
            console.error('[discover] Error:', msg);
            res.status(500).json({ error: msg });
        }
    });
});
// ─── GPS WEBHOOK: Recibe posición de dispositivos externos ───────────────────
exports.gpsWebhook = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== 'POST') {
            res.status(405).json({ error: 'Method not allowed' });
            return;
        }
        try {
            const { vehicleId, lat, lng, speed, heading } = req.body;
            if (!vehicleId || lat == null || lng == null) {
                res.status(400).json({ error: 'vehicleId, lat y lng son requeridos' });
                return;
            }
            await db.collection('viajes_activos').doc(String(vehicleId)).set({
                cocheId: String(vehicleId),
                posicion: new admin.firestore.GeoPoint(Number(lat), Number(lng)),
                velocidad: speed !== null && speed !== void 0 ? speed : null,
                rumbo: heading !== null && heading !== void 0 ? heading : null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                estado: 'en_servicio',
                fuente: 'webhook_externo',
            }, { merge: true });
            res.json({ ok: true, vehicleId, ts: new Date().toISOString() });
        }
        catch (error) {
            res.status(500).json({ error: error instanceof Error ? error.message : 'Error' });
        }
    });
});
// ─── Helpers ──────────────────────────────────────────────────────────────────
function extraerParadas(data) {
    const paradas = [];
    const raw = (data.stops || data.paradas || data.itinerary || []);
    if (Array.isArray(raw)) {
        for (const p of raw) {
            const punto = p;
            const lat = Number(punto.lat || punto.latitude || 0);
            const lng = Number(punto.lng || punto.longitude || punto.lon || 0);
            if (lat && lng) {
                paradas.push({ nombre: String(punto.name || punto.nombre || ''), lat, lng });
            }
        }
    }
    return paradas;
}
function extraerRecorrido(data) {
    const puntos = [];
    const raw = (data.shape || data.recorrido || data.geometry || []);
    if (Array.isArray(raw)) {
        for (const p of raw) {
            const punto = p;
            const lat = Number(punto.lat || punto.latitude || 0);
            const lng = Number(punto.lng || punto.longitude || punto.lon || 0);
            if (lat && lng)
                puntos.push({ lat, lng });
        }
    }
    return puntos;
}
// ─── Módulo de Detección de Desvíos GPS (Skill 3 + SRE) ──────────────────────
// Incluye: gpsWebhookV2, expirarDesvios, alertasVencimientosDocumentales, alertaSoCBajo
var detectarDesvio_1 = require("./detectarDesvio");
Object.defineProperty(exports, "gpsWebhookV2", { enumerable: true, get: function () { return detectarDesvio_1.gpsWebhookV2; } });
Object.defineProperty(exports, "expirarDesvios", { enumerable: true, get: function () { return detectarDesvio_1.expirarDesvios; } });
Object.defineProperty(exports, "alertasVencimientosDocumentales", { enumerable: true, get: function () { return detectarDesvio_1.alertasVencimientosDocumentales; } });
Object.defineProperty(exports, "alertaSoCBajo", { enumerable: true, get: function () { return detectarDesvio_1.alertaSoCBajo; } });
// ─── Shadow Dispatcher — Agentes Autónomos de Línea (Skill: shadow-dispatcher) ─
// Incluye: shadowDispatcherTick, rivalPingIngestion, limpiarPingsRivales, onAlertaRegulacion
var shadowDispatcher_1 = require("./shadowDispatcher");
Object.defineProperty(exports, "shadowDispatcherTick", { enumerable: true, get: function () { return shadowDispatcher_1.shadowDispatcherTick; } });
Object.defineProperty(exports, "rivalPingIngestion", { enumerable: true, get: function () { return shadowDispatcher_1.rivalPingIngestion; } });
Object.defineProperty(exports, "limpiarPingsRivales", { enumerable: true, get: function () { return shadowDispatcher_1.limpiarPingsRivales; } });
Object.defineProperty(exports, "onAlertaRegulacion", { enumerable: true, get: function () { return shadowDispatcher_1.onAlertaRegulacion; } });
// ─── Ingesta IMM — Motor de Datos Públicos STM (Skill: ingesta-bigdata-realtime) ─
// Consulta la API pública de la IMM cada 60s para obtener posiciones GPS de TODOS
// los buses de Montevideo. Elimina la dependencia de cartones internos.
var ingestaIMM_1 = require("./ingestaIMM");
Object.defineProperty(exports, "ingestaIMMTick", { enumerable: true, get: function () { return ingestaIMM_1.ingestaIMMTick; } });
Object.defineProperty(exports, "testIngestaIMM", { enumerable: true, get: function () { return ingestaIMM_1.testIngestaIMM; } });
// ─── PROXY: API STM Online (POST) ─────────────────────────────────────────────
// Resuelve CORS para el live map (POST a /buses/rest/stm-online) en producción
exports.stmOnlineProxy = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        try {
            const url = 'https://www.montevideo.gub.uy/buses/rest/stm-online';
            const response = await axios_1.default.post(url, req.body, {
                timeout: 15000,
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': 'https://www.montevideo.gub.uy',
                    'Referer': 'https://www.montevideo.gub.uy/buses/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json'
                }
            });
            res.json(response.data);
        }
        catch (error) {
            console.error('[stmOnlineProxy] Error:', error.message);
            res.status(502).json({ error: error.message });
        }
    });
});
// ─── DATA LAKE: Ingesta Masiva de Datos Históricos (CSV) ──────────────────────
exports.parseBulkTicketsStorage = functions
    .runWith({ timeoutSeconds: 540, memory: '1GB' })
    .storage.object().onFinalize(async (object) => {
    try {
        const filePath = object.name;
        const bucketName = object.bucket;
        if (!filePath || !filePath.startsWith('data_lake/uploads/') || !filePath.endsWith('.csv')) {
            return null;
        }
        console.log(`[DataLake] Comenzando ingesta para: ${filePath}`);
        const bucket = admin.storage().bucket(bucketName);
        const tempFilePath = path.join(os.tmpdir(), path.basename(filePath));
        await bucket.file(filePath).download({ destination: tempFilePath });
        const fileContent = fs.readFileSync(tempFilePath, 'utf8');
        // Leer CSV
        const result = Papa.parse(fileContent, {
            header: true,
            skipEmptyLines: true,
        });
        console.log(`[DataLake] Archivo procesado, ${result.data.length} filas encontradas.`);
        const collectionRef = db.collection('data_lake_tickets');
        let batch = db.batch();
        let count = 0;
        for (const row of result.data) {
            const id = collectionRef.doc().id;
            const ref = collectionRef.doc(id);
            batch.set(ref, Object.assign(Object.assign({}, row), { ingestedAt: admin.firestore.FieldValue.serverTimestamp(), sourceFile: path.basename(filePath) }));
            count++;
            // Límite de batch Firestore: 500
            if (count % 500 === 0) {
                await batch.commit();
                batch = db.batch();
            }
        }
        if (count % 500 !== 0) {
            await batch.commit();
        }
        console.log(`[DataLake] Ingestados ${count} tickets exitosamente.`);
        fs.unlinkSync(tempFilePath); // Cleanup
        // Mover a procesados (Evita re-ejecuciones accidentales)
        const processedFilePath = filePath.replace('data_lake/uploads/', 'data_lake/processed/');
        await bucket.file(filePath).move(processedFilePath);
        console.log(`[DataLake] Archivo movido a ${processedFilePath}`);
        return count;
    }
    catch (e) {
        console.error('[DataLake] Error procesando archivo:', e);
        return null;
    }
});
// ─── PROXY: STM Horarios (JSF) ────────────────────────────────────────────────
// Resuelve CORS para el scraping de horarios JSF desde producción.
// Vite proxy maneja /proxy-horarios/* en local, en prod Firebase rewrite apunta acá.
exports.stmHorariosProxy = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        try {
            // req.originalUrl is strictly the full path starting with /proxy-horarios
            const targetPath = req.originalUrl.replace(/^\/proxy-horarios/, '');
            const url = `https://www.montevideo.gub.uy${targetPath}`;
            const isPost = req.method === 'POST';
            const headersKeysToForward = ['content-type', 'faces-request', 'x-requested-with', 'accept'];
            const headers = {
                'Origin': 'https://www.montevideo.gub.uy',
                'Referer': 'https://www.montevideo.gub.uy/app/stm/horarios/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            };
            for (const k of headersKeysToForward) {
                if (req.headers[k]) {
                    headers[k] = req.headers[k];
                }
            }
            console.log(`[stmHorariosProxy] ${req.method} ${url}`);
            const config = {
                method: req.method,
                url,
                headers,
                timeout: 15000,
                responseType: 'arraybuffer' // to handle strings/html/xml correctly
            };
            if (isPost && req.rawBody) {
                config.data = req.rawBody;
            }
            const response = await (0, axios_1.default)(config);
            // Copy content-type from STM
            res.set('Content-Type', String(response.headers['content-type'] || 'text/html; charset=UTF-8'));
            // Send raw buffer back
            res.send(response.data);
        }
        catch (error) {
            console.error('[stmHorariosProxy] Error:', error.message);
            res.status(502).json({ error: error.message });
        }
    });
});
var intelligenceApi_1 = require("./intelligenceApi");
Object.defineProperty(exports, "intelligenceApi", { enumerable: true, get: function () { return intelligenceApi_1.intelligenceApi; } });
// ─── Horarios oficiales UCOT (scraper JSF diario) ─────────────────────────────
var refreshHorariosUcot_1 = require("./refreshHorariosUcot");
Object.defineProperty(exports, "refreshHorariosUcotTick", { enumerable: true, get: function () { return refreshHorariosUcot_1.refreshHorariosUcotTick; } });
Object.defineProperty(exports, "refreshHorariosUcotNow", { enumerable: true, get: function () { return refreshHorariosUcot_1.refreshHorariosUcotNow; } });
// ─── Refresh entidad-nivel `competidores` cada 10min ─────────────────────────
// Complementa ingestaIMMTick (cada 60s, pings GPS por bus): aquí mantenemos
// el documento agregado por empresa que consume competitionService.
var refreshCompetidores_1 = require("./refreshCompetidores");
Object.defineProperty(exports, "refreshCompetidoresTick", { enumerable: true, get: function () { return refreshCompetidores_1.refreshCompetidoresTick; } });
Object.defineProperty(exports, "refreshCompetidoresNow", { enumerable: true, get: function () { return refreshCompetidores_1.refreshCompetidoresNow; } });
// ─── AutoStats Collector — GPS+GTFS cada 5min ─────────────────────────────────
// Acumula historial de cumplimiento horario sin inspectores.
// Funciona para UCOT, CUTCSA, COETC, COME simultáneamente.
var autoStatsCollector_1 = require("./autoStatsCollector");
Object.defineProperty(exports, "autoStatsCollectorTick", { enumerable: true, get: function () { return autoStatsCollector_1.autoStatsCollectorTick; } });
Object.defineProperty(exports, "autoStatsCollectorNow", { enumerable: true, get: function () { return autoStatsCollector_1.autoStatsCollectorNow; } });
// ─── Refresh horarios STM completo (todas las empresas, todas las líneas) ─────
var refreshAllStmHorarios_1 = require("./refreshAllStmHorarios");
Object.defineProperty(exports, "refreshAllStmHorariosNow", { enumerable: true, get: function () { return refreshAllStmHorarios_1.refreshAllStmHorariosNow; } });
Object.defineProperty(exports, "refreshAllStmHorariosTick", { enumerable: true, get: function () { return refreshAllStmHorarios_1.refreshAllStmHorariosTick; } });
// ─── Schedule Adherence Engine — OTP planificado vs real ──────────────────────
// Cruza vehicle_events (GPS real) contra horarios_stm (programación oficial)
// y produce auto_stats_diarios/{YYYY-MM-DD}_{agencyId} con OTP real UITP.
// Métrica canónica: |desviación| ≤ 5 min = A_TIEMPO.
// Cron horario procesa la hora previa; endpoint manual permite recalcular días.
var scheduleAdherence_1 = require("./scheduleAdherence");
Object.defineProperty(exports, "computeAdherenceNow", { enumerable: true, get: function () { return scheduleAdherence_1.computeAdherenceNow; } });
Object.defineProperty(exports, "computeAdherenceCron", { enumerable: true, get: function () { return scheduleAdherence_1.computeAdherenceCron; } });
// ─── Market Penetration — snapshot diario de cuota cross-operador ─────────────
// Cron 23:45 Mvd toma snapshot de buses observados por (línea × agencyId)
// y persiste en penetracion_diaria/{ymd}_{linea}. Permite reconstruir
// histórico de penetración sin mantener cartones detallados.
// HTTP /penetrationHistoric?agencyId=X&days=N&topLineas=M para el dashboard.
var marketPenetration_1 = require("./marketPenetration");
Object.defineProperty(exports, "computePenetrationNow", { enumerable: true, get: function () { return marketPenetration_1.computePenetrationNow; } });
Object.defineProperty(exports, "computePenetrationCron", { enumerable: true, get: function () { return marketPenetration_1.computePenetrationCron; } });
Object.defineProperty(exports, "penetrationHistoric", { enumerable: true, get: function () { return marketPenetration_1.penetrationHistoric; } });
// ─── Service Delivery Engine — KPI canónico UITP cartones plan/ejec ───────────
// Cruza cartones planificados vs cartones_completados y produce
// service_delivery_diaria/{ymd}_{agencyId} con SD = ejec/plan.
// Cron 23:30 Mvd procesa el día. HTTP manual permite recalcular días específicos.
var serviceDeliveryEngine_1 = require("./serviceDeliveryEngine");
Object.defineProperty(exports, "computeServiceDeliveryNow", { enumerable: true, get: function () { return serviceDeliveryEngine_1.computeServiceDeliveryNow; } });
Object.defineProperty(exports, "computeServiceDeliveryCron", { enumerable: true, get: function () { return serviceDeliveryEngine_1.computeServiceDeliveryCron; } });
// ─── Audit Log — trazabilidad de cambios sobre colecciones críticas ───────────
// Trigger onWrite registra cada cambio (create/update/delete) en audit_log/
// con before/after/diff/uid/email para compliance y debugging.
var auditLog_1 = require("./auditLog");
Object.defineProperty(exports, "auditLogParametrosOperativos", { enumerable: true, get: function () { return auditLog_1.auditLogParametrosOperativos; } });
Object.defineProperty(exports, "auditLogParametrosOperativosHistorial", { enumerable: true, get: function () { return auditLog_1.auditLogParametrosOperativosHistorial; } });
Object.defineProperty(exports, "auditLogLineasUcot", { enumerable: true, get: function () { return auditLog_1.auditLogLineasUcot; } });
Object.defineProperty(exports, "auditLogLineas", { enumerable: true, get: function () { return auditLog_1.auditLogLineas; } });
Object.defineProperty(exports, "auditLogVehicles", { enumerable: true, get: function () { return auditLog_1.auditLogVehicles; } });
Object.defineProperty(exports, "auditLogVehiculos", { enumerable: true, get: function () { return auditLog_1.auditLogVehiculos; } });
Object.defineProperty(exports, "auditLogUsers", { enumerable: true, get: function () { return auditLog_1.auditLogUsers; } });
Object.defineProperty(exports, "auditLogReglasRotacion", { enumerable: true, get: function () { return auditLog_1.auditLogReglasRotacion; } });
Object.defineProperty(exports, "auditLogServiceDefinitions", { enumerable: true, get: function () { return auditLog_1.auditLogServiceDefinitions; } });
Object.defineProperty(exports, "auditLogServiceMatrices", { enumerable: true, get: function () { return auditLog_1.auditLogServiceMatrices; } });
Object.defineProperty(exports, "auditLogQuery", { enumerable: true, get: function () { return auditLog_1.auditLogQuery; } });
// ─── Archive Vehicle Events — Rotativo semanal a Storage ─────────────────────
// Exporta vehicle_events a Firebase Storage y purga Firestore.
// Mantiene Firestore pequeño (7 días) y el historial en Storage (ilimitado, barato).
var archiveVehicleEvents_1 = require("./archiveVehicleEvents");
Object.defineProperty(exports, "archiveVehicleEventsTick", { enumerable: true, get: function () { return archiveVehicleEvents_1.archiveVehicleEventsTick; } });
Object.defineProperty(exports, "archiveVehicleEventsNow", { enumerable: true, get: function () { return archiveVehicleEvents_1.archiveVehicleEventsNow; } });
Object.defineProperty(exports, "listVehicleArchives", { enumerable: true, get: function () { return archiveVehicleEvents_1.listVehicleArchives; } });
// ─── Shape Reconstruction — shapes cross-operador desde vehicle_events ────────
// DIRECTRIZ 2026-04-24: SkillRoute analiza el sistema metropolitano completo.
// Reconstruye polilíneas de UCOT/CUTCSA/COME/COETC desde el histórico GPS.
// Base para la matriz DRO (v2) y snap-to-shape en ShadowRadar.
var shapeReconstruction_1 = require("./shapeReconstruction");
Object.defineProperty(exports, "reconstructShapesTick", { enumerable: true, get: function () { return shapeReconstruction_1.reconstructShapesTick; } });
Object.defineProperty(exports, "reconstructShapesNow", { enumerable: true, get: function () { return shapeReconstruction_1.reconstructShapesNow; } });
// ─── DRO Matrix — Directional Route Overlap entre shapes ─────────────────────
// Consume shapes_cross_operator y produce corridor_overlap con pctAInB,
// sharedKm, sameEmpresa (para intra-empresa canibalización).
// Reemplaza la heurística de destino/heading en ShadowRadar.
var droMatrix_1 = require("./droMatrix");
Object.defineProperty(exports, "droMatrixTick", { enumerable: true, get: function () { return droMatrix_1.droMatrixTick; } });
Object.defineProperty(exports, "recomputeDroMatrixNow", { enumerable: true, get: function () { return droMatrix_1.recomputeDroMatrixNow; } });
// ─── FCM Alert Dispatcher — push al conductor + ACK loop ──────────────────────
// ─── Histórico de KPIs (CEO V7 fase 2) ────────────────────────────────────────
// Series diarias para los botones 7D/30D del Centro de Mando.
// /historicOtp?days=N&agencyId=X → puntualidad por día
// /historicBunching?days=N&agencyId=X → aglomeración por día
var historicMetrics_1 = require("./historicMetrics");
Object.defineProperty(exports, "historicOtp", { enumerable: true, get: function () { return historicMetrics_1.historicOtp; } });
Object.defineProperty(exports, "historicBunching", { enumerable: true, get: function () { return historicMetrics_1.historicBunching; } });
// DIRECTRIZ 2026-04-24: cierra el loop operacional (Swiftly/Optibus-style).
// onAlertaCreated: dispara FCM cada vez que se crea un doc en alertas_regulacion.
// acknowledgeAlerta: HTTP endpoint que marca ack_at + response_time_sec cuando
// el chofer toca "OK" en la notificación.
var fcmAlertDispatcher_1 = require("./fcmAlertDispatcher");
Object.defineProperty(exports, "onAlertaCreated", { enumerable: true, get: function () { return fcmAlertDispatcher_1.onAlertaCreated; } });
Object.defineProperty(exports, "acknowledgeAlerta", { enumerable: true, get: function () { return fcmAlertDispatcher_1.acknowledgeAlerta; } });
// FCM para incidencias: notifica supervisores y (si es urgente) conductores de la línea
var incidenciaDispatcher_1 = require("./incidenciaDispatcher");
Object.defineProperty(exports, "onIncidenciaCreated", { enumerable: true, get: function () { return incidenciaDispatcher_1.onIncidenciaCreated; } });
// ─── GTFS-Realtime Publisher ─────────────────────────────────────────────────
// Fase 1 #5 (2026-04-23): publica VehiclePositions GTFS-RT para integración
// con Google Maps, Moovit, Citymapper y cualquier agregador MaaS.
// URLs tras deploy:
//   /gtfsRealtime/vehicle-positions.pb   — protobuf (producción)
//   /gtfsRealtime/vehicle-positions.json — JSON (debug)
//   /gtfsRealtime/feed-info              — metadata
var gtfsRealtime_1 = require("./gtfsRealtime");
Object.defineProperty(exports, "gtfsRealtime", { enumerable: true, get: function () { return gtfsRealtime_1.gtfsRealtime; } });
Object.defineProperty(exports, "refreshGtfsRtAlerts", { enumerable: true, get: function () { return gtfsRealtime_1.refreshGtfsRtAlerts; } });
// ─── Compliance Reporting (Sprint 1, 2026-04-25) ─────────────────────────────
// GET/POST /regulatorio/export — PDF estructurado cumplimiento OTP + KPIs UITP
// Auth: ADMIN/SUPERADMIN
var regulatorio_1 = require("./api/regulatorio");
Object.defineProperty(exports, "regulatorio", { enumerable: true, get: function () { return regulatorio_1.regulatorio; } });
// ─── GTFS-Static Publisher ───────────────────────────────────────────────────
// Trim+ #1 (2026-04-23): dataset estático (routes, stops, trips, shapes) que
// complementa GTFS-RT. Agregadores MaaS consumen ambos.
//   /gtfsStatic/feed.zip    — application/zip (producción)
//   /gtfsStatic/feed-info   — metadata JSON
var gtfsStatic_1 = require("./gtfsStatic");
Object.defineProperty(exports, "gtfsStatic", { enumerable: true, get: function () { return gtfsStatic_1.gtfsStatic; } });
// ─── SIRI-Lite Publisher (mercado UE) ────────────────────────────────────────
// Trim+ #68 (2026-04-23): VehicleMonitoring + StopMonitoring en formato SIRI-Lite JSON
// para agregadores MaaS europeos.
//   /siriRealtime/vm.json
//   /siriRealtime/sm.json
//   /siriRealtime/discovery.json
var siriRealtime_1 = require("./siriRealtime");
Object.defineProperty(exports, "siriRealtime", { enumerable: true, get: function () { return siriRealtime_1.siriRealtime; } });
// ─── System Health Monitoring (operational observability) ────────────────────
// Trim+ #72 (2026-04-23): agrega estado de todos los componentes en un JSON.
//   /systemHealth          — estado completo (cache 30s)
//   /systemHealth?fresh=1  — force refresh
var systemHealth_1 = require("./systemHealth");
Object.defineProperty(exports, "systemHealth", { enumerable: true, get: function () { return systemHealth_1.systemHealth; } });
// ─── NeTEx Framework Discovery (EU/Interop stds) ─────────────────────────────
// GET /netexEndpoint/discovery.{xml,json} para agregadores MaaS europeos.
var netexEndpoint_1 = require("./netexEndpoint");
Object.defineProperty(exports, "netexEndpoint", { enumerable: true, get: function () { return netexEndpoint_1.netexEndpoint; } });
// ─── GPS History Accumulator — acumula pings GPS con TTL 7 días ──────────────
// Cron 60s: muestrea todos los buses del sistema y persiste en gps_pings_raw.
// Fuente primaria para shapeBuilder (shapes GPS-derived cross-operador).
var gpsHistoryAccumulator_1 = require("./gpsHistoryAccumulator");
Object.defineProperty(exports, "gpsHistoryAccumulatorTick", { enumerable: true, get: function () { return gpsHistoryAccumulator_1.gpsHistoryAccumulatorTick; } });
// ─── Shape Builder — reconstruye shapes desde historial GPS ──────────────────
// Cron 1h: lee gps_pings_raw, aplica Douglas-Peucker, materializa en
// shapes_cross_operator/{agencyId}_{linea}_{variante} con agencyId correcto.
// HTTP /shapeBuilderRun?agencyId=70&linea=300 para forzar reconstrucción puntual.
var shapeBuilder_1 = require("./shapeBuilder");
Object.defineProperty(exports, "shapeBuilderTick", { enumerable: true, get: function () { return shapeBuilder_1.shapeBuilderTick; } });
Object.defineProperty(exports, "shapeBuilderRun", { enumerable: true, get: function () { return shapeBuilder_1.shapeBuilderRun; } });
// ─── Compliance Alerts — detecta líneas con cumplimiento degradado ────────────
// Cron 6h: lee vehicle_events últimas 24h, escribe en compliance_alerts,
// envía FCM a ADMIN/TRAFFIC si hay alertas CRITICO (< 50%).
var complianceAlertsTick_1 = require("./complianceAlertsTick");
Object.defineProperty(exports, "complianceAlertsTick", { enumerable: true, get: function () { return complianceAlertsTick_1.complianceAlertsTick; } });
