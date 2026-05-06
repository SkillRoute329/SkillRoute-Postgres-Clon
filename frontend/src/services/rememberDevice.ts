/**
 * Persistencia "Recordar este dispositivo" — credenciales cifradas en
 * localStorage para auto-relogin transparente cuando la sesión Firebase
 * Auth muere (TTL ID token, deploy nuevo, refresh-token revocado).
 *
 * Seguridad: AES-GCM con clave aleatoria generada por Web Crypto. La clave
 * queda en localStorage también — no es protección contra atacante con
 * XSS sobre el dominio (que tendría sesión propia de todas formas), pero
 * sí impide leer credenciales con un simple `localStorage.getItem`.
 *
 * Solo se activa cuando el usuario marca explícitamente el checkbox
 * en /login. Logout las borra.
 */

const KEY_NAME  = 'sk_remember_key_v1';
const DATA_NAME = 'sk_remember_data_v1';

async function getOrCreateKey(): Promise<CryptoKey> {
  const cached = localStorage.getItem(KEY_NAME);
  if (cached) {
    const raw = Uint8Array.from(atob(cached), c => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', true, ['encrypt', 'decrypt']);
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  localStorage.setItem(KEY_NAME, btoa(String.fromCharCode(...raw)));
  return key;
}

interface Creds { internalNumber: string; password: string; savedAt: number }

export async function rememberCredentials(internalNumber: string, password: string): Promise<void> {
  const key = await getOrCreateKey();
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const data: Creds = { internalNumber, password, savedAt: Date.now() };
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded));
  const blob = new Uint8Array(iv.length + ciphertext.length);
  blob.set(iv, 0);
  blob.set(ciphertext, iv.length);
  localStorage.setItem(DATA_NAME, btoa(String.fromCharCode(...blob)));
}

export async function recallCredentials(): Promise<Creds | null> {
  try {
    const raw = localStorage.getItem(DATA_NAME);
    if (!raw) return null;
    const blob = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
    const iv = blob.slice(0, 12);
    const ciphertext = blob.slice(12);
    const key = await getOrCreateKey();
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext)) as Creds;
  } catch {
    // Si la clave o el blob están corruptos, limpiar y no auto-loguear
    forgetDevice();
    return null;
  }
}

export function forgetDevice(): void {
  localStorage.removeItem(KEY_NAME);
  localStorage.removeItem(DATA_NAME);
}

export function hasRememberedCredentials(): boolean {
  return !!localStorage.getItem(DATA_NAME);
}
