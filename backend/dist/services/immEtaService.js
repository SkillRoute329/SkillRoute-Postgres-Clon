"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getImmToken = getImmToken;
exports.snapshotEtaParada = snapshotEtaParada;
/**
 * immEtaService — cliente de la API REST oficial IMM (ETA/TEA por parada).
 *
 * FASE 5.17 (2026-05-16). ESTADO: OAuth FUNCIONAL y verificado (mismas
 * credenciales que el GTFS oficial: IMM_CLIENT_ID/SECRET). Tabla
 * `stm_eta_snapshots` creada. Scheduler listo (gateado por env).
 *
 * ⚠️ BLOQUEO HONESTO: el PATH exacto del endpoint de ETA NO es descubrible
 * automáticamente — el Swagger (`api.montevideo.gub.uy/apidocs/publictransport`)
 * se renderiza por JS y el manual es PDF; todas las rutas REST plausibles
 * probadas con token válido devolvieron 404. Para activar esto se necesita
 * confirmar el path desde el Swagger AUTENTICADO o el manual de conexión, y
 * setear IMM_ETA_PATH + IMM_ETA_ENABLED=true. Hasta entonces NO se inventa
 * un endpoint (no shippeamos una integración rota).
 *
 * Doc: https://api.montevideo.gub.uy/apidocs/publictransport
 *      https://api.montevideo.gub.uy/docs/manualdeconexion.pdf
 */
const https_1 = __importDefault(require("https"));
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
const TOKEN_URL = 'https://mvdapi-auth.montevideo.gub.uy/auth/realms/pci/protocol/openid-connect/token';
const API_BASE = 'https://api.montevideo.gub.uy/api/transportepublico/';
let cachedToken = null;
/** OAuth2 client_credentials (verificado funcional 2026-05-16). */
async function getImmToken() {
    if (cachedToken && Date.now() < cachedToken.exp - 30000)
        return cachedToken.token;
    const id = process.env.IMM_CLIENT_ID;
    const secret = process.env.IMM_CLIENT_SECRET;
    if (!id || !secret)
        throw new Error('Faltan IMM_CLIENT_ID/SECRET');
    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: id,
        client_secret: secret,
    }).toString();
    const json = await new Promise((resolve, reject) => {
        const r = https_1.default.request(TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body),
            },
        }, (x) => {
            let d = '';
            x.on('data', (c) => (d += c));
            x.on('end', () => {
                try {
                    resolve(JSON.parse(d));
                }
                catch (e) {
                    reject(new Error(`token parse: ${String(e)}`));
                }
            });
        });
        r.on('error', reject);
        r.write(body);
        r.end();
    });
    cachedToken = { token: json.access_token, exp: Date.now() + (json.expires_in || 300) * 1000 };
    return cachedToken.token;
}
/**
 * Captura un snapshot de ETA para una parada. Gateado: requiere
 * IMM_ETA_ENABLED=true y IMM_ETA_PATH (path REST confirmado del Swagger).
 * Devuelve cuántas filas insertó (0 si está deshabilitado/sin path).
 */
async function snapshotEtaParada(codigoParada) {
    if (process.env.IMM_ETA_ENABLED !== 'true' || !process.env.IMM_ETA_PATH) {
        logger_1.default.warn('[immEta] deshabilitado: setear IMM_ETA_ENABLED=true e IMM_ETA_PATH ' +
            '(path confirmado del Swagger autenticado IMM).');
        return 0;
    }
    const token = await getImmToken();
    const url = API_BASE +
        process.env.IMM_ETA_PATH.replace('{parada}', encodeURIComponent(codigoParada));
    const resp = await new Promise((resolve) => {
        const r = https_1.default.request(url, { headers: { Authorization: `Bearer ${token}` } }, (x) => {
            let d = '';
            x.on('data', (c) => (d += c));
            x.on('end', () => resolve({ status: x.statusCode || 0, body: d }));
        });
        r.on('error', (e) => resolve({ status: 0, body: String(e) }));
        r.setTimeout(15000, () => {
            r.destroy();
            resolve({ status: 0, body: 'timeout' });
        });
        r.end();
    });
    if (resp.status !== 200) {
        logger_1.default.error(`[immEta] HTTP ${resp.status} en ${url}`, { body: resp.body.slice(0, 200) });
        return 0;
    }
    // El shape exacto depende del endpoint real (a confirmar). Se intenta un
    // mapeo defensivo de campos comunes; ajustar cuando se conozca el contrato.
    let arr = [];
    try {
        const j = JSON.parse(resp.body);
        arr = Array.isArray(j) ? j : (j.arribos ?? j.data ?? j.results ?? []);
    }
    catch {
        return 0;
    }
    let n = 0;
    for (const a of arr) {
        await (0, database_1.default)('stm_eta_snapshots').insert({
            codigo_parada: codigoParada,
            cod_linea: a.linea ?? a.cod_linea ?? null,
            variante: a.variante ?? null,
            bus_id: a.bus ?? a.bus_id ?? a.codigoBus ?? null,
            eta_segundos: a.eta ?? a.eta_segundos ?? a.tiempo ?? null,
            distancia_m: a.distancia ?? a.distancia_m ?? null,
        });
        n++;
    }
    logger_1.default.info(`[immEta] parada ${codigoParada}: ${n} arribos snapshot`);
    return n;
}
