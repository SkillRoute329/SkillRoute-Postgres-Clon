/**
 * conteoVehicularScheduler — refresca conteo_vehicular (mes en curso).
 *
 * FASE 5.17 (2026-05-16): el dataset IMM de conteo del mes en curso se
 * actualiza durante el mes. ingest_conteo_vehicular.sh es idempotente por
 * archivo y transaccional. Env-gated por CONTEO_VEHICULAR_ENABLED.
 */
import { exec } from 'child_process';
import * as path from 'path';
import logger from '../config/logger';

let timer: NodeJS.Timeout | null = null;
let corriendo = false;
const SCRIPT = path.join(path.resolve(__dirname, '..', '..'), 'scripts', 'ingest_conteo_vehicular.sh');

function corrida(): void {
  if (corriendo) {
    logger.warn('[conteoVeh] corrida anterior en curso, salteando');
    return;
  }
  corriendo = true;
  const t0 = Date.now();
  exec(`bash "${SCRIPT}"`, { shell: 'bash', maxBuffer: 16 * 1024 * 1024 }, (err, _o, stderr) => {
    corriendo = false;
    if (err) {
      logger.error('[conteoVeh] falló (tabla previa intacta por la tx)', {
        err: String(err),
        stderr: String(stderr).slice(-300),
      });
      return;
    }
    logger.info(`[conteoVeh] conteo vehicular refrescado en ${Math.round((Date.now() - t0) / 1000)}s`);
  });
}

export function startConteoVehicularScheduler(): void {
  if (process.env.CONTEO_VEHICULAR_ENABLED !== 'true') {
    logger.info('[conteoVeh] scheduler DESHABILITADO (CONTEO_VEHICULAR_ENABLED!=true)');
    return;
  }
  const horas = Number(process.env.CONTEO_VEHICULAR_HORAS) || 24;
  setTimeout(corrida, 8 * 60_000);
  timer = setInterval(corrida, horas * 60 * 60_000);
  logger.info(`[conteoVeh] scheduler ACTIVO: cada ${horas} h`);
}

export function stopConteoVehicularScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
