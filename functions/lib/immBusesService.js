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
exports.immBusesLive = void 0;
exports.getBusesEnriquecidosInternal = getBusesEnriquecidosInternal;
/**
 * immBusesService — GPS enriquecido de TODAS las empresas via API oficial IMM.
 *
 * Agrega los campos que NO tiene stm-online:
 *   speed (km/h), access (PISO BAJO / COMÚN), thermalConfort, emissions
 *
 * GET /immBusesLive?empresa=all|UCOT|CUTCSA|COME|COETC
 *
 * Respuesta cross-empresa lista para consumir desde el Fleet Monitor.
 * Cache interna de 30 seg para no saturar la API IMM.
 */
const logger = __importStar(require("firebase-functions/logger"));
const https_1 = require("firebase-functions/v2/https");
const immTokenService_1 = require("./immTokenService");
const CACHE_TTL_MS = 15000;
const EMPRESA_ID = {
    UCOT: 70, CUTCSA: 50, COME: 20, COETC: 10,
};
const TODAS_EMPRESAS = ['UCOT', 'CUTCSA', 'COME', 'COETC'];
// ─── Cache en memoria ─────────────────────────────────────────────────────────
const cache = { data: [], fetchedAt: 0, empresa: '' };
// ─── Fetch y normalización ────────────────────────────────────────────────────
async function fetchEmpresa(empresa, token) {
    const raw = await (0, immTokenService_1.immApiGet)(`/buses?company=${empresa}&format=json`, token);
    if (!raw)
        return [];
    return raw.map((b) => {
        var _a, _b, _c, _d, _e;
        return ({
            idBus: String(b.busId),
            empresa: b.company,
            empresaId: (_a = EMPRESA_ID[b.company]) !== null && _a !== void 0 ? _a : 0,
            linea: b.line,
            lineaVariante: b.lineVariantId,
            origen: b.origin,
            destino: b.destination,
            sublinea: b.subline,
            lat: b.location.coordinates[1],
            lng: b.location.coordinates[0],
            velocidadKmh: (_b = b.speed) !== null && _b !== void 0 ? _b : 0,
            acceso: (_c = b.access) !== null && _c !== void 0 ? _c : 'SIN DATOS',
            climatizacion: (_d = b.thermalConfort) !== null && _d !== void 0 ? _d : 'SIN DATOS',
            emisiones: (_e = b.emissions) !== null && _e !== void 0 ? _e : 'SIN DATOS',
            especial: b.special,
            timestamp: b.timestamp,
            fuente: 'IMM_OFICIAL',
        });
    });
}
async function getBusesEnriquecidosInternal(empresa) {
    return getBusesEnriquecidos(empresa);
}
async function getBusesEnriquecidos(empresa) {
    const now = Date.now();
    if (now - cache.fetchedAt < CACHE_TTL_MS && cache.empresa === empresa) {
        return cache.data;
    }
    const token = await (0, immTokenService_1.getImmToken)();
    if (!token)
        return [];
    let buses;
    if (empresa === 'all') {
        const resultados = await Promise.all(TODAS_EMPRESAS.map(e => fetchEmpresa(e, token)));
        buses = resultados.flat();
    }
    else {
        buses = await fetchEmpresa(empresa, token);
    }
    cache.data = buses;
    cache.fetchedAt = now;
    cache.empresa = empresa;
    logger.info('[IMM Buses]', buses.length, 'buses de empresa:', empresa);
    return buses;
}
// ─── Cloud Function HTTP ──────────────────────────────────────────────────────
/**
 * GET /immBusesLive?empresa=all|UCOT|CUTCSA|COME|COETC
 *
 * Devuelve GPS enriquecido con speed, acceso, climatizacion, emisiones.
 * Cross-empresa: pasá empresa=all para todas las empresas del sistema.
 */
exports.immBusesLive = (0, https_1.onRequest)({ region: 'us-central1', cors: true }, async (req, res) => {
    const rawEmpresa = typeof req.query.empresa === 'string' ? req.query.empresa : 'all';
    const empresa = rawEmpresa.toLowerCase() === 'all' ? 'all' : rawEmpresa.toUpperCase();
    if (empresa !== 'all' && !TODAS_EMPRESAS.includes(empresa)) {
        res.status(400).json({
            ok: false,
            error: `empresa inválida. Usar: all, ${TODAS_EMPRESAS.join(', ')}`,
        });
        return;
    }
    const buses = await getBusesEnriquecidos(empresa);
    // Resumen por empresa para el frontend
    const porEmpresa = {};
    buses.forEach(b => { var _a; porEmpresa[b.empresa] = ((_a = porEmpresa[b.empresa]) !== null && _a !== void 0 ? _a : 0) + 1; });
    res.json({
        ok: true,
        total: buses.length,
        porEmpresa,
        empresa,
        buses,
        timestamp: new Date().toISOString(),
        fuente: 'IMM_OFICIAL',
        cacheEdadSeg: Math.round((Date.now() - cache.fetchedAt) / 1000),
    });
});
