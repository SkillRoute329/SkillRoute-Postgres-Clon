/**
 * cartonesHistorialScheduler — snapshot periódico del historial coche→servicio.
 *
 * FASE 5.17 (2026-05-16): copia el estado del día de cartones_completados a
 * cartones_historial (append idempotente) para análisis de distribución y
 * sustituciones. Es DB→DB interno (sin llamadas externas) → seguro;
 * env-gated por HISTORIAL_CARTONES_ENABLED (default ON).
 */
import { snapshotHistorial } from '../services/cartonesHistorialService';
import logger from '../config/logger';

let timer: NodeJS.Timeout | null = null;

async function tick(): Promise<void> {
  try {
    await snapshotHistorial('70');
  } catch (e) {
    logger.error('[cartonesHistorial] snapshot falló', { err: String(e) });
  }
}

export function startCartonesHistorialScheduler(): void {
  if (process.env.HISTORIAL_CARTONES_ENABLED === 'false') {
    logger.info('[cartonesHistorial] scheduler DESHABILITADO (HISTORIAL_CARTONES_ENABLED=false)');
    return;
  }
  const horas = Number(process.env.HISTORIAL_CARTONES_HORAS) || 3;
  setTimeout(() => void tick(), 2 * 60_000); // 2 min post-arranque
  timer = setInterval(() => void tick(), horas * 60 * 60_000);
  logger.info(`[cartonesHistorial] scheduler ACTIVO: cada ${horas} h`);
}

export function stopCartonesHistorialScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
