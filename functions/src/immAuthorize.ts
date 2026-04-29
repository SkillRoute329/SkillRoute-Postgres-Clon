/**
 * immAuthorize — Inicia el flujo OAuth con la IMM.
 *
 * Uso: abrir https://us-central1-ucot-gestor-cloud.cloudfunctions.net/immAuthorize
 * en el browser → redirige al portal IMM → usuario se loguea → vuelve al callback.
 *
 * Solo accesible para admins (protegido por Firebase Auth en el header).
 * Si no hay header de auth, igual redirige (la IMM pide credenciales propia).
 */
import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { createOAuthState, buildAuthorizeUrl } from './immTokenService';

export const immAuthorize = onRequest(
  { region: 'us-central1', cors: false },
  async (req, res) => {
    logger.info('[IMM Authorize] Iniciando flujo OAuth');

    const state       = await createOAuthState();
    const authorizeUrl = buildAuthorizeUrl(state);

    // Redirigir al portal de la IMM
    res.redirect(302, authorizeUrl);
  },
);
