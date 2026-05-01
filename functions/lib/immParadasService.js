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
Object.defineProperty(exports, "__esModule", { value: true });
exports.immParadasList = exports.seedParadas = exports.refreshParadasTick = exports.immEta = void 0;
exports.ingestarParadas = ingestarParadas;
/**
 * immParadasService — Ingesta de paradas oficiales desde la API IMM (OAuth).
 *
 * 4938 paradas con coordenadas + calles cruzadas. Refresh semanal (datos estáticos).
 * También expone el endpoint HTTP de ETA para que el frontend consulte tiempo de arribo.
 *
 * Colecciones Firestore:
 *   imm_paradas/{busstopId} — paradas con coordenadas y calles
 *   imm_config/paradas_meta — meta (total, updatedAt)
 */
const logger = __importStar(require("firebase-functions/logger"));
const firestore_1 = require("firebase-admin/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const immTokenService_1 = require("./immTokenService");
const COLLECTION = 'imm_paradas';
const META_DOC = 'imm_config/paradas_meta';
// ─── Ingesta de paradas ───────────────────────────────────────────────────────
async function ingestarParadas() {
    const token = await (0, immTokenService_1.getImmToken)();
    if (!token)
        throw new Error('Sin token IMM — credenciales no configuradas');
    const paradas = await (0, immTokenService_1.immApiGet)('/buses/busstops', token);
    if (!paradas)
        throw new Error('API IMM no devolvió paradas');
    const db = (0, firestore_1.getFirestore)();
    const updatedAt = firestore_1.Timestamp.now();
    let batch = db.batch();
    let count = 0;
    for (const p of paradas) {
        batch.set(db.collection(COLLECTION).doc(String(p.busstopId)), Object.assign(Object.assign({}, p), { updatedAt }), { merge: true });
        count++;
        if (count % 400 === 0) {
            await batch.commit();
            batch = db.batch();
        }
    }
    if (count % 400 !== 0)
        await batch.commit();
    await db.doc(META_DOC).set({ totalParadas: count, updatedAt }, { merge: true });
    logger.info('[IMM Paradas] Ingresadas', count, 'paradas');
    return { total: count };
}
// ─── ETA endpoint (para el frontend) ─────────────────────────────────────────
/**
 * GET /immEta?busstopId=546&lines=300,17&amountPerLine=3
 * Devuelve buses próximos a una parada con ETA en segundos.
 */
exports.immEta = (0, https_1.onRequest)({ region: 'us-central1', cors: true }, async (req, res) => {
    var _a, _b;
    const busstopId = Number(req.query.busstopId);
    const linesRaw = typeof req.query.lines === 'string' ? req.query.lines : '';
    const amountPerLine = Number((_a = req.query.amountPerLine) !== null && _a !== void 0 ? _a : 3);
    if (!busstopId || isNaN(busstopId)) {
        res.status(400).json({ ok: false, error: 'busstopId requerido' });
        return;
    }
    const token = await (0, immTokenService_1.getImmToken)();
    if (!token) {
        res.status(503).json({ ok: false, error: 'API IMM sin token. Credenciales no configuradas.' });
        return;
    }
    const lines = linesRaw ? linesRaw.split(',').map(l => l.trim()).filter(Boolean) : [];
    let path = `/buses/busstops/${busstopId}/upcomingbuses?amountperline=${amountPerLine}`;
    if (lines.length)
        path += '&' + lines.map(l => `lines=${encodeURIComponent(l)}`).join('&');
    // data es null cuando la API IMM devuelve non-200 (parada sin líneas próximas = 404 normal)
    const data = (_b = await (0, immTokenService_1.immApiGet)(path, token)) !== null && _b !== void 0 ? _b : [];
    res.json({
        ok: true,
        busstopId,
        lines,
        count: data.length,
        buses: data.map(b => ({
            busId: b.busId,
            company: b.companyName,
            line: b.line,
            origin: b.origin,
            destination: b.destination,
            etaSeg: b.eta,
            etaMin: Math.round(b.eta / 60),
            distanciaM: b.distance,
            acceso: b.access,
            climatizacion: b.thermalConfort,
            emisiones: b.emissions,
        })),
    });
});
// ─── Cron semanal ─────────────────────────────────────────────────────────────
exports.refreshParadasTick = (0, scheduler_1.onSchedule)({ schedule: '0 3 * * 0', region: 'us-central1', timeZone: 'America/Montevideo' }, async () => { await ingestarParadas(); });
// ─── Trigger manual ───────────────────────────────────────────────────────────
exports.seedParadas = (0, https_1.onRequest)({ region: 'us-central1', cors: false }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }
    try {
        const result = await ingestarParadas();
        res.json(Object.assign(Object.assign({ ok: true }, result), { timestamp: new Date().toISOString() }));
    }
    catch (e) {
        logger.error('[IMM Paradas] Error:', e);
        res.status(500).json({ ok: false, error: String(e) });
    }
});
// ─── Lista de paradas para el mapa (frontend) ────────────────────────────────
/**
 * GET /immParadasList
 * Devuelve las 4938 paradas con lat/lng y calles. Cache 30 min.
 * Usado por FleetMonitorModule para mostrar paradas en el mapa y lanzar ETA.
 */
exports.immParadasList = (0, https_1.onRequest)({ region: 'us-central1', cors: true }, async (_req, res) => {
    const db = (0, firestore_1.getFirestore)();
    const snap = await db.collection(COLLECTION).get();
    const paradas = snap.docs.map(d => {
        const p = d.data();
        return {
            id: Number(d.id),
            lat: p.location.coordinates[1],
            lng: p.location.coordinates[0],
            calle1: p.street1,
            calle2: p.street2,
        };
    });
    res.set('Cache-Control', 'public, max-age=1800');
    res.json({ ok: true, total: paradas.length, paradas });
});
