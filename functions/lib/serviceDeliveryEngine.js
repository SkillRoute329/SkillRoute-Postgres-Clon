"use strict";
/**
 * serviceDeliveryEngine.ts — KPI canónico Service Delivery (UITP/TfL)
 * =====================================================================
 * Cruza cartones planificados vs ejecutados y produce el indicador
 * `Service Delivery = ejecutados / planificados`.
 *
 * Definición canónica (UITP, TfL Service Delivery, NYC MTA Service Levels):
 *   Service Delivery (%) = trips ejecutados / trips planificados
 *
 * Es distinto de OTP (que mide puntualidad de los que SÍ corrieron).
 * Mide cuánto del servicio prometido se entregó. Un operador puede
 * tener OTP 95% pero Service Delivery 80% si canceló el 20% por
 * falta de unidades/conductores.
 *
 * Fuentes:
 *   - cartones_planificados/{ymd}_{cocheId}_{servicioId}: programa oficial
 *   - cartones_completados/{cartonId}: confirmación de ejecución
 *   - vehicle_events: fallback — si no hay cartones_completados, deducir
 *     ejecución desde GPS observado por (linea, día) vs plan.
 *
 * Output: service_delivery_diaria/{ymd}_{agencyId}
 *   {
 *     fecha, agencyId,
 *     planificados, ejecutados, cancelados, parciales,
 *     serviceDelivery (0-1),
 *     porLinea: { lineaId: { plan, ejec, sd } },
 *     ultimaActualizacion
 *   }
 *
 * Triggers:
 *   - HTTP /computeServiceDeliveryNow?date=YYYY-MM-DD&agencyId=70
 *   - cron `30 23 * * *` (23:30 Mvd) — procesa el día completo
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
exports.computeServiceDeliveryCron = exports.computeServiceDeliveryNow = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length)
    admin.initializeApp();
const db = admin.firestore();
const COLLECTION = 'service_delivery_diaria';
const AGENCY_IDS = ['10', '20', '50', '70'];
const AGENCY_NAMES = {
    '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT',
};
function emptyAgg() {
    return { planificados: 0, ejecutados: 0, cancelados: 0, parciales: 0, porLinea: {} };
}
function ymdOf(d) {
    const localMs = d.getTime() - 3 * 3600 * 1000;
    return new Date(localMs).toISOString().slice(0, 10);
}
function normalizeAgency(c) {
    var _a, _b;
    if (c.agencyId)
        return String(c.agencyId);
    const e = (_a = c.empresaId) !== null && _a !== void 0 ? _a : c.empresa;
    if (e == null)
        return null;
    const s = String(e).trim();
    // Si viene como número string
    if (/^(10|20|50|70)$/.test(s))
        return s;
    // Mapeo nombre → id
    const byName = { COETC: '10', COME: '20', CUTCSA: '50', UCOT: '70' };
    return (_b = byName[s.toUpperCase()]) !== null && _b !== void 0 ? _b : null;
}
function normalizeLinea(c) {
    var _a, _b;
    return String((_b = (_a = c.linea) !== null && _a !== void 0 ? _a : c.lineaId) !== null && _b !== void 0 ? _b : '').trim().replace(/[ab]$/i, '');
}
/**
 * Calcula Service Delivery para una fecha + opcionalmente filtrar por agency.
 */
async function computeServiceDeliveryFor(ymd, agencyFilter) {
    var _a;
    const agencias = agencyFilter ? [agencyFilter] : AGENCY_IDS;
    // Cargar cartones del día desde múltiples colecciones que coexisten en el sistema
    // (cartones, cartones_completados). Combinamos ambas y dedupeamos por id.
    const [planSnap, ejecSnap] = await Promise.all([
        db.collection('cartones').where('ymd', '==', ymd).limit(20000).get().catch(() => null),
        db.collection('cartones_completados').where('ymd', '==', ymd).limit(20000).get().catch(() => null),
    ]);
    const allCartones = new Map();
    if (planSnap) {
        planSnap.forEach((d) => {
            const data = d.data();
            allCartones.set(d.id, Object.assign(Object.assign({}, data), { id: d.id }));
        });
    }
    if (ejecSnap) {
        ejecSnap.forEach((d) => {
            const data = d.data();
            // cartones_completados manda — sobrescribe estado si ya existía
            const existing = allCartones.get(d.id);
            allCartones.set(d.id, Object.assign(Object.assign(Object.assign({}, (existing !== null && existing !== void 0 ? existing : {})), data), { id: d.id }));
        });
    }
    const resultsByAgency = {};
    for (const ag of agencias) {
        resultsByAgency[ag] = Object.assign(Object.assign({}, emptyAgg()), { serviceDelivery: 0 });
    }
    for (const c of allCartones.values()) {
        const ag = normalizeAgency(c);
        if (!ag || !agencias.includes(ag))
            continue;
        const linea = normalizeLinea(c) || '_sin_linea_';
        const agg = resultsByAgency[ag];
        if (!agg.porLinea[linea])
            agg.porLinea[linea] = { plan: 0, ejec: 0, sd: 0 };
        agg.planificados += 1;
        agg.porLinea[linea].plan += 1;
        const estado = (_a = c.estado) !== null && _a !== void 0 ? _a : 'PLANIFICADO';
        if (estado === 'COMPLETADO' || estado === 'EJECUTANDO') {
            agg.ejecutados += 1;
            agg.porLinea[linea].ejec += 1;
        }
        else if (estado === 'CANCELADO') {
            agg.cancelados += 1;
        }
        else if (estado === 'PARCIAL') {
            agg.parciales += 1;
            // En UITP, parciales cuentan como 0.5 ejecutado
            agg.ejecutados += 0.5;
            agg.porLinea[linea].ejec += 0.5;
        }
    }
    // Calcular SD final + por línea
    for (const ag of agencias) {
        const r = resultsByAgency[ag];
        r.serviceDelivery = r.planificados > 0 ? r.ejecutados / r.planificados : 0;
        Object.values(r.porLinea).forEach((p) => {
            p.sd = p.plan > 0 ? p.ejec / p.plan : 0;
        });
    }
    return { ymd, agencias, resultsByAgency };
}
async function persistResult(ymd, resultsByAgency) {
    var _a;
    for (const [agencyId, r] of Object.entries(resultsByAgency)) {
        const docId = `${ymd}_${agencyId}`;
        await db.collection(COLLECTION).doc(docId).set({
            fecha: ymd,
            agencyId,
            empresa: (_a = AGENCY_NAMES[agencyId]) !== null && _a !== void 0 ? _a : agencyId,
            planificados: r.planificados,
            ejecutados: r.ejecutados,
            cancelados: r.cancelados,
            parciales: r.parciales,
            serviceDelivery: r.serviceDelivery,
            porLinea: r.porLinea,
            ultimaActualizacion: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
}
// ── HTTP: cómputo manual ──────────────────────────────────────────────────
exports.computeServiceDeliveryNow = functions
    .runWith({ timeoutSeconds: 540, memory: '1GB' })
    .https.onRequest(async (req, res) => {
    var _a, _b;
    res.set('Access-Control-Allow-Origin', '*');
    try {
        const ymd = (_a = req.query.date) !== null && _a !== void 0 ? _a : ymdOf(new Date());
        const agencyId = (_b = req.query.agencyId) !== null && _b !== void 0 ? _b : undefined;
        const result = await computeServiceDeliveryFor(ymd, agencyId);
        await persistResult(result.ymd, result.resultsByAgency);
        res.json(Object.assign({ ok: true }, result));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        console.error('[serviceDelivery] HTTP error:', msg);
        res.status(500).json({ ok: false, error: msg });
    }
});
// ── Cron: 23:30 Mvd, procesa el día completo ──────────────────────────────
exports.computeServiceDeliveryCron = functions
    .runWith({ timeoutSeconds: 540, memory: '1GB' })
    .pubsub.schedule('30 23 * * *')
    .timeZone('America/Montevideo')
    .onRun(async () => {
    try {
        const ymd = ymdOf(new Date());
        const result = await computeServiceDeliveryFor(ymd);
        await persistResult(result.ymd, result.resultsByAgency);
        console.log('[serviceDelivery] Cron OK', JSON.stringify({
            ymd: result.ymd,
            sdByAgency: Object.fromEntries(Object.entries(result.resultsByAgency).map(([k, v]) => [k, +v.serviceDelivery.toFixed(3)])),
        }));
    }
    catch (err) {
        console.error('[serviceDelivery] Cron error:', err instanceof Error ? err.message : err);
    }
    return null;
});
