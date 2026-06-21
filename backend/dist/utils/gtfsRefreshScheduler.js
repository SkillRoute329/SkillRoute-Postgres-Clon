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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startGtfsRefreshScheduler = startGtfsRefreshScheduler;
exports.stopGtfsRefreshScheduler = stopGtfsRefreshScheduler;
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
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const logger_1 = __importDefault(require("../config/logger"));
let timer = null;
let corriendo = false;
const REPO_BACKEND = path.resolve(__dirname, '..', '..');
const DOWNLOAD_JS = path.join(REPO_BACKEND, 'scripts', 'download_gtfs_premium.js');
const RELOAD_SH = path.join(REPO_BACKEND, 'scripts', 'reload_gtfs_safe.sh');
const GTFS_DIR = 'C:/SkillRoute_Master/data_imports/gtfs_premium';
const ZIP = 'C:/SkillRoute_Master/data_imports/google_transit_premium.zip';
function corrida() {
    if (corriendo) {
        logger_1.default.warn('[gtfsRefresh] corrida anterior aún en curso, salteando');
        return;
    }
    corriendo = true;
    const t0 = Date.now();
    // download → unzip → reload transaccional seguro.
    const cmd = `node "${DOWNLOAD_JS}" && ` +
        `rm -rf "${GTFS_DIR}" && mkdir -p "${GTFS_DIR}" && ` +
        `cd "${GTFS_DIR}" && unzip -o "${ZIP}" >/dev/null && ` +
        `bash "${RELOAD_SH}" "${GTFS_DIR}"`;
    (0, child_process_1.exec)(cmd, { shell: 'bash', maxBuffer: 64 * 1024 * 1024 }, (err, _out, stderr) => {
        corriendo = false;
        if (err) {
            logger_1.default.error('[gtfsRefresh] falló (gtfs queda intacto por la tx)', {
                err: String(err),
                stderr: String(stderr).slice(-400),
            });
            return;
        }
        logger_1.default.info(`[gtfsRefresh] GTFS oficial refrescado en ${Math.round((Date.now() - t0) / 1000)}s`);
    });
}
function startGtfsRefreshScheduler() {
    if (process.env.GTFS_REFRESH_ENABLED !== 'true') {
        logger_1.default.info('[gtfsRefresh] scheduler DESHABILITADO (GTFS_REFRESH_ENABLED!=true)');
        return;
    }
    const horas = Number(process.env.GTFS_REFRESH_HORAS) || 24;
    // Primera corrida 10 min post-arranque (no competir con el boot).
    setTimeout(corrida, 10 * 60000);
    timer = setInterval(corrida, horas * 60 * 60000);
    logger_1.default.info(`[gtfsRefresh] scheduler ACTIVO: cada ${horas} h`);
}
function stopGtfsRefreshScheduler() {
    if (timer)
        clearInterval(timer);
    timer = null;
}
