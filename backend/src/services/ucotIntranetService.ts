import { logger } from '../config/logger';
import { immApiClient } from '../ingestion/ImmApiClient';
import { dataUploader } from '../ingestion/DataUploader';

export interface CocheServicioMap {
  [coche: string]: {
    servicio: string;
    timestamp: string;
  };
}

class UcotIntranetService {
  private isRunningSync = false;
  private memoryCache: CocheServicioMap = {};

  /**
   * Retorna el mapeo Coche -> Servicio (Linea/Variante) desde la memoria caché.
   * La fuente de verdad es la API oficial de la IMM.
   */
  public getActiveSchedules(): CocheServicioMap {
    return this.memoryCache;
  }

  /**
   * Renombrado de triggerDownloader según Plan Estratégico.
   * Hace una llamada síncrona a la API IMM y carga los datos de forma atómica en BD.
   */
  public async syncWithImmApi(): Promise<{ success: boolean; message: string }> {
    if (this.isRunningSync) {
      return { success: false, message: 'La sincronización con la API IMM ya está en progreso.' };
    }

    this.isRunningSync = true;
    logger.info('[UcotIntranet] Iniciando sincronización con API oficial IMM...');

    try {
      // 1. Consumir JSON oficial desde IMM
      const buses = await immApiClient.fetchBusesWithBackoff(3, 1000);
      
      // 2. Actualizar caché en memoria instantáneamente
      this.memoryCache = {};
      buses.filter(b => b.company.toUpperCase().includes('UCOT')).forEach(bus => {
        this.memoryCache[String(bus.busId)] = {
          servicio: String(bus.lineVariantId || bus.line),
          timestamp: bus.timestamp
        };
      });

      // 3. Persistencia Atómica
      const inserted = await dataUploader.uploadToCartonesCompletados(buses, 'UCOT');
      
      this.isRunningSync = false;
      return {
        success: true,
        message: `Sincronización exitosa con IMM. ${inserted} registros actualizados atómicamente.`
      };
    } catch (error) {
      this.isRunningSync = false;
      logger.error('[UcotIntranet] Fallo en sincronización con API IMM:', error);
      return {
        success: false,
        message: `Fallo al sincronizar: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  public getSyncStatus(): { isRunning: boolean } {
    return { isRunning: this.isRunningSync };
  }
}

export const ucotIntranetService = new UcotIntranetService();
