"use strict";
/**
 * refreshHorariosUcot.ts
 * Scrapea los horarios oficiales de las 29 líneas UCOT desde
 * https://www.montevideo.gub.uy/app/stm/horarios/ y los guarda en Firestore:
 *
 *   horarios_oficiales/{lineaId}
 *     {
 *       linea, nombre, categoria,
 *       dias: {
 *         Hábiles: { variantes, totalSalidas, frecuenciaDominanteMin, scrapedAt },
 *         Sábados: { ... },
 *         Domingos: { ... }
 *       },
 *       ultimaActualizacion
 *     }
 *
 * Cron diario 04:00 America/Montevideo.
 * HTTP trigger manual: /refreshHorariosUcotNow?linea=300&tipoDia=Hábiles (admin ad-hoc).
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
exports.refreshHorariosUcotNow = exports.refreshHorariosUcotTick = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const stmHorariosScraper_1 = require("./stmHorariosScraper");
const db = admin.firestore();
/** Las 29 líneas UCOT (id en el STM, nombre comercial, categoría). */
const LINEAS_UCOT = [
    { id: '17', nombre: 'Punta Carretas - Casabó', categoria: 'urbana' },
    { id: '71', nombre: 'Mendoza - Pocitos', categoria: 'urbana' },
    { id: '79', nombre: 'Pocitos - Paso de la Arena', categoria: 'urbana' },
    { id: '300', nombre: 'Instrucciones - Plaza Zitarrosa', categoria: 'urbana' },
    { id: '306', nombre: 'Parque Roosevelt - Casabó', categoria: 'urbana' },
    { id: '316', nombre: 'Cno. Maldonado Km16 - Pocitos', categoria: 'urbana' },
    { id: '328', nombre: 'Mendoza - Punta Carretas', categoria: 'urbana' },
    { id: '329', nombre: 'Punta Carretas - Melilla', categoria: 'urbana' },
    { id: '330', nombre: 'Instrucciones - Ciudadela', categoria: 'urbana' },
    { id: '370', nombre: 'Portones - Playa del Cerro', categoria: 'urbana' },
    { id: '396', nombre: 'Instrucciones - Ciudadela (ABC)', categoria: 'urbana' },
    { id: 'L12', nombre: 'Dique Nacional - Puntas de Sayago', categoria: 'local' },
    { id: 'L13', nombre: 'Local Cerro', categoria: 'local' },
    { id: 'L31', nombre: 'Local 31', categoria: 'local' },
    { id: 'L32', nombre: 'Local 32', categoria: 'local' },
    { id: 'L33', nombre: 'Local 33', categoria: 'local' },
    { id: 'CE1', nombre: 'Especial Costero 1', categoria: 'diferencial' },
    { id: 'PB', nombre: 'Punta Ballena', categoria: 'diferencial' },
    { id: '11A', nombre: 'Línea 11A', categoria: 'metropolitana' },
    { id: '221', nombre: 'Línea 221', categoria: 'metropolitana' },
    { id: '8SR', nombre: 'Santa Rosa', categoria: 'metropolitana' },
    { id: 'DM1', nombre: 'Directo M1', categoria: 'metropolitana' },
    { id: 'LM12', nombre: 'Metropolitana 12', categoria: 'metropolitana' },
    { id: 'LM13', nombre: 'Metropolitana 13', categoria: 'metropolitana' },
    { id: 'U11C', nombre: 'UCOT 11C', categoria: 'metropolitana' },
    { id: 'U11S', nombre: 'UCOT 11S', categoria: 'metropolitana' },
    { id: 'U11T', nombre: 'UCOT 11T', categoria: 'metropolitana' },
    { id: 'XA1', nombre: 'Expreso A1', categoria: 'metropolitana' },
    { id: 'XA2', nombre: 'Expreso A2', categoria: 'metropolitana' },
];
const TIPOS_DIA = ['Hábiles', 'Sábados', 'Domingos'];
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function scrapeLineaTodosLosDias(linea) {
    const horarios = {};
    for (const tipoDia of TIPOS_DIA) {
        try {
            const h = await (0, stmHorariosScraper_1.fetchLineSchedule)(linea.id, tipoDia);
            horarios[tipoDia] = h;
            await sleep(300); // rate-limit básico
        }
        catch (err) {
            // Si la línea no existe en el catálogo STM, abortar completo
            if (String((err === null || err === void 0 ? void 0 : err.message) || '').includes('no está en el catálogo')) {
                return { ok: false, error: err.message };
            }
            // Si solo falla un tipoDia concreto, seguir con los demás
        }
    }
    if (Object.keys(horarios).length === 0) {
        return { ok: false, error: 'Sin horarios para ningún tipoDia' };
    }
    return { ok: true, horarios };
}
async function persistirLinea(linea, horarios) {
    const ref = db.collection('horarios_oficiales').doc(linea.id);
    const dias = {};
    for (const [tipoDia, h] of Object.entries(horarios)) {
        // Variante más representativa: la que tiene MÁS salidas (no la primera del listado).
        const variantesOrdenadas = [...h.variantes].sort((a, b) => b.salidas.length - a.salidas.length);
        // Unimos TODAS las salidas de TODAS las variantes ordenadas por hora de partida.
        // Esto es la fuente real de "frecuencia programada del día".
        const salidasTodas = h.variantes
            .flatMap((v) => v.salidas.map((s) => ({
            desde: s.desde,
            hacia: s.hacia,
            origen: v.origen,
            destino: v.destino,
        })))
            .sort((a, b) => a.desde.localeCompare(b.desde));
        dias[tipoDia] = {
            variantes: variantesOrdenadas.map((v) => ({
                origen: v.origen,
                destino: v.destino,
                frecuenciaMin: v.frecuenciaMin,
                horaInicio: v.horaInicio,
                horaFin: v.horaFin,
                totalSalidas: v.salidas.length,
            })),
            // TODAS las salidas del día, de cualquier variante (usado por /api/ucot/fleet-intel
            // para calcular frecuencia programada real en una ventana horaria).
            salidasDominante: salidasTodas,
            totalSalidas: h.totalSalidas,
            frecuenciaDominanteMin: h.frecuenciaDominanteMin,
            scrapedAt: h.scrapedAt,
        };
    }
    await ref.set({
        linea: linea.id,
        nombre: linea.nombre,
        categoria: linea.categoria,
        dias,
        ultimaActualizacion: admin.firestore.FieldValue.serverTimestamp(),
        fuente: 'stm.horarios.jsf',
    }, { merge: true });
}
async function refrescarTodas() {
    const startMs = Date.now();
    const detalle = {};
    let exitosas = 0;
    let falladas = 0;
    for (const linea of LINEAS_UCOT) {
        const r = await scrapeLineaTodosLosDias(linea);
        if (!r.ok || !r.horarios) {
            detalle[linea.id] = { ok: false, error: r.error };
            falladas++;
            continue;
        }
        try {
            await persistirLinea(linea, r.horarios);
            const total = Object.values(r.horarios).reduce((s, h) => s + h.totalSalidas, 0);
            detalle[linea.id] = { ok: true, tiposDia: Object.keys(r.horarios), totalSalidas: total };
            exitosas++;
        }
        catch (err) {
            detalle[linea.id] = { ok: false, error: `persist: ${(err === null || err === void 0 ? void 0 : err.message) || err}` };
            falladas++;
        }
    }
    const latenciaMs = Date.now() - startMs;
    await db.collection('horarios_oficiales_health').doc('last_run').set({
        ok: exitosas > 0,
        totalLineas: LINEAS_UCOT.length,
        exitosas,
        falladas,
        latenciaMs,
        detalle,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { ok: exitosas > 0, totalLineas: LINEAS_UCOT.length, exitosas, falladas, detalle, latenciaMs };
}
// ─── CRON diario 04:00 America/Montevideo ────────────────────────────────────
exports.refreshHorariosUcotTick = functions
    .runWith({ timeoutSeconds: 540, memory: '512MB' })
    .pubsub.schedule('0 4 * * *')
    .timeZone('America/Montevideo')
    .onRun(async () => {
    console.log('[refreshHorariosUcot] Iniciando scraping diario de horarios oficiales...');
    const res = await refrescarTodas();
    console.log(`[refreshHorariosUcot] ✅ ${res.exitosas}/${res.totalLineas} líneas OK, ${res.falladas} falladas, ${res.latenciaMs}ms`);
    return null;
});
// ─── HTTP trigger manual: refresca todas las líneas o una sola ───────────────
exports.refreshHorariosUcotNow = functions
    .runWith({ timeoutSeconds: 540, memory: '512MB' })
    .https.onRequest(async (req, res) => {
    var _a;
    const lineaFiltro = (_a = req.query.linea) === null || _a === void 0 ? void 0 : _a.trim();
    try {
        if (lineaFiltro) {
            const linea = LINEAS_UCOT.find((l) => l.id === lineaFiltro);
            if (!linea) {
                res.status(404).json({ ok: false, error: `Línea ${lineaFiltro} no está en la lista UCOT` });
                return;
            }
            const r = await scrapeLineaTodosLosDias(linea);
            if (!r.ok || !r.horarios) {
                res.status(502).json({ ok: false, linea: lineaFiltro, error: r.error });
                return;
            }
            await persistirLinea(linea, r.horarios);
            const resumen = {};
            for (const [tipoDia, h] of Object.entries(r.horarios)) {
                resumen[tipoDia] = {
                    variantes: h.variantes.length,
                    totalSalidas: h.totalSalidas,
                    frecuenciaDominanteMin: h.frecuenciaDominanteMin,
                };
            }
            res.json({ ok: true, linea: lineaFiltro, resumen });
            return;
        }
        const result = await refrescarTodas();
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ ok: false, error: (err === null || err === void 0 ? void 0 : err.message) || String(err) });
    }
});
