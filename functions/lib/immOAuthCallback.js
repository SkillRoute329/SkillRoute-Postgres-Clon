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
exports.immOAuthCallback = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
/**
 * OAuth callback receiver para el cliente registrado ante la IMM.
 *
 * STUB pre-lunes 4 mayo 2026: devuelve 200 OK con HTML para que la URL
 * de Redirección registrada en el portal IMM no devuelva 404. NO procesa
 * el flujo OAuth real (eso es feature post-lunes con su propio plan).
 *
 * Cuando se implemente el canje real:
 *  - leer Client Secret desde Firebase Functions Config (NO hardcodear)
 *  - POST a token endpoint de IMM con grant_type=authorization_code
 *  - guardar access_token + refresh_token en Firestore con TTL
 *  - redirigir al frontend con flag de "integración IMM activa"
 */
exports.immOAuthCallback = (0, https_1.onRequest)({ region: 'us-central1', cors: false }, (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const state = typeof req.query.state === 'string' ? req.query.state : null;
    const error = typeof req.query.error === 'string' ? req.query.error : null;
    // Log seguro: nunca persistir el code real, solo flag de presencia.
    logger.info('[IMM OAuth Callback]', {
        codePresent: !!code,
        state: state !== null && state !== void 0 ? state : null,
        error: error !== null && error !== void 0 ? error : null,
    });
    if (error) {
        res.status(400).send(buildHtml({
            title: 'Autorización denegada',
            heading: 'No se completó la autorización',
            message: `La IMM rechazó la autorización: ${escapeHtml(error)}.`,
            ok: false,
        }));
        return;
    }
    res.status(200).send(buildHtml({
        title: 'SkillRoute · IMM Autorizado',
        heading: 'Autorización recibida',
        message: 'SkillRoute recibió correctamente la autorización de la IMM. Podés cerrar esta ventana.',
        ok: true,
    }));
});
function buildHtml({ title, heading, message, ok }) {
    const accent = ok ? '#10b981' : '#ef4444';
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; background: #0f172a;
           color: #e2e8f0; margin: 0; min-height: 100vh; display: flex;
           align-items: center; justify-content: center; padding: 24px; }
    .card { max-width: 480px; background: #1e293b; border: 1px solid #334155;
            border-radius: 12px; padding: 40px; text-align: center; }
    .badge { display: inline-block; width: 56px; height: 56px; line-height: 56px;
             border-radius: 50%; background: ${accent}; color: white;
             font-size: 28px; margin-bottom: 16px; }
    h1 { color: #f1f5f9; margin: 0 0 16px; font-size: 22px; }
    p { color: #cbd5e1; margin: 0; line-height: 1.55; }
    .brand { margin-top: 28px; color: #64748b; font-size: 13px; letter-spacing: 0.5px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">${ok ? '✓' : '!'}</div>
    <h1>${escapeHtml(heading)}</h1>
    <p>${escapeHtml(message)}</p>
    <div class="brand">SkillRoute · Inteligencia metropolitana</div>
  </div>
</body>
</html>`;
}
function escapeHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
