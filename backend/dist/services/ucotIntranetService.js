"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ucotIntranetService = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const logger_1 = require("../config/logger");
const DOWNLOADS_DIR = 'C:/Users/Usuario/Desktop/SkillRoute clon/ucot_downloads';
const DOWNLOADER_SCRIPT = 'C:/Users/Usuario/Desktop/SkillRoute clon/ucot_fleet_downloader.js';
class UcotIntranetService {
    constructor() {
        this.isRunningSync = false;
    }
    /**
     * Genera un mapeo dinámico Coche -> Servicio leyendo los JSONs descargados.
     * Filtra para devolver únicamente registros recientes (últimas 24 horas por rotación).
     */
    getActiveSchedules() {
        const map = {};
        try {
            if (!fs.existsSync(DOWNLOADS_DIR)) {
                logger_1.logger.warn(`[UcotIntranet] Directorio de descargas no existe: ${DOWNLOADS_DIR}`);
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
                    }
                    catch (err) {
                        // Ignorar fallos individuales de parseo
                    }
                }
            }
        }
        catch (error) {
            logger_1.logger.error('[UcotIntranet] Error leyendo cartones descargados:', error);
        }
        return map;
    }
    /**
     * Inicia el Puppeteer Scraper en segundo plano para descargar cartones del día.
     */
    triggerDownloader() {
        if (this.isRunningSync) {
            return { success: false, message: 'La sincronización de cartones ya está en progreso.' };
        }
        if (!fs.existsSync(DOWNLOADER_SCRIPT)) {
            logger_1.logger.error(`[UcotIntranet] Script de descarga no encontrado en: ${DOWNLOADER_SCRIPT}`);
            return { success: false, message: 'El motor de descarga no está instalado en la ruta correcta.' };
        }
        this.isRunningSync = true;
        logger_1.logger.info('[UcotIntranet] Iniciando ejecución asíncrona de ucot_fleet_downloader.js');
        // Ejecución desacoplada en background
        const child = (0, child_process_1.exec)(`node "${DOWNLOADER_SCRIPT}"`, { cwd: path.dirname(DOWNLOADER_SCRIPT) }, (error, stdout, stderr) => {
            this.isRunningSync = false;
            if (error) {
                logger_1.logger.error('[UcotIntranet] Error en ejecución de downloader:', error);
                return;
            }
            logger_1.logger.info('[UcotIntranet] Downloader finalizado exitosamente.');
        });
        // No esperamos a que termine la ejecución (toma varios minutos) para no bloquear Express
        return {
            success: true,
            message: 'Sincronización UCOT iniciada en segundo plano. Los cartones se cargarán progresivamente.'
        };
    }
    getSyncStatus() {
        return { isRunning: this.isRunningSync };
    }
}
exports.ucotIntranetService = new UcotIntranetService();
