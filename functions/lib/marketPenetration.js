"use strict";
/**
 * marketPenetration.ts — Snapshot diario de cuota de mercado por línea
 * ======================================================================
 * Cada día toma snapshot de los buses GPS observados en el sistema y
 * agrega por (linea_normalizada × agencyId). Persiste en
 * `penetracion_diaria/{ymd}_{linea}` con un objeto:
 *   {
 *     fecha, linea,
 *     totalBuses, agencias: {
 *       '70': { count, sharePct },
 *       '50': { count, sharePct },
 *       ...
 *     },
 *     dominante: { agencyId, label, sharePct },
 *     ultimaActualizacion
 *   }
 *
 * Permite reconstruir histórico de penetración por operador-corredor sin
 * tener que mantener cartones detallados. Fuente liviana, ideal para
 * tendencias diarias/semanales.
 *
 * Triggers:
 *   - cron `45 23 * * *` Mvd → snapshot del día actual
 *   - HTTP /computePenetrationNow?date=YYYY-MM-DD
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
exports.penetrationHistoric = exports.computePenetrationCron = exports.computePenetrationNow = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length)
    admin.initializeApp();
const db = admin.firestore();
const COLLECTION = 'penetracion_diaria';
const AGENCY_NAMES = {
    '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT',
};
function ymdOf(d) {
    const localMs = d.getTime() - 3 * 3600 * 1000;
    return new Date(localMs).toISOString().slice(0, 10);
}
function normalizeLinea(raw) {
    return String(raw !== null && raw !== void 0 ? raw : '').trim().replace(/[ab]$/i, '');
}
/**
 * Toma snapshot de penetración usando vehicle_events recientes (últimas 4h)
 * agregados por (línea × agencyId). Agrupa por bus único — un bus no se
 * cuenta dos veces aunque haya emitido múltiples eventos.
 */
async function snapshotPenetration(ymd, windowHours = 4) {
    var _a, _b, _c;
    const sinceMs = Date.now() - windowHours * 3600 * 1000;
    const sinceTs = admin.firestore.Timestamp.fromMillis(sinceMs);
    const allBuses = [];
    for (const ag of Object.keys(AGENCY_NAMES)) {
        const snap = await db
            .collection('vehicle_events')
            .where('agencyId', '==', ag)
            .where('createdAt', '>=', sinceTs)
            .orderBy('createdAt', 'desc')
            .limit(15000)
            .get();
        const seen = new Set();
        snap.forEach((doc) => {
            var _a, _b;
            const ev = doc.data();
            // Política unificada (docs/POLITICA_OTP_UNIFICADA.md): FUERA_DE_SERVICIO
            // excluido del denominador — un bus apagado no es "presencia operativa".
            if (ev.estadoCumplimiento === 'FUERA_DE_SERVICIO')
                return;
            const busId = String((_a = ev.idBus) !== null && _a !== void 0 ? _a : doc.id);
            if (seen.has(busId))
                return;
            seen.add(busId);
            const linea = normalizeLinea(String((_b = ev.linea) !== null && _b !== void 0 ? _b : ''));
            if (!linea)
                return;
            allBuses.push({ agencyId: ag, busId, linea });
        });
    }
    // Agrupar por línea
    const byLinea = {};
    for (const b of allBuses) {
        if (!byLinea[b.linea])
            byLinea[b.linea] = { totalBuses: 0, agencias: {} };
        byLinea[b.linea].totalBuses += 1;
        byLinea[b.linea].agencias[b.agencyId] = ((_a = byLinea[b.linea].agencias[b.agencyId]) !== null && _a !== void 0 ? _a : 0) + 1;
    }
    // Construir docs y persistir
    const porLinea = {};
    for (const [linea, data] of Object.entries(byLinea)) {
        const agencias = {};
        let dom = null;
        for (const [ag, count] of Object.entries(data.agencias)) {
            const sharePct = data.totalBuses > 0 ? (count / data.totalBuses) * 100 : 0;
            agencias[ag] = { count, sharePct, label: (_b = AGENCY_NAMES[ag]) !== null && _b !== void 0 ? _b : ag };
            if (!dom || sharePct > dom.sharePct) {
                dom = { agencyId: ag, label: (_c = AGENCY_NAMES[ag]) !== null && _c !== void 0 ? _c : ag, sharePct };
            }
        }
        const docId = `${ymd}_${linea}`;
        const docData = {
            fecha: ymd,
            linea,
            totalBuses: data.totalBuses,
            agencias,
            dominante: dom,
            ultimaActualizacion: admin.firestore.FieldValue.serverTimestamp(),
        };
        await db.collection(COLLECTION).doc(docId).set(docData, { merge: true });
        porLinea[linea] = docData;
    }
    return {
        ymd,
        lineas: Object.keys(byLinea).length,
        totalBusesUnicos: allBuses.length,
        porLinea,
    };
}
// HTTP: snapshot manual
exports.computePenetrationNow = functions
    .runWith({ timeoutSeconds: 540, memory: '1GB' })
    .https.onRequest(async (req, res) => {
    var _a, _b;
    res.set('Access-Control-Allow-Origin', '*');
    try {
        const ymd = (_a = req.query.date) !== null && _a !== void 0 ? _a : ymdOf(new Date());
        const windowH = parseInt((_b = req.query.hours) !== null && _b !== void 0 ? _b : '4', 10);
        const result = await snapshotPenetration(ymd, windowH);
        res.json({
            ok: true,
            ymd: result.ymd,
            lineas: result.lineas,
            totalBusesUnicos: result.totalBusesUnicos,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        console.error('[penetracion] Error:', msg);
        res.status(500).json({ ok: false, error: msg });
    }
});
// Cron diario: 23:45 Mvd
exports.computePenetrationCron = functions
    .runWith({ timeoutSeconds: 540, memory: '1GB' })
    .pubsub.schedule('45 23 * * *')
    .timeZone('America/Montevideo')
    .onRun(async () => {
    try {
        const ymd = ymdOf(new Date());
        const result = await snapshotPenetration(ymd, 4);
        console.log('[penetracion] Cron OK:', JSON.stringify({
            ymd: result.ymd,
            lineas: result.lineas,
            totalBuses: result.totalBusesUnicos,
        }));
    }
    catch (err) {
        console.error('[penetracion] Cron error:', err instanceof Error ? err.message : err);
    }
    return null;
});
/**
 * HTTP query para el dashboard frontend: devuelve serie histórica de
 * penetración de un operador para un rango de días.
 *
 * GET /penetrationHistoric?agencyId=70&days=30&topLineas=20
 */
exports.penetrationHistoric = functions
    .runWith({ timeoutSeconds: 60, memory: '256MB' })
    .https.onRequest(async (req, res) => {
    var _a, _b, _c;
    res.set('Access-Control-Allow-Origin', '*');
    try {
        const agencyId = (_a = req.query.agencyId) !== null && _a !== void 0 ? _a : '70';
        const days = Math.min(Math.max(parseInt((_b = req.query.days) !== null && _b !== void 0 ? _b : '30', 10), 1), 90);
        const topLineas = Math.min(parseInt((_c = req.query.topLineas) !== null && _c !== void 0 ? _c : '20', 10), 100);
        const sinceMs = Date.now() - days * 24 * 3600 * 1000;
        const sinceYmd = ymdOf(new Date(sinceMs));
        // Query rango por fecha (string >= sinceYmd)
        const snap = await db
            .collection(COLLECTION)
            .where('fecha', '>=', sinceYmd)
            .orderBy('fecha', 'desc')
            .limit(20000)
            .get();
        // Agrupar por línea con la agencia solicitada
        const byLinea = {};
        snap.forEach((d) => {
            var _a;
            const data = d.data();
            const agData = (_a = data.agencias) === null || _a === void 0 ? void 0 : _a[agencyId];
            if (!agData)
                return;
            const linea = data.linea;
            if (!byLinea[linea])
                byLinea[linea] = { fechas: {}, sumShare: 0, samples: 0 };
            byLinea[linea].fechas[data.fecha] = { count: agData.count, sharePct: agData.sharePct };
            byLinea[linea].sumShare += agData.sharePct;
            byLinea[linea].samples += 1;
        });
        // Top líneas por share promedio
        const sorted = Object.entries(byLinea)
            .map(([linea, info]) => ({
            linea,
            avgShare: info.samples > 0 ? info.sumShare / info.samples : 0,
            samples: info.samples,
            fechas: info.fechas,
        }))
            .sort((a, b) => b.avgShare - a.avgShare)
            .slice(0, topLineas);
        res.json({
            ok: true,
            agencyId,
            days,
            topLineas: sorted,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        console.error('[penetrationHistoric] Error:', msg);
        res.status(500).json({ ok: false, error: msg });
    }
});
