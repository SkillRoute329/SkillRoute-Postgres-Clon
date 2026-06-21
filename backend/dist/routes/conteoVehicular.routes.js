"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * conteoVehicular.routes.ts (FASE 5.17) — conteo vehicular IMM por avenida.
 * Contexto de tráfico para explicar atrasos GPS en la auditoría.
 */
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
const router = (0, express_1.Router)();
router.use(auth_1.verifyAuth);
router.get('/meta', async (_req, res) => {
    try {
        const ing = await (0, database_1.default)('conteo_vehicular_ingestados').orderBy('mes', 'desc');
        res.json({ ok: true, ingestados: ing });
    }
    catch (err) {
        logger_1.default.error('[conteo/meta]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
/** GET /api/conteo-vehicular?avenida=&fecha=&hora= — volumen por avenida/hora. */
router.get('/', async (req, res) => {
    try {
        const { avenida, fecha, hora } = req.query;
        let q = (0, database_1.default)('conteo_vehicular')
            .select('dsc_avenida', 'fecha', 'hora')
            .avg('volumen_hora_prom as vol_prom')
            .max('volumen_hora_max as vol_max')
            .sum('muestras as muestras')
            .groupBy('dsc_avenida', 'fecha', 'hora')
            .orderBy([{ column: 'fecha' }, { column: 'hora' }])
            .limit(Math.min(Number(req.query.limit) || 1000, 10000));
        if (avenida)
            q = q.where('dsc_avenida', 'ilike', `%${avenida}%`);
        if (fecha)
            q = q.where('fecha', String(fecha));
        if (hora)
            q = q.where('hora', Number(hora));
        const rows = await q;
        res.json({ ok: true, total: rows.length, conteo: rows });
    }
    catch (err) {
        logger_1.default.error('[conteo]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
/** GET /api/conteo-vehicular/velocidad/meta — snapshots de velocidad. */
router.get('/velocidad/meta', async (_req, res) => {
    try {
        const ing = await (0, database_1.default)('velocidad_vehicular_ingestados').orderBy('mes', 'desc');
        res.json({ ok: true, ingestados: ing });
    }
    catch (err) {
        logger_1.default.error('[velocidad/meta]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
/**
 * GET /api/conteo-vehicular/velocidad?avenida=&fecha=&hora=
 * Velocidad comercial real por avenida/hora — contexto y predicción de
 * atrasos de buses (velocidad baja en una avenida → atraso esperado).
 */
router.get('/velocidad', async (req, res) => {
    try {
        const { avenida, fecha, hora } = req.query;
        let q = (0, database_1.default)('velocidad_vehicular')
            .select('dsc_avenida', 'fecha', 'hora')
            .avg('velocidad_prom as vel_prom')
            .min('velocidad_min as vel_min')
            .sum('muestras as muestras')
            .groupBy('dsc_avenida', 'fecha', 'hora')
            .orderBy([{ column: 'fecha' }, { column: 'hora' }])
            .limit(Math.min(Number(req.query.limit) || 1000, 10000));
        if (avenida)
            q = q.where('dsc_avenida', 'ilike', `%${avenida}%`);
        if (fecha)
            q = q.where('fecha', String(fecha));
        if (hora)
            q = q.where('hora', Number(hora));
        const rows = await q;
        res.json({ ok: true, total: rows.length, velocidad: rows });
    }
    catch (err) {
        logger_1.default.error('[velocidad]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
exports.default = router;
