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
exports.cartonIndex = cartonIndex;
exports.serviciosOficialesDeLinea = serviciosOficialesDeLinea;
exports.lineaOficialDeServicio = lineaOficialDeServicio;
exports.cartonMeta = cartonMeta;
/**
 * cartonOficial.ts (FASE 5.22 — 2026-05-17)
 *
 * FUENTE OFICIAL Y VALIDADA del cartón UCOT: el Excel real
 *   "Cartones habiles desde el 2 de marzo.xls"
 * (autor interno UCOT, una hoja por servicio). Reemplaza al artefacto
 * heurístico servicios_habiles.json, que tenía errores comprobados
 * (p.ej. asignaba el servicio 1020 a la línea 306 cuando 1020 es de la
 * 370 — el XLS oficial lo confirma; la 306 tiene "1020N", otra hoja).
 *
 * Estructura de cada hoja (nombre de hoja = Nº de servicio):
 *   fila 0: rótulos  ["Línea", ... "U.C.O.T." ... "Servicio N°" ...]
 *   fila 1: [LÍNEA, ... régimen ... , Nº SERVICIO, ...]
 *   fila 2: etapas del recorrido (paradas) + "ESPERAS" + etapas de vuelta
 *   filas 4..: vueltas — horas por etapa (col 0 = hora de salida)
 *   resto  : notas / turnos / totales
 *
 * Sólo se exponen datos verificables contra esta fuente. Nada inventado.
 */
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const logger_1 = __importDefault(require("../config/logger"));
// SheetJS ya está en node_modules del backend.
const XLSX = __importStar(require("xlsx"));
// Ruta oficial pasada por el operador. Configurable por env si se moviera.
const XLS_PATH = process.env.CARTON_XLS_PATH ||
    'C:/Users/Usuario/Desktop/Cartones habiles desde el 2 de marzo.xls';
let _idx = null;
const norm = (v) => String(v ?? '').trim();
const esHora = (s) => /^\d{1,2}:\d{2}$/.test(s.trim());
/** Carga (una vez) y parsea el XLS oficial. Si falla, índice vacío honesto. */
function cartonIndex() {
    if (_idx)
        return _idx;
    const vacio = {
        porServicio: new Map(),
        porLinea: new Map(),
        cargadoEn: new Date().toISOString(),
        archivo: XLS_PATH,
        totalServicios: 0,
    };
    if (!fs_1.default.existsSync(XLS_PATH)) {
        logger_1.default.error(`[cartonOficial] XLS oficial no encontrado: ${XLS_PATH}`);
        _idx = vacio;
        return _idx;
    }
    try {
        const wb = XLSX.readFile(XLS_PATH, { cellDates: false });
        const porServicio = new Map();
        const porLinea = new Map();
        for (const hoja of wb.SheetNames) {
            const sh = wb.Sheets[hoja];
            if (!sh)
                continue;
            const r = XLSX.utils.sheet_to_json(sh, {
                header: 1,
                defval: '',
                raw: false,
            });
            const fila1 = r[1] || [];
            const linea = norm(fila1[0]);
            if (!linea || !/^[0-9A-Za-z]+$/.test(linea))
                continue; // hoja no-cartón
            const regimen = norm(fila1[5]) || null;
            // Etapas: fila índice 2, nombres no vacíos, sin la columna "ESPERAS".
            const filaEtapas = r[2] || [];
            const etapas = filaEtapas
                .map(norm)
                .filter((c) => c && c.toUpperCase() !== 'ESPERAS' && !esHora(c));
            // 1ª salida: primera fila de datos con hora en col 0.
            let primeraEtapa = etapas[0] ?? null;
            let primeraHora = null;
            for (let i = 3; i < r.length; i++) {
                const c0 = norm(r[i]?.[0]);
                if (esHora(c0)) {
                    primeraHora = c0;
                    break;
                }
            }
            const ultimaEtapa = etapas.length ? etapas[etapas.length - 1] : null;
            const servicio = norm(hoja);
            const cs = {
                servicio,
                linea,
                regimen,
                primeraEtapa,
                primeraHora,
                ultimaEtapa,
                etapas,
            };
            porServicio.set(servicio, cs);
            const arr = porLinea.get(linea) ?? [];
            arr.push(servicio);
            porLinea.set(linea, arr);
        }
        _idx = {
            porServicio,
            porLinea,
            cargadoEn: new Date().toISOString(),
            archivo: XLS_PATH,
            totalServicios: porServicio.size,
        };
        logger_1.default.info(`[cartonOficial] XLS oficial cargado: ${_idx.totalServicios} servicios, ` +
            `${porLinea.size} líneas (${path_1.default.basename(XLS_PATH)})`);
        return _idx;
    }
    catch (e) {
        logger_1.default.error('[cartonOficial] error parseando XLS', { err: String(e) });
        _idx = vacio;
        return _idx;
    }
}
/** Servicios oficiales de una línea (según el cartón XLS validado). */
function serviciosOficialesDeLinea(linea) {
    const idx = cartonIndex();
    const svs = idx.porLinea.get(String(linea).trim()) ?? [];
    return svs
        .map((s) => idx.porServicio.get(s))
        .filter(Boolean)
        .sort((a, b) => (a.primeraHora ?? '').localeCompare(b.primeraHora ?? ''));
}
/** Línea oficial de un servicio, o null si no está en el cartón. */
function lineaOficialDeServicio(servicio) {
    return cartonIndex().porServicio.get(String(servicio).trim())?.linea ?? null;
}
/** Metadatos de carga (para la nota de fuentes / auditoría). */
function cartonMeta() {
    const i = cartonIndex();
    return { archivo: i.archivo, totalServicios: i.totalServicios, cargadoEn: i.cargadoEn };
}
