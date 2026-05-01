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
exports.immAuthorize = void 0;
/**
 * immAuthorize — Inicia el flujo OAuth con la IMM.
 *
 * Uso: abrir https://us-central1-ucot-gestor-cloud.cloudfunctions.net/immAuthorize
 * en el browser → redirige al portal IMM → usuario se loguea → vuelve al callback.
 *
 * Solo accesible para admins (protegido por Firebase Auth en el header).
 * Si no hay header de auth, igual redirige (la IMM pide credenciales propia).
 */
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const immTokenService_1 = require("./immTokenService");
exports.immAuthorize = (0, https_1.onRequest)({ region: 'us-central1', cors: false }, async (req, res) => {
    logger.info('[IMM Authorize] Iniciando flujo OAuth');
    const state = await (0, immTokenService_1.createOAuthState)();
    const authorizeUrl = (0, immTokenService_1.buildAuthorizeUrl)(state);
    // Redirigir al portal de la IMM
    res.redirect(302, authorizeUrl);
});
