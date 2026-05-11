/**
 * firebaseStubsShim.ts — Stubs mínimos de firebase/app, firebase/storage,
 * firebase/messaging para que el código del clon compile (FASE 4).
 *
 * Storage real va a MinIO en FASE 5. Push real va a Web Push en FASE 6.
 * Por ahora estos stubs evitan errores de import pero NO operan.
 *
 * Reglas:
 *   - REGLA -2: si una función stub se llama, devuelve algo neutral o tira
 *     un error claro indicando "FASE futura", nunca devuelve data falsa.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

// ─── firebase/app ──────────────────────────────────────────────────────────

export interface FirebaseAppShim {
  __shim: true;
  name: string;
  options: Record<string, unknown>;
}

const _app: FirebaseAppShim = {
  __shim: true,
  name: '[DEFAULT]',
  options: {},
};

export function initializeApp(opts?: Record<string, unknown>, _name?: string): FirebaseAppShim {
  if (opts) _app.options = opts;
  return _app;
}

export function getApp(_name?: string): FirebaseAppShim {
  return _app;
}

export function getApps(): FirebaseAppShim[] {
  return [_app];
}

// ─── firebase/storage ──────────────────────────────────────────────────────

export interface StorageShim {
  __shim: true;
  app: FirebaseAppShim;
}

export function getStorage(_app?: FirebaseAppShim, _bucketUrl?: string): StorageShim {
  return { __shim: true, app: _app ?? _app ?? getApp() };
}

export interface StorageReferenceShim {
  __type: 'storage-ref';
  bucket: string;
  fullPath: string;
}

export function ref(_storage: StorageShim, path?: string): StorageReferenceShim {
  return { __type: 'storage-ref', bucket: 'clone-minio', fullPath: path ?? '' };
}

export async function uploadBytes(
  _ref: StorageReferenceShim,
  _data: Blob | Uint8Array | ArrayBuffer,
  _metadata?: unknown,
): Promise<{ ref: StorageReferenceShim }> {
  throw new Error('[firebaseStubsShim] uploadBytes no implementado todavía — FASE 5 migra storage a MinIO');
}

export async function uploadBytesResumable(
  _ref: StorageReferenceShim,
  _data: Blob | Uint8Array | ArrayBuffer,
  _metadata?: unknown,
): Promise<{ ref: StorageReferenceShim }> {
  throw new Error('[firebaseStubsShim] uploadBytesResumable no implementado — FASE 5');
}

export async function getDownloadURL(_ref: StorageReferenceShim): Promise<string> {
  return '';
}

export async function deleteObject(_ref: StorageReferenceShim): Promise<void> {
  throw new Error('[firebaseStubsShim] deleteObject no implementado — FASE 5');
}

// ─── firebase/messaging ────────────────────────────────────────────────────

export interface MessagingShim {
  __shim: true;
}

export async function isSupported(): Promise<boolean> {
  return false; // forzamos false para que el código que pregunta no intente registrar tokens
}

export function getMessaging(_app?: FirebaseAppShim): MessagingShim {
  return { __shim: true };
}

export async function getToken(_messaging: MessagingShim, _options?: unknown): Promise<string | null> {
  return null;
}

export function onMessage(_messaging: MessagingShim, _cb: (payload: unknown) => void): () => void {
  return () => undefined;
}

// ─── firebase/analytics (algunos archivos lo importan) ─────────────────────

export interface AnalyticsShim {
  __shim: true;
}

export function getAnalytics(_app?: FirebaseAppShim): AnalyticsShim {
  return { __shim: true };
}

export function logEvent(_analytics: AnalyticsShim, _eventName: string, _params?: unknown): void {
  // no-op
}

// ─── default export ────────────────────────────────────────────────────────

export default {
  initializeApp,
  getApp,
  getApps,
  getStorage,
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  isSupported,
  getMessaging,
  getToken,
  onMessage,
  getAnalytics,
  logEvent,
};
