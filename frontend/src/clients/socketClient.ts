/**
 * socketClient.ts — Cliente Socket.io único del frontend hacia el clon.
 *
 * FASE 4: reemplaza Firestore onSnapshot por suscripciones Socket.io del clon.
 * Mantiene una sola conexión global, multiplexada por evento.
 *
 * Eventos emitidos por el backend del clon (cascadeEngineService, pollerService):
 *   - 'alerta-operativa'           → nueva alerta
 *   - 'alerta-atendida'            → alerta marcada como atendida
 *   - 'resumen-diario-actualizado' → resumen del día cambió
 *
 * Eventos del shim:
 *   - 'firestore:<collection>'     → emitido por el backend cuando algo cambia
 *                                    en una tabla equivalente. Usado por el
 *                                    shim para implementar onSnapshot.
 *
 * Reglas:
 *   - REGLA -6: apunta al clon, no al original.
 *   - REGLA -3: el handshake incluye el JWT en `auth: { token }` para que el
 *     backend valide (control de acceso a salas).
 */

import { io, Socket } from 'socket.io-client';
import { getAuthToken } from './apiClient';

const ENV_BRIDGE = (import.meta as any).env?.VITE_BRIDGE_URL as string | undefined;
const ENV_API = (import.meta as any).env?.VITE_API_URL as string | undefined;

function resolveSocketUrl(): string {
  // Debe apuntar al backend principal (donde corre el servidor socket.io)
  const base = ENV_API || ENV_BRIDGE || 'http://localhost:3001';
  return base.replace(/\/+$/, '');
}

export const SOCKET_URL = resolveSocketUrl();

// ─── Singleton ─────────────────────────────────────────────────────────────

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket && socket.connected) return socket;
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      transports: ['websocket', 'polling'],
      auth: () => ({ token: getAuthToken() ?? '' }),
    });

    socket.on('connect', () => {
      // eslint-disable-next-line no-console
      console.info('[socketClient] conectado al clon', { url: SOCKET_URL, id: socket?.id });
    });
    socket.on('disconnect', (reason: string) => {
      // eslint-disable-next-line no-console
      console.warn('[socketClient] desconectado', { reason });
    });
    socket.on('connect_error', (err: Error) => {
      // eslint-disable-next-line no-console
      console.warn('[socketClient] error de conexión', { error: err?.message });
    });
  }
  return socket;
}

/**
 * Refresca el token de autenticación de la conexión Socket.io.
 * Llamar después de un login o re-login.
 */
export function refreshSocketAuth(): void {
  if (!socket) return;
  // Forzar re-handshake con el nuevo token
  socket.disconnect();
  socket.connect();
}

/**
 * Helper: suscribirse a un evento del backend con limpieza automática.
 * Devuelve una función para cancelar la suscripción.
 */
export function on<T = unknown>(eventName: string, handler: (data: T) => void): () => void {
  const s = getSocket();
  s.on(eventName, handler as (...args: unknown[]) => void);
  return () => {
    s.off(eventName, handler as (...args: unknown[]) => void);
  };
}

export default getSocket;
