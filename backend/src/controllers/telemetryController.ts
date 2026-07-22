import { Response } from 'express';
import { AuthRequest as AuthenticatedRequest } from '../types/index';
import sqlDb from '../config/database';
import { writeAuditLog } from '../utils/logger';

/**
 * Controlador de Telemetría Sincronizada y Regularidad STM
 */
export async function procesarCoordenadaFlota(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { cocheId, lineaId, direction_id, latitud, longitud, panic_active } = req.body;
  const userId = req.user?.id;

  if (!userId || !cocheId || !latitud || !longitud || !lineaId || typeof direction_id !== 'number') {
    res.status(400).json({ error: 'Faltan parámetros físicos (incluyendo direction_id obligatorio).' });
    return;
  }

  // Validación Estricta: Consumo de Variables de Entorno (IMM_API_KEY)
  const immApiKey = process.env.IMM_API_KEY;
  if (!immApiKey) {
    writeAuditLog('ERROR', userId, 'CONFIG_CHANGE', { action: 'IMM_API_KEY_MISSING' });
    res.status(500).json({ error: 'Falla crítica: Credenciales de la Intendencia (IMM_API_KEY) no configuradas en entorno local.' });
    return;
  }

  try {
    await sqlDb.transaction(async (trx) => {
      // 1. Acoplamiento de Cartón
      const asignacionActiva = await trx('roster_assignments')
        .where('coche_id', cocheId)
        .andWhere('estado', 'ACTIVO')
        .first();

      if (!asignacionActiva) {
        res.status(403).json({ error: 'Operación denegada: Coche no posee cartón activo.' });
        return;
      }

      // PROTOCOLO DE PÁNICO SORDA (Prioridad Máxima)
      if (panic_active === true) {
        await trx('incident_reports').insert({
          vehicle_id: cocheId,
          driver_id: asignacionActiva.driver_id,
          carton_id: asignacionActiva.id,
          direction_id,
          latitud,
          longitud,
          tipo_incidente: 'OTRO',
          mensaje: 'ALERTA MÁXIMA: BOTÓN DE PÁNICO ACTIVADO EN CABINA',
          estado: 'CRITICO'
        });

        writeAuditLog('ERROR', userId, 'CONFIG_CHANGE', { action: 'PANIC_BUTTON', cocheId, latitud, longitud });

        // Orden de control síncrona a la tablet: cambiar transmisión a 1 Hz
        res.status(200).json({ 
          ok: true, 
          comando_hardware: { forzar_frecuencia_transmision_ms: 1000 },
          message: 'Pánico interceptado y grabado. Forzando frecuencia de transmisión a 1 Hz.' 
        });
        return; 
      }

      // 2. Cálculo de Distancia con Aislamiento de Sentido (Haversine SQL)
      // Se excluyen totalmente los trazos de Vuelta si el direction_id es 0 (Ida)
      const haversineQuery = `
        WITH PuntosAislados AS (
          SELECT 
            s.shape_pt_lat as lat,
            s.shape_pt_lon as lon,
            s.shape_pt_sequence,
            st.arrival_time
          FROM gtfs.shapes s
          JOIN gtfs.trips t ON s.shape_id = t.shape_id
          JOIN gtfs.routes r ON t.route_id = r.route_id
          LEFT JOIN gtfs.stop_times st ON st.trip_id = t.trip_id AND s.shape_pt_sequence = st.stop_sequence
          WHERE r.route_short_name = ? AND t.direction_id = ?
        )
        SELECT 
          arrival_time,
          MIN(
            6371000 * 2 * ASIN(SQRT(
              POWER(SIN((? - CAST(lat AS FLOAT)) * PI() / 180 / 2), 2) +
              COS(? * PI() / 180) * COS(CAST(lat AS FLOAT) * PI() / 180) *
              POWER(SIN((? - CAST(lon AS FLOAT)) * PI() / 180 / 2), 2)
            ))
          ) as dist_metros
        FROM PuntosAislados
        GROUP BY arrival_time
        ORDER BY dist_metros ASC
        LIMIT 1
      `;
      
      const result = await trx.raw(haversineQuery, [lineaId, direction_id, latitud, latitud, longitud]);
      const closestPoint = result.rows[0];
      const distanciaMinima = closestPoint?.dist_metros || 0;

      // Infracción de Desvío a 50m
      if (distanciaMinima > 50) {
        await trx('incident_reports').insert({
          vehicle_id: cocheId,
          driver_id: asignacionActiva.driver_id,
          carton_id: asignacionActiva.id,
          direction_id,
          latitud,
          longitud,
          tipo_incidente: 'DESVIO',
          mensaje: `Alerta: Desvío detectado (${Math.round(distanciaMinima)} metros). Sentido Aislado: ${direction_id}`,
          estado: 'ACTIVO'
        });
      }

      // 3. Regularidad Horaria (Atrasos y Adelantos) Anti Falsos Positivos
      if (closestPoint && closestPoint.arrival_time) {
        const arrivalTimeStr = closestPoint.arrival_time; // HH:MM:SS
        const now = new Date();
        const [h, m, s] = arrivalTimeStr.split(':').map(Number);
        
        const theoreticalTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s);
        
        // Positivo = Atrasado (llegó más tarde de lo programado)
        // Negativo = Adelantado
        const diffMinutos = (now.getTime() - theoreticalTime.getTime()) / 60000;

        if (diffMinutos > 5) {
          await trx('incident_reports').insert({
            vehicle_id: cocheId,
            driver_id: asignacionActiva.driver_id,
            carton_id: asignacionActiva.id,
            direction_id,
            latitud,
            longitud,
            tipo_incidente: 'OTRO',
            mensaje: `ATRASO CRÍTICO DE FRECUENCIA: ${Math.round(diffMinutos)} minutos.`,
            estado: 'ACTIVO'
          });
        } else if (diffMinutos < -2) {
          await trx('incident_reports').insert({
            vehicle_id: cocheId,
            driver_id: asignacionActiva.driver_id,
            carton_id: asignacionActiva.id,
            direction_id,
            latitud,
            longitud,
            tipo_incidente: 'OTRO',
            mensaje: `ADELANTO CRÍTICO DE FRECUENCIA: ${Math.round(Math.abs(diffMinutos))} minutos.`,
            estado: 'ACTIVO'
          });
        }
      }

      res.status(200).json({ ok: true, message: 'Telemetría procesada bajo aislamiento esférico y validación IMM.' });
    });
  } catch (error) {
    writeAuditLog('ERROR', userId || 'SYSTEM', 'CONFIG_CHANGE', { action: 'TELEMETRY_CRASH', error: String(error) });
    res.status(500).json({ error: 'Falla en procesamiento de regularidad.' });
  }
}

/**
 * [ADMIN/LISTERO] ejecutarRelevoCocheEnRuta
 * Desvincula el coche roto del cartón activo y asocia un vehículo de auxilio mecánicamente,
 * manteniendo el historial de incidencias previas íntegro.
 */
export async function ejecutarRelevoCocheEnRuta(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { carton_id, coche_nuevo_id, justificacion_motivo } = req.body;
  const userId = req.user?.id;
  const role = req.user?.role;

  if (!userId || (role !== 'LISTERO' && role !== 'JEFATURA_TRANSITO' && role !== 'SuperAdmin')) {
    res.status(403).json({ error: 'Operación denegada: Privilegios requeridos para autorizar relevo de flota.' });
    return;
  }

  if (!carton_id || !coche_nuevo_id || !justificacion_motivo) {
    res.status(400).json({ error: 'Faltan parámetros del protocolo mecánico.' });
    return;
  }

  try {
    await sqlDb.transaction(async (trx) => {
      const carton = await trx('roster_assignments').where('id', carton_id).first();
      
      if (!carton) {
        res.status(404).json({ error: 'Cartón de servicio no encontrado.' });
        return;
      }

      const coche_antiguo_id = carton.coche_id;

      // 1. Población inmutable de auditoría (Sin destruir incidentes pasados)
      await trx('vehicle_swaps_in_route').insert({
        carton_id,
        coche_antiguo_id,
        coche_nuevo_id,
        justificacion_motivo,
        listero_id: userId
      });

      // 2. Hot-Swap (Relevo en Caliente) del coche físico
      await trx('roster_assignments').where('id', carton_id).update({
        coche_id: coche_nuevo_id
      });

      writeAuditLog('INFO', userId, 'CONFIG_CHANGE', { action: 'VEHICLE_HOT_SWAP', carton_id, coche_antiguo_id, coche_nuevo_id });
      
      res.status(200).json({ ok: true, message: 'Relevo mecánico de emergencia (Hot-Swap) consolidado exitosamente.' });
    });
  } catch (error) {
    writeAuditLog('ERROR', userId || 'SYSTEM', 'CONFIG_CHANGE', { action: 'SWAP_CRASH', error: String(error) });
    res.status(500).json({ error: 'Falla de base de datos durante relevo.' });
  }
}
