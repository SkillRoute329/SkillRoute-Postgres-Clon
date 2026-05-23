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

import type { Server } from 'socket.io';
import logger from '../config/logger';

let _io: Server | null = null;

export function setBusServer(io: Server): void {
  _io = io;
  logger.info('[socketBus] Bus de propagación montado');
}

export function getBusServer(): Server | null {
  return _io;
}

/**
 * Emite un evento del bus a todos los clientes conectados. No-op si el
 * socket no está montado (no rompe el flujo de la request).
 */
export function busEmit(event: string, payload: Record<string, unknown> = {}): void {
  if (!_io) {
    logger.warn('[socketBus] emit DROPPED · io no montado', { event });
    return;
  }
  try {
    _io.emit(event, {
      ...payload,
      _ts: Date.now(),
      _event: event,
    });
    logger.info('[socketBus] emit ' + event, { keys: Object.keys(payload).slice(0, 5) });
  } catch (e) {
    logger.warn('[socketBus] error emitiendo evento', { event, err: String(e).slice(0, 120) });
  }
}

/**
 * Helper para eventos de dbBridge.
 */
export function busDbEvent(collection: string, op: 'created' | 'updated' | 'deleted', payload: Record<string, unknown>): void {
  busEmit(`bus:db:${collection}:${op}`, { collection, op, ...payload });
  // Y al canal genérico:
  busEmit('bus:db:any', { collection, op, ...payload });
}

/**
 * Helper para resultado del motor de consecuencias.
 */
export function busCascade(payload: { evento: Record<string, unknown>; efectos: unknown[]; resumen: Record<string, unknown> }): void {
  busEmit('bus:cascade:summary', payload);
}

/**
 * Helper para operaciones operativas (ausencia, reserva, etc.) que
 * tienen impacto cross-dominio.
 */
export function busOperation(tipo: string, payload: Record<string, unknown>): void {
  busEmit(`bus:operation:${tipo}`, payload);
  busEmit('bus:operation:any', { tipo, ...payload });
}
