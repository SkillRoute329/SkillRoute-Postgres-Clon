/**
 * horariosControlScheduler — refresca stm_horarios_control a diario.
 *
 * FASE 5.17 (2026-05-16): la fuente IMM (horarios por punto de control) se
 * publica DIARIAMENTE. ingest_horarios_control.sh es idempotente por fecha
 * de snapshot y transaccional (si falla, ROLLBACK; tabla previa intacta).
 *
 * Env-gated por HORARIOS_CTRL_ENABLED (default OFF). Intervalo por
 * HORARIOS_CTRL_HORAS (default 24 h).
 */
import { exec } from 'child_process';
import * as path from 'path';
import logger from '../config/logger';

let timer: NodeJS.Timeout | null = null;
let corriendo = false;

const SCRIPT = path.join(path.resolve(__dirname, '..', '..'), 'scripts', 'ingest_horarios_control.sh');

function corrida(): void {
  if (corriendo) {
    logger.warn('[horariosCtrl] corrida anterior en curso, salteando');
    return;
  }
  corriendo = true;
  const t0 = Date.now();
  exec(`bash "${SCRIPT}"`, { shell: 'bash', maxBuffer: 16 * 1024 * 1024 }, (err, _o, stderr) => {
    corriendo = false;
    if (err) {
      logger.error('[horariosCtrl] falló (tabla previa intacta por la tx)', {
        err: String(err),
        stderr: String(stderr).slice(-300),
      });
      return;
    }
    logger.info(`[horariosCtrl] horarios STM por punto de control refrescados en ${Math.round((Date.now() - t0) / 1000)}s`);
  });
}

export function startHorariosControlScheduler(): void {
  if (process.env.HORARIOS_CTRL_ENABLED !== 'true') {
    logger.info('[horariosCtrl] scheduler DESHABILITADO (HORARIOS_CTRL_ENABLED!=true)');
    return;
  }
  const horas = Number(process.env.HORARIOS_CTRL_HORAS) || 24;
  setTimeout(corrida, 5 * 60_000); // 5 min post-arranque
  timer = setInterval(corrida, horas * 60 * 60_000);
  logger.info(`[horariosCtrl] scheduler ACTIVO: cada ${horas} h`);
}

export function stopHorariosControlScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
