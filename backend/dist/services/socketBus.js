"use strict";
/**
 * socketBus — Bus de eventos del sistema (FASE 5.30, 2026-05-21)
 *
 * Singleton accesible desde cualquier controller para emitir eventos de
 * propagación al frontend en vivo. Es la implementación técnica del
 * "TODO interconectado": cada acción operativa importante (asignar,
 * sancionar, registrar ausencia, simular consecuencias) emite un evento
 * que cualquier pantalla suscripta recibe inmediatamente.
 *
 * Convención de eventos:
 *   - bus:db:<collection>:<op>      crear/modificar/borrar en dbBridge
 *   - bus:cascade:effect            efecto generado por el motor
 *   - bus:operation:<tipo>          ausencia, reserva, vehículo-taller, etc.
 *   - bus:cascade:summary           resumen del último ciclo de propagación
 *
 * Sin acoplamiento bloqueante: si el socket no está montado (modo no
 * realtime, tests), las llamadas son no-op.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setBusServer = setBusServer;
exports.getBusServer = getBusServer;
exports.busEmit = busEmit;
exports.busDbEvent = busDbEvent;
exports.busCascade = busCascade;
exports.busOperation = busOperation;
const logger_1 = __importDefault(require("../config/logger"));
let _io = null;
function setBusServer(io) {
    _io = io;
    logger_1.default.info('[socketBus] Bus de propagación montado');
}
function getBusServer() {
    return _io;
}
/**
 * Emite un evento del bus a todos los clientes conectados. No-op si el
 * socket no está montado (no rompe el flujo de la request).
 */
function busEmit(event, payload = {}) {
    if (!_io) {
        logger_1.default.warn('[socketBus] emit DROPPED · io no montado', { event });
        return;
    }
    try {
        _io.emit(event, {
            ...payload,
            _ts: Date.now(),
            _event: event,
        });
        logger_1.default.info('[socketBus] emit ' + event, { keys: Object.keys(payload).slice(0, 5) });
    }
    catch (e) {
        logger_1.default.warn('[socketBus] error emitiendo evento', { event, err: String(e).slice(0, 120) });
    }
}
/**
 * Helper para eventos de dbBridge.
 */
function busDbEvent(collection, op, payload) {
    busEmit(`bus:db:${collection}:${op}`, { collection, op, ...payload });
    // Y al canal genérico:
    busEmit('bus:db:any', { collection, op, ...payload });
}
/**
 * Helper para resultado del motor de consecuencias.
 */
function busCascade(payload) {
    busEmit('bus:cascade:summary', payload);
}
/**
 * Helper para operaciones operativas (ausencia, reserva, etc.) que
 * tienen impacto cross-dominio.
 */
function busOperation(tipo, payload) {
    busEmit(`bus:operation:${tipo}`, payload);
    busEmit('bus:operation:any', { tipo, ...payload });
}
