"use strict";
/**
 * ingestaIMM.ts — Motor de Ingesta Directa de la API Pública STM/IMM
 * ====================================================================
 * Consulta el feed público de la IMM (stm-online) cada 60 segundos.
 * ELIMINA la dependencia de "cartones de servicio" para el análisis competitivo.
 *
 * Fuente: POST http://www.montevideo.gub.uy/buses/rest/stm-online
 * Respuesta: GeoJSON FeatureCollection con posiciones de TODOS los buses.
 *
 * ESTRATEGIA DE AUTOSUFICIENCIA:
 * ─────────────────────────────
 * 1. Consultar API pública IMM → Obtener posiciones GPS de ~1500 buses
 * 2. Separar UCOT (empresa=70) de rivales (50=CUTCSA, 20=COME, 10=COETC)
 * 3. Para rivales: escribir directamente en competencia_monitoreo/{lineaId}/pings
 * 4. Para UCOT: actualizar viajes_activos/{cocheId} con la posición real
 * 5. El shadowDispatcherTick ahora SIEMPRE tiene datos frescos,
 *    con o sin cartones cargados.
 *
 * Restricciones:
 *  - PROHIBIDO mezclar datos de empresas en la misma subcolección
 *  - PROHIBIDO confiar en posiciones con más de 90s de antigüedad
 *  - La API de la IMM usa HTTP (no HTTPS) — el POST debe usar http://
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
exports.testIngestaIMM = exports.ingestaIMMTick = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const db = admin.firestore();
// ─── Constantes ───────────────────────────────────────────────────────────────
/** API pública de la IMM — endpoint STM-Online (HTTPS obligatorio + headers de browser) */
const STM_ONLINE_URL = 'https://www.montevideo.gub.uy/buses/rest/stm-online';
const STM_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Referer': 'https://www.montevideo.gub.uy/buses/',
    'Origin': 'https://www.montevideo.gub.uy',
};
/** Mapeo de códigos de empresa de la IMM */
const EMPRESA_MAP = {
    10: 'COETC',
    20: 'COME',
    50: 'CUTCSA',
    70: 'UCOT',
};
/** Líneas que opera UCOT — para filtrar rival analysis */
const LINEAS_UCOT = ['300', '306', '316', '317', '328', '329', '330', '370', 'CE1'];
/**
 * Corredores compartidos: mapea cada línea UCOT a las líneas rivales
 * que comparten el mismo corredor/recorrido. Esto permite detectar
 * qué buses rivales son relevantes para cada línea propia.
 */
const CORREDORES_UCOT = {
    // Líneas UCOT → líneas rivales que comparten corredor
    '300': ['117', '176', '370', '158'], // Corredor Maroñas-Centro
    '306': ['104', '121', '116', '405'], // Corredor La Unión-Pocitos
    '316': ['144', '195', 'D5', '582'], // Corredor Piedras Blancas-Centro
    '317': ['144', '195', 'D5'], // Similar a 316
    '328': ['181', '180', 'D10', '174'], // Corredor Manga-Tres Cruces
    '329': ['186', '130', '370', '371'], // Corredor Melilla-Centro
    '330': ['156', '145', '149', '370'], // Corredor Peñarol-Centro
    '370': ['300', '329', '330', '149'], // Corredor compartido con propias
    'CE1': ['CA1', 'D1', 'D2'], // Diferencial Ciudad Vieja
};
// ─── Fórmula de Haversine (metros) ───────────────────────────────────────────
function haversineMetros(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
// ─── Validación de coordenadas ────────────────────────────────────────────────
function esCoordenadaValida(lat, lng) {
    // Bounding box de Montevideo y área metropolitana
    return (lat >= -35.2 && lat <= -34.5 &&
        lng >= -56.5 && lng <= -55.8 &&
        lat !== 0 && lng !== 0);
}
// ─── CRON: Ingesta Masiva de Posiciones desde la IMM ──────────────────────────
// Ejecuta cada 60 segundos. Consulta la API pública, clasifica buses,
// alimenta competencia_monitoreo y viajes_activos.
exports.ingestaIMMTick = functions
    .runWith({ timeoutSeconds: 120, memory: '512MB' })
    .pubsub.schedule('every 1 minutes')
    .onRun(async () => {
    var _a, _b, _c, _d;
    const startMs = Date.now();
    const ahora = admin.firestore.FieldValue.serverTimestamp();
    // ─────────────────────────────────────────────────────────────────────────
    // 1. CONSULTAR API STM-ONLINE (todas las empresas, todas las líneas)
    // ─────────────────────────────────────────────────────────────────────────
    let stmData;
    try {
        const response = await axios_1.default.post(STM_ONLINE_URL, { empresa: '-1' }, {
            headers: STM_HEADERS,
            timeout: 15000,
        });
        stmData = response.data;
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown';
        console.error(`[ingestaIMM] Error al consultar API IMM: ${msg}`);
        // Registrar fallo para Circuit Breaker
        await db.collection('ingesta_health').doc('imm_status').set({
            status: 'ERROR',
            error: msg,
            timestamp: ahora,
            fallback: 'MODO_HISTORICO_PREDICTIVO',
        }, { merge: true });
        return;
    }
    if (!(stmData === null || stmData === void 0 ? void 0 : stmData.features) || !Array.isArray(stmData.features)) {
        console.warn('[ingestaIMM] Respuesta IMM sin features válidas');
        return;
    }
    // ─────────────────────────────────────────────────────────────────────────
    // 2. CLASIFICAR Y VALIDAR BUSES
    // ─────────────────────────────────────────────────────────────────────────
    const busesValidos = [];
    let descartados = 0;
    for (const feature of stmData.features) {
        const { properties, geometry } = feature;
        if (!properties || !geometry || geometry.type !== 'Point') {
            descartados++;
            continue;
        }
        const [lng, lat] = geometry.coordinates; // GeoJSON: [lng, lat]
        // Validar coordenadas dentro de Montevideo
        if (!esCoordenadaValida(lat, lng)) {
            descartados++;
            continue;
        }
        const empresaNombre = EMPRESA_MAP[properties.codigoEmpresa] || `E${properties.codigoEmpresa}`;
        busesValidos.push({
            empresa: empresaNombre,
            empresaCodigo: properties.codigoEmpresa,
            linea: properties.linea,
            interno: properties.codigoBus,
            variante: properties.variante,
            lat,
            lng,
            timestamp: ahora,
        });
    }
    console.log(`[ingestaIMM] ${busesValidos.length} buses válidos / ${descartados} descartados de ${stmData.features.length} totales`);
    // ─────────────────────────────────────────────────────────────────────────
    // 3. SEPARAR UCOT vs RIVALES
    // ─────────────────────────────────────────────────────────────────────────
    const busesUCOT = busesValidos.filter(b => b.empresaCodigo === 70);
    const busesRivales = busesValidos.filter(b => b.empresaCodigo !== 70);
    // ─────────────────────────────────────────────────────────────────────────
    // 4. ACTUALIZAR POSICIONES UCOT EN viajes_activos (sin depender de cartón)
    // ─────────────────────────────────────────────────────────────────────────
    const batchUcot = db.batch();
    let ucotActualizados = 0;
    for (const bus of busesUCOT) {
        const cocheId = String(bus.interno);
        const ref = db.collection('viajes_activos').doc(cocheId);
        // Leer posición anterior para calcular bearing
        let lat_prev = null;
        let lng_prev = null;
        try {
            const prevDoc = await ref.get();
            if (prevDoc.exists) {
                const prevData = prevDoc.data();
                if (prevData === null || prevData === void 0 ? void 0 : prevData.posicion) {
                    lat_prev = (_b = (_a = prevData.posicion.latitude) !== null && _a !== void 0 ? _a : prevData.posicion._latitude) !== null && _b !== void 0 ? _b : null;
                    lng_prev = (_d = (_c = prevData.posicion.longitude) !== null && _c !== void 0 ? _c : prevData.posicion._longitude) !== null && _d !== void 0 ? _d : null;
                }
            }
        }
        catch (_e) {
            // No pasa nada, es la primera posición
        }
        batchUcot.set(ref, {
            posicion: new admin.firestore.GeoPoint(bus.lat, bus.lng),
            posicion_anterior: lat_prev !== null && lng_prev !== null
                ? new admin.firestore.GeoPoint(lat_prev, lng_prev)
                : null,
            linea: bus.linea,
            interno: bus.interno,
            variante: bus.variante,
            empresa: 'UCOT',
            fuente: 'imm_stm_online',
            updatedAt: ahora,
        }, { merge: true });
        ucotActualizados++;
    }
    if (ucotActualizados > 0) {
        await batchUcot.commit();
    }
    // ─────────────────────────────────────────────────────────────────────────
    // 5. ALIMENTAR competencia_monitoreo CON PINGS DE RIVALES
    //    Solo guardar rivales que circulan por corredores donde opera UCOT
    // ─────────────────────────────────────────────────────────────────────────
    let rivalesRegistrados = 0;
    const batches = [db.batch()];
    let currentBatchOps = 0;
    for (const rival of busesRivales) {
        // Determinar a qué líneas UCOT afecta este rival
        const lineasAfectadas = [];
        for (const [lineaUcot, lineasRival] of Object.entries(CORREDORES_UCOT)) {
            if (lineasRival.includes(rival.linea)) {
                lineasAfectadas.push(lineaUcot);
            }
        }
        // Si no afecta ninguna línea UCOT, también hacer un check por proximidad geográfica
        // Verificar si el rival está cerca de algún recorrido UCOT (fallback)
        if (lineasAfectadas.length === 0) {
            // Verificar proximidad a buses UCOT activos de cualquier línea
            for (const ucot of busesUCOT) {
                const dist = haversineMetros(ucot.lat, ucot.lng, rival.lat, rival.lng);
                if (dist < 800) { // 800m de proximidad
                    const lineaUcotId = LINEAS_UCOT.find(l => ucot.linea.startsWith(l));
                    if (lineaUcotId && !lineasAfectadas.includes(lineaUcotId)) {
                        lineasAfectadas.push(lineaUcotId);
                    }
                }
            }
        }
        // Registrar el ping rival en cada línea UCOT que afecta
        for (const lineaUcotId of lineasAfectadas) {
            if (currentBatchOps >= 490) { // Firestore batch limit = 500
                batches.push(db.batch());
                currentBatchOps = 0;
            }
            const pingRef = db
                .collection('competencia_monitoreo')
                .doc(lineaUcotId)
                .collection('pings')
                .doc(); // auto-id
            batches[batches.length - 1].set(pingRef, {
                empresa: rival.empresa,
                empresaCodigo: rival.empresaCodigo,
                interno: String(rival.interno),
                linea_rival: rival.linea,
                variante: rival.variante,
                lat: rival.lat,
                lng: rival.lng,
                sentido: 'AUTO_IMM',
                timestamp: ahora,
                ttl: 90,
                fuente: 'imm_stm_online',
            });
            currentBatchOps++;
            rivalesRegistrados++;
        }
    }
    // Commit all batches
    for (const batch of batches) {
        try {
            await batch.commit();
        }
        catch (batchErr) {
            console.error('[ingestaIMM] Error en batch commit:', batchErr instanceof Error ? batchErr.message : batchErr);
        }
    }
    // ─────────────────────────────────────────────────────────────────────────
    // 6. ACTUALIZAR SNAPSHOT GLOBAL (para dashboard y métricas)
    // ─────────────────────────────────────────────────────────────────────────
    const elapsed = Date.now() - startMs;
    // Conteo por empresa
    const porEmpresa = {};
    for (const bus of busesValidos) {
        porEmpresa[bus.empresa] = (porEmpresa[bus.empresa] || 0) + 1;
    }
    await db.collection('ingesta_health').doc('imm_status').set({
        status: busesValidos.length > 0 ? 'OK' : 'EMPTY',
        timestamp: ahora,
        buses_totales: busesValidos.length,
        ucot_activos: busesUCOT.length,
        rivales_totales: busesRivales.length,
        rivales_registrados: rivalesRegistrados,
        por_empresa: porEmpresa,
        latencia_ms: elapsed,
        descartados,
        fuente: 'stm-online',
        fallback: null,
        error: admin.firestore.FieldValue.delete(),
    }, { merge: true });
    // Snapshot para el CEO Dashboard
    await db.collection('kpi_snapshots').doc('ingesta_imm').set({
        buses_rastreados: busesValidos.length,
        ucot_en_calle: busesUCOT.length,
        rivales_monitoreados: rivalesRegistrados,
        latencia_ingesta_ms: elapsed,
        ultima_actualizacion: ahora,
        empresas: porEmpresa,
    }, { merge: true });
    console.log(`[ingestaIMM] ✅ Ciclo completo en ${elapsed}ms | ` +
        `UCOT: ${busesUCOT.length} | Rivales: ${rivalesRegistrados} pings | ` +
        `Total: ${busesValidos.length} buses | ` +
        `Empresas: ${JSON.stringify(porEmpresa)}`);
});
// ─── FUNCIÓN HTTP: Consulta ad-hoc para testing ──────────────────────────────
// Permite hacer una consulta manual a la API IMM para verificar conectividad
exports.testIngestaIMM = functions
    .runWith({ timeoutSeconds: 30 })
    .https.onRequest(async (req, res) => {
    const corsHandler = (await Promise.resolve().then(() => __importStar(require('cors')))).default({ origin: true });
    corsHandler(req, res, async () => {
        var _a;
        try {
            const empresaFilter = req.query.empresa ? Number(req.query.empresa) : 0;
            const lineaFilter = req.query.linea ? [String(req.query.linea)] : [];
            const response = await axios_1.default.post(STM_ONLINE_URL, {
                empresa: empresaFilter ? String(empresaFilter) : '-1',
                lineas: lineaFilter,
            }, {
                headers: STM_HEADERS,
                timeout: 15000,
            });
            const features = ((_a = response.data) === null || _a === void 0 ? void 0 : _a.features) || [];
            const buses = features
                .filter(f => { var _a; return ((_a = f.geometry) === null || _a === void 0 ? void 0 : _a.type) === 'Point'; })
                .map(f => ({
                empresa: EMPRESA_MAP[f.properties.codigoEmpresa] || `E${f.properties.codigoEmpresa}`,
                linea: f.properties.linea,
                interno: f.properties.codigoBus,
                lat: f.geometry.coordinates[1],
                lng: f.geometry.coordinates[0],
                variante: f.properties.variante,
            }));
            // Conteo por empresa
            const porEmpresa = {};
            for (const b of buses) {
                porEmpresa[b.empresa] = (porEmpresa[b.empresa] || 0) + 1;
            }
            res.json({
                ok: true,
                total: buses.length,
                por_empresa: porEmpresa,
                filtros: { empresa: empresaFilter, linea: lineaFilter },
                buses: buses.slice(0, 50), // Primeros 50 para preview
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : 'Error';
            res.status(500).json({ ok: false, error: msg });
        }
    });
});
