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
exports.seedVariantes = exports.refreshVariantesTick = void 0;
exports.ingestarVariantes = ingestarVariantes;
/**
 * immVariantesService — Ingesta de variantes de línea desde la API pública de la IMM.
 *
 * Endpoint sin autenticación: GET https://www.montevideo.gub.uy/buses/rest/variantes
 * Devuelve 2204 variantes con origen, destino y sublinea para todas las empresas.
 *
 * Uso en frontend: leer imm_variantes/{varianteCodigo} o consultar por linea
 * para enriquecer la vista de GPS con origen/destino legibles.
 *
 * Cron: diario a las 4:00 AM (datos estáticos, cambian raramente).
 * HTTP manual: POST /seedVariantes (admin).
 */
const https = __importStar(require("https"));
const logger = __importStar(require("firebase-functions/logger"));
const firestore_1 = require("firebase-admin/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const VARIANTES_URL = 'https://www.montevideo.gub.uy/buses/rest/variantes';
const COLLECTION = 'imm_variantes';
const META_DOC = 'imm_config/variantes_meta';
function fetchVariantesRaw() {
    return new Promise((resolve, reject) => {
        https.get(VARIANTES_URL, (res) => {
            let d = '';
            res.on('data', (c) => (d += c));
            res.on('end', () => {
                try {
                    resolve(JSON.parse(d));
                }
                catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}
async function ingestarVariantes() {
    var _a;
    var _b;
    const variantes = await fetchVariantesRaw();
    const db = (0, firestore_1.getFirestore)();
    const updatedAt = firestore_1.Timestamp.now();
    let batch = db.batch();
    let count = 0;
    for (const v of variantes) {
        batch.set(db.collection(COLLECTION).doc(String(v.varianteCodigo)), Object.assign(Object.assign({}, v), { updatedAt }), { merge: true });
        count++;
        if (count % 400 === 0) {
            await batch.commit();
            batch = db.batch();
        }
    }
    if (count % 400 !== 0)
        await batch.commit();
    // Índice por linea (string) → lista de variantes para join rápido desde GPS
    const byLinea = {};
    for (const v of variantes) {
        ((_a = byLinea[_b = v.linea]) !== null && _a !== void 0 ? _a : (byLinea[_b] = [])).push(v);
    }
    await db.doc(META_DOC).set({
        totalVariantes: count,
        totalLineas: Object.keys(byLinea).length,
        updatedAt,
    }, { merge: true });
    logger.info('[IMM Variantes] Ingresadas', count, 'variantes,', Object.keys(byLinea).length, 'líneas únicas');
    return { total: count };
}
// ─── Cron diario ──────────────────────────────────────────────────────────────
exports.refreshVariantesTick = (0, scheduler_1.onSchedule)({ schedule: '0 4 * * *', region: 'us-central1', timeZone: 'America/Montevideo' }, async () => { await ingestarVariantes(); });
// ─── Trigger manual (admin) ───────────────────────────────────────────────────
exports.seedVariantes = (0, https_1.onRequest)({ region: 'us-central1', cors: false }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }
    try {
        const result = await ingestarVariantes();
        res.json(Object.assign(Object.assign({ ok: true }, result), { timestamp: new Date().toISOString() }));
    }
    catch (e) {
        logger.error('[IMM Variantes] Error:', e);
        res.status(500).json({ ok: false, error: String(e) });
    }
});
