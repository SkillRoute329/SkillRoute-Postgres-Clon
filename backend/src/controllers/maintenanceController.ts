import { Request, Response } from 'express';
import { AuthRequest } from '../types/index';
import { logger } from '../config/logger';
import sqlDb from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export const maintenanceController = {
  /**
   * POST /api/mantenimiento/ticket
   * Registra una denuncia de avería (EAM) y activa el bloqueo en cascada si es CRÍTICA.
   */
  async crearTicketAveria(req: AuthRequest, res: Response): Promise<void> {
    const { vehiculo_id, sector_afectado, gravedad, descripcion } = req.body;
    const reporter_id = req.user?.id;
    const { agency_id: query_agency_id } = req.query; 
    const final_agency_id = req.body.agency_id || query_agency_id;

    if (!vehiculo_id || !sector_afectado || !gravedad || !descripcion || !reporter_id || !final_agency_id) {
      res.status(400).json({ error: 'Parámetros obligatorios faltantes para el ticket de avería.' });
      return;
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
