"use strict";
/**
 * shadowDispatcher.ts — Orquestador de Agentes Autónomos de Línea
 * ================================================================
 * Despliega un agente independiente por línea UCOT que:
 *  1. Vincula el coche al Cartón de Servicio asignado
 *  2. Calcula el Gap de Puntualidad (Haversine vs. horario teórico)
 *  3. Rastrea pings de rivales en el mismo corredor
 *  4. Emite "REGULACION_MARCHA" al Navegador del chofer vía FCM
 *
 * Restricción: PROHIBIDO mezclar datos propios con datos de competencia.
 * PROHIBIDO generar alertas sin posición GPS real.
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
exports.onAlertaRegulacion = exports.limpiarPingsRivales = exports.rivalPingIngestion = exports.shadowDispatcherTick = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require('axios');
const db = admin.firestore();
const messaging = admin.messaging();
// ─── STM GPS directo ──────────────────────────────────────────────────────────
const STM_URL = 'https://www.montevideo.gub.uy/buses/rest/stm-online';
const STM_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Referer': 'https://www.montevideo.gub.uy/buses/',
    'Origin': 'https://www.montevideo.gub.uy',
};
const EMPRESA_UCOT_ID = 70;
async function fetchBusesSTM() {
    var _a;
    const res = await axios.post(STM_URL, { empresa: '-1' }, { headers: STM_HEADERS, timeout: 20000 });
    const features = ((_a = res.data) === null || _a === void 0 ? void 0 : _a.features) || [];
    return features
        .map((f) => {
        var _a;
        const p = f.properties || {};
        const coords = ((_a = f.geometry) === null || _a === void 0 ? void 0 : _a.coordinates) || [];
        const lat = coords[1];
        const lng = coords[0];
        if (!lat || !lng || lat >= 0 || lng >= 0)
            return null;
        const sublinea = String(p.sublinea || '');
        const destino = String(p.destinoDesc || '');
        return {
            cocheId: String(p.codigoBus || ''),
            lineaId: p.linea ? String(p.linea) : '',
            sublinea,
            sentido: 'DESCONOCIDO',
            destino,
            empresa: { 10: 'COETC', 20: 'COME', 50: 'CUTCSA', 70: 'UCOT' }[p.codigoEmpresa] || `EMP_${p.codigoEmpresa}`,
            empresaId: Number(p.codigoEmpresa || 0),
            lat,
            lng,
        };
    })
        .filter((b) => b !== null && b.cocheId !== '');
}
// ─── Parámetros del Sistema (defaults — se sobreescriben desde Firestore) ─────
const DEFAULTS = {
    UMBRAL_RETRASO_MIN: 5, // minutos antes de alertar por retraso
    UMBRAL_CRITICO_MIN: 10, // minutos → alerta CRITICO
    UMBRAL_ADELANTO_MIN: 3, // minutos antes de alertar por adelanto
    PROXIMIDAD_RIVAL_M: 500, // metros — radio de detección de rival
    HUECO_FACTOR: 1.5, // multiplicador sobre headway esperado
    TICK_SEGUNDOS: 60, // frecuencia del CRON
    RIVAL_PING_TTL_S: 90, // segundos máximos que un ping de rival es válido
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
/** Retorna el bearing (ángulo en grados) entre dos puntos */
function bearing(lat1, lng1, lat2, lng2) {
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const y = Math.sin(dLng) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLng);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
/** ¿El rival está moviéndose en dirección similar (< 45°) a nosotros? */
function esDireccionParalela(bearingPropio, bearingRival) {
    const diff = Math.abs(bearingPropio - bearingRival);
    return diff < 45 || diff > 315;
}
/** ¿El rival está por delante de nosotros en la dirección del viaje? */
function estaDelante(latPropio, lngPropio, latRival, lngRival, bearingPropio) {
    const bearingHaciaRival = bearing(latPropio, lngPropio, latRival, lngRival);
    const diff = Math.abs(bearingPropio - bearingHaciaRival);
    return diff < 90 || diff > 270;
}
// ─── Motor de Gap de Puntualidad ──────────────────────────────────────────────
function calcularGapPuntualidad(posGPS, paradas, horaActual, params) {
    if (!paradas || paradas.length === 0)
        return null;
    let paradaMasCercana = null;
    let distMin = Infinity;
    for (const parada of paradas) {
        const dist = haversineMetros(posGPS.lat, posGPS.lng, parada.lat, parada.lng);
        if (dist < distMin) {
            distMin = dist;
            paradaMasCercana = parada;
        }
    }
    if (!paradaMasCercana)
        return null;
    // Parsear hora teórica
    const partes = paradaMasCercana.hora_teorica.split(':');
    const horaTeoricaMins = parseInt(partes[0]) * 60 + parseInt(partes[1]);
    const horaRealMins = horaActual.getHours() * 60 + horaActual.getMinutes();
    const gapMinutos = horaRealMins - horaTeoricaMins;
    let estado = 'EN_HORARIO';
    if (gapMinutos > params.UMBRAL_RETRASO_MIN)
        estado = 'RETRASADO';
    else if (gapMinutos < -params.UMBRAL_ADELANTO_MIN)
        estado = 'ADELANTADO';
    return {
        paradaRef: paradaMasCercana.nombre,
        distanciaMetros: distMin,
        gapMinutos,
        estado,
    };
}
// ─── CRON: Motor Principal del Shadow Dispatcher ──────────────────────────────
// Ejecuta cada 60 segundos. Un proceso unificado lee TODOS los cartones activos
// y procesa cada coche de forma aislada. Un error en un coche no para el ciclo.
exports.shadowDispatcherTick = functions
    .runWith({ timeoutSeconds: 300, memory: '512MB' })
    .pubsub.schedule('every 2 minutes')
    .onRun(async () => {
    const ahora = new Date();
    const ahoraTs = admin.firestore.Timestamp.now();
    // 1. Cargar parámetros del sistema desde Firestore (fallback a DEFAULTS)
    let params = Object.assign({}, DEFAULTS);
    let empresaPropiaId = EMPRESA_UCOT_ID;
    try {
        const paramDoc = await db.collection('parametros_sistema').doc('default').get();
        if (paramDoc.exists) {
            const data = paramDoc.data();
            params = Object.assign(Object.assign({}, DEFAULTS), data);
            if (data.empresaPropiaId)
                empresaPropiaId = Number(data.empresaPropiaId);
        }
    }
    catch (_a) {
        // Usar defaults
    }
    // 2. Obtener TODOS los buses del STM en tiempo real (GPS live)
    let todosLosBuses = [];
    try {
        todosLosBuses = await fetchBusesSTM();
    }
    catch (err) {
        console.error('[shadowDispatcher] Error llamando STM GPS:', err);
        return;
    }
    if (todosLosBuses.length === 0) {
        console.log('[shadowDispatcher] STM no devolvió buses en este ciclo.');
        return;
    }
    // 3. Detectar rivalidad cross-operador — los 4 operadores del sistema STM
    //    Genera alertas en vivo (alertas_regulacion) + log append-only (alertas_log)
    const TODOS_OPERADORES = [70, 50, 20, 10];
    const alertasEscritas = [];
    const logEscritos = [];
    const UMBRAL_M = params.PROXIMIDAD_RIVAL_M;
    const ahora_str = ahora.toISOString();
    // TTL: docs de alertas_log expiran en 30 dias (habilitar en Firestore TTL policy)
    const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 24 * 3600 * 1000);
    let totalDetecciones = 0;
    for (const opId of TODOS_OPERADORES) {
        const busesPropia = todosLosBuses.filter((b) => b.empresaId === opId);
        const busesRivales = todosLosBuses.filter((b) => b.empresaId !== opId);
        if (busesPropia.length === 0)
            continue;
        for (const busProp of busesPropia) {
            const rivalesCercanos = busesRivales.filter((r) => haversineMetros(busProp.lat, busProp.lng, r.lat, r.lng) <= UMBRAL_M);
            if (rivalesCercanos.length === 0)
                continue;
            const rival = rivalesCercanos[0];
            const dist = Math.round(haversineMetros(busProp.lat, busProp.lng, rival.lat, rival.lng));
            const sentidoLabel = busProp.sentido !== 'DESCONOCIDO' ? ` [${busProp.sentido}]` : '';
            const mensaje = `🚨 ATENCION COCHE ${busProp.cocheId}${sentidoLabel}: Rival ${rival.empresa} #${rival.cocheId} a ${dist}m. Mantenga la marcha. Regule ${Math.round(dist / 50)} minutos.`;
            // Alerta en vivo — clave incluye opId para evitar colisiones entre operadores
            const alertaRef = db.collection('alertas_regulacion').doc(`${opId}_${busProp.cocheId}_${rival.cocheId}`);
            alertasEscritas.push(alertaRef.set({
                tipo: 'RIVAL_PISANDO_TURNO',
                rival_empresa: rival.empresa,
                rival_interno: rival.cocheId,
                rival_linea: rival.lineaId,
                distancia_metros: dist,
                instruccion: 'REGULAR_MARCHA',
                mensaje_chofer: mensaje,
                linea_id: busProp.lineaId,
                coche_id: busProp.cocheId,
                empresa_id: opId,
                sentido: busProp.sentido,
                destino_propio: busProp.destino,
                destino_rival: rival.destino,
                lat_propio: busProp.lat,
                lng_propio: busProp.lng,
                lat_rival: rival.lat,
                lng_rival: rival.lng,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                leido: false,
                generado_en: ahora_str,
            }, { merge: true }));
            // Log append-only para analytics historico — add() crea un doc nuevo por ciclo
            logEscritos.push(db.collection('alertas_log').add({
                tipo: 'RIVAL_PISANDO_TURNO',
                empresa_id: opId,
                linea_id: busProp.lineaId,
                coche_id: busProp.cocheId,
                rival_empresa: rival.empresa,
                rival_linea: rival.lineaId,
                rival_interno: rival.cocheId,
                distancia_metros: dist,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                generado_en: ahora_str,
                expiresAt,
            }));
            totalDetecciones += 1;
        }
    }
    if (alertasEscritas.length === 0) {
        console.log('[shadowDispatcher] Sin rivalidades detectadas en este ciclo.');
        return;
    }
    await Promise.allSettled([...alertasEscritas, ...logEscritos]);
    console.log(`[shadowDispatcher] Ciclo completo. ${totalDetecciones} detecciones, ${logEscritos.length} logs escritos.`);
});
// ─── Agente Aislado: Lógica por Coche ────────────────────────────────────────
async function procesarAgente(carton, ahora, params) {
    var _a, _b, _c, _d;
    const { cocheId, lineaId, servicioId, paradas_embed, chofer_snapshot } = carton;
    const logBase = `[agente-${lineaId}-${cocheId}]`;
    // 1. Leer posición GPS real del coche y determinar estado
    const viajeDoc = await db.collection('viajes_activos').doc(cocheId).get();
    if (!viajeDoc.exists) {
        // ==========================================
        // ESTADO: PRE-SALIDA (Inteligencia de Terminal)
        // El coche tiene cartón asignado pero aún no inició viaje.
        // ==========================================
        if (paradas_embed.length > 0) {
            const paradaOrigen = paradas_embed[0];
            const partes = paradaOrigen.hora_teorica.split(':');
            const horaTeoricaMins = parseInt(partes[0]) * 60 + parseInt(partes[1]);
            const horaRealMins = ahora.getHours() * 60 + ahora.getMinutes();
            const diffMins = horaTeoricaMins - horaRealMins;
            // Si falta menos de 15 minutos para salir...
            if (diffMins > 0 && diffMins <= 15) {
                // Mirar si hay pings de rivales cerca del ORIGEN en los últimos 5mins
                const TTL_TS = admin.firestore.Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
                const pingsOrigenSnap = await db
                    .collection('competencia_monitoreo')
                    .doc(lineaId)
                    .collection('pings')
                    .where('timestamp', '>', TTL_TS)
                    .where('empresa', '!=', 'UCOT')
                    .get();
                const rivalesEnTerminal = [];
                pingsOrigenSnap.forEach(doc => {
                    const p = doc.data();
                    const dist = haversineMetros(paradaOrigen.lat, paradaOrigen.lng, p.lat, p.lng);
                    if (dist < 800)
                        rivalesEnTerminal.push(Object.assign(Object.assign({}, p), { dist })); // a menos de 800m
                });
                if (rivalesEnTerminal.length > 0) {
                    // Hay un rival por salir o saliendo en nuestra cara. ¡Sugerir ganarle la salida!
                    const rival = rivalesEnTerminal[0];
                    const mensajeChofer = `🏁 ESTRATEGIA: Rival ${rival.empresa} #${rival.interno} en cabecera. Sugerimos ADELANTAR SALIDA 3 min para captación.`;
                    await db.collection('alertas_regulacion').doc(cocheId).set({
                        tipo: 'GANAR_SALIDA',
                        rival_empresa: rival.empresa,
                        rival_interno: rival.interno,
                        distancia_metros: Math.round(rival.dist),
                        instruccion: 'ADELANTAR_SALIDA',
                        mensaje_chofer: mensajeChofer,
                        linea_id: lineaId,
                        coche_id: cocheId,
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                        leido: false,
                    }, { merge: true });
                    console.log(`${logBase} GANAR_SALIDA emitido. Rival ${rival.empresa} detectado en cabecera.`);
                    // Enviar push
                    const fcmToken = chofer_snapshot === null || chofer_snapshot === void 0 ? void 0 : chofer_snapshot.fcm_token;
                    if (fcmToken) {
                        try {
                            await messaging.send({
                                token: fcmToken,
                                notification: { title: '💡 Inteligencia de Despacho', body: mensajeChofer },
                                data: { tipo: 'GANAR_SALIDA' },
                                android: { priority: 'high' }
                            });
                        }
                        catch (err) { }
                    }
                }
            }
        }
        // Guardar estado visual en Radar como PRE-SALIDA
        await db.collection('shadow_tracker').doc(cocheId).set({
            coche_id: cocheId,
            linea_id: lineaId,
            estado_radar: 'PRE_SALIDA',
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        await registrarLog(lineaId, cocheId, { fuente_gps: 'sin_datos', ciclo_omitido: true, estado: 'PRE_SALIDA' });
        return;
    }
    const viajeData = viajeDoc.data();
    const geoPoint = viajeData.posicion;
    const posGPS = { lat: geoPoint.latitude, lng: geoPoint.longitude };
    // Validar antigüedad de la posición (máximo RIVAL_PING_TTL_S segundos)
    const updatedAt = viajeData.updatedAt;
    if (updatedAt) {
        const segundosAntiguo = (Date.now() / 1000) - updatedAt.seconds;
        if (segundosAntiguo > params.RIVAL_PING_TTL_S) {
            await registrarLog(lineaId, cocheId, {
                fuente_gps: 'sin_datos', motivo: 'GPS_STALE', segundos_stale: segundosAntiguo
            });
            console.warn(`${logBase} GPS obsoleto (${Math.round(segundosAntiguo)}s). No genera alertas.`);
            return;
        }
    }
    // 2. Calcular Gap de Puntualidad
    const gap = calcularGapPuntualidad(posGPS, paradas_embed, ahora, params);
    const alertasEmitidas = [];
    let bearingPropio = 0;
    // Estimar bearing propio usando la dirección del viaje (hacia la parada más cercana)
    if (gap && paradas_embed.length > 1) {
        const idxParadaRef = paradas_embed.findIndex((p) => p.nombre === gap.paradaRef);
        if (idxParadaRef >= 0 && idxParadaRef < paradas_embed.length - 1) {
            const siguiente = paradas_embed[idxParadaRef + 1];
            bearingPropio = bearing(posGPS.lat, posGPS.lng, siguiente.lat, siguiente.lng);
        }
    }
    // Emitir alerta de puntualidad si corresponde
    if (gap && gap.estado !== 'EN_HORARIO' && Math.abs(gap.gapMinutos) >= params.UMBRAL_RETRASO_MIN) {
        const nivelAlerta = Math.abs(gap.gapMinutos) >= params.UMBRAL_CRITICO_MIN ? 'CRITICO' : 'ADVERTENCIA';
        const alertaRef = await db.collection('alertas_de_via').add({
            tipo: gap.estado === 'RETRASADO' ? 'RETRASO_SERVICIO' : 'ADELANTO_SERVICIO',
            nivel: nivelAlerta,
            coche_id: cocheId,
            linea_id: lineaId,
            servicio_id: servicioId,
            parada_ref: gap.paradaRef,
            gap_minutos: gap.gapMinutos,
            distancia_parada_m: Math.round(gap.distanciaMetros),
            mensaje: gap.estado === 'RETRASADO'
                ? `Coche ${cocheId} con ${gap.gapMinutos} min de retraso cerca de "${gap.paradaRef}"`
                : `Coche ${cocheId} adelantado ${Math.abs(gap.gapMinutos)} min cerca de "${gap.paradaRef}"`,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            resuelto: false,
        });
        alertasEmitidas.push(alertaRef.id);
        console.log(`${logBase} Alerta puntualidad ${nivelAlerta}: gap=${gap.gapMinutos}min`);
    }
    // 3. Leer posiciones de otros vehículos (Rivales + Propios para Bunching)
    const TTL_TS = admin.firestore.Timestamp.fromMillis(Date.now() - params.RIVAL_PING_TTL_S * 1000);
    // Pings de Rivales
    const pingsSnap = await db
        .collection('competencia_monitoreo')
        .doc(lineaId)
        .collection('pings')
        .where('timestamp', '>', TTL_TS)
        .where('empresa', '!=', 'UCOT')
        .get();
    const pingsValidos = [];
    // Pings de la misma empresa (UCOT) en la misma línea (Viajes Activos) para Bunching
    const propiosSnap = await db
        .collection('viajes_activos')
        .where('estado', '==', 'en_servicio')
        .get();
    const propiosValidos = [];
    pingsSnap.forEach((doc) => {
        const ping = doc.data();
        const dist = haversineMetros(posGPS.lat, posGPS.lng, ping.lat, ping.lng);
        // Verificar dirección paralela si hay posición previa
        if (ping.lat_prev !== undefined && ping.lng_prev !== undefined) {
            const bearingRival = bearing(ping.lat_prev, ping.lng_prev, ping.lat, ping.lng);
            if (!esDireccionParalela(bearingPropio, bearingRival))
                return;
        }
        pingsValidos.push(Object.assign(Object.assign({}, ping), { distanciaM: dist }));
    });
    // Procesar posiciones propias de UCOT para detectar Bunching
    propiosSnap.forEach((doc) => {
        if (doc.id === cocheId)
            return; // omitirnos a nosotros mismos
        const v = doc.data();
        // Validar por cartón activo que sea de la misma línea (opcional) pero
        // por simplicidad comparamos cercanía y rumbo. Si tenemos la línea, mejor.
        const geo = v.posicion;
        const dist = haversineMetros(posGPS.lat, posGPS.lng, geo.latitude, geo.longitude);
        // Si tiene rumbo, verificar paralelismo para filtrar buses en sentido opuesto
        if (v.rumbo !== undefined && v.rumbo !== null) {
            if (!esDireccionParalela(bearingPropio, Number(v.rumbo)))
                return;
        }
        propiosValidos.push({
            empresa: 'UCOT',
            interno: v.cocheId || doc.id,
            lat: geo.latitude,
            lng: geo.longitude,
            sentido: 'DESCONOCIDO',
            timestamp: v.updatedAt,
            distanciaM: dist
        });
    });
    // Ordenar por cercanía
    pingsValidos.sort((a, b) => a.distanciaM - b.distanciaM);
    propiosValidos.sort((a, b) => a.distanciaM - b.distanciaM);
    // 4. Detectar Bunching (Coches Propios muy juntos) y Rival adelantado
    const UMBRAL_BUNCHING_M = params.PROXIMIDAD_RIVAL_M; // Podemos reusar el umbral o definir uno nuevo (ej. 800m)
    const UCOTDelante = propiosValidos.filter((p) => p.distanciaM < UMBRAL_BUNCHING_M &&
        estaDelante(posGPS.lat, posGPS.lng, p.lat, p.lng, bearingPropio));
    const rivalesDelante = pingsValidos.filter((p) => p.distanciaM < params.PROXIMIDAD_RIVAL_M &&
        estaDelante(posGPS.lat, posGPS.lng, p.lat, p.lng, bearingPropio));
    if (UCOTDelante.length > 0) {
        // Alerta de Bunching interno (Nos estamos pegando al coche de adelante)
        const companeroCercano = UCOTDelante[0];
        const mensajeChofer = `🚌 Coche compañero #${companeroCercano.interno} a solo ${Math.round(companeroCercano.distanciaM)}m! Regule marcha para evitar BUNCHING.`;
        await db.collection('alertas_regulacion').doc(cocheId).set({
            tipo: 'PELIGRO_BUNCHING',
            rival_empresa: companeroCercano.empresa,
            rival_interno: companeroCercano.interno,
            distancia_metros: Math.round(companeroCercano.distanciaM),
            instruccion: 'REGULACION_MARCHA',
            mensaje_chofer: mensajeChofer,
            linea_id: lineaId,
            coche_id: cocheId,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            leido: false,
        }, { merge: true });
        alertasEmitidas.push(`BUNCHING_${cocheId}`);
        console.log(`${logBase} PELIGRO_BUNCHING: Compañero #${companeroCercano.interno} a ${Math.round(companeroCercano.distanciaM)}m.`);
        const fcmToken = chofer_snapshot === null || chofer_snapshot === void 0 ? void 0 : chofer_snapshot.fcm_token;
        if (fcmToken) {
            try {
                await messaging.send({
                    token: fcmToken,
                    notification: { title: '⚠️ Atención: Coches Pegados', body: mensajeChofer },
                    data: { tipo: 'REGULACION_MARCHA', instruccion: 'REGULACION_MARCHA' },
                    android: { priority: 'high' },
                });
            }
            catch (fcmErr) { }
        }
    }
    else if (rivalesDelante.length > 0) {
        // Alerta de Rival pisando turno (Rival adelante)
        const rivalCercano = rivalesDelante[0];
        const mensajeChofer = `🚌 Coche ${rivalCercano.empresa} #${rivalCercano.interno} a ${Math.round(rivalCercano.distanciaM)}m delante. Regule velocidad para mantener headway.`;
        await db.collection('alertas_regulacion').doc(cocheId).set({
            tipo: 'RIVAL_PISANDO_TURNO',
            rival_empresa: rivalCercano.empresa,
            rival_interno: rivalCercano.interno,
            distancia_metros: Math.round(rivalCercano.distanciaM),
            instruccion: 'REGULACION_MARCHA',
            mensaje_chofer: mensajeChofer,
            linea_id: lineaId,
            coche_id: cocheId,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            leido: false,
        }, { merge: true });
        alertasEmitidas.push(`REGULACION_${cocheId}`);
        console.log(`${logBase} RIVAL_PISANDO_TURNO: ${rivalCercano.empresa} #${rivalCercano.interno} a ${Math.round(rivalCercano.distanciaM)}m.`);
        const fcmToken = chofer_snapshot === null || chofer_snapshot === void 0 ? void 0 : chofer_snapshot.fcm_token;
        if (fcmToken) {
            try {
                await messaging.send({
                    token: fcmToken,
                    notification: { title: '⚠️ Regulación de Marcha', body: mensajeChofer },
                    data: {
                        tipo: 'REGULACION_MARCHA',
                        distancia: String(Math.round(rivalCercano.distanciaM)),
                        rival: `${rivalCercano.empresa} #${rivalCercano.interno}`,
                        linea_id: lineaId,
                    },
                    android: { priority: 'high' },
                    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
                });
            }
            catch (fcmErr) {
                console.warn(`${logBase} FCM falló:`, fcmErr instanceof Error ? fcmErr.message : fcmErr);
            }
        }
    }
    else if (rivalesDelante.length === 0 && pingsValidos.length === 0 && UCOTDelante.length === 0) {
        // Sin competencia activa ni bunching — limpiar alerta anterior si estaba activa
        const alertaActual = await db.collection('alertas_regulacion').doc(cocheId).get();
        if (alertaActual.exists && !((_a = alertaActual.data()) === null || _a === void 0 ? void 0 : _a.leido)) {
            await db.collection('alertas_regulacion').doc(cocheId).update({ leido: true });
        }
    }
    // 5. Detectar hueco de frecuencia rival (oportunidad de captación de pasajeros)
    if (pingsValidos.length >= 2) {
        // Ordenar pings por timestamp para detectar gaps temporales entre rivales
        const pingsOrdenados = [...pingsValidos]
            .filter(p => p.timestamp)
            .sort((a, b) => a.timestamp.seconds - b.timestamp.seconds);
        for (let i = 1; i < pingsOrdenados.length; i++) {
            const deltaSegundos = pingsOrdenados[i].timestamp.seconds - pingsOrdenados[i - 1].timestamp.seconds;
            const deltaMinutos = deltaSegundos / 60;
            // Si el gap temporal entre rivales consecutivos excede HUECO_FACTOR * headway esperado (TICK),
            // hay un hueco potencial de captación
            const umbralHuecoMin = params.TICK_SEGUNDOS * params.HUECO_FACTOR / 60;
            if (deltaMinutos > umbralHuecoMin) {
                const alertaCaptacion = {
                    tipo: 'CAPTACION_OPORTUNIDAD',
                    rival_empresa_anterior: pingsOrdenados[i - 1].empresa,
                    rival_empresa_siguiente: pingsOrdenados[i].empresa,
                    gap_minutos: Math.round(deltaMinutos),
                    umbral_minutos: Math.round(umbralHuecoMin),
                    instruccion: 'ACELERAR_CAPTACION',
                    mensaje_chofer: `📢 Hueco de ${Math.round(deltaMinutos)} min entre rivales. Oportunidad de captación de pasajeros.`,
                    linea_id: lineaId,
                    coche_id: cocheId,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    resuelto: false,
                };
                await db.collection('alertas_de_via').add(alertaCaptacion);
                alertasEmitidas.push(`CAPTACION_${cocheId}`);
                console.log(`${logBase} CAPTACION_OPORTUNIDAD: gap=${Math.round(deltaMinutos)}min entre ${pingsOrdenados[i - 1].empresa} y ${pingsOrdenados[i].empresa}`);
                break; // Solo una alerta de captación por ciclo
            }
        }
    }
    // 5.5 Registrar estado global del Radar para Frontend (Target Lock System)
    await db.collection('shadow_tracker').doc(cocheId).set({
        coche_id: cocheId,
        linea_id: lineaId,
        posicion_gps: new admin.firestore.GeoPoint(posGPS.lat, posGPS.lng),
        rival_interno: rivalesDelante.length > 0 ? rivalesDelante[0].interno : null,
        rival_empresa: rivalesDelante.length > 0 ? rivalesDelante[0].empresa : null,
        distancia_metros: rivalesDelante.length > 0 ? Math.round(rivalesDelante[0].distanciaM) : null,
        estado_radar: rivalesDelante.length > 0 ? 'FIJADO_AL_BLANCO' : (UCOTDelante.length > 0 ? 'PELIGRO_BUNCHING' : 'VIA_LIBRE'),
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    // 6. Registrar log inmutable de auditoría
    await registrarLog(lineaId, cocheId, {
        servicio_id: servicioId,
        posicion_real: new admin.firestore.GeoPoint(posGPS.lat, posGPS.lng),
        parada_ref: (_b = gap === null || gap === void 0 ? void 0 : gap.paradaRef) !== null && _b !== void 0 ? _b : 'N/A',
        gap_minutos: (_c = gap === null || gap === void 0 ? void 0 : gap.gapMinutos) !== null && _c !== void 0 ? _c : 0,
        estado_puntualidad: (_d = gap === null || gap === void 0 ? void 0 : gap.estado) !== null && _d !== void 0 ? _d : 'SIN_REFERENCIA',
        rivales_detectados: pingsValidos.length,
        rivales_delante: rivalesDelante.length,
        alertas_emitidas: alertasEmitidas,
        fuente_gps: 'viajes_activos',
    });
}
// ─── Helper: Registro de auditoría inmutable ──────────────────────────────────
async function registrarLog(lineaId, cocheId, datos) {
    try {
        await db
            .collection('shadow_logs')
            .doc(lineaId)
            .collection(cocheId)
            .add(Object.assign(Object.assign({}, datos), { timestamp: admin.firestore.FieldValue.serverTimestamp() }));
    }
    catch (err) {
        // El log no debe bloquear la operación principal
        console.error(`[shadow_logs] Error al registrar log ${lineaId}/${cocheId}:`, err);
    }
}
// ─── HTTP: Ingestión de Pings de Rivales (desde integración IMM o scraper) ───
// POST /rivalPingIngestion
// Body: { lineaId, empresa, interno, lat, lng, sentido, lat_prev?, lng_prev? }
exports.rivalPingIngestion = functions.https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    try {
        const { lineaId, empresa, interno, lat, lng, sentido, lat_prev, lng_prev } = req.body;
        if (!lineaId || !empresa || !interno || lat == null || lng == null) {
            res.status(400).json({ error: 'lineaId, empresa, interno, lat, lng son requeridos' });
            return;
        }
        // Guardar ÚNICAMENTE en competencia_monitoreo — NUNCA en viajes_activos
        await db
            .collection('competencia_monitoreo')
            .doc(lineaId)
            .collection('pings')
            .add({
            empresa,
            interno,
            lat: Number(lat),
            lng: Number(lng),
            sentido: sentido || 'DESCONOCIDO',
            lat_prev: lat_prev !== null && lat_prev !== void 0 ? lat_prev : null,
            lng_prev: lng_prev !== null && lng_prev !== void 0 ? lng_prev : null,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            ttl: DEFAULTS.RIVAL_PING_TTL_S,
        });
        res.json({ ok: true, lineaId, empresa, interno, ts: new Date().toISOString() });
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : 'Error';
        console.error('[rivalPingIngestion] Error:', msg);
        res.status(500).json({ error: msg });
    }
});
// ─── CRON: Limpieza de pings de rivales expirados ────────────────────────────
// Evita que la colección competencia_monitoreo crezca indefinidamente
exports.limpiarPingsRivales = functions
    .runWith({ timeoutSeconds: 120 })
    .pubsub.schedule('every 5 minutes')
    .onRun(async () => {
    const ttlMs = DEFAULTS.RIVAL_PING_TTL_S * 1000 * 10; // 10x TTL como margen de limpieza
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - ttlMs);
    // Limpiar por cada línea UCOT conocida (Hardcoded: Matriz Expandida IMM + Base)
    const lineas = [
        '300', '306', '316', '317', '328', '329', '330', '370', '396', 'CE1', '17', 'PB',
        '71', '79', 'D8', 'DM1', 'L13', 'L31', 'L32', 'L33', '221', '222', '14', '12'
    ];
    let totalEliminados = 0;
    for (const lineaId of lineas) {
        const snap = await db
            .collection('competencia_monitoreo')
            .doc(lineaId)
            .collection('pings')
            .where('timestamp', '<', cutoff)
            .limit(200)
            .get();
        if (snap.empty)
            continue;
        const batch = db.batch();
        snap.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        totalEliminados += snap.size;
    }
    console.log(`[limpiarPings] ${totalEliminados} pings de rivales eliminados.`);
});
// ─── TRIGGER: Notificar cambio en alertas_regulacion al Navegador ─────────────
// Si un agente externo (admin) marca leido=false, re-notifica al chofer
exports.onAlertaRegulacion = functions.firestore
    .document('alertas_regulacion/{cocheId}')
    .onWrite(async (change, context) => {
    var _a, _b, _c, _d, _e;
    const { cocheId } = context.params;
    const datos = change.after.data();
    // Solo actuar si la alerta es nueva (no existe before) o fue reseteada a leido=false.
    // fcmSent=true: ya se envió la notificación en este ciclo, no reenviar.
    if (!datos || datos.leido === true || datos.fcmSent === true)
        return;
    const before = change.before.data();
    if (before && before.leido === false && ((_a = before.timestamp) === null || _a === void 0 ? void 0 : _a.isEqual(datos.timestamp)))
        return;
    // datos.coche_id es el número real del coche (ej: "123").
    // context.params.cocheId es el ID del documento (ej: "70_123_456") — NO el coche.
    const cocheReal = (_c = (_b = datos.coche_id) !== null && _b !== void 0 ? _b : datos.cocheId) !== null && _c !== void 0 ? _c : cocheId;
    // Leer FCM token desde el cartón activo usando el coche real, no el ID del documento
    const cartonSnap = await db
        .collection('cartones_de_servicio')
        .where('cocheId', '==', cocheReal)
        .where('expire_at', '>', admin.firestore.Timestamp.now())
        .limit(1)
        .get();
    if (cartonSnap.empty)
        return;
    const fcmToken = (_e = (_d = cartonSnap.docs[0].data()) === null || _d === void 0 ? void 0 : _d.chofer_snapshot) === null || _e === void 0 ? void 0 : _e.fcm_token;
    if (!fcmToken)
        return;
    try {
        await messaging.send({
            token: fcmToken,
            notification: {
                title: datos.tipo === 'RIVAL_PISANDO_TURNO' ? '⚠️ Regulación de Marcha' : '📢 Alerta Operativa',
                body: datos.mensaje_chofer || 'Alerta del despacho. Revise el Navegador.',
            },
            data: {
                tipo: datos.tipo || 'ALERTA',
                alerta_id: context.params.cocheId,
                instruccion: datos.instruccion || '',
            },
            android: { priority: 'high' },
        });
        // Marcar como enviado para no reenviar si el documento se actualiza de nuevo
        await change.after.ref.update({ fcmSent: true });
    }
    catch (err) {
        console.warn(`[onAlertaRegulacion] FCM error coche ${cocheReal}:`, err);
    }
});
