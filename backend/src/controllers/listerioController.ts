import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import sqlDb from '../config/database';
import { writeAuditLog } from '../utils/logger';

/**
 * Controlador de Listería con Validación Normativa de Fatiga y Descanso Operativo
 * Protegido en ruta por requireRole(['ADMIN', 'LISTERO'])
 */
export async function crearAsignacionDiaria(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { coche_id, driver_id, linea_id, hora_inicio, hora_fin } = req.body;
  const userId = req.user?.id || 'SYSTEM';

  if (!coche_id || !driver_id || !linea_id || !hora_inicio || !hora_fin) {
    res.status(400).json({ error: 'Faltan campos obligatorios para la asignación.' });
    return;
  }

  try {
    // Encapsulado en Transacción Estricta de Knex
    await sqlDb.transaction(async (trx) => {
      // 1. Validación de Descanso: Buscar el último servicio finalizado del conductor
      const lastService = await trx('roster_assignments')
        .where('driver_id', driver_id)
        .andWhere('estado', 'FINALIZADO')
        .orderBy('hora_fin', 'desc')
        .first();

      if (lastService) {
        const lastEndTime = new Date(lastService.hora_fin).getTime();
        const newStartTime = new Date(hora_inicio).getTime();
        
        const hoursDiff = (newStartTime - lastEndTime) / (1000 * 60 * 60);
        
        if (hoursDiff < 8) {
          // Trazabilidad ISO 27001 (Infracción Detectada)
          writeAuditLog('WARN', userId, 'CONFIG_CHANGE', {
            action: 'ROSTER_ASSIGN_DENIED',
            reason: 'FATIGUE_VIOLATION',
            driver_id,
            hoursDiff
          });
          
          // Aborta la transacción
          res.status(400).json({ 
            error: 'Violación normativa: El conductor no cuenta con las 8 horas libres de descanso reglamentario.',
            horas_descanso: hoursDiff.toFixed(2)
          });
          return;
        }
      }

      // 2. Inserción Relacional Rígida
      const [newAssignment] = await trx('roster_assignments').insert({
        coche_id,
        driver_id,
        linea_id,
        hora_inicio,
        hora_fin,
        estado: 'PROGRAMADO'
      }).returning('*');

      // 3. Trazabilidad ISO 27001 (Éxito)
      writeAuditLog('INFO', userId, 'CONFIG_CHANGE', {
        action: 'ROSTER_ASSIGN_CREATED',
        assignment_id: newAssignment.id,
        driver_id,
        coche_id
      });

      res.status(201).json({
        ok: true,
        message: 'Asignación creada y validada normativamente.',
        data: newAssignment
      });
    });
  } catch (error) {
    writeAuditLog('ERROR', userId, 'CONFIG_CHANGE', {
      action: 'ROSTER_ASSIGN_ERROR',
      error: String(error)
    });
    res.status(500).json({ error: 'Falla crítica al procesar la asignación en la base de datos local.' });
  }
}
