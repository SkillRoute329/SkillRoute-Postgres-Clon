/**
 * firebaseAuthShim.ts — Stub de firebase/auth → backend del clon (FASE 4)
 *
 * Implementa la API mínima de firebase/auth que el frontend usa, traduciendo
 * a llamadas REST contra `/api/auth/*` del clon.
 *
 * APIs cubiertas:
 *   - getAuth()
 *   - setPersistence, browserLocalPersistence
 *   - signInWithEmailAndPassword, signInWithCustomToken
 *   - signOut
 *   - onAuthStateChanged
 *   - connectAuthEmulator (no-op)
 *
 * Reglas:
 *   - REGLA -6: opera contra el clon (POST /api/auth/login con internalNumber).
 *   - REGLA -3 OWASP A07: tokens via apiClient (httpOnly cookie a futuro).
 */

import { apiClient, setAuthToken, getAuthToken } from '../clients/apiClient';
import { refreshSocketAuth } from '../clients/socketClient';

export interface UserShim {
  uid: string;
  email: string | null;
  displayName: string | null;
  internalNumber?: string;
  role?: string;
  agencyId?: string;
  getIdToken: () => Promise<string>;
  getIdTokenResult: () => Promise<{ token: string; claims: Record<string, unknown> }>;
}

export interface AuthShim {
  __shim: true;
  currentUser: UserShim | null;
  // Listeners locales
  _listeners: Set<(user: UserShim | null) => void>;
}

const _auth: AuthShim = {
  __shim: true,
  currentUser: null,
  _listeners: new Set(),
};

function notify(user: UserShim | null): void {
  _auth.currentUser = user;
  _auth._listeners.forEach((cb) => {
    try { cb(user); } catch { /* ignore */ }
  });
}

// Restaurar sesión si hay JWT en localStorage al cargar.
function tryRestore(): void {
  const token = getAuthToken();
  if (!token) return;
  // Decodificar payload del JWT (HS256 sin verificación local; el backend
  // valida en cada request). Solo es para tener `currentUser` para la UI.
  try {
    const [, payloadB64] = token.split('.');
    const payload = JSON.parse(
      atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')),
    ) as Record<string, unknown>;
    const user: UserShim = {
      uid: String(payload.id ?? payload.uid ?? ''),
      email: (payload.email as string) ?? null,
      displayName: (payload.fullName as string) ?? null,
      internalNumber: payload.internalNumber as string | undefined,
      role: payload.role as string | undefined,
      agencyId: payload.agencyId as string | undefined,
      getIdToken: async () => token,
      getIdTokenResult: async () => ({ token, claims: payload }),
    };
    notify(user);
  } catch {
    // Token corrupto: limpiar.
    setAuthToken(null);
  }
}

export function getAuth(_app?: unknown): AuthShim {
  return _auth;
}

export async function setPersistence(_auth: AuthShim, _persistence: unknown): Promise<void> {
  // En el shim la persistencia es localStorage del JWT — siempre on. No-op.
}

export const browserLocalPersistence = { __type: 'LOCAL' };
export const inMemoryPersistence = { __type: 'NONE' };

export function connectAuthEmulator(_auth: AuthShim, _url: string, _opts?: unknown): void {
  // No-op en el shim — el "emulador" es el clon directamente.
}

/**
 * signInWithEmailAndPassword(auth, email, password)
 * El email se pasa como internalNumber al backend del clon (que acepta
 * email/internalNumber indistintamente en authService).
 */
export async function signInWithEmailAndPassword(
  _auth: AuthShim,
  email: string,
  password: string,
): Promise<{ user: UserShim }> {
  const res = await apiClient.post<{ token: string; user: Record<string, unknown> }>(
    '/api/auth/login',
    { internalNumber: email, password },
    { anon: true },
  );
  const token = (res.data?.token ?? '') as string;
  if (!token) throw new Error('Login falló: backend no devolvió token');
  setAuthToken(token);
  refreshSocketAuth();
  const u = (res.data?.user ?? {}) as Record<string, unknown>;
  const user: UserShim = {
    uid: String(u.id ?? u.uid ?? ''),
    email: (u.email as string) ?? email,
    displayName: (u.fullName as string) ?? null,
    internalNumber: (u.internalNumber as string) ?? undefined,
    role: (u.role as string) ?? undefined,
    agencyId: (u.agencyId as string) ?? undefined,
    getIdToken: async () => token,
    getIdTokenResult: async () => ({ token, claims: u }),
  };
  notify(user);
  return { user };
}

/** signInWithCustomToken — el clon no emite custom tokens hoy; tratar como JWT directo */
export async function signInWithCustomToken(
  _auth: AuthShim,
  token: string,
): Promise<{ user: UserShim }> {
  setAuthToken(token);
  refreshSocketAuth();
  tryRestore();
  if (!_auth.currentUser) throw new Error('Custom token inválido');
  return { user: _auth.currentUser };
}

export async function signOut(_auth: AuthShim): Promise<void> {
  setAuthToken(null);
  notify(null);
  refreshSocketAuth();
}

export function onAuthStateChanged(
  _auth: AuthShim,
  cb: (user: UserShim | null) => void,
): () => void {
  _auth._listeners.add(cb);
  // Disparar el estado actual inmediatamente (compat con Firebase).
  Promise.resolve().then(() => cb(_auth.currentUser));
  return () => {
    _auth._listeners.delete(cb);
  };
}

export function onIdTokenChanged(
  _auth: AuthShim,
  cb: (user: UserShim | null) => void,
): () => void {
  return onAuthStateChanged(_auth, cb);
}

// Inicialización: intentar restaurar al cargar el módulo.
tryRestore();

export default {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
  connectAuthEmulator,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
  onAuthStateChanged,
  onIdTokenChanged,
};
