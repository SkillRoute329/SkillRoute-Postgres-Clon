"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMlRetrainScheduler = startMlRetrainScheduler;
exports.stopMlRetrainScheduler = stopMlRetrainScheduler;
/**
 * mlRetrainScheduler.ts — Programador de re-entrenamiento semanal para el motor de predicciones ML.
 *
 * FASE 3 Bloque 4 (Sprints 5-6).
 */
const logger_1 = __importDefault(require("../config/logger"));
const extract_training_data_1 = require("../scripts/extract_training_data");
const predictionEngine_1 = require("../services/predictionEngine");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
let timer = null;
let running = false;
const modelPath = path_1.default.join(__dirname, '../../data/trained_model.json');
async function runRetrain() {
    if (running) {
        logger_1.default.warn('[ML Scheduler] Re-entrenamiento ya en curso. Salteando.');
        return;
    }
    running = true;
    const t0 = Date.now();
    try {
        logger_1.default.info('[ML Scheduler] Iniciando re-entrenamiento automático de ML...');
        // 1. Extraer los datos actualizados
        await (0, extract_training_data_1.runExtraction)(false);
        // 2. Entrenar el modelo
        const metrics = await predictionEngine_1.PredictionEngine.getInstance().trainModel();
        logger_1.default.info(`[ML Scheduler] Modelo re-entrenado con éxito en ${Math.round((Date.now() - t0) / 1000)}s`, metrics);
    }
    catch (error) {
        logger_1.default.error('[ML Scheduler] Error durante el re-entrenamiento automático de ML:', error);
    }
    finally {
        running = false;
    }
}
function startMlRetrainScheduler() {
    if (process.env.ML_RETRAIN_ENABLED === 'false') {
        logger_1.default.info('[ML Scheduler] Scheduler de re-entrenamiento de ML DESHABILITADO.');
        return;
    }
    // Si no hay modelo entrenado aún, programar entrenamiento inicial inmediato
    if (!fs_1.default.existsSync(modelPath)) {
        logger_1.default.info('[ML Scheduler] Sin modelo previo. Programando entrenamiento inicial en 5 segundos...');
        setTimeout(() => {
            runRetrain().catch(err => {
                logger_1.default.error('[ML Scheduler] Error en entrenamiento inicial:', err);
            });
        }, 5000);
    }
    // Intervalo semanal por defecto (7 días)
    const intervalDays = Number(process.env.ML_RETRAIN_DAYS) || 7;
    const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
    timer = setInterval(() => {
        runRetrain().catch(err => {
            logger_1.default.error('[ML Scheduler] Error en ciclo de re-entrenamiento:', err);
        });
    }, intervalMs);
    logger_1.default.info(`[ML Scheduler] Scheduler de re-entrenamiento de ML ACTIVO: Cada ${intervalDays} días`);
}
function stopMlRetrainScheduler() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
    logger_1.default.info('[ML Scheduler] Scheduler de re-entrenamiento de ML DETENIDO');
}
