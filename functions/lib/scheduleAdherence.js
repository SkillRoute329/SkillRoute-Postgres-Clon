"use strict";
/**
 * scheduleAdherence.ts — Agregador diario de OTP planificado vs real
 * ====================================================================
 * Cada `vehicle_events` ya viene con `estadoCumplimiento` (calculado por
 * el ingestor IMM contra horarios_stm). Este módulo persiste agregaciones
 * diarias en `auto_stats_diarios/{YYYY-MM-DD}_{agencyId}` para que el
 * dashboard CEO no tenga que escanear 757k docs en cada apertura.
 *
 * Estados ya calculados upstream:
 *  - EN_TIEMPO:        |desviación| <= 5 min  (UITP/TfL standard)
 *  - ADELANTADO:       desviación  < -5 min
 *  - ATRASADO:         desviación  > +5 min
 *  - SIN_HORARIO:      línea no programada para ese día/hora
 *  - FUERA_DE_SERVICIO: bus operando fuera de ventana programada
 *
 * Fórmula OTP UITP:  OTP = aTiempo / (aTiempo + adelantado + atrasado)
 *                            (excluye SIN_HORARIO y FUERA_DE_SERVICIO)
 *
 * Endpoints:
 *  - GET /computeAdherenceNow?date=YYYY-MM-DD&agencyId=70&hours=24
 *  - cron `15 * * * *` → procesa la hora previa cada hora
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
exports.computeAdherenceCron = exports.computeAdherenceNow = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length)
    admin.initializeApp();
const db = admin.firestore();
const STATS_COLLECTION = 'auto_stats_diarios';
const RT_COLLECTION = 'compliance_rt';
const EVENTS_COLLECTION = 'vehicle_events';
const AGENCY_IDS = ['10', '20', '50', '70']; // COETC, COME, CUTCSA, UCOT
function emptyAgg() {
    return {
        serviciosTotales: 0, aTiempo: 0, adelantados: 0, atrasados: 0,
        sinHorario: 0, fueraDeServicio: 0,
        desviacionAcumMin: 0, desviacionMuestras: 0,
    };
}
function dayKeyMvd(d) {
    const localMs = d.getTime() - 3 * 3600 * 1000;
    return new Date(localMs).toISOString().slice(0, 10);
}
/**
 * Lee vehicle_events del rango y agrega por agencia consolidando
 * estadoCumplimiento. Cada bus cuenta una sola vez (su evento más reciente
 * en la ventana) — proxy del "estado del bus en esta hora".
 */
async function computeAdherenceForRange(startMs, endMs, agencyFilter) {
    const ymd = dayKeyMvd(new Date(startMs));
    const startTs = admin.firestore.Timestamp.fromMillis(startMs);
    const endTs = admin.firestore.Timestamp.fromMillis(endMs);
    const agencias = agencyFilter ? [agencyFilter] : AGENCY_IDS;
    const resultsByAgency = {};
    let totalBuses = 0;
    for (const agencyId of agencias) {
        const agg = emptyAgg();
        const lineasSeen = new Set();
        const seenBuses = new Set();
        const snap = await db
            .collection(EVENTS_COLLECTION)
            .where('agencyId', '==', agencyId)
            .where('createdAt', '>=', startTs)
            .where('createdAt', '<=', endTs)
            .orderBy('createdAt', 'desc')
            .limit(20000)
            .get();
        snap.forEach((doc) => {
            var _a, _b, _c, _d, _e, _f;
            const ev = doc.data();
            const busId = String((_a = ev.idBus) !== null && _a !== void 0 ? _a : doc.id);
            if (seenBuses.has(busId))
                return;
            seenBuses.add(busId);
            totalBuses += 1;
            const linea = String((_b = ev.linea) !== null && _b !== void 0 ? _b : '').trim();
            if (linea)
                lineasSeen.add(linea);
            const estado = (_c = ev.estadoCumplimiento) !== null && _c !== void 0 ? _c : 'SIN_HORARIO';
            switch (estado) {
                case 'EN_TIEMPO':
                    agg.aTiempo += 1;
                    agg.serviciosTotales += 1;
                    break;
                case 'ADELANTADO':
                    agg.adelantados += 1;
                    agg.serviciosTotales += 1;
                    break;
                case 'ATRASADO':
                    agg.atrasados += 1;
                    agg.serviciosTotales += 1;
                    break;
                case 'SIN_HORARIO':
                    agg.sinHorario += 1;
                    break;
                case 'FUERA_DE_SERVICIO':
                    agg.fueraDeServicio += 1;
                    break;
                default:
                    agg.sinHorario += 1;
                    break;
            }
            if (typeof ev.desviacionMin === 'number') {
                agg.desviacionAcumMin += ev.desviacionMin;
                agg.desviacionMuestras += 1;
            }
            // RT bucket: estado del bus para visualización en vivo (ej. mapa, V7)
            if (linea) {
                const rtKey = `${busId}_${ymd.replace(/-/g, '')}`;
                void db.collection(RT_COLLECTION).doc(rtKey).set({
                    busId, agencyId, linea,
                    estado,
                    desviacionMin: (_d = ev.desviacionMin) !== null && _d !== void 0 ? _d : null,
                    proximaParada: (_e = ev.proximaParada) !== null && _e !== void 0 ? _e : null,
                    sentido: (_f = ev.sentido) !== null && _f !== void 0 ? _f : null,
                    ymd,
                    actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
        });
        const otp = agg.serviciosTotales > 0 ? agg.aTiempo / agg.serviciosTotales : 0;
        resultsByAgency[agencyId] = Object.assign(Object.assign({}, agg), { otp, lineasObservadas: [...lineasSeen].sort() });
    }
    // Persistir agregación diaria
    for (const [agencyId, r] of Object.entries(resultsByAgency)) {
        const docId = `${ymd}_${agencyId}`;
        const desviacionPromedioMin = r.desviacionMuestras > 0
            ? r.desviacionAcumMin / r.desviacionMuestras
            : null;
        await db.collection(STATS_COLLECTION).doc(docId).set({
            fecha: ymd,
            agencyId,
            serviciosTotales: r.serviciosTotales,
            aTiempo: r.aTiempo,
            adelantados: r.adelantados,
            atrasados: r.atrasados,
            sinHorario: r.sinHorario,
            fueraDeServicio: r.fueraDeServicio,
            otp: r.otp,
            desviacionPromedioMin,
            lineasObservadas: r.lineasObservadas,
            ventanaInicioMs: startMs,
            ventanaFinMs: endMs,
            ultimaActualizacion: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    return {
        ymd,
        ventanaInicioMs: startMs,
        ventanaFinMs: endMs,
        totalBuses,
        resultsByAgency,
    };
}
// ── HTTP: recálculo manual ────────────────────────────────────────────────
exports.computeAdherenceNow = functions
    .runWith({ timeoutSeconds: 540, memory: '1GB' })
    .https.onRequest(async (req, res) => {
    var _a, _b, _c;
    res.set('Access-Control-Allow-Origin', '*');
    try {
        const dateParam = (_a = req.query.date) !== null && _a !== void 0 ? _a : null;
        const agencyParam = (_b = req.query.agencyId) !== null && _b !== void 0 ? _b : undefined;
        const hoursParam = parseInt((_c = req.query.hours) !== null && _c !== void 0 ? _c : '24', 10);
        let startMs;
        let endMs;
        if (dateParam) {
            const start = new Date(`${dateParam}T00:00:00-03:00`);
            startMs = start.getTime();
            endMs = startMs + 24 * 3600 * 1000;
        }
        else {
            endMs = Date.now();
            startMs = endMs - hoursParam * 3600 * 1000;
        }
        const result = await computeAdherenceForRange(startMs, endMs, agencyParam);
        res.json(Object.assign({ ok: true }, result));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        console.error('[ScheduleAdherence] HTTP error:', msg);
        res.status(500).json({ ok: false, error: msg });
    }
});
// ── Cron: cada hora a los 15 min, procesa la hora previa ──────────────────
exports.computeAdherenceCron = functions
    .runWith({ timeoutSeconds: 540, memory: '1GB' })
    .pubsub.schedule('15 * * * *')
    .timeZone('America/Montevideo')
    .onRun(async () => {
    try {
        const endMs = Date.now();
        const startMs = endMs - 60 * 60 * 1000;
        const r = await computeAdherenceForRange(startMs, endMs);
        console.log('[ScheduleAdherence] Cron OK:', JSON.stringify({
            ymd: r.ymd,
            totalBuses: r.totalBuses,
            otpByAgency: Object.fromEntries(Object.entries(r.resultsByAgency).map(([k, v]) => [k, +v.otp.toFixed(3)])),
        }));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        console.error('[ScheduleAdherence] Cron error:', msg);
    }
    return null;
});
