"use strict";
/**
 * IMM Realtime Service
 * Cliente del endpoint público de tracking GPS de buses de Montevideo.
 *
 * Endpoint: POST https://www.montevideo.gub.uy/buses/rest/stm-online
 * Body: {"empresa": "<codigo>"}
 *   - "10" COETC | "20" COME | "50" CUTCSA | "70" UCOT | "-1" todas
 *
 * Respuesta: GeoJSON FeatureCollection — cada feature es un bus con
 *   properties.linea, codigoEmpresa, sublinea, destinoDesc, tipoLineaDesc,
 *   variante, codigoBus, velocidad, frecuencia + geometry.coordinates [lng,lat].
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMPRESA_NAMES = exports.EMPRESA_CODES = void 0;
exports.fetchBusesLive = fetchBusesLive;
exports.agruparPorEmpresa = agruparPorEmpresa;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../config/logger");
const STM_ONLINE_URL = 'https://www.montevideo.gub.uy/buses/rest/stm-online';
exports.EMPRESA_CODES = {
    COETC: '10',
    COME: '20',
    CUTCSA: '50',
    UCOT: '70',
    TODAS: '-1',
};
exports.EMPRESA_NAMES = {
    10: 'COETC',
    20: 'COME',
    50: 'CUTCSA',
    70: 'UCOT',
};
const httpClient = axios_1.default.create({
    timeout: 15000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
        Referer: 'https://www.montevideo.gub.uy/buses/',
        Origin: 'https://www.montevideo.gub.uy',
    },
});
/**
 * Obtiene snapshot GPS en vivo de buses operando.
 * @param empresaCode Código de empresa o "-1" para todas
 */
async function fetchBusesLive(empresaCode = exports.EMPRESA_CODES.TODAS) {
    const started = Date.now();
    try {
        const response = await httpClient.post(STM_ONLINE_URL, { empresa: empresaCode });
        const ms = Date.now() - started;
        const count = response.data?.features?.length ?? 0;
        logger_1.logger.info(`[immRealtime] empresa=${empresaCode} buses=${count} ${ms}ms`);
        return response.data;
    }
    catch (error) {
        logger_1.logger.error(`[immRealtime] fetch falló empresa=${empresaCode}: ${error.message}`);
        throw error;
    }
}
function agruparPorEmpresa(coll) {
    const map = new Map();
    for (const feat of coll.features ?? []) {
        const p = feat.properties;
        if (!p?.codigoEmpresa || !p?.linea)
            continue;
        let empresa = map.get(p.codigoEmpresa);
        if (!empresa) {
            empresa = {
                codigo: p.codigoEmpresa,
                nombre: exports.EMPRESA_NAMES[p.codigoEmpresa] ?? `Empresa ${p.codigoEmpresa}`,
                totalBuses: 0,
                lineas: new Map(),
            };
            map.set(p.codigoEmpresa, empresa);
        }
        empresa.totalBuses += 1;
        let linea = empresa.lineas.get(p.linea);
        if (!linea) {
            linea = {
                numero: p.linea,
                sublineas: new Set(),
                destinos: new Set(),
                variantes: new Set(),
                tipoLineaDesc: p.tipoLineaDesc,
                busesActivos: 0,
                posiciones: [],
            };
            empresa.lineas.set(p.linea, linea);
        }
        linea.busesActivos += 1;
        if (p.sublinea)
            linea.sublineas.add(p.sublinea);
        if (p.destinoDesc)
            linea.destinos.add(p.destinoDesc);
        if (typeof p.variante === 'number')
            linea.variantes.add(p.variante);
        if (feat.geometry?.coordinates?.length === 2) {
            const [lng, lat] = feat.geometry.coordinates;
            linea.posiciones.push({
                lat,
                lng,
                busId: p.codigoBus,
                velocidad: p.velocidad,
            });
        }
    }
    return map;
}
exports.default = { fetchBusesLive, agruparPorEmpresa, EMPRESA_CODES: exports.EMPRESA_CODES, EMPRESA_NAMES: exports.EMPRESA_NAMES };
