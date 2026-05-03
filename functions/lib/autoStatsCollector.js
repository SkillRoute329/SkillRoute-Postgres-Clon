"use strict";
/**
 * autoStatsCollector.ts — GPS + STM Horarios (sin GTFS departamental)
 * =====================================================================
 * Cron cada 5 minutos:
 *  1. Obtiene posición GPS de los 4 operadores desde STM en vivo
 *  2. Lee la posición anterior del bus (Firestore bus_last_pos) → calcula bearing
 *  3. Lee horarios STM scrapeados (horarios_stm/{linea}) → detecta servicio activo
 *  4. Determina sentido IDA/VUELTA por bearing + dirección de la variante
 *  5. Calcula desvío en minutos respecto al servicio programado
 *  6. Guarda vehicle_events (TTL 7 días) + actualiza bus_last_pos
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
exports.autoStatsCollectorNow = exports.autoStatsCollectorTick = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const db = admin.firestore();
// ── Constantes ─────────────────────────────────────────────────────────────
const STM_URL = 'https://www.montevideo.gub.uy/buses/rest/stm-online';
const STM_HDR = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Content-Type': 'application/json',
    'Referer': 'https://www.montevideo.gub.uy/buses/',
    'Origin': 'https://www.montevideo.gub.uy',
};
const AGENCY_NAMES = { '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT' };
const COLLECTION = 'vehicle_events';
const LAST_POS_COLL = 'bus_last_pos';
const TTL_DAYS = 7;
// ── Helpers matemáticos ────────────────────────────────────────────────────
function toMin(t) {
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    return m ? +m[1] * 60 + +m[2] : null;
}
function nowMin(d) { return d.getHours() * 60 + d.getMinutes(); }
function tipoDia(d) {
    const dow = d.getDay();
    if (dow === 0)
        return 'Domingos';
    if (dow === 6)
        return 'Sábados';
    return 'Hábiles';
}
/** Bearing en grados (0=N, 90=E, 180=S, 270=W) entre dos puntos GPS */
function calcBearing(lat1, lon1, lat2, lon2) {
    const toRad = (d) => d * Math.PI / 180;
    const dLon = toRad(lon2 - lon1);
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const y = Math.sin(dLon) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
/** Diferencia angular mínima entre dos bearings (0-180) */
function angleDiff(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
}
/**
 * Sentido: IDA = bus moviéndose hacia el destino de la variante.
 * Usamos la dirección geográfica del vector origen→destino de cada variante
 * (inferida desde sus nombres: términos como "Norte", "Cerro", "Pocitos", etc.)
 * como heurística de último recurso. Para Montevideo, la ciudad antigua está
 * al SW y la periferia al NE/E/N, por lo que:
 *   bearing ∈ [0,135] ∪ [315,360] → periferia (IDA en muchas líneas)
 *   bearing ∈ [135,315]            → centro (VUELTA en muchas líneas)
 * Pero mejor: si las salidas de la variante A van a FullMin < FullMin de B
 * entonces A es la variante del servicio de mañana/ida.
 *
 * NOTA: Si el nombre del destino contiene "centro", "ciudad vieja", "MDEO" → VUELTA
 * Si contiene "cerro", "pocitos", "maldonado", "instrucciones", "portones" → IDA
 */
function detectarSentido(bearing, variantes) {
    if (!bearing)
        return null;
    if (variantes.length < 2)
        return 'IDA';
    // Palabras clave de destinos "hacia el centro" → VUELTA
    const CENTRO = /centro|ciudad vieja|mdeo|aduana|tres cruces|palacio|goes|zitarrosa/i;
    // Determinar cuál variante es "hacia el centro" (VUELTA)
    const vueltaIdx = variantes.findIndex(v => CENTRO.test(v.destino) || CENTRO.test(v.origen));
    // Si tenemos 2 variantes: una es IDA (outbound) y otra VUELTA (inbound)
    // El bearing hacia el sur/suroeste de Montevideo → VUELTA (hacia Ciudad Vieja)
    // Montevideo: ciudad vieja ≈ bearing 225° desde periferia
    const haciaCentro = angleDiff(bearing, 225) < 90;
    if (vueltaIdx >= 0) {
        return haciaCentro ? 'VUELTA' : 'IDA';
    }
    return haciaCentro ? 'VUELTA' : 'IDA';
}
// ── Motor de cumplimiento ──────────────────────────────────────────────────
function calcularCumplimiento(velocidad, linea, horario, bearing, now) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const hora = now.getHours();
    // Sin horario registrado en Firestore para esta línea: no se puede calcular cumplimiento.
    // Usamos SIN_HORARIO para que complianceAlertsTick NO lo cuente como EN_TIEMPO.
    // FUERA_DE_SERVICIO solo si el bus está literalmente detenido en madrugada.
    if (!horario) {
        if (hora >= 1 && hora < 5)
            return { state: 'FUERA_DE_SERVICIO', desviacionMin: null, proximaParada: null, sentido: null, bearing };
        // Sin horario de referencia: no marcar EN_TIEMPO por velocidad — eso inflaría OTP artificialmente.
        const state = velocidad >= 2 ? 'SIN_HORARIO' : 'FUERA_DE_SERVICIO';
        return { state, desviacionMin: null, proximaParada: null, sentido: null, bearing };
    }
    // Buscar el día con fallback: acentos pueden variar entre versiones del scraper
    const tipo = tipoDia(now);
    const dia = (_f = (_d = (_b = (_a = horario.dias) === null || _a === void 0 ? void 0 : _a[tipo]) !== null && _b !== void 0 ? _b : (_c = horario.dias) === null || _c === void 0 ? void 0 : _c['Habiles']) !== null && _d !== void 0 ? _d : (_e = horario.dias) === null || _e === void 0 ? void 0 : _e['Hábiles']) !== null && _f !== void 0 ? _f : Object.values((_g = horario.dias) !== null && _g !== void 0 ? _g : {})[0];
    if (!dia || !((_h = dia.salidasTodas) === null || _h === void 0 ? void 0 : _h.length)) {
        if (hora >= 1 && hora < 5)
            return { state: 'FUERA_DE_SERVICIO', desviacionMin: null, proximaParada: null, sentido: null, bearing };
        // Horario existe pero no tiene salidas para este día/tipo: no hay servicio programado.
        // No inferir EN_TIEMPO desde velocidad — inflaría OTP con eventos no medibles.
        const state = velocidad >= 2 ? 'SIN_HORARIO' : 'FUERA_DE_SERVICIO';
        return { state, desviacionMin: null, proximaParada: null, sentido: null, bearing };
    }
    const nMin = nowMin(now);
    // Detectar sentido con bearing
    const sentido = detectarSentido(bearing, dia.variantes);
    // Filtrar variante por sentido si es posible
    const CENTRO = /centro|ciudad vieja|mdeo|aduana|tres cruces|palacio|goes|zitarrosa/i;
    let salidas = dia.salidasTodas;
    if (sentido && dia.variantes.length >= 2) {
        const filtradas = salidas.filter(s => sentido === 'VUELTA' ? CENTRO.test(s.destino) : !CENTRO.test(s.destino));
        if (filtradas.length > 0)
            salidas = filtradas;
    }
    // Servicios activos: desde <= ahora <= hacia (ventana exacta)
    let activos = salidas.filter(s => {
        const d = toMin(s.desde);
        const h = toMin(s.hacia);
        return d !== null && h !== null && d <= nMin && h >= nMin;
    });
    // Ampliar ventana: si no hay activos exactos, buscar servicios que salieron hace ≤60 min
    // (cubre trips cortos donde hacia < ahora pero el bus sigue en ruta)
    if (!activos.length) {
        activos = salidas.filter(s => {
            const d = toMin(s.desde);
            return d !== null && d <= nMin && d >= nMin - 60;
        });
    }
    // Siguiente salida (para el caso en que el bus está a punto de salir)
    if (!activos.length) {
        const proxima = salidas.filter(s => {
            const d = toMin(s.desde);
            return d !== null && d > nMin && d <= nMin + 15;
        });
        if (proxima.length)
            activos = proxima;
    }
    if (!activos.length) {
        if (hora >= 1 && hora < 5)
            return { state: 'FUERA_DE_SERVICIO', desviacionMin: null, proximaParada: null, sentido, bearing };
        const state = velocidad >= 5 ? 'SIN_HORARIO' : 'FUERA_DE_SERVICIO';
        return { state, desviacionMin: null, proximaParada: null, sentido, bearing };
    }
    // Servicio más cercano a ahora (el más reciente que salió)
    const mejorServicio = activos.reduce((best, s) => {
        const d = toMin(s.desde);
        const bd = toMin(best.desde);
        return Math.abs(d - nMin) < Math.abs(bd - nMin) ? s : best;
    });
    const desdeMin = toMin(mejorServicio.desde);
    const haciaMin = toMin(mejorServicio.hacia);
    const duracion = haciaMin - desdeMin;
    const transcurrido = nMin - desdeMin;
    const pctCompletado = duracion > 0 ? transcurrido / duracion : 0;
    // Frecuencia del servicio
    const freq = dia.frecuenciaDominanteMin > 0 ? dia.frecuenciaDominanteMin : 10;
    // Cálculo honesto de OTP sin snap-to-shape.
    // pctCompletado = transcurrido/duracion → tiempoEsperado = duracion*(transcurrido/duracion) = transcurrido
    // → desviacionMin = 0 SIEMPRE: tautología matemática, no mide nada real.
    // Sin progreso geográfico real (snap-to-shape, pendiente v2 usando otpEngine),
    // solo detectamos los casos objetivamente medibles por tiempo:
    let desviacionMin = null;
    let state;
    if (pctCompletado > 1.2) {
        // Bus superó el tiempo máximo del servicio → atrasado estructural confirmado
        state = 'ATRASADO';
        desviacionMin = Math.round(nMin - haciaMin);
    }
    else if (pctCompletado < -0.1) {
        // Bus arrancó antes de lo programado
        state = 'ADELANTADO';
        desviacionMin = Math.round(desdeMin - nMin);
    }
    else if (velocidad < 2 && transcurrido > duracion * 0.7) {
        // Bus detenido habiendo consumido >70% del tiempo del servicio → probable atraso
        state = 'ATRASADO';
        desviacionMin = Math.round(transcurrido - duracion * 0.7);
    }
    else {
        // Dentro de la ventana programada: sin métrica geográfica no podemos confirmar
        // puntualidad. Reportar SIN_HORARIO es honesto vs inventar EN_TIEMPO 100%.
        // otpEngine.ts tiene el snap-to-stop real; estos datos alimentan scheduleAdherence.
        state = 'SIN_HORARIO';
        desviacionMin = null;
    }
    // Parada próxima: destino del servicio activo
    const proximaParada = mejorServicio.destino || null;
    return { state, desviacionMin, proximaParada, sentido, bearing };
}
// ── Fetch GPS ──────────────────────────────────────────────────────────────
async function fetchGPS(stmCode) {
    var _a, _b;
    const res = await axios_1.default.post(STM_URL, { empresa: stmCode }, { timeout: 15000, headers: STM_HDR });
    return (_b = (_a = res.data) === null || _a === void 0 ? void 0 : _a.features) !== null && _b !== void 0 ? _b : [];
}
// ── Snapshot completo de un operador ──────────────────────────────────────
async function snapshotAgency(stmCode) {
    var _a, _b, _c, _d, _e;
    const empresa = (_a = AGENCY_NAMES[stmCode]) !== null && _a !== void 0 ? _a : `Empresa ${stmCode}`;
    const features = await fetchGPS(stmCode);
    if (!features.length)
        return 0;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TTL_DAYS * 24 * 60 * 60 * 1000);
    const tsISO = now.toISOString();
    // 1. Recopilar IDs y líneas únicas
    const busIds = features
        .map(f => String(f.properties.codigoBus))
        .filter(Boolean);
    const lineasUnicas = [...new Set(features.map(f => f.properties.linea).filter(Boolean))];
    // 2. Batch-leer posiciones anteriores y horarios en paralelo
    const [lastPosSnap, horariosSnap] = await Promise.all([
        db.getAll(...busIds.map(id => db.collection(LAST_POS_COLL).doc(id))),
        db.getAll(...lineasUnicas.map(l => db.collection('horarios_stm').doc(l))),
    ]);
    const lastPosMap = new Map();
    for (const doc of lastPosSnap) {
        if (doc.exists)
            lastPosMap.set(doc.id, doc.data());
    }
    const horariosMap = new Map();
    for (const doc of horariosSnap) {
        if (doc.exists)
            horariosMap.set(doc.id, doc.data());
    }
    // 3. Procesar cada bus
    const events = [];
    const lastPosBatch = db.batch();
    for (const feat of features) {
        const p = feat.properties;
        if (!(p === null || p === void 0 ? void 0 : p.codigoBus) || !(p === null || p === void 0 ? void 0 : p.linea))
            continue;
        const [lon, lat] = feat.geometry.coordinates;
        // Coordenadas sentinela de STM para buses sin fix GPS (ej: -258,-258). Descartar.
        if (typeof lat !== 'number' || typeof lon !== 'number' ||
            Math.abs(lat) > 90 || Math.abs(lon) > 180 ||
            lat > -30 || lat < -36 || lon > -53 || lon < -58) {
            console.warn(`[AutoStats] GPS descartado: bus ${p.codigoBus} (${lat},${lon})`);
            continue;
        }
        const velocidad = (_b = p.velocidad) !== null && _b !== void 0 ? _b : 0;
        const idBus = String(p.codigoBus);
        // Calcular bearing desde última posición
        const prev = lastPosMap.get(idBus);
        let bearing = null;
        if (prev && (Date.now() - prev.ts) < 15 * 60 * 1000) { // solo si < 15 min
            const dist = Math.hypot(lat - prev.lat, lon - prev.lon);
            if (dist > 0.0002) { // ~20m mínimo para bearing confiable
                bearing = calcBearing(prev.lat, prev.lon, lat, lon);
            }
        }
        // Calcular cumplimiento
        const horario = (_c = horariosMap.get(p.linea)) !== null && _c !== void 0 ? _c : null;
        const result = calcularCumplimiento(velocidad, p.linea, horario, bearing, now);
        events.push({
            idBus, agencyId: stmCode, empresa, linea: p.linea,
            lat, lon, velocidad,
            estadoCumplimiento: result.state,
            desviacionMin: result.desviacionMin,
            proximaParada: result.proximaParada,
            sentido: result.sentido,
            bearing: result.bearing !== null ? Math.round(result.bearing) : null,
            timestampGPS: tsISO,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt,
        });
    }
    // 4. Guardar vehicle_events en batches de 400
    const coll = db.collection(COLLECTION);
    for (let i = 0; i < events.length; i += 400) {
        const batch = db.batch();
        for (const ev of events.slice(i, i + 400))
            batch.set(coll.doc(), ev);
        await batch.commit();
    }
    // 5. Actualizar posiciones en batches de 400 (límite Firestore)
    const lastPosEntries = Array.from(lastPosMap.entries());
    const posWrites = features.map(f => {
        const idBus = String(f.properties.codigoBus);
        const [lon, lat] = f.geometry.coordinates;
        return { idBus, lat, lon };
    });
    for (let i = 0; i < posWrites.length; i += 400) {
        const posBatch = db.batch();
        for (const { idBus, lat, lon } of posWrites.slice(i, i + 400)) {
            posBatch.set(db.collection(LAST_POS_COLL).doc(idBus), {
                lat, lon, ts: now.getTime(),
                linea: (_e = (_d = features.find(f => String(f.properties.codigoBus) === idBus)) === null || _d === void 0 ? void 0 : _d.properties.linea) !== null && _e !== void 0 ? _e : '',
                empresa,
            });
        }
        await posBatch.commit();
    }
    // Eliminar el batch anterior (ya no se usa)
    void lastPosBatch;
    return events.length;
}
// ── Función principal ──────────────────────────────────────────────────────
async function runCollection() {
    const results = {};
    for (const code of Object.keys(AGENCY_NAMES)) {
        try {
            results[AGENCY_NAMES[code]] = await snapshotAgency(code);
        }
        catch (err) {
            console.error(`[AutoStats] Error ${AGENCY_NAMES[code]}:`, err === null || err === void 0 ? void 0 : err.message);
            results[AGENCY_NAMES[code]] = -1;
        }
    }
    return results;
}
// ── Health tracking ────────────────────────────────────────────────────────
const HEALTH_DOC = () => db.collection('system_status').doc('stm_gps');
async function updateEndpointHealth(results) {
    const allFailed = Object.values(results).every(v => v === -1);
    const now = admin.firestore.Timestamp.now();
    const ref = HEALTH_DOC();
    try {
        await db.runTransaction(async (tx) => {
            var _a, _b, _c, _d, _e, _f, _g;
            const doc = await tx.get(ref);
            const prev = (_a = doc.data()) !== null && _a !== void 0 ? _a : {};
            const prevStatus = (_b = prev.status) !== null && _b !== void 0 ? _b : 'UNKNOWN';
            const prevFailures = (_c = prev.consecutiveFailures) !== null && _c !== void 0 ? _c : 0;
            if (allFailed) {
                const isFirstFailure = prevStatus !== 'DOWN';
                if (isFirstFailure) {
                    console.warn('[AutoStats] STM endpoint WENT DOWN');
                }
                tx.set(ref, {
                    status: 'DOWN',
                    lastCheck: now,
                    consecutiveFailures: prevFailures + 1,
                    downSince: isFirstFailure ? now : ((_d = prev.downSince) !== null && _d !== void 0 ? _d : now),
                    upSince: (_e = prev.upSince) !== null && _e !== void 0 ? _e : null,
                    lastSuccessfulCollection: (_f = prev.lastSuccessfulCollection) !== null && _f !== void 0 ? _f : null,
                });
            }
            else {
                const wasDown = prevStatus === 'DOWN';
                if (wasDown) {
                    console.log('[AutoStats] STM endpoint RESTORED after', prevFailures, 'consecutive failures');
                }
                tx.set(ref, {
                    status: 'UP',
                    lastCheck: now,
                    consecutiveFailures: 0,
                    downSince: null,
                    upSince: wasDown ? now : ((_g = prev.upSince) !== null && _g !== void 0 ? _g : now),
                    lastSuccessfulCollection: now,
                });
            }
        });
    }
    catch (err) {
        console.error('[AutoStats] Error escribiendo health:', err === null || err === void 0 ? void 0 : err.message);
    }
}
// ── Exports ────────────────────────────────────────────────────────────────
exports.autoStatsCollectorTick = functions.pubsub
    .schedule('every 15 minutes')
    .timeZone('America/Montevideo')
    .onRun(async () => {
    try {
        const r = await runCollection();
        console.log('[AutoStats]', JSON.stringify(r));
        await updateEndpointHealth(r);
    }
    catch (err) {
        console.error('[AutoStats] Error:', err === null || err === void 0 ? void 0 : err.message);
    }
    return null;
});
exports.autoStatsCollectorNow = functions
    .runWith({ timeoutSeconds: 120, memory: '512MB' })
    .https.onRequest(async (_req, res) => {
    try {
        const started = Date.now();
        const results = await runCollection();
        await updateEndpointHealth(results);
        res.json({ ok: true, durationMs: Date.now() - started, results });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err === null || err === void 0 ? void 0 : err.message });
    }
});
