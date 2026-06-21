"use strict";
/**
 * alertasCaducidadScheduler — Auto-caducidad de alertas viejas
 * (FASE 5.38, 2026-05-22).
 *
 * Corre cada 4 horas y marca como atendidas (con razón "auto:caducada")
 * las alertas de regulación que llevan >24h sin atención humana. También
 * desactiva alertas de tráfico viejas. Evita que se acumulen alertas
 * obsoletas como las 200+ horas reportadas.
 *
 * Umbral por defecto: 24h. Se puede ajustar via env
 * `ALERTAS_CADUCIDAD_HORAS`. La purga emite `bus:alertas:purgadas`.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAlertasCaducidad = startAlertasCaducidad;
exports.stopAlertasCaducidad = stopAlertasCaducidad;
const logger_1 = __importDefault(require("../config/logger"));
const alertasMantenimientoController_1 = require("../controllers/alertasMantenimientoController");
const TICK_MS = 4 * 60 * 60 * 1000; // 4h
const DEFAULT_ANTIGUEDAD_HORAS = 24;
let _timer = null;
async function tick() {
    const horas = Number(process.env.ALERTAS_CADUCIDAD_HORAS ?? DEFAULT_ANTIGUEDAD_HORAS);
    try {
        const r = await (0, alertasMantenimientoController_1.correrPurgaProgramada)(horas);
        if (r.regulacion > 0 || r.trafico > 0 || r.motor > 0) {
            logger_1.default.info(`[alertasCaducidad] purgadas (>${horas}h) · regulacion=${r.regulacion} trafico=${r.trafico} motor=${r.motor}`);
        }
    }
    catch (e) {
        logger_1.default.warn('[alertasCaducidad] tick error', { err: String(e).slice(0, 200) });
    }
}
function startAlertasCaducidad() {
    if (_timer)
        return;
    const horas = Number(process.env.ALERTAS_CADUCIDAD_HORAS ?? DEFAULT_ANTIGUEDAD_HORAS);
    logger_1.default.info(`[alertasCaducidad] ACTIVO · cada ${TICK_MS / 1000 / 60}min · purga regulacion/trafico >${horas}h sin atender`);
    // Primer tick demorado 60s para no interferir con el arranque.
    setTimeout(() => { void tick(); }, 60000);
    _timer = setInterval(() => { void tick(); }, TICK_MS);
}
function stopAlertasCaducidad() {
    if (_timer) {
        clearInterval(_timer);
        _timer = null;
    }
}
