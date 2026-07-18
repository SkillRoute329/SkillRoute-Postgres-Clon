import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import sqlDb from '../config/database';
import { writeAuditLog } from '../utils/logger';

/**
 * Controlador de Gobernanza de Distribución Integral y Permutas Paperless
 */

/**
 * [ADMIN/LISTERO] reasignarOAlterarReglaTurno
 * Permite alterar un descanso o remover un chofer fijo de su quincena.
 * Exige justificación táctica de mínimo 15 caracteres auditada bajo ISO 27001.
 */
export async function reasignarOAlterarReglaTurno(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { driver_id, justificacion_motivo, nueva_hora_inicio, nueva_hora_fin, carton_id, coche_id } = req.body;
  const userId = req.user?.id || 'SYSTEM';

  // Validación Mandatoria de Justificación (ISO 27001)
  if (!justificacion_motivo || justificacion_motivo.length < 15) {
    res.status(400).json({ error: 'Violación de auditoría: Es obligatorio proveer una justificación táctica de al menos 15 caracteres.' });
    return;
  }

  try {
    await sqlDb.transaction(async (trx) => {
      // 1. Registro del historial Append-Only (Evita sobreescribir el pasado)
      await trx('driver_service_logs').insert({
        driver_id,
        coche_id,
        carton_id,
        hora_inicio: nueva_hora_inicio,
        hora_fin: nueva_hora_fin,
        modificado_por: userId,
        justificacion_motivo
      });
      
      // 2. Modificación táctica en la tabla viva de asignaciones
      await trx('roster_assignments')
        .where('driver_id', driver_id)
        .andWhere('estado', 'PROGRAMADO')
        .update({
          hora_inicio: nueva_hora_inicio,
          hora_fin: nueva_hora_fin
        });

      // 3. Trazabilidad de Alteración (AppSec)
      writeAuditLog('WARN', userId, 'CONFIG_CHANGE', { 
        action: 'ROSTER_OVERRIDE', 
        driver_id, 
        justificacion_motivo 
      });

      res.status(200).json({ ok: true, message: 'Alteración táctica ejecutada y auditada correctamente.' });
    });
  } catch (error) {
    res.status(500).json({ error: 'Falla crítica al intentar alterar la grilla de turnos.' });
  }
}

/**
 * [CONDUCTOR/LISTERO] obtenerMiHistorialCarton
 * Endpoint protegido para visualizar historial. Los conductores solo ven sus datos.
 */
export async function obtenerMiHistorialCarton(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  const role = req.user?.role;
  
  if (!userId || !role) {
    res.status(401).json({ error: 'No autorizado. Faltan credenciales criptográficas.' });
    return;
  }

  try {
    let query = sqlDb('driver_service_logs').select('*');
    
    // Filtro Inmutable de Privacidad (Aislamiento de Identidad)
    if (role === 'CONDUCTOR') {
      query = query.where('driver_id', userId);
    } else {
      // Listero/Admin pueden aplicar filtros opcionales
      const filterDriver = req.query.driver_id as string;
      if (filterDriver) {
        query = query.where('driver_id', filterDriver);
      }
    }

    const historial = await query.orderBy('hora_inicio', 'desc').limit(100);
    res.json({ ok: true, data: historial });
  } catch (error) {
    res.status(500).json({ error: 'Falla al procesar el historial de cartones.' });
  }
}

/**
 * [CONDUCTOR/LISTERO] registrarYSincronizarSolicitud
 * Algoritmo Matcher (Paperless) para permutas automatizadas con validación física.
 */
export async function registrarYSincronizarSolicitud(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { driver_id, coche_preferencia, tipo_solicitud } = req.body;
  const userId = req.user?.id || 'SYSTEM';

  try {
    await sqlDb.transaction(async (trx) => {
      // 1. Inserción de la solicitud base (Estado inicial PROCESANDO)
      const [newReq] = await trx('service_requests').insert({
        driver_id,
        coche_preferencia,
        tipo_solicitud,
        estado_solicitud: 'PROCESANDO'
      }).returning('*');

      let matched = false;

      // 2. Lógica Algorítmica Matcher
      if (tipo_solicitud === 'DOBLETE_CORRELATIVO' && coche_preferencia) {
        // Escaneo Automático: ¿Alguien pidió liberar el coche que deseo?
        const matchingRelease = await trx('service_requests')
          .where('coche_preferencia', coche_preferencia)
          .andWhere('tipo_solicitud', 'LIBERAR_TURNO')
          .andWhere('estado_solicitud', 'PENDIENTE')
          .first();

        if (matchingRelease) {
          // Análisis de Contexto Operativo
          const asignacionOrigen = await trx('roster_assignments')
            .where('driver_id', driver_id).andWhere('estado', 'PROGRAMADO').first();
          
          const asignacionDestino = await trx('roster_assignments')
            .where('driver_id', matchingRelease.driver_id).andWhere('coche_id', coche_preferencia).andWhere('estado', 'PROGRAMADO').first();

          if (asignacionOrigen && asignacionDestino) {
             // Validar Matemáticamente Ventana Logística de 45 minutos (Transbordos)
             let transbordoViable = true;
             
             if (asignacionOrigen.coche_id !== asignacionDestino.coche_id) {
                // Cálculo 100% PostgreSQL para evitar fisuras de reloj (Clock Skew)
                const dbResult = await trx.raw<{ rows: { minutos: string }[] }>(
                  "SELECT EXTRACT(EPOCH FROM (?::timestamp with time zone - ?::timestamp with time zone)) / 60 as minutos", 
                  [asignacionDestino.hora_inicio, asignacionOrigen.hora_fin]
                );
                
                const ventanaMinutos = parseFloat(dbResult.rows[0].minutos);
                
                if (ventanaMinutos < 45) {
                   transbordoViable = false; // Bloqueo físico: No hay tiempo para cambiar de coche
                }
             }

             if (transbordoViable) {
                // Filtro de Exclusión Mutua contra Solapamientos
                const solapamiento = await trx('roster_assignments')
                  .where('driver_id', driver_id)
                  .andWhere('estado', 'PROGRAMADO')
                  .andWhere(function() {
                    this.where('hora_inicio', '<', asignacionDestino.hora_fin)
                        .andWhere('hora_fin', '>', asignacionDestino.hora_inicio);
                  })
                  .first();

                if (solapamiento) {
                  res.status(400).json({ error: 'Colisión temporal detectada: El conductor ya posee un cartón solapado en ese horario.' });
                  return; // Rollback implícito
                }

                // Intercambio Atómico (Swap de Conductor)
                await trx('roster_assignments').where('id', asignacionDestino.id).update({ driver_id });
                
                // Actualizar solicitudes a emparejadas
                await trx('service_requests').whereIn('id', [newReq.id, matchingRelease.id]).update({ estado_solicitud: 'EMPARETADO' });
                
                writeAuditLog('INFO', userId, 'CONFIG_CHANGE', { action: 'PAPERLESS_MATCH_SUCCESS', req1: newReq.id, req2: matchingRelease.id });
                matched = true;
                res.json({ ok: true, message: 'Match exitoso: Permuta atómica completada.', estado: 'EMPARETADO' });
             }
          }
        }
      }

      // 3. Fallback a PENDIENTE y Protección de Personal Fijo Pasivo
      // Si el matcher no encontró compañero, queda PENDIENTE. Nunca altera a un chofer fijo que no haya levantado una solicitud.
      if (!matched) {
        await trx('service_requests').where('id', newReq.id).update({ estado_solicitud: 'PENDIENTE' });
        res.json({ ok: true, message: 'Solicitud registrada y encolada. Personal pasivo congelado.', estado: 'PENDIENTE' });
      }
    });
  } catch (error) {
    writeAuditLog('ERROR', userId, 'CONFIG_CHANGE', { action: 'SERVICE_REQUEST_ERROR', error: String(error) });
    res.status(500).json({ error: 'Falla crítica al procesar solicitud de distribución.' });
  }
}
