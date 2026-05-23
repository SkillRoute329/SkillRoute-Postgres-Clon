/**
 * ucotCartonesScheduler — dispara el scraper de cartones UCOT en forma
 * sostenida para que la descarga NO se detenga.
 *
 * FASE 5.17 (2026-05-16): el scraper `ucot_fleet_downloader.js` era un
 * one-shot SIN scheduler — se corrió a mano una vez el 2026-05-13 y la
 * tabla `cartones_completados` quedó congelada (el watcher PM2 seguía vivo
 * reprocesando los mismos 83 archivos). Esto provee el disparador periódico
 * que faltaba. El watcher PM2 (vivo) ingesta los JSON nuevos en ≤30s.
 *
 * Diseño:
 *   - Env-gated por UCOT_DOWNLOADER_ENABLED (default OFF: usa credenciales
 *     corporativas reales de UCOT contra su web — se habilita a conciencia).
 *   - Sólo en horario de servicio (UCOT_DOWNLOADER_HORAS, default 5–23 MVD)
 *     para no golpear la web de UCOT de madrugada.
 *   - Intervalo amplio (default 30 min) configurable por
 *     UCOT_DOWNLOADER_INTERVAL_MIN. La rotación del día no cambia seguido.
 *   - Guard reentrante propio de ucotIntranetService.triggerDownloader()
 *     (isRunningSync): si una corrida tarda, no se encola otra.
 */
import { ucotIntranetService } from '../services/ucotIntranetService';
import logger from '../config/logger';

let timer: NodeJS.Timeout | null = null;

function horaMvd(): number {
  const h = new Date().toLocaleString('en-US', {
    timeZone: 'America/Montevideo',
    hour: '2-digit',
    hour12: false,
  });
  return Number(h.replace(/\D/g, '')) || 0;
}

function tick(): void {
  const [hIni, hFin] = (process.env.UCOT_DOWNLOADER_HORAS || '5-23')
    .split('-')
    .map((x) => Number(x));
  const h = horaMvd();
  if (h < (hIni ?? 5) || h >= (hFin ?? 23)) {
    return; // fuera de horario de servicio
  }
  const r = ucotIntranetService.triggerDownloader();
  if (r.success) logger.info(`[ucotCartones] disparo programado: ${r.message}`);
  else logger.warn(`[ucotCartones] disparo omitido: ${r.message}`);
}

export function startUcotCartonesScheduler(): void {
  if (process.env.UCOT_DOWNLOADER_ENABLED !== 'true') {
    logger.info(
      '[ucotCartones] scheduler DESHABILITADO (UCOT_DOWNLOADER_ENABLED!=true). ' +
        'La descarga de cartones no correrá automáticamente hasta habilitarlo.',
    );
    return;
  }
  const intervalMin = Number(process.env.UCOT_DOWNLOADER_INTERVAL_MIN) || 30;
  // Primer disparo a los 90s del arranque (dar tiempo al poller a poblar
  // bus_last_pos, de donde el scraper saca la flota activa).
  setTimeout(tick, 90_000);
  timer = setInterval(tick, intervalMin * 60_000);
  logger.info(
    `[ucotCartones] scheduler ACTIVO: cada ${intervalMin} min, ` +
      `horario ${process.env.UCOT_DOWNLOADER_HORAS || '5-23'} MVD`,
  );
}

export function stopUcotCartonesScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
