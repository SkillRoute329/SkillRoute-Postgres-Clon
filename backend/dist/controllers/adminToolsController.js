"use strict";
/**
 * adminToolsController — endpoints admin de menor uso (FASE 5.28, 2026-05-19)
 *
 * Centraliza endpoints que el frontend referencia pero que en este stack
 * son no-críticos, peligrosos o ya están cargados via otra vía:
 *
 *   POST /api/admin/seed-*           → seeds legacy; responde alreadyLoaded
 *   PUT  /api/system-config          → guardar valores globales en system_config
 *   POST /api/emergency/wipe-all     → DESHABILITADO en este stack
 *   GET  /api/debug/force-seed       → DESHABILITADO en este stack
 *   GET  /api/simulation/report      → vacío honesto
 *   POST /api/simulation/reset       → no-op con log
 *   GET  /api/data-import/template   → CSV template para AdminUsers
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postSeedLegacy = postSeedLegacy;
exports.putSystemConfig = putSystemConfig;
exports.postEmergencyWipeAll = postEmergencyWipeAll;
exports.getDebugForceSeed = getDebugForceSeed;
exports.getSimulationReport = getSimulationReport;
exports.postSimulationReset = postSimulationReset;
exports.getDataImportTemplate = getDataImportTemplate;
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
// ─── /api/admin/seed-* ─────────────────────────────────────────────────────
// Mapeo seed → tabla(s) cuyo count valida que el dato ya está cargado.
const SEED_MAP = {
    'seed-personal-ucot': { table: 'personal', descripcion: '691+ empleados UCOT' },
    'seed-vehicles-ucot': { table: 'vehiculos', descripcion: '257 coches UCOT' },
    'seed-horarios-ucot': { table: 'cartones_completados', descripcion: 'Cartones hábiles invierno' },
    'seed-sabado-ucot': { table: 'cartones_completados', descripcion: 'Cartones sábado verano' },
    'seed-boletin-ucot': { table: 'cartones_completados', descripcion: 'Boletín hábil' },
    'seed-rotacion-ucot': { table: 'cartones_historial', descripcion: 'Rotación diaria capturada' },
    'seed-boletin-verano-ucot': { table: 'cartones_completados', descripcion: 'Boletín verano' },
};
async function postSeedLegacy(req, res) {
    const which = String(req.params.which ?? '').replace(/^\/+/, '');
    const meta = SEED_MAP[which];
    if (!meta) {
        res.status(404).json({ ok: false, error: `Seed legacy desconocido: ${which}` });
        return;
    }
    try {
        const row = await (0, database_1.default)(meta.table).count({ count: '*' }).first();
        const count = Number(row?.count ?? 0);
        res.json({
            ok: true,
            alreadyLoaded: count > 0,
            table: meta.table,
            count,
            message: count > 0
                ? `${meta.descripcion}: ya cargado (${count} filas). Re-import disponible vía /api/data-import.`
                : `${meta.descripcion}: tabla ${meta.table} vacía. Cargar manualmente vía /api/cartones/bulk u otra ingesta dedicada.`,
        });
    }
    catch (err) {
        logger_1.default.error('[admin/seed-legacy]', { error: String(err), which });
        res.status(500).json({ ok: false, error: 'Error consultando estado del seed' });
    }
}
// ─── /api/system-config (PUT) ──────────────────────────────────────────────
async function putSystemConfig(req, res) {
    try {
        const body = (req.body ?? {});
        const key = String(body.key ?? body.k ?? 'global_config').trim();
        const value = body.value ?? body.v ?? body;
        const exists = await (0, database_1.default)('system_config').where('key', key).first();
        if (exists) {
            await (0, database_1.default)('system_config').where('key', key).update({ value_jsonb: value });
        }
        else {
            await (0, database_1.default)('system_config').insert({ key, value_jsonb: value });
        }
        res.json({ ok: true, key });
    }
    catch (err) {
        logger_1.default.error('[system-config/put]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error guardando configuración' });
    }
}
// ─── DESHABILITADOS por seguridad ──────────────────────────────────────────
function postEmergencyWipeAll(_req, res) {
    // Wipe destructivo de toda la base: rechazado conscientemente para que
    // un click accidental NO ponga la operación en cero. Si se requiere, hay
    // que correr el script DROP+restore desde shell con la fuente original.
    res.status(403).json({
        ok: false,
        error: 'Operación DESHABILITADA. Wipe global solo desde shell con backup verificado.',
    });
}
function getDebugForceSeed(_req, res) {
    res.status(403).json({
        ok: false,
        error: 'Endpoint legacy DESHABILITADO. Usar /api/data-import para importar datos.',
    });
}
// ─── /api/simulation/* (compatibilidad con AdminStressTest) ────────────────
function getSimulationReport(_req, res) {
    res.json({
        ok: true,
        active: false,
        nota: 'Simulación no activa en este stack. AdminStressTest opera en modo demo (local-only).',
    });
}
function postSimulationReset(_req, res) {
    res.json({ ok: true, reset: true, nota: 'No-op: ningún simulador corriendo en backend.' });
}
// ─── /api/data-import/template ─────────────────────────────────────────────
function getDataImportTemplate(_req, res) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla_empleados.csv"');
    res.send('internalNumber,firstName,lastName,email,role\n');
}
