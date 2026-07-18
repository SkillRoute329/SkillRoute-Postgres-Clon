import { Request, Response } from 'express';
import { AuthRequest } from '../types/index';
import { logger } from '../config/logger';
import sqlDb from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export const maintenanceController = {
  /**
   * POST /api/mantenimiento/ticket
   * Registra una denuncia de avería (EAM) y activa el bloqueo en cascada si es CRÍTICA.
   * Delegación a reportarAvariaEnCalle si incluye coordenadas de posición.
   */
  async crearTicketAveria(req: AuthRequest, res: Response): Promise<void> {
    const { vehiculo_id, sector_afectado, gravedad, descripcion, lat, lng } = req.body;
    const reporter_id = req.user?.id;
    const { agency_id: query_agency_id } = req.query; 
    const final_agency_id = req.body.agency_id || query_agency_id;

    if (!vehiculo_id || !sector_afectado || !gravedad || !descripcion || !reporter_id || !final_agency_id) {
      res.status(400).json({ error: 'Parámetros obligatorios faltantes para el ticket de avería.' });
      return;
    }

    // Si el cliente envía coordenadas, ejecutar el motor de evaluación espacial
    if (lat !== undefined && lng !== undefined) {
      return maintenanceController.reportarAvariaEnCalle(req, res);
    }

    try {
      await sqlDb.transaction(async (trx) => {
        // 1. Inserción inmutable del Ticket de Mantenimiento
        const ticket_id = uuidv4();
        await trx('maintenance_tickets').insert({
          id: ticket_id,
          agency_id: final_agency_id,
          vehiculo_id,
          reporter_id,
          sector_afectado,
          gravedad,
          descripcion,
          estado: 'PENDIENTE'
        });

        // 2. Interceptación y Cascada si la avería es CRÍTICA
        if (gravedad === 'CRITICA') {
          // Bloquear en flota
          await trx.raw(`
            UPDATE vehiculos 
            SET data_jsonb = jsonb_set(COALESCE(data_jsonb, '{}'::jsonb), '{estado_operativo}', '"TALLER"') 
            WHERE id = ? AND agency_id = ?
          `, [vehiculo_id, final_agency_id]);

          // Desafectar de listería activa
          await trx('roster_assignments')
            .where('coche_id', vehiculo_id)
            .whereNull('hora_logoff_real')
            .update({
              coche_id: null,
              estado: 'REEMPLAZO_REQUERIDO'
            });
        }
      });

      res.status(200).json({ success: true, message: 'Ticket EAM registrado exitosamente.' });
    } catch (error: any) {
      logger.error(`Error en crearTicketAveria: ${error?.message || error}`);
      res.status(500).json({ error: 'Error interno al procesar el ticket de mantenimiento.' });
    }
  },

  // ── Motor de Protección de Jornal Base por Incidencia Espacial ────────────
  // Escenario de Falla 2: Siniestro en Desvío — PostGIS ST_DWithin ~50 metros
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/mantenimiento/ticket  (con lat/lng en el body)
   *
   * Cuando el conductor envía coordenadas de su posición actual:
   *  1. Registra el ticket EAM en maintenance_tickets.
   *  2. Recupera la última telemetría del vehículo.
   *  3. Ejecuta ST_DWithin contra route_detours para evaluar proximidad (~50 m).
   *  4a. Si está en zona de desvío → INCIDENCIA_CALLE + jornal_equivalente = 1.0
   *  4b. Si NO está en zona de desvío → flujo normal CRITICA (REEMPLAZO_REQUERIDO)
   *  5. En ambos casos CRITICO/desvío → inserta traffic_alert para despacho de auxilio.
   */
  async reportarAvariaEnCalle(req: AuthRequest, res: Response): Promise<void> {
    const {
      vehiculo_id,
      sector_afectado,
      gravedad,
      descripcion,
      lat,
      lng,
    } = req.body as {
      vehiculo_id: string;
      sector_afectado: string;
      gravedad: string;
      descripcion: string;
      lat: number;
      lng: number;
    };

    const reporter_id = req.user?.id;
    const { agency_id: query_agency_id } = req.query;
    const final_agency_id = (req.body.agency_id as string) || (query_agency_id as string);

    if (!vehiculo_id || !sector_afectado || !gravedad || !descripcion || !reporter_id || !final_agency_id) {
      res.status(400).json({ error: 'Parámetros obligatorios faltantes.' });
      return;
    }
    if (lat === undefined || lng === undefined || isNaN(Number(lat)) || isNaN(Number(lng))) {
      res.status(400).json({ error: 'Coordenadas (lat/lng) obligatorias para evaluación espacial.' });
      return;
    }

    const trx = await sqlDb.transaction();
    try {
      // ── 1. Registrar el ticket EAM ─────────────────────────────────────
      const ticket_id = uuidv4();
      await trx('maintenance_tickets').insert({
        id: ticket_id,
        agency_id: final_agency_id,
        vehiculo_id,
        reporter_id,
        sector_afectado,
        gravedad,
        descripcion,
        estado: 'PENDIENTE',
      });

      // ── 2. Evaluar proximidad al desvío con PostGIS ST_DWithin ──────────
      // 0.00045 grados en EPSG:4326 ≈ 50 metros a la latitud de Montevideo
      const RADIO_DESVIO_GRADOS = 0.00045;

      const desvioResult = await trx.raw<{ rows: Array<{ desvio_id: string; nombre: string }> }>(`
        SELECT d.id AS desvio_id, d.nombre
        FROM route_detours d
        WHERE d.agency_id = ?
          AND d.activo = TRUE
          AND ST_DWithin(
            d.geom_excluyente,
            ST_SetSRID(ST_MakePoint(?, ?), 4326),
            ?
          )
        ORDER BY ST_Distance(d.geom_excluyente, ST_SetSRID(ST_MakePoint(?, ?), 4326))
        LIMIT 1
      `, [final_agency_id, lng, lat, RADIO_DESVIO_GRADOS, lng, lat]);

      const enZonaDesvio = desvioResult.rows.length > 0;
      const desvio = enZonaDesvio ? desvioResult.rows[0] : null;

      // ── 3. Obtener asignación activa del conductor (por driver_id o vehiculo) ─
      const asignacionActiva = await trx('roster_assignments')
        .where('driver_id', reporter_id)
        .whereNotIn('estado', ['FINALIZADO', 'CANCELADO'])
        .orderBy('created_at', 'desc')
        .first() as {
          id: string;
          linea_id: string | null;
          hora_inicio: string | null;
          driver_id: string;
        } | undefined;

      // ── 4. Aplicar estado según resultado espacial ──────────────────────
      if (enZonaDesvio && asignacionActiva) {
        // RAMA A: Bus varado en zona de desvío → INCIDENCIA_CALLE + escudo de jornal
        await trx('roster_assignments')
          .where('id', asignacionActiva.id)
          .update({
            estado:              'INCIDENCIA_CALLE',
            jornal_equivalente:  1.0,
            incidencia_geom:     trx.raw(`ST_SetSRID(ST_MakePoint(?, ?), 4326)`, [lng, lat]),
            incidencia_desvio_id: desvio!.desvio_id,
            incidencia_timestamp: trx.fn.now(),
            updated_at:          trx.fn.now(),
          });

        logger.info('[maintenance] INCIDENCIA_CALLE activada — jornal protegido', {
          ticket_id,
          driver_id: reporter_id,
          vehiculo_id,
          desvio_id: desvio!.desvio_id,
          lat, lng,
        });
      } else if (asignacionActiva && gravedad === 'CRITICA') {
        // RAMA B: No está en desvío, avería crítica → flujo normal
        await trx('roster_assignments')
          .where('id', asignacionActiva.id)
          .update({ estado: 'REEMPLAZO_REQUERIDO', updated_at: trx.fn.now() });

        await trx.raw(`
          UPDATE vehiculos
          SET data_jsonb = jsonb_set(COALESCE(data_jsonb, '{}'::jsonb), '{estado_operativo}', '"TALLER"')
          WHERE id = ? AND agency_id = ?
        `, [vehiculo_id, final_agency_id]);
      }

      // ── 5. Alerta de tráfico COCHE_VARADO para despacho inmediato de auxilio ─
      if (gravedad === 'CRITICA' || enZonaDesvio) {
        const horaStr = asignacionActiva?.hora_inicio
          ? new Date(asignacionActiva.hora_inicio).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })
          : 'N/D';

        const tipoAlerta = enZonaDesvio ? 'COCHE_VARADO_EN_DESVIO' : 'COCHE_VARADO_CRITICO';
        const mensajeAlerta = enZonaDesvio
          ? `SINIESTRO EN DESVÍO — Vehículo ${vehiculo_id} varado a ~50 m del desvío "${desvio!.nombre}". ` +
            `Línea ${asignacionActiva?.linea_id ?? '?'} (servicio ${horaStr}). ` +
            `Jornal del conductor PROTEGIDO. Se requiere auxilio mecánico inmediato.`
          : `COCHE VARADO — Vehículo ${vehiculo_id} reporta avería CRÍTICA (${sector_afectado}). ` +
            `Línea ${asignacionActiva?.linea_id ?? '?'}. Coordenadas: ${lat},${lng}.`;

        await trx('traffic_alerts').insert({
          agency_id:        final_agency_id,
          linea_id:         asignacionActiva?.linea_id ?? null,
          servicio_id:      asignacionActiva?.id ?? null,
          tipo_alerta:      tipoAlerta,
          nivel_gravedad:   'CRITICO',
          mensaje:          mensajeAlerta,
          driver_ausente_id: reporter_id,
          reten_asignado_id: null,
          resuelta:         false,
        });
      }

      await trx.commit();

      res.status(200).json({
        success: true,
        escudo_jornal_activado: enZonaDesvio,
        estado_asignacion:      enZonaDesvio ? 'INCIDENCIA_CALLE' : (gravedad === 'CRITICA' ? 'REEMPLAZO_REQUERIDO' : 'SIN_CAMBIO'),
        desvio_detectado:       desvio ?? null,
        message: enZonaDesvio
          ? 'Incidencia registrada. Jornal protegido bajo convenio de desvíos.'
          : 'Ticket EAM registrado.',
      });

    } catch (error: any) {
      await trx.rollback();
      logger.error(`[maintenance] Error en reportarAvariaEnCalle: ${error?.message || error}`);
      res.status(500).json({ error: 'Error interno al procesar la avería en calle.' });
    }
  },

  /**
   * GET /api/mantenimiento/rendimiento
   * Ejecuta agregación matemática en base de datos para auditar desvíos de rendimiento mecánico.
   */
  async controlRendimientoOperario(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Query SQL crudo que agrupa por operario y calcula el promedio de resolución en horas
      const result = await sqlDb.raw(`
        SELECT 
          w.operario_id,
          u.email AS operario_email,
          COUNT(w.id) AS total_tickets_resueltos,
          AVG(EXTRACT(EPOCH FROM (w.fecha_fin - w.fecha_inicio)) / 3600) AS promedio_horas_resolucion
        FROM maintenance_work_logs w
        JOIN users u ON w.operario_id = u.id
        WHERE w.fecha_fin IS NOT NULL
        GROUP BY w.operario_id, u.email
        ORDER BY promedio_horas_resolucion ASC;
      `);

      res.status(200).json({ success: true, data: result.rows });
    } catch (error: any) {
      logger.error(`Error en controlRendimientoOperario: ${error?.message || error}`);
      res.status(500).json({ error: 'Error al auditar el rendimiento de operarios.' });
    }
  },

  /**
   * GET /api/conductor/estado-coche
   * Consulta proactiva del panel del chofer. Si la unidad asignada está en foso, devuelve el flag de bloqueo.
   */
  async verificarEstadoCocheAsignado(req: AuthRequest, res: Response): Promise<void> {
    const driver_id = req.user?.id;

    if (!driver_id) {
      res.status(400).json({ error: 'Conductor no autenticado.' });
      return;
    }

    try {
      // Buscamos si el conductor tiene una asignación activa (incluso si coche_id es null por cascada o si está asignado a un coche en TALLER)
      const assignment = await sqlDb('roster_assignments')
        .where('driver_id', driver_id)
        .whereNull('hora_logoff_real')
        .orderBy('created_at', 'desc')
        .first();

      if (!assignment) {
        res.status(200).json({ success: true, bloqueado: false, mensaje: 'No hay turno activo.' });
        return;
      }

      // Si la cascada lo dejó en REEMPLAZO_REQUERIDO o nullificó su coche
      if (assignment.estado === 'REEMPLAZO_REQUERIDO' || !assignment.coche_id) {
        res.status(200).json({
          success: true,
          bloqueado: true,
          mensaje: 'UNIDAD DESAFECTADA POR AVERÍA CRÍTICA - DIRÍJASE A LISTERÍA'
        });
        return;
      }

      // Validar si el coche asignado fue inyectado con un ticket CRITICO pendiente que no barrió bien
      const ticketCritico = await sqlDb('maintenance_tickets')
        .where('vehiculo_id', assignment.coche_id)
        .where('gravedad', 'CRITICA')
        .whereIn('estado', ['PENDIENTE', 'EN_REPARACION'])
        .first();

      if (ticketCritico) {
        res.status(200).json({
          success: true,
          bloqueado: true,
          mensaje: 'UNIDAD DESAFECTADA POR AVERÍA CRÍTICA - DIRÍJASE A LISTERÍA'
        });
        return;
      }

      res.status(200).json({ success: true, bloqueado: false, coche_id: assignment.coche_id });
    } catch (error: any) {
      logger.error(`Error en verificarEstadoCocheAsignado: ${error?.message || error}`);
      res.status(500).json({ error: 'Error interno de verificación de flota.' });
    }
  }
};
