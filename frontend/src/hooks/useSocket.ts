/**
 * Hook React para Socket.io
 * Maneja conexión y desconexión automáticamente
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import {
  createSocket,
  disconnectSocket,
  isConnected,
  getSocket,
  SocketUser,
} from '../services/socketService';

interface UseSocketOptions {
  autoConnect?: boolean;
  autoDisconnect?: boolean;
  logErrors?: boolean;
}

/**
 * Hook para gestionar conexión Socket.io
 */
export function useSocket(user: SocketUser, options: UseSocketOptions = {}) {
  const {
    autoConnect = true,
    autoDisconnect = true,
    logErrors = true,
  } = options;

  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!autoConnect) {
      setLoading(false);
      return;
    }

    try {
      // Conectar
      const newSocket = createSocket(user);
      socketRef.current = newSocket;
      setSocket(newSocket);

      // Escuchar conexión
      const handleConnect = () => {
        setConnected(true);
        setLoading(false);
        setError(null);
      };

      // Escuchar desconexión
      const handleDisconnect = () => {
        setConnected(false);
      };

      // Escuchar error
      const handleError = (err: any) => {
        const errorMsg = err?.message || 'Socket.io error';
        setError(errorMsg);
        if (logErrors) {
          console.error('🔌 Socket error:', errorMsg);
        }
      };

      newSocket.on('connect', handleConnect);
      newSocket.on('disconnect', handleDisconnect);
      newSocket.on('error', handleError);
      newSocket.on('connect_error', handleError);

      // Si ya está conectado
      if (newSocket.connected) {
        handleConnect();
      }

      // Cleanup
      return () => {
        newSocket.off('connect', handleConnect);
        newSocket.off('disconnect', handleDisconnect);
        newSocket.off('error', handleError);
        newSocket.off('connect_error', handleError);

        if (autoDisconnect) {
          disconnectSocket();
        }
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      setLoading(false);
      if (logErrors) {
        console.error('🔌 Socket setup error:', err);
      }
    }
  }, [user.id, autoConnect, autoDisconnect, logErrors]);

  // Funciones de utilidad
  const reconnect = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.disconnect();
    }

    setLoading(true);
    const newSocket = createSocket(user);
    socketRef.current = newSocket;
    setSocket(newSocket);
  }, [user]);

  const disconnect = useCallback(() => {
    disconnectSocket();
    setSocket(null);
    setConnected(false);
  }, []);

  return {
    socket: socket || getSocket(),
    connected,
    loading,
    error,
    reconnect,
    disconnect,
    isConnected: connected,
  };
}

/**
 * Hook para escuchar eventos específicos
 */
export function useSocketEvent<T = any>(
  eventName: string,
  callback: (data: T) => void,
  dependencies: any[] = [],
) {
  const socket = getSocket();

  useEffect(() => {
    if (!socket?.connected) return;

    socket.on(eventName, callback);

    return () => {
      socket.off(eventName, callback);
    };
  }, [socket, eventName, callback, ...dependencies]);
}

/**
 * Hook para emitir eventos
 */
export function useSocketEmit() {
  const socket = getSocket();

  return useCallback(
    (eventName: string, data: any) => {
      if (!socket?.connected) {
        console.warn('⚠️ Socket no conectado');
        return;
      }

      socket.emit(eventName, data);
    },
    [socket],
  );
}
