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
import * as https from 'https';
import * as logger from 'firebase-functions/logger';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const TOKEN_ENDPOINT =
  'https://mvdapi-auth.montevideo.gub.uy/auth/realms/pci/protocol/openid-connect/token';
export const AUTHORIZE_URL =
  'https://mvdapi-auth.montevideo.gub.uy/auth/realms/pci/protocol/openid-connect/auth';
export const IMM_API_BASE = 'https://api.montevideo.gub.uy/api/transportepublico';

export const CLIENT_ID    = process.env.IMM_CLIENT_ID     ?? '51137bff';
export const REDIRECT_URI =
  'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/immOAuthCallback';

const TOKEN_DOC  = 'imm_config/oauth_token';
const STATE_COLL = 'imm_oauth_states';

interface StoredTokens {
  access_token:  string;
  refresh_token: string;
  expires_at:    Timestamp;
  stored_at:     Timestamp;
}

// ─── Token principal (client_credentials — automático) ────────────────────────

/** Devuelve un access_token válido. Lo renueva solo cuando expira. null = sin credenciales. */
export async function getImmToken(): Promise<string | null> {
  const clientId     = process.env.IMM_CLIENT_ID     ?? '';
  const clientSecret = process.env.IMM_CLIENT_SECRET ?? '';

  if (!clientId || !clientSecret) {
    logger.warn('[IMM Token] Sin credenciales. Configurar IMM_CLIENT_ID e IMM_CLIENT_SECRET en .env.ucot-gestor-cloud');
    return null;
  }

  const db  = getFirestore();
  const ref = db.doc(TOKEN_DOC);
  const snap = await ref.get();

  if (snap.exists) {
    const cached = snap.data() as StoredTokens;
    if (cached.expires_at.toDate().getTime() - Date.now() > 60_000) {
      return cached.access_token;
    }
  }

  // Token expirado o no existe → obtener uno nuevo con client_credentials
  const result = await _postToken(new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     clientId,
    client_secret: clientSecret,
  }).toString());

  if (!result) return null;

  await ref.set({
    access_token:  result.access_token,
    refresh_token: '',
    expires_at:    Timestamp.fromDate(new Date(Date.now() + result.expires_in * 1_000)),
    stored_at:     Timestamp.now(),
    flow:          'client_credentials',
  });

  logger.info('[IMM Token] Token nuevo (client_credentials), expira en', result.expires_in, 'seg');
  return result.access_token;
}

/** ¿Hay credenciales configuradas? */
export function hasImmCredentials(): boolean {
  return !!(process.env.IMM_CLIENT_ID && process.env.IMM_CLIENT_SECRET);
}

// ─── Authorization code (flujo con usuario, opcional) ────────────────────────

/** Intercambia el authorization code por tokens y los almacena. */
export async function exchangeCodeForTokens(code: string): Promise<boolean> {
  const clientId     = process.env.IMM_CLIENT_ID     ?? CLIENT_ID;
  const clientSecret = process.env.IMM_CLIENT_SECRET ?? '';

  const params: Record<string, string> = {
    grant_type:   'authorization_code',
    client_id:    clientId,
    code,
    redirect_uri: REDIRECT_URI,
  };
  if (clientSecret) params['client_secret'] = clientSecret;

  const result = await _postToken(new URLSearchParams(params).toString());
  if (!result) return false;

  await getFirestore().doc(TOKEN_DOC).set({
    access_token:  result.access_token,
    refresh_token: result.refresh_token ?? '',
    expires_at:    Timestamp.fromDate(new Date(Date.now() + result.expires_in * 1_000)),
    stored_at:     Timestamp.now(),
    flow:          'authorization_code',
  });

  logger.info('[IMM Token] Tokens authorization_code almacenados, expira en', result.expires_in, 'seg');
  return true;
}

/** Verifica si hay un token almacenado (cualquier flujo). */
export async function isImmConnected(): Promise<boolean> {
  return hasImmCredentials();
}

// ─── OAuth state (CSRF) ───────────────────────────────────────────────────────

export async function createOAuthState(): Promise<string> {
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  await getFirestore().collection(STATE_COLL).doc(state).set({
    created_at: Timestamp.now(),
    expires_at: Timestamp.fromDate(new Date(Date.now() + 10 * 60_000)),
  });
  return state;
}

export async function validateAndConsumeState(state: string): Promise<boolean> {
  const db  = getFirestore();
  const ref = db.collection(STATE_COLL).doc(state);
  const doc = await ref.get();
  if (!doc.exists) return false;
  const data = doc.data() as { expires_at: Timestamp };
  const valid = data.expires_at.toDate().getTime() > Date.now();
  await ref.delete();
  return valid;
}

export function buildAuthorizeUrl(state: string): string {
  return (
    AUTHORIZE_URL +
    '?' +
    new URLSearchParams({
      client_id:     CLIENT_ID,
      redirect_uri:  REDIRECT_URI,
      response_type: 'code',
      scope:         'openid',
      state,
    }).toString()
  );
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

/** GET autenticado a la API IMM oficial. */
export function immApiGet<T>(path: string, token: string): Promise<T | null> {
  return new Promise((resolve) => {
    const url = new URL(IMM_API_BASE + path);
    const req = https.request(url, {
      method:  'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        if (res.statusCode === 200) resolve(JSON.parse(d) as T);
        else { logger.warn('[IMM API]', path, '→ HTTP', res.statusCode); resolve(null); }
      });
    });
    req.on('error', (e) => { logger.error('[IMM API]', e.message); resolve(null); });
    req.end();
  });
}

// ─── Privada ──────────────────────────────────────────────────────────────────

function _postToken(body: string): Promise<{
  access_token:   string;
  refresh_token?: string;
  expires_in:     number;
} | null> {
  return new Promise((resolve) => {
    const req = https.request(TOKEN_ENDPOINT, {
      method:  'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        if (res.statusCode === 200) resolve(JSON.parse(d));
        else { logger.error('[IMM Token] POST HTTP', res.statusCode, d.slice(0, 300)); resolve(null); }
      });
    });
    req.on('error', (e) => { logger.error('[IMM Token] Conexión:', e.message); resolve(null); });
    req.write(body);
    req.end();
  });
}
