import { apiClient } from '../clients/apiClient';
import { getToken } from '../utils/tokenStore';

// TODO FASE 4.5: onAuthStateChanged replaced by JWT validation in apiClient
// disableNetwork / enableNetwork have no REST equivalent — omitted

export type ConnectivityStatus = 'ONLINE' | 'OFFLINE' | 'UNSTABLE' | 'BLOCKED';

export const ConnectivityGuard = {
  /**
   * HEALTH CHECK SEQUENCE
   * Runs before the app mounts to determine the network environment.
   */
  async performHealthCheck(): Promise<{ status: ConnectivityStatus; message: string }> {
    if (import.meta.env.MODE !== 'production') console.log('[ConnectivityGuard] boot check start');

    // 1. Basic Internet Check
    if (!navigator.onLine) {
      console.warn('ConnectivityGuard: No Internet Connection detected at boot.');
      return { status: 'OFFLINE', message: 'Sin conexión a internet. Iniciando en Modo Offline.' };
    }

    // 2. Check if user has a valid JWT token
    const token = getToken();
    if (!token) {
      return { status: 'ONLINE', message: 'Esperando Autenticación...' };
    }

    // 3. Backend Connectivity Check (Ping)
    const start = performance.now();
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 5000),
      );

      await Promise.race([
        apiClient.get('/api/db/system_settings', { query: { limit: 1 } }),
        timeoutPromise,
      ]);

      const duration = Math.round(performance.now() - start);
      console.log(`ConnectivityGuard: Connection Verified in ${duration}ms.`);

      return { status: 'ONLINE', message: 'Conexión Establecida.' };
    } catch (error: any) {
      console.warn('ConnectivityGuard: Connection Check Failed.', error?.message ?? error);

      if (error?.status === 401 || error?.status === 403 || String(error).includes('permissions')) {
        // If blocked by auth rules, we ARE connected, just not authorized.
        return { status: 'ONLINE', message: 'Conectado (Requiere Login)' };
      }

      if (error.message === 'Timeout') {
        return { status: 'UNSTABLE', message: 'Conexión lenta detectada. Ajustando protocolo...' };
      }

      if (String(error).includes('offline') || String(error).includes('network')) {
        return { status: 'OFFLINE', message: 'Modo Offline Activado.' };
      }

      return {
        status: 'BLOCKED',
        message: `Red Restrictiva Detectada. Intentando bypass...`,
      };
    }
  },

  /**
   * MANUAL NETWORK TOGGLE
   * For "Tunnel Mode" simulation or recovery.
   * TODO FASE 4.5: disableNetwork/enableNetwork have no REST equivalent; this is a no-op stub.
   */
  async forceReconnect() {
    console.log('ConnectivityGuard: forceReconnect called (REST mode — no-op).');
  },
};
