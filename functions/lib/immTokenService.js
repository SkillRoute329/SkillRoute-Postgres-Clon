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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.REDIRECT_URI = exports.CLIENT_ID = exports.IMM_API_BASE = exports.AUTHORIZE_URL = void 0;
exports.getImmToken = getImmToken;
exports.hasImmCredentials = hasImmCredentials;
exports.exchangeCodeForTokens = exchangeCodeForTokens;
exports.isImmConnected = isImmConnected;
exports.createOAuthState = createOAuthState;
exports.validateAndConsumeState = validateAndConsumeState;
exports.buildAuthorizeUrl = buildAuthorizeUrl;
exports.immApiGet = immApiGet;
/**
 * immTokenService — OAuth2 para la API oficial de la IMM.
 *
 * Usa client_credentials automáticamente (no requiere login de usuario).
 * Credenciales en functions/.env.ucot-gestor-cloud (gitignored):
 *   IMM_CLIENT_ID=51137bff
 *   IMM_CLIENT_SECRET=<secreto>
 *
 * El token expira en 300 seg. Se cachea en Firestore (imm_config/oauth_token).
 * getImmToken() lo renueva automáticamente — transparente para el llamador.
 *
 * El endpoint /immAuthorize + /immOAuthCallback siguen disponibles para
 * el flujo authorization_code (cuando se quiera delegar a un usuario IMM).
 */
const https = __importStar(require("https"));
const logger = __importStar(require("firebase-functions/logger"));
const firestore_1 = require("firebase-admin/firestore");
const TOKEN_ENDPOINT = 'https://mvdapi-auth.montevideo.gub.uy/auth/realms/pci/protocol/openid-connect/token';
exports.AUTHORIZE_URL = 'https://mvdapi-auth.montevideo.gub.uy/auth/realms/pci/protocol/openid-connect/auth';
exports.IMM_API_BASE = 'https://api.montevideo.gub.uy/api/transportepublico';
exports.CLIENT_ID = (_a = process.env.IMM_CLIENT_ID) !== null && _a !== void 0 ? _a : '51137bff';
exports.REDIRECT_URI = 'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/immOAuthCallback';
const TOKEN_DOC = 'imm_config/oauth_token';
const STATE_COLL = 'imm_oauth_states';
// ─── Token principal (client_credentials — automático) ────────────────────────
/** Devuelve un access_token válido. Lo renueva solo cuando expira. null = sin credenciales. */
async function getImmToken() {
    var _a, _b;
    const clientId = (_a = process.env.IMM_CLIENT_ID) !== null && _a !== void 0 ? _a : '';
    const clientSecret = (_b = process.env.IMM_CLIENT_SECRET) !== null && _b !== void 0 ? _b : '';
    if (!clientId || !clientSecret) {
        logger.warn('[IMM Token] Sin credenciales. Configurar IMM_CLIENT_ID e IMM_CLIENT_SECRET en .env.ucot-gestor-cloud');
        return null;
    }
    const db = (0, firestore_1.getFirestore)();
    const ref = db.doc(TOKEN_DOC);
    const snap = await ref.get();
    if (snap.exists) {
        const cached = snap.data();
        if (cached.expires_at.toDate().getTime() - Date.now() > 60000) {
            return cached.access_token;
        }
    }
    // Token expirado o no existe → obtener uno nuevo con client_credentials
    const result = await _postToken(new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
    }).toString());
    if (!result)
        return null;
    await ref.set({
        access_token: result.access_token,
        refresh_token: '',
        expires_at: firestore_1.Timestamp.fromDate(new Date(Date.now() + result.expires_in * 1000)),
        stored_at: firestore_1.Timestamp.now(),
        flow: 'client_credentials',
    });
    logger.info('[IMM Token] Token nuevo (client_credentials), expira en', result.expires_in, 'seg');
    return result.access_token;
}
/** ¿Hay credenciales configuradas? */
function hasImmCredentials() {
    return !!(process.env.IMM_CLIENT_ID && process.env.IMM_CLIENT_SECRET);
}
// ─── Authorization code (flujo con usuario, opcional) ────────────────────────
/** Intercambia el authorization code por tokens y los almacena. */
async function exchangeCodeForTokens(code) {
    var _a, _b, _c;
    const clientId = (_a = process.env.IMM_CLIENT_ID) !== null && _a !== void 0 ? _a : exports.CLIENT_ID;
    const clientSecret = (_b = process.env.IMM_CLIENT_SECRET) !== null && _b !== void 0 ? _b : '';
    const params = {
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: exports.REDIRECT_URI,
    };
    if (clientSecret)
        params['client_secret'] = clientSecret;
    const result = await _postToken(new URLSearchParams(params).toString());
    if (!result)
        return false;
    await (0, firestore_1.getFirestore)().doc(TOKEN_DOC).set({
        access_token: result.access_token,
        refresh_token: (_c = result.refresh_token) !== null && _c !== void 0 ? _c : '',
        expires_at: firestore_1.Timestamp.fromDate(new Date(Date.now() + result.expires_in * 1000)),
        stored_at: firestore_1.Timestamp.now(),
        flow: 'authorization_code',
    });
    logger.info('[IMM Token] Tokens authorization_code almacenados, expira en', result.expires_in, 'seg');
    return true;
}
/** Verifica si hay un token almacenado (cualquier flujo). */
async function isImmConnected() {
    return hasImmCredentials();
}
// ─── OAuth state (CSRF) ───────────────────────────────────────────────────────
async function createOAuthState() {
    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    await (0, firestore_1.getFirestore)().collection(STATE_COLL).doc(state).set({
        created_at: firestore_1.Timestamp.now(),
        expires_at: firestore_1.Timestamp.fromDate(new Date(Date.now() + 10 * 60000)),
    });
    return state;
}
async function validateAndConsumeState(state) {
    const db = (0, firestore_1.getFirestore)();
    const ref = db.collection(STATE_COLL).doc(state);
    const doc = await ref.get();
    if (!doc.exists)
        return false;
    const data = doc.data();
    const valid = data.expires_at.toDate().getTime() > Date.now();
    await ref.delete();
    return valid;
}
function buildAuthorizeUrl(state) {
    return (exports.AUTHORIZE_URL +
        '?' +
        new URLSearchParams({
            client_id: exports.CLIENT_ID,
            redirect_uri: exports.REDIRECT_URI,
            response_type: 'code',
            scope: 'openid',
            state,
        }).toString());
}
// ─── HTTP helper ──────────────────────────────────────────────────────────────
/** GET autenticado a la API IMM oficial. */
function immApiGet(path, token) {
    return new Promise((resolve) => {
        const url = new URL(exports.IMM_API_BASE + path);
        const req = https.request(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        }, (res) => {
            let d = '';
            res.on('data', (c) => (d += c));
            res.on('end', () => {
                if (res.statusCode === 200)
                    resolve(JSON.parse(d));
                else {
                    logger.warn('[IMM API]', path, '→ HTTP', res.statusCode);
                    resolve(null);
                }
            });
        });
        req.on('error', (e) => { logger.error('[IMM API]', e.message); resolve(null); });
        req.end();
    });
}
// ─── Privada ──────────────────────────────────────────────────────────────────
function _postToken(body) {
    return new Promise((resolve) => {
        const req = https.request(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body),
            },
        }, (res) => {
            let d = '';
            res.on('data', (c) => (d += c));
            res.on('end', () => {
                if (res.statusCode === 200)
                    resolve(JSON.parse(d));
                else {
                    logger.error('[IMM Token] POST HTTP', res.statusCode, d.slice(0, 300));
                    resolve(null);
                }
            });
        });
        req.on('error', (e) => { logger.error('[IMM Token] Conexión:', e.message); resolve(null); });
        req.write(body);
        req.end();
    });
}
