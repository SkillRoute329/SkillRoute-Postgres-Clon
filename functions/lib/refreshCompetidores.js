"use strict";
/**
 * refreshCompetidores.ts — Mantiene `competidores` fresco automáticamente
 * ====================================================================
 * Cada 10 minutos, consulta el endpoint público GPS de IMM y materializa
 * la colección `competidores` con identidad + estado operativo en vivo
 * de COETC, COME, CUTCSA (excluye UCOT).
 *
 * Distinción importante vs `ingestaIMMTick`:
 *   - ingestaIMMTick (cada 60s): escribe pings GPS por bus en
 *     `competencia_monitoreo/{lineaId}/pings` y `viajes_activos`.
 *   - refreshCompetidoresTick (cada 10min): mantiene la entidad-nivel
 *     `competidores/{emp-XX}` con sus líneas observadas y buses activos.
 *     Esta colección es la que consume `competitionService` para análisis.
 *
 * El refresh "completo" de horarios reales (scrape JSF) es operación
 * pesada (~minutos por empresa) y se dispara manual vía
 * POST /api/competition/enrich-horarios/:competidorId.
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
exports.refreshCompetidoresNow = exports.refreshCompetidoresTick = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const db = admin.firestore();
const STM_ONLINE_URL = 'https://www.montevideo.gub.uy/buses/rest/stm-online';
const COMPETIDORES_COLLECTION = 'competidores';
const SNAPSHOT_COLLECTION = 'stm_snapshots';
const EMPRESA_NAMES = {
    10: 'COETC',
    20: 'COME',
    50: 'CUTCSA',
    70: 'UCOT',
};
const UCOT_CODE = 70;
async function fetchSnapshot() {
    const res = await axios_1.default.post(STM_ONLINE_URL, { empresa: '-1' }, {
        timeout: 15000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
            'Content-Type': 'application/json',
            Referer: 'https://www.montevideo.gub.uy/buses/',
            Origin: 'https://www.montevideo.gub.uy',
        },
    });
    return res.data;
}
function agruparPorEmpresa(coll) {
    var _a;
    const map = new Map();
    for (const f of (_a = coll.features) !== null && _a !== void 0 ? _a : []) {
        const p = f.properties;
        if (!(p === null || p === void 0 ? void 0 : p.codigoEmpresa) || !(p === null || p === void 0 ? void 0 : p.linea))
            continue;
        let emp = map.get(p.codigoEmpresa);
        if (!emp) {
            emp = {
                codigo: p.codigoEmpresa,
                nombre: EMPRESA_NAMES[p.codigoEmpresa] || `Empresa ${p.codigoEmpresa}`,
                totalBuses: 0,
                lineas: new Map(),
            };
            map.set(p.codigoEmpresa, emp);
        }
        emp.totalBuses += 1;
        let linea = emp.lineas.get(p.linea);
        if (!linea) {
            linea = {
                numero: p.linea,
                sublineas: new Set(),
                destinos: new Set(),
                variantes: new Set(),
                tipoLineaDesc: p.tipoLineaDesc,
                busesActivos: 0,
            };
            emp.lineas.set(p.linea, linea);
        }
        linea.busesActivos += 1;
        if (p.sublinea)
            linea.sublineas.add(p.sublinea);
        if (p.destinoDesc)
            linea.destinos.add(p.destinoDesc);
        if (typeof p.variante === 'number')
            linea.variantes.add(p.variante);
    }
    return map;
}
async function refresh() {
    var _a, _b;
    const started = Date.now();
    const ahora = admin.firestore.FieldValue.serverTimestamp();
    const snapshot = await fetchSnapshot();
    const totalBuses = (_b = (_a = snapshot.features) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0;
    const grouped = agruparPorEmpresa(snapshot);
    const batch = db.batch();
    let competidoresWritten = 0;
    const procesadas = [];
    for (const [codigo, emp] of grouped.entries()) {
        const omitida = codigo === UCOT_CODE;
        procesadas.push({
            codigo,
            nombre: emp.nombre,
            buses: emp.totalBuses,
            lineas: emp.lineas.size,
            omitida,
        });
        if (omitida)
            continue;
        const lineas = Array.from(emp.lineas.values()).map((l) => {
            var _a;
            return ({
                id: `${codigo}-${l.numero}`,
                numeroLinea: parseInt(l.numero, 10) || 0,
                numeroLineaTexto: l.numero,
                operador: emp.nombre,
                recorrido: [],
                horarios: [],
                frecuencia: 0,
                historico: [],
                activa: l.busesActivos > 0,
                sublineas: Array.from(l.sublineas),
                destinos: Array.from(l.destinos),
                variantes: Array.from(l.variantes),
                tipoLineaDesc: (_a = l.tipoLineaDesc) !== null && _a !== void 0 ? _a : null,
                busesActivosUltimoSnapshot: l.busesActivos,
            });
        });
        const ref = db.collection(COMPETIDORES_COLLECTION).doc(`emp-${codigo}`);
        batch.set(ref, {
            id: `emp-${codigo}`,
            nombre: emp.nombre,
            lineas,
            ultimaActualizacion: ahora,
        }, { merge: true });
        competidoresWritten++;
    }
    // Audit
    const snapRef = db.collection(SNAPSHOT_COLLECTION).doc();
    batch.set(snapRef, {
        timestamp: ahora,
        totalBuses,
        porEmpresa: procesadas,
        fuente: 'POST /buses/rest/stm-online (refreshCompetidores cron)',
    });
    await batch.commit();
    const durationMs = Date.now() - started;
    console.log(`[refreshCompetidores] OK ${totalBuses} buses, ${competidoresWritten} competidores, ${durationMs}ms`);
    return { totalBuses, competidores: competidoresWritten, durationMs };
}
/**
 * Cron: cada 10 minutos.
 * Mantiene `competidores` con identidad y estado operativo fresco.
 */
exports.refreshCompetidoresTick = functions.pubsub
    .schedule('every 10 minutes')
    .timeZone('America/Montevideo')
    .onRun(async () => {
    try {
        await refresh();
    }
    catch (err) {
        console.error('[refreshCompetidores] Error:', (err === null || err === void 0 ? void 0 : err.message) || err);
    }
    return null;
});
/**
 * HTTP: trigger manual (debug/test).
 */
exports.refreshCompetidoresNow = functions.https.onRequest(async (_req, res) => {
    try {
        const result = await refresh();
        res.json(Object.assign({ ok: true }, result));
    }
    catch (err) {
        console.error('[refreshCompetidoresNow] Error:', (err === null || err === void 0 ? void 0 : err.message) || err);
        res.status(502).json({ ok: false, error: (err === null || err === void 0 ? void 0 : err.message) || String(err) });
    }
});
