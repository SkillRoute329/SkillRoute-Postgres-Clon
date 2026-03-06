import { db, auth } from '../config/firebase';
import {
  getDocs,
  collection,
  limit,
  query,
  enableIndexedDbPersistence,
  disableNetwork,
  enableNetwork,
} from 'firebase/firestore';

export type ConnectivityStatus = 'ONLINE' | 'OFFLINE' | 'UNSTABLE' | 'BLOCKED';

export const ConnectivityGuard = {
  /**
   * HEALTH CHECK SEQUENCE
   * Runs before the app mounts to determine the network environment.
   */
  async performHealthCheck(): Promise<{ status: ConnectivityStatus; message: string }> {
    console.log('🛡️ ConnectivityGuard: Initiating Boot Check...');

    // 1. Basic Internet Check
    if (!navigator.onLine) {
      console.warn('🛡️ ConnectivityGuard: No Internet Connection detected at boot.');
      return { status: 'OFFLINE', message: 'Sin conexión a internet. Iniciando en Modo Offline.' };
    }

    // 2. Firebase Connectivity Check (Ping)
    // CRITICAL: Check Auth first to avoid Permission Denied on Boot
    if (!auth.currentUser) {
      console.log(
        '🛡️ ConnectivityGuard: No User. Skipping Firewall/Latency Check (Permissions would fail).',
      );
      return { status: 'ONLINE', message: 'Esperando Autenticación...' };
    }

    const start = performance.now();
    try {
      // Try to read a public config or just check connection validity
      // Using a very cheap query
      const q = query(collection(db, 'system_settings'), limit(1));
      // Set a strict timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 5000),
      );

      await Promise.race([getDocs(q), timeoutPromise]);

      const duration = Math.round(performance.now() - start);
      console.log(`🛡️ ConnectivityGuard: Connection Verified in ${duration}ms.`);

      return { status: 'ONLINE', message: 'Conexión Establecida.' };
    } catch (error: any) {
      console.error('🛡️ ConnectivityGuard: Connection Check Failed.', error);

      if (error.code === 'permission-denied' || String(error).includes('permissions')) {
        // FAKE IT TIL YOU MAKE IT:
        // If we are blocked by rules, we ARE connected, just not authorized.
        // Allow boot to proceed so user can Login.
        return { status: 'ONLINE', message: 'Conectado (Requiere Login)' };
      }

      if (error.message === 'Timeout') {
        return { status: 'UNSTABLE', message: 'Conexión lenta detectada. Ajustando protocolo...' };
      }

      if (error.code === 'failed-precondition' || error.message.includes('offline')) {
        return { status: 'OFFLINE', message: 'Modo Offline Activado.' };
      }

      return {
        status: 'BLOCKED',
        message: `Red Restrictiva Detectada (${error.code || 'Unknown'}). Intentando bypass...`,
      };
    }
  },

  /**
   * MANUAL NETWORK TOGGLE
   * For "Tunnel Mode" simulation or recovery.
   */
  async forceReconnect() {
    try {
      await disableNetwork(db);
      await new Promise((r) => setTimeout(r, 1000));
      await enableNetwork(db);
      console.log('🛡️ ConnectivityGuard: Reconnection Forced.');
    } catch (e) {
      console.error(e);
    }
  },
};
