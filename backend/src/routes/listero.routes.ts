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
import { computeConsequencesForEvent } from '../controllers/consequenceController';
import { busOperation } from '../services/socketBus';

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

    // FASE 5.30 (2026-05-21): trigger automático del motor de consecuencias
    // y emit al bus para que las pantallas conectadas vean el efecto en vivo.
    // No bloqueante: si el motor falla, la ausencia ya quedó registrada.
    computeConsequencesForEvent({
      tipo: 'CONDUCTOR_AUSENTE',
      conductorId,
      conductorNombre: conductorNombre ?? conductorId,
      codigoAusencia: String(motivo).toLowerCase().includes('injust') ? 'ausencia_injustificada' : motivo,
      duracionHoras: 8,
      kmEsperados: 120,
    }).catch((err) => logger.error('[LISTERO_ROUTE] consequencePreview error', { err: String(err) }));

    busOperation('ausencia', { conductorId, conductorNombre, fecha, motivo, registradoPor });

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
    busOperation('reserva-asignada', { turnoId, conductorReservaId, conductorReservaNombre, asignadoPor });
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

    // FASE 5.30 (2026-05-21): motor de consecuencias + bus.
    computeConsequencesForEvent({
      tipo: 'VEHICULO_FUERA_DE_SERVICIO',
      cocheId: vehiculoId,
      cocheNumero: vehiculoInterno ?? vehiculoId,
      motivoVehiculo: motivo,
      horasEstimadas: 4,
      kmPerdidos: 60,
    }).catch((err) => logger.error('[LISTERO_ROUTE] consequencePreview error', { err: String(err) }));

    busOperation('vehiculo-taller', { vehiculoId, vehiculoInterno, motivo, fecha: fechaHoy, registradoPor });

    res.json({ ok: true, mensaje: 'Vehículo marcado en taller. Cascada de alertas iniciada.' });
  }),
);

// ─── GENERAR PROGRAMACIÓN DEL DÍA ────────────────────────────────────────────

/**
 * POST /api/listero/generar-programacion
 *   body: { fecha: 'YYYY-MM-DD' }
 *
 * FASE 5.28 (2026-05-19): genera los turnos del día desde la última
 * rotación capturada por el watcher en `cartones_historial`. Devuelve
 * `{ ok, created, existing }`. Si ya hay turnos para esa fecha, no
 * duplica.
 */
router.post(
  '/generar-programacion',
  verifyAuth,
  wrap(async (req, res) => {
    const fecha = String(req.body?.fecha ?? new Date().toISOString().slice(0, 10));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      res.status(400).json({ ok: false, error: 'Formato esperado: fecha=YYYY-MM-DD' });
      return;
    }
    const existentes = await listeroService.getTurnosByFecha(fecha);
    if (existentes.length > 0) {
      res.json({ ok: true, created: 0, existing: existentes.length, fecha });
      return;
    }
    // Leer rotación del día desde cartones_historial.
    const sqlDb = (await import('../config/database')).default;
    const rows: Array<{ vehiculo_id: string; service_number: string | null; line: string | null }>
      = await sqlDb('cartones_historial')
        .select('vehiculo_id', 'service_number', 'line')
        .where('fecha', fecha);
    if (rows.length === 0) {
      res.json({ ok: true, created: 0, existing: 0, fecha, nota: 'No hay rotación capturada para esa fecha.' });
      return;
    }
    let created = 0;
    for (const r of rows) {
      try {
        // conductor_id es FK a personal(id); si no hay asignación aún,
        // dejamos null (FK lo permite). El listero asigna después.
        await listeroService.createTurno({
          fecha,
          vehiculoId: r.vehiculo_id,
          vehiculoInterno: r.vehiculo_id,
          lineaId: r.line ?? '',
          horaSalida: '00:00',
          horaLlegadaEstimada: '00:00',
          conductorId: null,
          conductorNombre: null,
          conductorInterno: null,
          servicioId: r.service_number ?? null,
        } as never);
        created += 1;
      } catch (e) {
        logger.warn('[listero/generar-programacion] turno no creado', { error: String(e) });
      }
    }
    res.json({ ok: true, created, existing: 0, fecha });
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
