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
exports.startConteoVehicularScheduler = startConteoVehicularScheduler;
exports.stopConteoVehicularScheduler = stopConteoVehicularScheduler;
/**
 * conteoVehicularScheduler — refresca conteo_vehicular (mes en curso).
 *
 * FASE 5.17 (2026-05-16): el dataset IMM de conteo del mes en curso se
 * actualiza durante el mes. ingest_conteo_vehicular.sh es idempotente por
 * archivo y transaccional. Env-gated por CONTEO_VEHICULAR_ENABLED.
 */
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const logger_1 = __importDefault(require("../config/logger"));
let timer = null;
let corriendo = false;
const SCRIPT = path.join(path.resolve(__dirname, '..', '..'), 'scripts', 'ingest_conteo_vehicular.sh');
function corrida() {
    if (corriendo) {
        logger_1.default.warn('[conteoVeh] corrida anterior en curso, salteando');
        return;
    }
    corriendo = true;
    const t0 = Date.now();
    (0, child_process_1.exec)(`bash "${SCRIPT}"`, { shell: 'bash', maxBuffer: 16 * 1024 * 1024 }, (err, _o, stderr) => {
        corriendo = false;
        if (err) {
            logger_1.default.error('[conteoVeh] falló (tabla previa intacta por la tx)', {
                err: String(err),
                stderr: String(stderr).slice(-300),
            });
            return;
        }
        logger_1.default.info(`[conteoVeh] conteo vehicular refrescado en ${Math.round((Date.now() - t0) / 1000)}s`);
    });
}
function startConteoVehicularScheduler() {
    if (process.env.CONTEO_VEHICULAR_ENABLED !== 'true') {
        logger_1.default.info('[conteoVeh] scheduler DESHABILITADO (CONTEO_VEHICULAR_ENABLED!=true)');
        return;
    }
    const horas = Number(process.env.CONTEO_VEHICULAR_HORAS) || 24;
    setTimeout(corrida, 8 * 60000);
    timer = setInterval(corrida, horas * 60 * 60000);
    logger_1.default.info(`[conteoVeh] scheduler ACTIVO: cada ${horas} h`);
}
function stopConteoVehicularScheduler() {
    if (timer)
        clearInterval(timer);
    timer = null;
}
