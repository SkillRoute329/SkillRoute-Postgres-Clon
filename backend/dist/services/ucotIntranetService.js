"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ucotIntranetService = void 0;
const logger_1 = require("../config/logger");
const ImmApiClient_1 = require("../ingestion/ImmApiClient");
const DataUploader_1 = require("../ingestion/DataUploader");
class UcotIntranetService {
    constructor() {
        this.isRunningSync = false;
        this.memoryCache = {};
    }
    /**
     * Retorna el mapeo Coche -> Servicio (Linea/Variante) desde la memoria caché.
     * La fuente de verdad es la API oficial de la IMM.
     */
    getActiveSchedules() {
        return this.memoryCache;
    }
    /**
     * Renombrado de triggerDownloader según Plan Estratégico.
     * Hace una llamada síncrona a la API IMM y carga los datos de forma atómica en BD.
     */
    async syncWithImmApi() {
        if (this.isRunningSync) {
            return { success: false, message: 'La sincronización con la API IMM ya está en progreso.' };
        }
        this.isRunningSync = true;
        logger_1.logger.info('[UcotIntranet] Iniciando sincronización con API oficial IMM...');
        try {
            // 1. Consumir JSON oficial desde IMM
            const buses = await ImmApiClient_1.immApiClient.fetchBusesWithBackoff(3, 1000);
            // 2. Actualizar caché en memoria instantáneamente
            this.memoryCache = {};
            buses.filter(b => b.company.toUpperCase().includes('UCOT')).forEach(bus => {
                this.memoryCache[String(bus.busId)] = {
                    servicio: String(bus.lineVariantId || bus.line),
                    timestamp: bus.timestamp
                };
            });
            // 3. Persistencia Atómica
            const inserted = await DataUploader_1.dataUploader.uploadToCartonesCompletados(buses, 'UCOT');
            this.isRunningSync = false;
            return {
                success: true,
                message: `Sincronización exitosa con IMM. ${inserted} registros actualizados atómicamente.`
            };
        }
        catch (error) {
            this.isRunningSync = false;
            logger_1.logger.error('[UcotIntranet] Fallo en sincronización con API IMM:', error);
            return {
                success: false,
                message: `Fallo al sincronizar: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
    getSyncStatus() {
        return { isRunning: this.isRunningSync };
    }
}
exports.ucotIntranetService = new UcotIntranetService();
