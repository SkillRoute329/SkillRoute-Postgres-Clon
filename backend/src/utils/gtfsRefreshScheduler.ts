/**
 * gtfsRefreshScheduler — refresca el GTFS oficial IMM en forma sostenida.
 *
 * FASE 5.17 (2026-05-16): el GTFS del clon estaba correcto pero NO había
 * mecanismo automático de refresco (la carga era manual) → riesgo de quedar
 * desactualizado para la auditoría IMM. Esto descarga el feed oficial
 * (OAuth IMM_CLIENT_ID/SECRET) y lo recarga con reload_gtfs_safe.sh
 * (TRUNCATE + \copy transaccional: si falla, ROLLBACK y gtfs queda intacto;
 * preserva la vista `lineas`).
 *
 * Env-gated por GTFS_REFRESH_ENABLED (default OFF). Intervalo amplio
 * (default 24 h) por GTFS_REFRESH_HORAS — el feed IMM cambia ~semanal.
 */
import { exec } from 'child_process';
import * as path from 'path';
import logger from '../config/logger';

let timer: NodeJS.Timeout | null = null;
let corriendo = false;

const REPO_BACKEND = path.resolve(__dirname, '..', '..');
const DOWNLOAD_JS = path.join(REPO_BACKEND, 'scripts', 'download_gtfs_premium.js');
const RELOAD_SH = path.join(REPO_BACKEND, 'scripts', 'reload_gtfs_safe.sh');
const GTFS_DIR = 'C:/SkillRoute_Master/data_imports/gtfs_premium';
const ZIP = 'C:/SkillRoute_Master/data_imports/google_transit_premium.zip';

function corrida(): void {
  if (corriendo) {
    logger.warn('[gtfsRefresh] corrida anterior aún en curso, salteando');
    return;
  }
  corriendo = true;
  const t0 = Date.now();
  // download → unzip → reload transaccional seguro.
  const cmd =
    `node "${DOWNLOAD_JS}" && ` +
    `rm -rf "${GTFS_DIR}" && mkdir -p "${GTFS_DIR}" && ` +
    `cd "${GTFS_DIR}" && unzip -o "${ZIP}" >/dev/null && ` +
    `bash "${RELOAD_SH}" "${GTFS_DIR}"`;
  exec(cmd, { shell: 'bash', maxBuffer: 64 * 1024 * 1024 }, (err, _out, stderr) => {
    corriendo = false;
    if (err) {
      logger.error('[gtfsRefresh] falló (gtfs queda intacto por la tx)', {
        err: String(err),
        stderr: String(stderr).slice(-400),
      });
      return;
    }
    logger.info(`[gtfsRefresh] GTFS oficial refrescado en ${Math.round((Date.now() - t0) / 1000)}s`);
  });
}

export function startGtfsRefreshScheduler(): void {
  if (process.env.GTFS_REFRESH_ENABLED !== 'true') {
    logger.info('[gtfsRefresh] scheduler DESHABILITADO (GTFS_REFRESH_ENABLED!=true)');
    return;
  }
  const horas = Number(process.env.GTFS_REFRESH_HORAS) || 24;
  // Primera corrida 10 min post-arranque (no competir con el boot).
  setTimeout(corrida, 10 * 60_000);
  timer = setInterval(corrida, horas * 60 * 60_000);
  logger.info(`[gtfsRefresh] scheduler ACTIVO: cada ${horas} h`);
}

export function stopGtfsRefreshScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
