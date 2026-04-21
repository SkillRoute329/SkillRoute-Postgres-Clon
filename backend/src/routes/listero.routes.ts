/**
 * Rutas del Módulo Listero — /api/listero
 *
 * Gestión de programación diaria, ausencias, reservas y cascada operativa.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { verifyAuth } from '../middleware/auth';
import * as listeroService from '../services/listeroService';
import * as cascadeEngine from '../services/cascadeEngineService';
import logger from '../config/logger';

const router = Router();

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

// ─── TURNOS ──────────────────────────────────────────────────────────────────

/** GET /api/listero/turnos?fecha=YYYY-MM-DD */
router.get(
  '/turnos',
  verifyAuth,
  wrap(async (req, res) => {
    const fecha = (req.query.fecha as string) || new Date().toISOString().split('T')[0];
    const turnos = await listeroService.getTurnosByFecha(fecha);
    res.json({ ok: true, turnos });
  }),
);

/** POST /api/listero/turnos — crear nuevo turno */
router.post(
  '/turnos',
  verifyAuth,
  wrap(async (req, res) => {
    const turno = req.body as Omit<listeroService.TurnoDia, 'id' | 'createdAt' | 'updatedAt'>;
    if (!turno.fecha || !turno.vehiculoId || !turno.lineaId || !turno.horaSalida) {
      res.status(400).json({ ok: false, error: 'Faltan campos: fecha, vehiculoId, lineaId, horaSalida' });
      return;
    }
    const id = await listeroService.createTurno(turno);
    res.status(201).json({ ok: true, id });
  }),
);

/** PATCH /api/listero/turnos/:id — actualizar turno */
router.patch(
  '/turnos/:id',
  verifyAuth,
  wrap(async (req, res) => {
    await listeroService.updateTurno(req.params.id, req.body);
    res.json({ ok: true });
  }),
);

/** DELETE /api/listero/turnos/:id */
router.delete(
  '/turnos/:id',
  verifyAuth,
  wrap(async (req, res) => {
    await listeroService.deleteTurno(req.params.id);
    res.json({ ok: true });
  }),
);

// ─── CONDUCTORES ──────────────────────────────────────────────────────────────

/** GET /api/listero/conductores?fecha=YYYY-MM-DD */
router.get(
  '/conductores',
  verifyAuth,
  wrap(async (req, res) => {
    const fecha = (req.query.fecha as string) || new Date().toISOString().split('T')[0];
    const conductores = await listeroService.getConductoresDia(fecha);
    res.json({ ok: true, conductores });
  }),
);

/** POST /api/listero/ausencia — registrar ausencia y disparar cascada */
router.post(
  '/ausencia',
  verifyAuth,
  wrap(async (req, res) => {
    const { conductorId, conductorNombre, fecha, motivo } = req.body;
    if (!conductorId || !fecha || !motivo) {
      res.status(400).json({ ok: false, error: 'Faltan campos: conductorId, fecha, motivo' });
      return;
    }
    const user = (req as any).user;
    const registradoPor = user?.fullName ?? user?.id ?? 'sistema';

    // Disparar cascada completa (async, no bloqueante para la respuesta)
    cascadeEngine
      .procesarAusenciaConductor(
        conductorId,
        conductorNombre ?? conductorId,
        fecha,
        motivo,
        registradoPor,
      )
      .catch((err) => logger.error('[LISTERO_ROUTE] Error en cascada ausencia', { err: String(err) }));

    res.json({ ok: true, mensaje: 'Ausencia registrada. Cascada de alertas iniciada.' });
  }),
);

/** POST /api/listero/reserva — asignar conductor de reserva a un turno */
router.post(
  '/reserva',
  verifyAuth,
  wrap(async (req, res) => {
    const { turnoId, conductorReservaId, conductorReservaNombre } = req.body;
    if (!turnoId || !conductorReservaId) {
      res.status(400).json({ ok: false, error: 'Faltan campos: turnoId, conductorReservaId' });
      return;
    }
    const user = (req as any).user;
    const asignadoPor = user?.fullName ?? user?.id ?? 'sistema';
    await listeroService.asignarReserva(turnoId, conductorReservaId, conductorReservaNombre ?? '', asignadoPor);
    res.json({ ok: true, mensaje: 'Reserva asignada correctamente.' });
  }),
);

// ─── VEHÍCULOS ────────────────────────────────────────────────────────────────

/** GET /api/listero/vehiculos-reserva?fecha=YYYY-MM-DD */
router.get(
  '/vehiculos-reserva',
  verifyAuth,
  wrap(async (req, res) => {
    const fecha = (req.query.fecha as string) || new Date().toISOString().split('T')[0];
    const vehiculos = await listeroService.buscarVehiculosReserva(fecha);
    res.json({ ok: true, vehiculos });
  }),
);

/** POST /api/listero/vehiculo-taller — marcar vehículo en taller y disparar cascada */
router.post(
  '/vehiculo-taller',
  verifyAuth,
  wrap(async (req, res) => {
    const { vehiculoId, vehiculoInterno, motivo, fecha } = req.body;
    if (!vehiculoId || !motivo) {
      res.status(400).json({ ok: false, error: 'Faltan campos: vehiculoId, motivo' });
      return;
    }
    const user = (req as any).user;
    const registradoPor = user?.fullName ?? user?.id ?? 'sistema';
    const fechaHoy = fecha ?? new Date().toISOString().split('T')[0];

    cascadeEngine
      .procesarVehiculoEnTaller(vehiculoId, vehiculoInterno ?? vehiculoId, motivo, registradoPor, fechaHoy)
      .catch((err) => logger.error('[LISTERO_ROUTE] Error en cascada taller', { err: String(err) }));

    res.json({ ok: true, mensaje: 'Vehículo marcado en taller. Cascada de alertas iniciada.' });
  }),
);

// ─── FIRMA DIGITAL DEL CARTÓN ─────────────────────────────────────────────────

/** POST /api/listero/firma — conductor firma su cartón del día */
router.post(
  '/firma',
  verifyAuth,
  wrap(async (req, res) => {
    const { turnoId, horaFirma } = req.body;
    const user = (req as any).user;
    if (!turnoId) {
      res.status(400).json({ ok: false, error: 'Falta turnoId' });
      return;
    }
    const hora = horaFirma ?? new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });
    await listeroService.registrarFirma(turnoId, user.id, hora);
    res.json({ ok: true, horaFirma: hora });
  }),
);

// ─── ALERTAS ──────────────────────────────────────────────────────────────────

/** GET /api/listero/alertas?fecha=YYYY-MM-DD&historial=true */
router.get(
  '/alertas',
  verifyAuth,
  wrap(async (req, res) => {
    const fecha = (req.query.fecha as string) || new Date().toISOString().split('T')[0];
    const historial = req.query.historial === 'true';
    const alertas = historial
      ? await cascadeEngine.getHistorialAlertas(fecha)
      : await cascadeEngine.getAlertasActivas(fecha);
    res.json({ ok: true, alertas });
  }),
);

/** PATCH /api/listero/alertas/:id/atender */
router.patch(
  '/alertas/:id/atender',
  verifyAuth,
  wrap(async (req, res) => {
    const user = (req as any).user;
    await cascadeEngine.atenderAlerta(req.params.id, user?.fullName ?? user?.id ?? 'desconocido');
    res.json({ ok: true });
  }),
);

// ─── RESUMEN DIARIO ───────────────────────────────────────────────────────────

/** GET /api/listero/resumen?fecha=YYYY-MM-DD */
router.get(
  '/resumen',
  verifyAuth,
  wrap(async (req, res) => {
    const fecha = (req.query.fecha as string) || new Date().toISOString().split('T')[0];
    const resumen = await listeroService.getResumenDiario(fecha);
    res.json({ ok: true, resumen });
  }),
);

export default router;
