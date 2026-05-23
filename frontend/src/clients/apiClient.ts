/**
 * apiClient.ts — Cliente HTTP único del frontend hacia el backend del clon.
 *
 * FASE 4 (2026-05-11): unificación de la capa de transporte HTTP.
 * Todo lo que antes hacía `fetch` a Firestore vía SDK o `fetch('/api/...')`
 * directo pasa por acá. JWT del clon se inyecta automáticamente.
 *
 * Reglas:
 *   - REGLA -6: este cliente APUNTA AL CLON, nunca al original cloud.
 *   - REGLA -3: token en httpOnly cookie a futuro; por ahora en localStorage
 *     compatible con AuthContext actual.
 *   - REGLA -2: si una llamada falla, propaga el error real, no inventa.
 */

import { getToken, setToken } from '../utils/tokenStore';

const ENV_BASE = (import.meta as any).env?.VITE_API_URL as string | undefined;

// Fallback en orden:
//   1. VITE_API_URL del .env.local (apunta al bridge :3099 hoy).
//   2. http://localhost:3000 (backend directo del clon).
//   3. window.location.origin si el frontend está servido por el bridge.
function resolveBaseUrl(): string {
  if (ENV_BASE && ENV_BASE.trim()) return ENV_BASE.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    return 'http://localhost:3001';
  }
  return 'http://localhost:3001';
}

export const API_BASE_URL = resolveBaseUrl();

// ─── Token management ──────────────────────────────────────────────────────
// FASE 5.16: delega en utils/tokenStore (única fuente de verdad + migración
// automática de keys legacy). Nombres exportados intactos para no romper
// imports existentes.

export function setAuthToken(token: string | null): void {
  setToken(token);
}

export function getAuthToken(): string | null {
  return getToken();
}

// ─── Tipos básicos ──────────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = 'ApiError';
  }
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
  details?: unknown;
  total?: number;
  timestamp?: string;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  /** Si true, no agrega Authorization aunque haya token. */
  anon?: boolean;
  signal?: AbortSignal;
  /** Timeout en milisegundos. Default 15s. */
  timeoutMs?: number;
}

// ─── Helper interno ────────────────────────────────────────────────────────

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const rel = path.startsWith('/') ? path : '/' + path;
  const url = new URL(API_BASE_URL + rel);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === null || v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function rawRequest<T = unknown>(
  path: string,
  opts: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const url = buildUrl(path, opts.query);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(opts.headers ?? {}),
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!opts.anon) {
    const token = getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const ctrl = opts.signal ? null : new AbortController();
  const timeoutMs = opts.timeoutMs ?? 15000;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal ?? ctrl?.signal,
      credentials: 'include',
    });
  } catch (err: unknown) {
    if (timer) clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    throw new ApiError(0, `Network: ${msg}`);
  } finally {
    if (timer) clearTimeout(timer);
  }

  const text = await res.text();
  let parsed: ApiResponse<T> | unknown = text;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      /* no es JSON, devolver crudo */
    }
  }

  if (!res.ok) {
    // FASE 5.16 (2026-05-16): handler global 401, con GUARD anti-tormenta.
    //
    // Bug original (Antigravity): cada request 401 disparaba el evento
    // `skillroute:auth-unauthorized` → AuthContext hacía logout() →
    // re-render → más requests en paralelo → más 401 → más eventos...
    // Tormenta sincrónica que congelaba el navegador (ni F12 abría).
    //
    // Fix: una sola emisión del evento por "episodio". El flag global se
    // arma al primer 401 y se desarma a los 5s. Mientras esté armado,
    // los 401 subsecuentes NO re-disparan el evento. Corta el bucle de
    // raíz sin perder el comportamiento de logout en sesión caducada.
    if (res.status === 401 && !opts.anon) {
      const w = window as unknown as { __sr401Lock?: boolean };
      if (!w.__sr401Lock) {
        w.__sr401Lock = true;
        console.warn('[API] Sesión caducada o no autorizada (401). Cerrando sesión una vez.');
        window.dispatchEvent(new CustomEvent('skillroute:auth-unauthorized'));
        setTimeout(() => { w.__sr401Lock = false; }, 5000);
      }
    }

    const errBody = parsed as ApiResponse<T>;
    const message = errBody?.error ?? errBody?.message ?? res.statusText;
    throw new ApiError(res.status, message, parsed);
  }

  if (parsed && typeof parsed === 'object' && 'ok' in (parsed as object)) {
    return parsed as ApiResponse<T>;
  }
  // Endpoints que devuelven raw JSON sin envelope
  return { ok: true, data: parsed as T };
}

// ─── API pública ───────────────────────────────────────────────────────────

export const apiClient = {
  baseUrl: API_BASE_URL,

  get<T = unknown>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return rawRequest<T>(path, { ...opts, method: 'GET' });
  },

  post<T = unknown>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return rawRequest<T>(path, { ...opts, method: 'POST', body });
  },

  put<T = unknown>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return rawRequest<T>(path, { ...opts, method: 'PUT', body });
  },

  patch<T = unknown>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return rawRequest<T>(path, { ...opts, method: 'PATCH', body });
  },

  delete<T = unknown>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return rawRequest<T>(path, { ...opts, method: 'DELETE' });
  },

  setAuthToken,
  getAuthToken,
  ApiError,
};

export default apiClient;
