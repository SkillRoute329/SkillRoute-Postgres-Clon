/**
 * config/firebase.ts — Adaptador transparente del clon (FASE 4.3)
 *
 * Este archivo NO inicializa Firebase real. Reemplaza el SDK original con
 * shims que apuntan al backend del clon. Los exports `db`, `auth`, `storage`,
 * `app`, `authReady`, `getAppMessaging` se mantienen idénticos en API para
 * que los 148 archivos que importan de aquí sigan funcionando sin cambios.
 *
 * Cuando un archivo se migra a importar de los clientes nuevos
 * (`../clients/apiClient`, `../clients/socketClient`) directamente, deja de
 * usar este archivo. Cuando ya nadie lo importe, lo borramos en FASE 4.9.
 *
 * REGLA -6 (CLON vs ORIGINAL): este archivo opera 100% contra el clon. No
 * hay UN solo byte que vaya al original cloud.
 *
 * REGLA -1 NO REGRESIÓN: API pública preservada — los archivos que importan
 * `db, auth, storage, authReady, getAppMessaging` desde acá siguen viendo
 * los mismos nombres, los mismos tipos a grandes rasgos, y el código del
 * frontend sigue compilando.
 */

import { getFirestore } from './firestoreShim';
import { getAuth } from './firebaseAuthShim';
import {
  initializeApp,
  getStorage,
  getMessaging,
  isSupported,
  type FirebaseAppShim,
} from './firebaseStubsShim';

// ─── App ───────────────────────────────────────────────────────────────────

const _config = {
  // No son credenciales activas: el SDK real ya no se usa. Mantenemos los
  // metadatos para compatibilidad con código que lee `app.options`.
  projectId: 'skillroute-clon-local',
  authDomain: 'localhost',
  storageBucket: 'minio-local',
  messagingSenderId: '0',
  appId: 'clon-local',
};

const _app: FirebaseAppShim = initializeApp(_config);

export default _app;

// ─── DB (Firestore shim) ───────────────────────────────────────────────────

export const db = getFirestore();

// ─── Auth (shim apuntando al clon) ─────────────────────────────────────────

export const auth = getAuth(_app);

// ─── Storage (stub mínimo, FASE 5 lo migra a MinIO) ────────────────────────

export const storage = getStorage(_app);

// ─── Messaging (stub mínimo, FASE 6 lo migra a web-push propio) ────────────

export const getAppMessaging = async (): Promise<ReturnType<typeof getMessaging> | null> => {
  const supported = await isSupported();
  if (!supported) return null;
  return getMessaging(_app);
};

// ─── authReady — Promise que resuelve cuando el shim está listo ────────────
//
// En el shim, la sesión local se restaura de localStorage al instante. Por
// tanto `authReady` resuelve inmediatamente. Compatibilidad de tipos
// preservada para que el código que la espera no se cuelgue.

export const authReady: Promise<void> = Promise.resolve();
