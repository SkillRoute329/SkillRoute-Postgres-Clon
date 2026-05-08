"use strict";
// Endpoint /api/compliance/regulador — datos para Vista Regulador
// SPEC_CUMPLIMIENTO_V2_FRONTEND_2026_05.md §2.7
// Lee compliance_aggregates, agrega por operador, devuelve OperatorSummary[]
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
exports.registerComplianceReguladorRoutes = registerComplianceReguladorRoutes;
const admin = __importStar(require("firebase-admin"));
const getDb = () => admin.firestore();
const AGENCY_NAMES = {
    '70': 'UCOT',
    '50': 'CUTCSA',
    '20': 'COME',
    '10': 'COETC',
};
function parsedGranularidad(g) {
    if (g === 'mensual')
        return 'MONTHLY';
    if (g === 'semanal')
        return 'WEEKLY';
    return 'DAILY';
}
function isValidMetric(m) {
    return m != null && m.value != null && m.badge !== 'INSUFFICIENT' && m.badge !== 'NO_COVERAGE';
}
function weightedAvg(docs, key) {
    const valid = docs.filter(d => isValidMetric(d.metrics[key]));
    if (valid.length === 0)
        return { value: null, n: 0, badge: 'INSUFFICIENT' };
    const totalN = valid.reduce((s, d) => { var _a, _b; return s + ((_b = (_a = d.metrics[key]) === null || _a === void 0 ? void 0 : _a.n) !== null && _b !== void 0 ? _b : 0); }, 0);
    if (totalN === 0)
        return { value: null, n: 0, badge: 'INSUFFICIENT' };
    const wavg = valid.reduce((s, d) => { var _a, _b, _c, _d; return s + (((_b = (_a = d.metrics[key]) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : 0) * ((_d = (_c = d.metrics[key]) === null || _c === void 0 ? void 0 : _c.n) !== null && _d !== void 0 ? _d : 0)); }, 0) / totalN;
    const badge = totalN >= 200 ? 'OK' : 'IC_VISIBLE';
    return { value: Math.round(wavg * 100) / 100, n: totalN, badge };
}
async function queryDocs(agencyId, gran, desde, hasta) {
    const db = getDb();
    let q = db.collection('compliance_aggregates')
        .where('agencyId', '==', agencyId)
        .where('granularidad', '==', gran);
    if (gran === 'DAILY') {
        q = q.where('periodo', '>=', desde).where('periodo', '<=', hasta);
    }
    else if (gran === 'MONTHLY') {
        const month = desde.slice(0, 7);
        q = q.where('periodo', '==', month);
    }
    else {
        // WEEKLY: ordenar y limitar
        q = q.orderBy('periodo').limit(50);
    }
    const snap = await q.get();
    return snap.docs.map(d => d.data());
}
function registerComplianceReguladorRoutes(app) {
    // ── GET /api/compliance/regulador ────────────────────────────────────────
    app.get('/api/compliance/regulador', async (req, res) => {
        var _a, _b, _c, _d, _e;
        try {
            const empresa = String((_a = req.query.empresa) !== null && _a !== void 0 ? _a : 'all');
            const desde = String((_b = req.query.desde) !== null && _b !== void 0 ? _b : '');
            const hasta = String((_c = req.query.hasta) !== null && _c !== void 0 ? _c : '');
            const granParam = String((_d = req.query.granularidad) !== null && _d !== void 0 ? _d : 'diaria');
            const gran = parsedGranularidad(granParam);
            const agencies = empresa === 'all'
                ? ['70', '50', '20', '10']
                : [empresa];
            // Leer docs de todas las empresas
            const allDocs = [];
            await Promise.all(agencies.map(async (agencyId) => {
                const docs = await queryDocs(agencyId, gran, desde, hasta);
                allDocs.push(...docs);
            }));
            // Cobertura global del sistema
            const totalEventsAll = allDocs.reduce((s, d) => { var _a; return s + ((_a = d.totalEventsObserved) !== null && _a !== void 0 ? _a : 0); }, 0);
            const systemGps = totalEventsAll > 0
                ? allDocs.reduce((s, d) => { var _a, _b; return s + ((_a = d.globalCoverageGps) !== null && _a !== void 0 ? _a : 0) * ((_b = d.totalEventsObserved) !== null && _b !== void 0 ? _b : 0); }, 0) / totalEventsAll
                : 0;
            // Agrupar por empresa
            const byAgency = new Map();
            for (const doc of allDocs) {
                if (!byAgency.has(doc.agencyId))
                    byAgency.set(doc.agencyId, []);
                byAgency.get(doc.agencyId).push(doc);
            }
            // Construir resumen por operador
            const operators = agencies.map(agencyId => {
                var _a, _b;
                const agDocs = (_a = byAgency.get(agencyId)) !== null && _a !== void 0 ? _a : [];
                const totalEvents = agDocs.reduce((s, d) => { var _a; return s + ((_a = d.totalEventsObserved) !== null && _a !== void 0 ? _a : 0); }, 0);
                const coverageGps = totalEvents > 0
                    ? agDocs.reduce((s, d) => { var _a, _b; return s + ((_a = d.globalCoverageGps) !== null && _a !== void 0 ? _a : 0) * ((_b = d.totalEventsObserved) !== null && _b !== void 0 ? _b : 0); }, 0) / totalEvents
                    : 0;
                const totalTrips = agDocs.reduce((s, d) => { var _a; return s + ((_a = d.totalTripsScheduled) !== null && _a !== void 0 ? _a : 0); }, 0);
                const uniqueLines = new Set(agDocs.map(d => d.linea)).size;
                const otp = weightedAvg(agDocs, 'otp_low_freq');
                const ewt = weightedAvg(agDocs, 'ewt_high_freq');
                const sd = weightedAvg(agDocs, 'service_delivered');
                const srs = weightedAvg(agDocs, 'service_reliability_score');
                return {
                    agencyId,
                    name: (_b = AGENCY_NAMES[agencyId]) !== null && _b !== void 0 ? _b : agencyId,
                    totalEvents,
                    totalLines: uniqueLines,
                    lineCount: agDocs.length,
                    coverageGps: Math.round(coverageGps * 10) / 10,
                    services: { value: totalTrips, type: 'medido' },
                    otp: otp.value != null ? Object.assign(Object.assign({}, otp), { applicable: true }) : null,
                    ewt: ewt.value != null ? Object.assign(Object.assign({}, ewt), { applicable: true }) : null,
                    serviceDelivered: sd.value != null ? sd : null,
                    srs: srs.value != null ? srs : null,
                };
            });
            const byOperatorCov = {};
            for (const op of operators) {
                byOperatorCov[op.agencyId] = op.coverageGps;
            }
            return res.json({
                meta: {
                    period: { desde, hasta, granularidad: granParam },
                    generatedAt: new Date().toISOString(),
                    source: 'GPS oficial IMM (POST stm-online) + GTFS oficial',
                },
                coverage: {
                    systemGps: Math.round(systemGps * 10) / 10,
                    byOperator: byOperatorCov,
                },
                operators,
            });
        }
        catch (err) {
            console.error('[compliance/regulador] Error:', err);
            return res.status(500).json({ error: (_e = err === null || err === void 0 ? void 0 : err.message) !== null && _e !== void 0 ? _e : String(err) });
        }
    });
    // ── POST /api/compliance/regulador/export — stub ─────────────────────────
    app.post('/api/compliance/regulador/export', async (_req, res) => {
        return res.status(501).json({
            error: 'Exportación PDF pendiente de implementación',
            stub: true,
        });
    });
    // ── GET /api/compliance/operador — Sprint 4: Vista Operador ───────────────
    // Devuelve métricas por línea para un operador específico.
    // Params: agencyId (requerido), desde, hasta, granularidad
    app.get('/api/compliance/operador', async (req, res) => {
        var _a, _b, _c, _d, _e;
        try {
            const agencyId = String((_a = req.query.agencyId) !== null && _a !== void 0 ? _a : '');
            const desde = String((_b = req.query.desde) !== null && _b !== void 0 ? _b : '');
            const hasta = String((_c = req.query.hasta) !== null && _c !== void 0 ? _c : '');
            const granParam = String((_d = req.query.granularidad) !== null && _d !== void 0 ? _d : 'diaria');
            const gran = parsedGranularidad(granParam);
            if (!agencyId || !AGENCY_NAMES[agencyId]) {
                return res.status(400).json({ error: 'agencyId inválido. Valores válidos: 70, 50, 20, 10' });
            }
            const docs = await queryDocs(agencyId, gran, desde, hasta);
            // Cobertura global del operador
            const totalEvents = docs.reduce((s, d) => { var _a; return s + ((_a = d.totalEventsObserved) !== null && _a !== void 0 ? _a : 0); }, 0);
            const operatorGps = totalEvents > 0
                ? docs.reduce((s, d) => { var _a, _b; return s + ((_a = d.globalCoverageGps) !== null && _a !== void 0 ? _a : 0) * ((_b = d.totalEventsObserved) !== null && _b !== void 0 ? _b : 0); }, 0) / totalEvents
                : 0;
            // Agrupar por (linea, sentido)
            const groups = new Map();
            for (const doc of docs) {
                const key = `${doc.linea}__${doc.sentido}`;
                if (!groups.has(key))
                    groups.set(key, []);
                groups.get(key).push(doc);
            }
            const ORDER = {
                INSUFICIENTE: 0, COBERTURA_BAJA: 1, OK_PROVISIONAL: 2, OK: 3,
            };
            const lines = Array.from(groups.entries()).map(([key, grpDocs]) => {
                const [linea, sentido] = key.split('__');
                const n = grpDocs.reduce((s, d) => { var _a; return s + ((_a = d.totalEventsObserved) !== null && _a !== void 0 ? _a : 0); }, 0);
                const trips = grpDocs.reduce((s, d) => { var _a; return s + ((_a = d.totalTripsScheduled) !== null && _a !== void 0 ? _a : 0); }, 0);
                const covGps = n > 0
                    ? grpDocs.reduce((s, d) => { var _a, _b; return s + ((_a = d.globalCoverageGps) !== null && _a !== void 0 ? _a : 0) * ((_b = d.totalEventsObserved) !== null && _b !== void 0 ? _b : 0); }, 0) / n
                    : 0;
                const isHighFreq = grpDocs.some(d => d.isHighFreq);
                const otp = weightedAvg(grpDocs, 'otp_low_freq');
                const ewt = weightedAvg(grpDocs, 'ewt_high_freq');
                const sd = weightedAvg(grpDocs, 'service_delivered');
                const srs = weightedAvg(grpDocs, 'service_reliability_score');
                let estado;
                if (n < 30) {
                    estado = 'INSUFICIENTE';
                }
                else if (covGps < 70) {
                    estado = 'COBERTURA_BAJA';
                }
                else {
                    const primary = isHighFreq ? ewt : otp;
                    estado = primary.badge === 'OK' ? 'OK'
                        : primary.badge === 'IC_VISIBLE' ? 'OK_PROVISIONAL'
                            : 'INSUFICIENTE';
                }
                return {
                    linea,
                    sentido,
                    totalEventsObserved: n,
                    totalTripsScheduled: trips,
                    globalCoverageGps: Math.round(covGps * 10) / 10,
                    isHighFreq,
                    estado,
                    metrics: {
                        otp: otp.value != null ? otp : null,
                        ewt: ewt.value != null ? ewt : null,
                        serviceDelivered: sd.value != null ? sd : null,
                        srs: srs.value != null ? srs : null,
                    },
                };
            });
            // Alertas primero, luego OK_PROVISIONAL, luego OK
            lines.sort((a, b) => { var _a, _b; return ((_a = ORDER[a.estado]) !== null && _a !== void 0 ? _a : 0) - ((_b = ORDER[b.estado]) !== null && _b !== void 0 ? _b : 0); });
            return res.json({
                meta: {
                    agencyId,
                    agencyName: AGENCY_NAMES[agencyId],
                    period: { desde, hasta, granularidad: granParam },
                    generatedAt: new Date().toISOString(),
                    source: 'GPS oficial IMM (POST stm-online) + GTFS oficial',
                },
                coverage: {
                    operatorGps: Math.round(operatorGps * 10) / 10,
                    totalEvents,
                },
                lines,
            });
        }
        catch (err) {
            console.error('[compliance/operador] Error:', err);
            return res.status(500).json({ error: (_e = err === null || err === void 0 ? void 0 : err.message) !== null && _e !== void 0 ? _e : String(err) });
        }
    });
    // ── POST /api/compliance/operador/export — stub Sprint 4 ─────────────────
    app.post('/api/compliance/operador/export', async (_req, res) => {
        return res.status(501).json({
            error: 'Exportación PDF pendiente de implementación',
            stub: true,
        });
    });
}
