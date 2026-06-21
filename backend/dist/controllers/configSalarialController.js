"use strict";
/**
 * configSalarialController — /api/admin/config-salarial (FASE 5.28, 2026-05-19)
 *
 * Antes 404 (ConfigSalarialTab). Persiste en system_config con dos keys:
 *   - config_salarial_turnos     → { categorias: {...}, vigenciaDesde }
 *   - config_salarial_descuentos → { items: [...],     vigenciaDesde }
 *
 *   GET  /api/admin/config-salarial             → { turnos, descuentos }
 *   PUT  /api/admin/config-salarial/turnos      body: { categorias, vigenciaDesde? }
 *   PUT  /api/admin/config-salarial/descuentos  body: { items, vigenciaDesde? }
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfigSalarial = getConfigSalarial;
exports.putTurnos = putTurnos;
exports.putDescuentos = putDescuentos;
exports.getMotorConfigHandler = getMotorConfigHandler;
exports.putMotorConfigHandler = putMotorConfigHandler;
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
const motorConfigService_1 = require("../services/motorConfigService");
const KEY_TURNOS = 'config_salarial_turnos';
const KEY_DESC = 'config_salarial_descuentos';
async function readConfig(key) {
    const row = await (0, database_1.default)('system_config').where('key', key).first();
    if (!row)
        return null;
    const v = row.value_jsonb;
    return v && typeof v === 'object' ? v : null;
}
async function writeConfig(key, value) {
    const exists = await (0, database_1.default)('system_config').where('key', key).first();
    if (exists) {
        await (0, database_1.default)('system_config').where('key', key).update({ value_jsonb: value });
    }
    else {
        await (0, database_1.default)('system_config').insert({ key, value_jsonb: value });
    }
}
async function getConfigSalarial(_req, res) {
    try {
        const [turnos, descuentos] = await Promise.all([readConfig(KEY_TURNOS), readConfig(KEY_DESC)]);
        res.json({
            ok: true,
            turnos: turnos ?? { categorias: {}, vigenciaDesde: null },
            descuentos: descuentos ?? { items: [], vigenciaDesde: null },
        });
    }
    catch (err) {
        logger_1.default.error('[config-salarial/get]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error leyendo config salarial' });
    }
}
async function putTurnos(req, res) {
    try {
        const body = (req.body ?? {});
        if (!body.categorias || typeof body.categorias !== 'object') {
            res.status(400).json({ ok: false, error: 'Falta categorias' });
            return;
        }
        await writeConfig(KEY_TURNOS, {
            categorias: body.categorias,
            vigenciaDesde: body.vigenciaDesde ?? null,
            updated_at: new Date().toISOString(),
        });
        res.json({ ok: true });
    }
    catch (err) {
        logger_1.default.error('[config-salarial/turnos]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error guardando turnos' });
    }
}
async function putDescuentos(req, res) {
    try {
        const body = (req.body ?? {});
        if (!Array.isArray(body.items)) {
            res.status(400).json({ ok: false, error: 'Falta items[]' });
            return;
        }
        await writeConfig(KEY_DESC, {
            items: body.items,
            vigenciaDesde: body.vigenciaDesde ?? null,
            updated_at: new Date().toISOString(),
        });
        res.json({ ok: true });
    }
    catch (err) {
        logger_1.default.error('[config-salarial/descuentos]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error guardando descuentos' });
    }
}
// ─── FASE 5.32 (2026-05-21) Motor de consecuencias config ─────────────────
async function getMotorConfigHandler(_req, res) {
    try {
        const cfg = await (0, motorConfigService_1.getMotorConfig)();
        res.json({ ok: true, data: cfg, key: 'config_motor_consecuencias' });
    }
    catch (err) {
        logger_1.default.error('[config-motor/get]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error leyendo config motor' });
    }
}
async function putMotorConfigHandler(req, res) {
    try {
        const body = (req.body ?? {});
        const partial = {};
        for (const [k, v] of Object.entries(body)) {
            if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
                partial[k] = v;
            }
        }
        if (Object.keys(partial).length === 0) {
            res.status(400).json({ ok: false, error: 'Body vacío o sin valores numéricos válidos' });
            return;
        }
        const merged = await (0, motorConfigService_1.setMotorConfig)(partial);
        res.json({ ok: true, data: merged });
    }
    catch (err) {
        logger_1.default.error('[config-motor/put]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error guardando config motor: ' + String(err).slice(0, 120) });
    }
}
