/**
 * tokenStore — única fuente de verdad del JWT en el frontend.
 *
 * FASE 5.16 (2026-05-16): consolidación. Antes el token se leía/escribía
 * con TRES keys distintas (`skillroute_jwt`, `tf_token`, `token`) y un
 * esquema JSON aparte (`auth`), repartido en ~12 archivos. Esa
 * fragmentación causó el incidente del 2026-05-16: Antigravity cambió la
 * key en AuthContext y desincronizó todo → tormenta de 401 → navegador
 * congelado.
 *
 * Reglas:
 *   - Key canónica ÚNICA: `skillroute_jwt`.
 *   - `getToken()` migra automáticamente cualquier token legacy
 *     (`tf_token`, `token`, o dentro de `auth` JSON) a la key canónica y
 *     borra el legacy. Así una sesión vieja NUNCA se pierde en un deploy.
 *   - Todo el frontend (apiClient, AuthContext, services) debe usar este
 *     módulo. Prohibido `localStorage.getItem('tf_token')` suelto.
 */

export const TOKEN_KEY = 'skillroute_jwt';
const LEGACY_KEYS = ['tf_token', 'token'] as const;

function safeLS(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Devuelve el JWT vigente o null. Si no hay token canónico pero existe
 * uno legacy, lo migra (copia a la key canónica, borra el legacy).
 */
export function getToken(): string | null {
  const ls = safeLS();
  if (!ls) return null;

  const canonical = ls.getItem(TOKEN_KEY);
  if (canonical) return canonical;

  // Migración: keys legacy sueltas
  for (const k of LEGACY_KEYS) {
    const v = ls.getItem(k);
    if (v) {
      ls.setItem(TOKEN_KEY, v);
      ls.removeItem(k);
      return v;
    }
  }

  // Migración: esquema legacy `auth` = JSON { token, user }
  try {
    const authRaw = ls.getItem('auth');
    if (authRaw) {
      const parsed = JSON.parse(authRaw) as { token?: string };
      if (parsed?.token) {
        ls.setItem(TOKEN_KEY, parsed.token);
        return parsed.token;
      }
    }
  } catch {
    /* auth corrupto: ignorar */
  }
  return null;
}

export function setToken(token: string | null): void {
  const ls = safeLS();
  if (!ls) return;
  if (token) {
    ls.setItem(TOKEN_KEY, token);
  } else {
    ls.removeItem(TOKEN_KEY);
  }
  // Limpiar siempre los legacy para que no haya tokens fantasma.
  for (const k of LEGACY_KEYS) ls.removeItem(k);
}

export function clearToken(): void {
  const ls = safeLS();
  if (!ls) return;
  ls.removeItem(TOKEN_KEY);
  for (const k of LEGACY_KEYS) ls.removeItem(k);
}

/**
 * Header Authorization listo para fetch/axios. `{}` si no hay token —
 * evita mandar `Authorization: Bearer null`.
 */
export function authHeader(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}
