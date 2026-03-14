/**
 * Socket.io Client Service
 * Maneja la conexión y eventos de Socket.io desde el frontend
 */

import io, { Socket } from 'socket.io-client';

// Tipos
export interface SocketUser {
  id: string;
  internalNumber: string;
  fullName: string;
  role: 'SuperAdmin' | 'Admin' | 'Inspector' | 'Driver' | 'User';
}

export interface LocationUpdate {
  vehicleId: string;
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  timestamp: number;
  updatedBy?: string;
}

export interface ServiceStatusChange {
  serviceId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  timestamp: number;
  updatedBy?: string;
}

export interface InspectorAlert {
  inspectorId?: string;
  vehicleId: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: number;
}

export interface FleetCheckCompleted {
  checkId: string;
  vehicleId: string;
  status: 'OK' | 'WARNING' | 'CRITICAL';
  timestamp: number;
  completedBy?: string;
}

export interface UserConnected {
  userId: string;
  fullName: string;
  role: string;
  timestamp: number;
}

// Configuración
const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

// Socket singleton
let socket: Socket | null = null;

/**
 * Crear conexión Socket.io
 */
export function createSocket(user: SocketUser): Socket {
  if (socket?.connected) {
    console.log('✅ Socket.io ya conectado');
    return socket;
  }

  console.log(`🔌 Conectando Socket.io a ${SOCKET_URL}`);

  socket = io(SOCKET_URL, {
    auth: { user },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    transports: ['websocket', 'polling'],
  });

  // Event listeners globales
  socket.on('connect', () => {
    console.log('✅ Socket.io conectado');
  });

  socket.on('disconnect', () => {
    console.log('❌ Socket.io desconectado');
  });

  socket.on('connect_error', (error) => {
    console.error('❌ Socket.io connection error:', error);
  });

  socket.on('error', (error) => {
    console.error('❌ Socket.io error:', error);
  });

  return socket;
}

/**
 * Obtener instancia actual de socket
 */
export function getSocket(): Socket | null {
  return socket;
}

/**
 * Desconectar socket
 */
export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
    socket = null;
    console.log('🔌 Socket.io desconectado');
  }
}

/**
 * Verificar si está conectado
 */
export function isConnected(): boolean {
  return socket?.connected ?? false;
}

// ─── EVENTOS DE CLIENTE → SERVIDOR ────────────────────────────────────────

/**
 * Emitir ubicación GPS
 */
export function emitLocationUpdate(data: Omit<LocationUpdate, 'timestamp'>) {
  if (!socket?.connected) {
    console.warn('⚠️ Socket no conectado');
    return;
  }

  socket.emit('location-update', {
    ...data,
    timestamp: Date.now(),
  });
}

/**
 * Emitir cambio de estado de servicio
 */
export function emitServiceStatusChange(data: Omit<ServiceStatusChange, 'timestamp'>) {
  if (!socket?.connected) {
    console.warn('⚠️ Socket no conectado');
    return;
  }

  socket.emit('service-status-changed', {
    ...data,
    timestamp: Date.now(),
  });
}

/**
 * Emitir alerta de inspector
 */
export function emitInspectorAlert(data: Omit<InspectorAlert, 'timestamp'>) {
  if (!socket?.connected) {
    console.warn('⚠️ Socket no conectado');
    return;
  }

  socket.emit('inspector-alert', {
    ...data,
    timestamp: Date.now(),
  });
}

/**
 * Emitir inspección completada
 */
export function emitFleetCheckCompleted(data: Omit<FleetCheckCompleted, 'timestamp'>) {
  if (!socket?.connected) {
    console.warn('⚠️ Socket no conectado');
    return;
  }

  socket.emit('fleet-check-completed', {
    ...data,
    timestamp: Date.now(),
  });
}

/**
 * Unirse a una sala de monitoreo
 */
export function joinRoom(roomName: string): void {
  if (!socket?.connected) {
    console.warn('⚠️ Socket no conectado');
    return;
  }

  socket.emit('join-room', roomName);
  console.log(`🚪 Unido a sala: ${roomName}`);
}

/**
 * Salir de una sala
 */
export function leaveRoom(roomName: string): void {
  if (!socket?.connected) {
    console.warn('⚠️ Socket no conectado');
    return;
  }

  socket.emit('leave-room', roomName);
  console.log(`🚪 Salido de sala: ${roomName}`);
}

/**
 * Ping para mantener conexión viva
 */
export function sendPing(): void {
  if (!socket?.connected) {
    console.warn('⚠️ Socket no conectado');
    return;
  }

  socket.emit('ping');
}

// ─── ESCUCHADORES (para usar en React) ────────────────────────────────────

/**
 * Escuchar actualización de ubicación
 */
export function onLocationUpdate(callback: (data: LocationUpdate) => void) {
  if (!socket) return;
  socket.on('location-update', callback);

  return () => {
    socket?.off('location-update', callback);
  };
}

/**
 * Escuchar cambio de estado de servicio
 */
export function onServiceStatusChange(callback: (data: ServiceStatusChange) => void) {
  if (!socket) return;
  socket.on('service-status-changed', callback);

  return () => {
    socket?.off('service-status-changed', callback);
  };
}

/**
 * Escuchar alerta de inspector
 */
export function onInspectorAlert(callback: (data: InspectorAlert) => void) {
  if (!socket) return;
  socket.on('inspector-alert', callback);

  return () => {
    socket?.off('inspector-alert', callback);
  };
}

/**
 * Escuchar inspección completada
 */
export function onFleetCheckCompleted(callback: (data: FleetCheckCompleted) => void) {
  if (!socket) return;
  socket.on('fleet-check-completed', callback);

  return () => {
    socket?.off('fleet-check-completed', callback);
  };
}

/**
 * Escuchar usuario conectado
 */
export function onUserConnected(callback: (data: UserConnected) => void) {
  if (!socket) return;
  socket.on('user-connected', callback);

  return () => {
    socket?.off('user-connected', callback);
  };
}

/**
 * Escuchar usuario desconectado
 */
export function onUserDisconnected(callback: (data: any) => void) {
  if (!socket) return;
  socket.on('user-disconnected', callback);

  return () => {
    socket?.off('user-disconnected', callback);
  };
}

/**
 * Escuchar respuesta de pong
 */
export function onPong(callback: (data: { timestamp: number }) => void) {
  if (!socket) return;
  socket.on('pong', callback);

  return () => {
    socket?.off('pong', callback);
  };
}

/**
 * Escuchar errores
 */
export function onSocketError(callback: (error: any) => void) {
  if (!socket) return;
  socket.on('error', callback);

  return () => {
    socket?.off('error', callback);
  };
}

export default socket;
