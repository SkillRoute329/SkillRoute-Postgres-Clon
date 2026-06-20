/**
 * mlRetrainScheduler.ts — Programador de re-entrenamiento semanal para el motor de predicciones ML.
 *
 * FASE 3 Bloque 4 (Sprints 5-6).
 */
import logger from '../config/logger';
import { runExtraction } from '../scripts/extract_training_data';
import { PredictionEngine } from '../services/predictionEngine';
import fs from 'fs';
import path from 'path';

let timer: NodeJS.Timeout | null = null;
let running = false;

const modelPath = path.join(__dirname, '../../data/trained_model.json');

async function runRetrain(): Promise<void> {
  if (running) {
    logger.warn('[ML Scheduler] Re-entrenamiento ya en curso. Salteando.');
    return;
  }
  running = true;
  const t0 = Date.now();
  try {
    logger.info('[ML Scheduler] Iniciando re-entrenamiento automático de ML...');
    
    // 1. Extraer los datos actualizados
    await runExtraction(false);
    
    // 2. Entrenar el modelo
    const metrics = await PredictionEngine.getInstance().trainModel();
    
    logger.info(`[ML Scheduler] Modelo re-entrenado con éxito en ${Math.round((Date.now() - t0) / 1000)}s`, metrics);
  } catch (error) {
    logger.error('[ML Scheduler] Error durante el re-entrenamiento automático de ML:', error);
  } finally {
    running = false;
  }
}

export function startMlRetrainScheduler(): void {
  if (process.env.ML_RETRAIN_ENABLED === 'false') {
    logger.info('[ML Scheduler] Scheduler de re-entrenamiento de ML DESHABILITADO.');
    return;
  }

  // Si no hay modelo entrenado aún, programar entrenamiento inicial inmediato
  if (!fs.existsSync(modelPath)) {
    logger.info('[ML Scheduler] Sin modelo previo. Programando entrenamiento inicial en 5 segundos...');
    setTimeout(() => {
      runRetrain().catch(err => {
        logger.error('[ML Scheduler] Error en entrenamiento inicial:', err);
      });
    }, 5000);
  }

  // Intervalo semanal por defecto (7 días)
  const intervalDays = Number(process.env.ML_RETRAIN_DAYS) || 7;
  const intervalMs = intervalDays * 24 * 60 * 60 * 1000;

  timer = setInterval(() => {
    runRetrain().catch(err => {
      logger.error('[ML Scheduler] Error en ciclo de re-entrenamiento:', err);
    });
  }, intervalMs);

  logger.info(`[ML Scheduler] Scheduler de re-entrenamiento de ML ACTIVO: Cada ${intervalDays} días`);
}

export function stopMlRetrainScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  logger.info('[ML Scheduler] Scheduler de re-entrenamiento de ML DETENIDO');
}
