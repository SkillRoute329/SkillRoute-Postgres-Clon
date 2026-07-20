"use strict";
/**
 * Servicio de eventos en tiempo real con Socket.io
 * Maneja toda la comunicación bidireccional entre clientes y servidor
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeSocket = initializeSocket;
exports.broadcastVehicleLocation = broadcastVehicleLocation;
exports.broadcastServiceStatusChange = broadcastServiceStatusChange;
exports.broadcastInspectorAlert = broadcastInspectorAlert;
exports.broadcastFleetCheckCompleted = broadcastFleetCheckCompleted;
exports.getConnectedUsers = getConnectedUsers;
exports.getUserBySocket = getUserBySocket;
exports.broadcastRouteDeviation = broadcastRouteDeviation;
const logger_1 = __importDefault(require("../config/logger"));
const index_1 = require("../types/index");
// Mapeo de usuarios conectados
const connectedUsers = new Map(); // userId -> socketId
const socketUsers = new Map(); // socketId -> AuthUser
/**
 * Inicializar Socket.io con autenticación
 */
function initializeSocket(io) {
    logger_1.default.info('🔌 Socket.io inicializado');
    // Middleware de autenticación
    io.use((socket, next) => {
        const user = socket.handshake.auth.user;
        if (!user) {
            return next(new index_1.AppError(401, 'Authentication required: Acceso denegado por políticas de AppSec'));
        }
        next();
    });
    // Manejo de conexiones
    io.on('connection', (socket) => {
        const user = socket.handshake.auth.user;
        logger_1.default.info(`[SOCKET] Usuario conectado: ${user.id} (${user.fullName})`, {
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
        socket.on('location-update', (data) => {
            logger_1.default.debug('[SOCKET] location-update', { vehicleId: data.vehicleId });
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
        socket.on('service-status-changed', (data) => {
            logger_1.default.info('[SOCKET] service-status-changed', {
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
            logger_1.default.info('[AUDIT] Service status changed', {
                serviceId: data.serviceId,
                status: data.status,
                userId: user.id,
            });
        });
        /**
         * inspector-alert: Inspector reporta una alerta
         */
        socket.on('inspector-alert', (data) => {
            logger_1.default.warn('[SOCKET] inspector-alert', {
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
                logger_1.default.error('[CRITICAL ALERT]', {
                    vehicleId: data.vehicleId,
                    message: data.message,
                    inspector: user.fullName,
                });
            }
        });
        /**
         * fleet-check-completed: Inspector completó inspección de vehículo
         */
        socket.on('fleet-check-completed', (data) => {
            logger_1.default.info('[SOCKET] fleet-check-completed', { vehicleId: data.vehicleId });
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
        socket.on('join-room', (roomName) => {
            if (!roomName || typeof roomName !== 'string') {
                socket.emit('error', { message: 'Invalid room name' });
                return;
            }
            socket.join(roomName);
            logger_1.default.debug('[SOCKET] User joined room', { userId: user.id, room: roomName });
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
        socket.on('leave-room', (roomName) => {
            socket.leave(roomName);
            logger_1.default.debug('[SOCKET] User left room', { userId: user.id, room: roomName });
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
            logger_1.default.info('[SOCKET] Usuario desconectado', {
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
            logger_1.default.error('[SOCKET] Error', {
                userId: user.id,
                error: String(error),
            });
        });
    });
}
/**
 * Emitir ubicación de vehículo a clientes específicos
 */
function broadcastVehicleLocation(io, data) {
    io.to(`vehicle-${data.vehicleId}`).emit('vehicle-location-updated', data);
}
/**
 * Emitir cambio de estado de servicio
 */
function broadcastServiceStatusChange(io, data) {
    io.emit('service-status-changed', data);
}
/**
 * Emitir alerta de inspector
 */
function broadcastInspectorAlert(io, data) {
    io.emit('inspector-alert', data);
}
/**
 * Emitir inspección completada
 */
function broadcastFleetCheckCompleted(io, data) {
    io.emit('fleet-check-completed', data);
}
/**
 * Obtener usuarios conectados
 */
function getConnectedUsers() {
    return Array.from(connectedUsers.entries()).map(([userId, socketId]) => ({
        userId,
        socketId,
    }));
}
/**
 * Obtener información de usuario por socket
 */
function getUserBySocket(socketId) {
    return socketUsers.get(socketId);
}
/**
 * Emitir actualización de trazado dinámico a las tablets de navegación a bordo
 */
function broadcastRouteDeviation(io, lineaId, payload) {
    io.to(`linea_${lineaId}`).emit('actualizarTrazadoNavegacion', payload);
    logger_1.default.info(`[SOCKET] Navegación actualizada en caliente para la línea ${lineaId}`);
}
