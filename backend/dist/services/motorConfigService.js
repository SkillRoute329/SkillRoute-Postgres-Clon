"use strict";
/**
 * motorConfigService — Parámetros del motor de consecuencias y los auto-
 * triggers GPS, cargados desde `system_config` con cache (FASE 5.32, 2026-05-21).
 *
 * Antes eran constantes hardcoded en `consequenceController.ts` y
 * `cascadeAutoTriggerScheduler.ts`. Ahora admin las edita en vivo y todo
 * el motor las toma con TTL de 60s (sin reinicio).
 *
 * Clave en system_config: 'config_motor_consecuencias'
 * Defaults razonables si la clave no existe.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULTS = void 0;
exports.getMotorConfig = getMotorConfig;
exports.invalidateMotorConfig = invalidateMotorConfig;
exports.setMotorConfig = setMotorConfig;
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
exports.DEFAULTS = {
    tarifaHoraUyu: 1350,
    subsidioPorKmUyu: 87,
    costoReservaExtraUyu: 1800,
    retrasoThresholdPct: 30,
    retrasoMinBuses: 3,
    cocheFdsMinMin: 5,
    bunchingDistanciaMetros: 500,
    coberturaMinBusesPorLinea: 3,
    headwayMinBuses: 4,
    headwayPegadoMetros: 300,
    headwayLejosMetros: 3000,
    velocidadAnomalaKmhMin: 4,
    velocidadAnomalaMuestraMin: 3,
    inspeccionAusenteDias: 7,
    cooldownLineaMs: 60 * 60 * 1000,
    cooldownCocheMs: 4 * 60 * 60 * 1000,
};
const KEY = 'config_motor_consecuencias';
const TTL_MS = 60000;
let cached = null;
let inflight = null;
function merge(raw) {
    if (!raw || typeof raw !== 'object')
        return { ...exports.DEFAULTS };
    const out = { ...exports.DEFAULTS };
    for (const k of Object.keys(out)) {
        const v = raw[k];
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
            out[k] = v;
        }
    }
    return out;
}
async function fetchFromDb() {
    try {
        const row = await (0, database_1.default)('system_config').where('key', KEY).first();
        const v = row?.value_jsonb;
        const cfg = merge(v && typeof v === 'object' ? v : null);
        cached = { value: cfg, loadedAt: Date.now() };
        return cfg;
    }
    catch (e) {
        logger_1.default.warn('[motorConfig] error leyendo system_config, uso defaults', { err: String(e).slice(0, 100) });
        cached = { value: { ...exports.DEFAULTS }, loadedAt: Date.now() };
        return cached.value;
    }
}
async function getMotorConfig() {
    const now = Date.now();
    if (cached && now - cached.loadedAt < TTL_MS)
        return cached.value;
    if (inflight)
        return inflight;
    inflight = fetchFromDb().finally(() => { inflight = null; });
    return inflight;
}
function invalidateMotorConfig() {
    cached = null;
}
/** Persiste config en system_config y limpia el cache para forzar reload. */
async function setMotorConfig(partial) {
    const current = await getMotorConfig();
    const merged = { ...current, ...partial };
    // Validar tipos antes de guardar
    for (const k of Object.keys(merged)) {
        const v = merged[k];
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
            throw new Error(`Valor inválido para ${String(k)}: ${v}`);
        }
    }
    const exists = await (0, database_1.default)('system_config').where('key', KEY).first();
    if (exists) {
        await (0, database_1.default)('system_config').where('key', KEY).update({ value_jsonb: merged });
    }
    else {
        await (0, database_1.default)('system_config').insert({ key: KEY, value_jsonb: merged });
    }
    invalidateMotorConfig();
    return merged;
}
