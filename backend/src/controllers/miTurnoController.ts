/**
 * miTurnoController — Endpoint para que el conductor obtenga su turno
 * activo de hoy (FASE 5.36, 2026-05-22).
 *
 *   GET /api/mi-turno  → busca en turnos_dia el turno asignado al user
 *                        autenticado para la fecha de hoy.
 *
 * Lo consume la vista `/dashboard/driver/mi-linea` para saber qué línea
 * y coche está corriendo el chofer en este momento y filtrar el feed de
 * cascadas a esa línea.
 */

import { Request, Response } from 'express';
import sqlDb from '../config/database';
import logger from '../config/logger';

export async function getMiTurno(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as Request & { user?: { id?: string; internalNumber?: string } }).user;
    const userId = user?.id ?? user?.internalNumber ?? '';
    if (!userId) {
      res.status(401).json({ ok: false, error: 'No autenticado' });
      return;
    }
    const hoy = new Date().toISOString().slice(0, 10);

    // turnos_dia.conductor_id es FK a personal(id). Buscamos por id directo
    // O por internal_number igual al userId (legacy).
    const row = await sqlDb('turnos_dia as t')
      .leftJoin('personal as p', 't.conductor_id', 'p.id')
      .select(
        't.id',
        't.fecha',
        't.linea_id',
        't.vehiculo_id',
        't.vehiculo_interno',
        't.hora_salida',
        't.hora_llegada_estimada',
        't.estado',
        't.agency_id',
        't.firma_conductor',
        't.hora_firma',
        'p.full_name as conductor_nombre',
        'p.internal_number as conductor_interno',
      )
      .where('t.fecha', hoy)
      .andWhere((b) => {
        b.where('t.conductor_id', userId)
         .orWhere('p.internal_number', userId);
      })
      .orderBy('t.hora_salida', 'asc')
      .first();

    if (!row) {
      res.json({
        ok: true,
        turno: null,
        nota: `No hay turno asignado para hoy (${hoy}) al usuario ${userId}.`,
      });
      return;
    }

    res.json({ ok: true, turno: row });
  } catch (err) {
    logger.error('[mi-turno]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error consultando turno' });
  }
}
