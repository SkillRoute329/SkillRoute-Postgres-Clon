import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { logger } from '../config/logger';

const DOWNLOADS_DIR = 'C:/Users/Usuario/Desktop/SkillRoute clon/ucot_downloads';
const DOWNLOADER_SCRIPT = 'C:/Users/Usuario/Desktop/SkillRoute clon/ucot_fleet_downloader.js';

export interface CocheServicioMap {
  [coche: string]: {
    servicio: string;
    timestamp: string;
  };
}

class UcotIntranetService {
  private isRunningSync = false;

  /**
   * Genera un mapeo dinámico Coche -> Servicio leyendo los JSONs descargados.
   * Filtra para devolver únicamente registros recientes (últimas 24 horas por rotación).
   */
  public getActiveSchedules(): CocheServicioMap {
    const map: CocheServicioMap = {};
    try {
      if (!fs.existsSync(DOWNLOADS_DIR)) {
        logger.warn(`[UcotIntranet] Directorio de descargas no existe: ${DOWNLOADS_DIR}`);
        return map;
      }

      const files = fs.readdirSync(DOWNLOADS_DIR);
      const now = Date.now();
      const hours24 = 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(DOWNLOADS_DIR, file);
            const stats = fs.statSync(filePath);
            
            // Solo considerar archivos leídos o modificados en las últimas 24 horas para la rotación diaria
            if (now - stats.mtimeMs > hours24) {
              continue; 
            }

            const raw = fs.readFileSync(filePath, 'utf-8');
            const json = JSON.parse(raw);
            
            if (json.coche && json.servicio) {
              map[String(json.coche)] = {
                servicio: String(json.servicio),
                timestamp: json.timestamp || new Date(stats.mtimeMs).toISOString()
              };
            }
          } catch (err) {
            // Ignorar fallos individuales de parseo
          }
        }
      }
    } catch (error) {
      logger.error('[UcotIntranet] Error leyendo cartones descargados:', error);
    }
    return map;
  }

  /**
   * Inicia el Puppeteer Scraper en segundo plano para descargar cartones del día.
   */
  public triggerDownloader(): { success: boolean; message: string } {
    if (this.isRunningSync) {
      return { success: false, message: 'La sincronización de cartones ya está en progreso.' };
    }

    if (!fs.existsSync(DOWNLOADER_SCRIPT)) {
      logger.error(`[UcotIntranet] Script de descarga no encontrado en: ${DOWNLOADER_SCRIPT}`);
      return { success: false, message: 'El motor de descarga no está instalado en la ruta correcta.' };
    }

    this.isRunningSync = true;
    logger.info('[UcotIntranet] Iniciando ejecución asíncrona de ucot_fleet_downloader.js');

    // Ejecución desacoplada en background
    const child = exec(`node "${DOWNLOADER_SCRIPT}"`, { cwd: path.dirname(DOWNLOADER_SCRIPT) }, (error, stdout, stderr) => {
      this.isRunningSync = false;
      if (error) {
        logger.error('[UcotIntranet] Error en ejecución de downloader:', error);
        return;
      }
      logger.info('[UcotIntranet] Downloader finalizado exitosamente.');
    });

    // No esperamos a que termine la ejecución (toma varios minutos) para no bloquear Express
    return { 
      success: true, 
      message: 'Sincronización UCOT iniciada en segundo plano. Los cartones se cargarán progresivamente.' 
    };
  }

  public getSyncStatus(): { isRunning: boolean } {
    return { isRunning: this.isRunningSync };
  }
}

export const ucotIntranetService = new UcotIntranetService();
