import { initializeApp } from 'firebase/app';
import { getStorage } from 'firebase/storage';
import { getMessaging, isSupported } from 'firebase/messaging';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  connectAuthEmulator,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDPviXHSMncZQ_l3oMwIRoPWAOXOHeVeL4',
  authDomain: 'ucot-gestor-cloud.firebaseapp.com',
  projectId: 'ucot-gestor-cloud',
  storageBucket: 'ucot-gestor-cloud.firebasestorage.app',
  messagingSenderId: '231108889084',
  appId: '1:231108889084:web:45f28a7a143a19995f0a79',
  measurementId: 'G-SBF5S0ZG2D',
};

const app = initializeApp(firebaseConfig);

// INEXCUSABLE: en local siempre usar emulador (E2E y dev local).
const useEmulator = false; // Forzado a Cloud para uso inmediato del usuario.

export const db = initializeFirestore(
  app,
  useEmulator
    ? { experimentalAutoDetectLongPolling: true }
    : {
        experimentalAutoDetectLongPolling: true,
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
         }),
      },
);

if (useEmulator) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  console.log('[Firebase] Conectado a Firestore emulador 127.0.0.1:8080');
}

export const auth = getAuth(app);
if (useEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}
setPersistence(auth, browserLocalPersistence);

export const storage = getStorage(app);

export const getAppMessaging = async () => {
  const supported = await isSupported();
  if (supported) {
    return getMessaging(app);
  }
  return null;
};

export default app;
