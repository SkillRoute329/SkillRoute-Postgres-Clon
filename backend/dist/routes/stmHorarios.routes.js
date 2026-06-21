"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * stmHorarios.routes.ts (FASE 5.17 — 2026-05-16)
 *
 * Horarios teóricos STM por punto de control (tabla stm_horarios_control,
 * fuente oficial IMM diaria). Cubre hábil/sábado/FESTIVO — el regulador
 * independiente del GTFS (sin OAuth) y la base para validar el cartón UCOT
 * y los domingos que antes no resolvíamos.
 */
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
const router = (0, express_1.Router)();
router.use(auth_1.verifyAuth);
/** GET /api/stm-horarios/meta — estado del snapshot ingestado. */
router.get('/meta', async (_req, res) => {
    try {
        const ing = await (0, database_1.default)('stm_horarios_control_ingestados')
            .orderBy('snapshot_fecha', 'desc')
            .first();
        const porTipo = await (0, database_1.default)('stm_horarios_control')
            .select('tipo_dia')
            .count('* as count')
            .groupBy('tipo_dia');
        res.json({ ok: true, snapshot: ing ?? null, porTipoDia: porTipo });
    }
    catch (err) {
        logger_1.default.error('[stm-horarios/meta]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
/**
 * GET /api/stm-horarios/control?linea=&tipo_dia=&codigo_punto=&limit=
 * Horarios por punto de control filtrables. tipo_dia: habil|sabado|festivo.
 */
router.get('/control', async (req, res) => {
    try {
        // `linea` filtra por el número PÚBLICO de línea (columna `linea`),
        // que es como piensa el usuario; `cod_linea` es el código interno STM.
        const { linea, cod_linea, tipo_dia, codigo_punto } = req.query;
        const limit = Math.min(Number(req.query.limit) || 2000, 20000);
        let q = (0, database_1.default)('stm_horarios_control')
            .select('cod_linea', 'linea', 'sublinea', 'variante', 'codigo_minuta', 'tipo_dia', 'codigo_punto', 'hora', 'fecha_desde')
            .orderBy([{ column: 'cod_linea' }, { column: 'codigo_punto' }, { column: 'hora' }])
            .limit(limit);
        if (linea)
            q = q.where('linea', String(linea));
        if (cod_linea)
            q = q.where('cod_linea', String(cod_linea));
        if (tipo_dia)
            q = q.where('tipo_dia', String(tipo_dia));
        if (codigo_punto)
            q = q.where('codigo_punto', String(codigo_punto));
        const rows = await q;
        res.json({ ok: true, total: rows.length, horarios: rows });
    }
    catch (err) {
        logger_1.default.error('[stm-horarios/control]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
exports.default = router;
