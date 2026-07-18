/**
 * Servicio de eventos en tiempo real con Socket.io
 * Maneja toda la comunicación bidireccional entre clientes y servidor
 */

import { Server, Socket } from 'socket.io';
import logger from '../config/logger';
import { AuthUser, AppError } from '../types/index';

// Tipos de eventos
export interface LocationUpdate {
  vehicleId: string;
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  timestamp: number;
}

export interface ServiceStatusChange {
  serviceId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  timestamp: number;
  updatedBy: string;
}

export interface InspectorAlert {
  inspectorId: string;
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
  completedBy: string;
}

// Mapeo de usuarios conectados
const connectedUsers = new Map<string, string>(); // userId -> socketId
const socketUsers = new Map<string, AuthUser>();  // socketId -> AuthUser

/**
 * Inicializar Socket.io con autenticación
 */
export function initializeSocket(io: Server): void {
  logger.info('🔌 Socket.io inicializado');

  // Middleware de autenticación
  io.use((socket, next) => {
    const user = socket.handshake.auth.user as AuthUser | null;

    if (!user) {
      return next(new AppError(401, 'Authentication required: Acceso denegado por políticas de AppSec'));
    }

    next();
  });

  // Manejo de conexiones
  io.on('connection', (socket: Socket) => {
    const user = socket.handshake.auth.user as AuthUser;

    logger.info(`[SOCKET] Usuario conectado: ${user.id} (${user.fullName})`, {
      socketId: socket.id,
    });

    // Registrar usuario
    connectedUsers.set(user.id, socket.id);
    socketUsers.set(socket.id, user);

    // Emitir que usuario se conectó
    io.emit('user-connected', {
      userId: user.id,
      fullName: user.fullName,
      role: user.role,
      timestamp: Date.now(),
    });

    // ─── EVENTOS ENTRANTES (del cliente al servidor) ───────────────────

    /**
     * location-update: Cliente envía su ubicación GPS
     */
    socket.on('location-update', (data: LocationUpdate) => {
      logger.debug('[SOCKET] location-update', { vehicleId: data.vehicleId });

      // Validar datos
      if (!data.vehicleId || typeof data.latitude !== 'number' || typeof data.longitude !== 'number') {
        socket.emit('error', { message: 'Invalid location data' });
        return;
      }

      // Emitir a todos (excepto el que envió)
      socket.broadcast.emit('location-update', {
        ...data,
        updatedBy: user.id,
      });

      // También guardar en una sala específica del vehículo
      io.to(`vehicle-${data.vehicleId}`).emit('vehicle-location-updated', data);
    });

    /**
     * service-status-changed: Cliente reporta cambio de estado del servicio
     */
    socket.on('service-status-changed', (data: ServiceStatusChange) => {
      logger.info('[SOCKET] service-status-changed', {
        serviceId: data.serviceId,
        status: data.status,
      });

      // Validar datos
      if (!data.serviceId || !data.status) {
        socket.emit('error', { message: 'Invalid service data' });
        return;
      }

      // Emitir a todos los conectados
      io.emit('service-status-changed', {
        ...data,
        updatedBy: user.id,
      });

      // Log para auditoría
      logger.info('[AUDIT] Service status changed', {
        serviceId: data.serviceId,
        status: data.status,
        userId: user.id,
      });
    });

    /**
     * inspector-alert: Inspector reporta una alerta
     */
    socket.on('inspector-alert', (data: InspectorAlert) => {
      logger.warn('[SOCKET] inspector-alert', {
        vehicleId: data.vehicleId,
        severity: data.severity,
      });

      // Validar datos
      if (!data.vehicleId || !data.severity || !data.message) {
        socket.emit('error', { message: 'Invalid alert data' });
        return;
      }

      // Emitir a supervisores y admins
      io.emit('inspector-alert', {
        ...data,
        inspectorId: user.id,
        timestamp: Date.now(),
      });

      // Log de alerta crítica
      if (data.severity === 'critical') {
        logger.error('[CRITICAL ALERT]', {
          vehicleId: data.vehicleId,
          message: data.message,
          inspector: user.fullName,
        });
      }
    });

    /**
     * fleet-check-completed: Inspector completó inspección de vehículo
     */
    socket.on('fleet-check-completed', (data: FleetCheckCompleted) => {
      logger.info('[SOCKET] fleet-check-completed', { vehicleId: data.vehicleId });

      // Validar datos
      if (!data.checkId || !data.vehicleId || !data.status) {
        socket.emit('error', { message: 'Invalid check data' });
        return;
      }

      // Emitir a todos
      io.emit('fleet-check-completed', {
        ...data,
        completedBy: user.id,
      });
    });

    /**
     * join-room: Cliente se une a una sala específica
     * Uso: para monitorear un vehículo específico
     */
    socket.on('join-room', (roomName: string) => {
      if (!roomName || typeof roomName !== 'string') {
        socket.emit('error', { message: 'Invalid room name' });
        return;
      }

      socket.join(roomName);
      logger.debug('[SOCKET] User joined room', { userId: user.id, room: roomName });

      // Notificar a otros en la sala
      io.to(roomName).emit('user-joined-room', {
        userId: user.id,
        fullName: user.fullName,
        room: roomName,
      });
    });

    /**
     * leave-room: Cliente sale de una sala
     */
    socket.on('leave-room', (roomName: string) => {
      socket.leave(roomName);
      logger.debug('[SOCKET] User left room', { userId: user.id, room: roomName });

      // Notificar a otros en la sala
      io.to(roomName).emit('user-left-room', {
        userId: user.id,
        fullName: user.fullName,
        room: roomName,
      });
    });

    /**
     * ping: Cliente envía ping para keep-alive
     */
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // ─── DESCONEXIÓN ──────────────────────────────────────────────────

    socket.on('disconnect', () => {
      connectedUsers.delete(user.id);
      socketUsers.delete(socket.id);

      logger.info('[SOCKET] Usuario desconectado', {
        userId: user.id,
        fullName: user.fullName,
      });

      // Emitir que usuario se desconectó
      io.emit('user-disconnected', {
        userId: user.id,
        fullName: user.fullName,
        timestamp: Date.now(),
      });
    });

    // Manejo de errores
    socket.on('error', (error) => {
      logger.error('[SOCKET] Error', {
        userId: user.id,
        error: String(error),
      });
    });
  });
}

/**
 * Emitir ubicación de vehículo a clientes específicos
 */
export function broadcastVehicleLocation(io: Server, data: LocationUpdate): void {
  io.to(`vehicle-${data.vehicleId}`).emit('vehicle-location-updated', data);
}

/**
 * Emitir cambio de estado de servicio
 */
export function broadcastServiceStatusChange(io: Server, data: ServiceStatusChange): void {
  io.emit('service-status-changed', data);
}

/**
 * Emitir alerta de inspector
 */
export function broadcastInspectorAlert(io: Server, data: InspectorAlert): void {
  io.emit('inspector-alert', data);
}

/**
 * Emitir inspección completada
 */
export function broadcastFleetCheckCompleted(io: Server, data: FleetCheckCompleted): void {
  io.emit('fleet-check-completed', data);
}

/**
 * Obtener usuarios conectados
 */
export function getConnectedUsers(): Array<{ userId: string; socketId: string }> {
  return Array.from(connectedUsers.entries()).map(([userId, socketId]) => ({
    userId,
    socketId,
  }));
}

/**
 * Obtener información de usuario por socket
 */
export function getUserBySocket(socketId: string): AuthUser | undefined {
  return socketUsers.get(socketId);
}

/**
 * Emitir actualización de trazado dinámico a las tablets de navegación a bordo
 */
export function broadcastRouteDeviation(io: Server, lineaId: string, payload: any): void {
  io.to(`linea_${lineaId}`).emit('actualizarTrazadoNavegacion', payload);
  logger.info(`[SOCKET] Navegación actualizada en caliente para la línea ${lineaId}`);
}
