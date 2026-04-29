/**
 * immOAuthCallback — Receptor del authorization code OAuth de la IMM.
 *
 * La IMM redirige aquí tras la autorización del usuario:
 *   https://us-central1-ucot-gestor-cloud.cloudfunctions.net/immOAuthCallback?code=...&state=...
 *
 * Intercambia el code por access_token + refresh_token y los almacena en Firestore.
 * A partir de ahí, getImmToken() los usa automáticamente (con renovación por refresh_token).
 *
 * Para iniciar el flujo: abrir /immAuthorize en el browser.
 */
import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { exchangeCodeForTokens, validateAndConsumeState } from './immTokenService';

export const immOAuthCallback = onRequest(
  { region: 'us-central1', cors: false },
  async (req, res) => {
    const code  = typeof req.query.code  === 'string' ? req.query.code  : null;
    const state = typeof req.query.state === 'string' ? req.query.state : null;
    const error = typeof req.query.error === 'string' ? req.query.error : null;

    logger.info('[IMM OAuth Callback]', { codePresent: !!code, state, error });

    // ── Error devuelto por la IMM ─────────────────────────────────────────────
    if (error) {
      res.status(400).send(buildHtml({
        title:   'Autorización denegada',
        heading: 'No se completó la autorización',
        message: `La IMM rechazó la autorización: ${escapeHtml(error)}.`,
        ok: false,
      }));
      return;
    }

    // ── Sin code (visita directa a la URL) ────────────────────────────────────
    if (!code) {
      res.status(200).send(buildHtml({
        title:   'SkillRoute · IMM OAuth',
        heading: 'URL de callback OAuth',
        message: 'Esta URL es el receptor del flujo OAuth de la IMM. Para iniciar la autorización, ir a /immAuthorize.',
        ok: true,
      }));
      return;
    }

    // ── Validar state (CSRF) ──────────────────────────────────────────────────
    if (state) {
      const validState = await validateAndConsumeState(state);
      if (!validState) {
        logger.warn('[IMM OAuth] State inválido o expirado:', state);
        res.status(400).send(buildHtml({
          title:   'Autorización inválida',
          heading: 'Solicitud inválida',
          message: 'El parámetro state expiró o es inválido. Volvé a iniciar el flujo desde /immAuthorize.',
          ok: false,
        }));
        return;
      }
    }

    // ── Canjear code por tokens ───────────────────────────────────────────────
    const ok = await exchangeCodeForTokens(code);

    if (!ok) {
      res.status(500).send(buildHtml({
        title:   'Error en la autorización',
        heading: 'No se pudo completar la integración',
        message: 'El intercambio del código de autorización falló. Reintentar desde /immAuthorize.',
        ok: false,
      }));
      return;
    }

    res.status(200).send(buildHtml({
      title:   'SkillRoute · IMM Conectado',
      heading: '¡Integración activada!',
      message: 'SkillRoute está conectado a la API oficial de la IMM. Los datos en tiempo real con ETA y accesibilidad ya están disponibles. Podés cerrar esta ventana.',
      ok: true,
    }));
  },
);

// ─── HTML helpers ─────────────────────────────────────────────────────────────

interface HtmlOpts { title: string; heading: string; message: string; ok: boolean; }

function buildHtml({ title, heading, message, ok }: HtmlOpts): string {
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
    p  { color: #cbd5e1; margin: 0; line-height: 1.55; }
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
