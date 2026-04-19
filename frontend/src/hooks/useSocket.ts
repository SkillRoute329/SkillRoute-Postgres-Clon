/**
 * Hook React para Socket.io - DEPRECATED
 * Migrado a Firebase Firestore onSnapshot.
 * Retorna estado conectado fijo para evitar cuelgues UI.
 */

import { useEffect, useState, useCallback } from 'react';
import type { SocketUser } from '../services/socketService';

export function useSocket(user: SocketUser, options: any = {}) {
  const [connected, setConnected] = useState(true);

  return {
    socket: null,
    connected: true,
    loading: false,
    error: null,
    reconnect: () => {},
    disconnect: () => {},
    isConnected: true,
  };
}

export function useSocketEvent<T = any>(
  eventName: string,
  callback: (data: T) => void,
  dependencies: any[] = [],
) {
  // No-op ya que migramos a hooks de Firebase directo
  useEffect(() => {}, dependencies);
}

export function useSocketEmit() {
  return useCallback((eventName: string, data: any) => {
    console.warn('[useSocketEmit] Deprecated. Operación omitida:', eventName);
  }, []);
}
