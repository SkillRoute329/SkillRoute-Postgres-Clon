import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import sqlDb from '../config/database';
import { writeAuditLog } from '../utils/logger';

/**
 * Controlador de Telemetría no Bloqueante (Anti-Event Loop Freeze)
 */
export async function procesarCoordenadaFlota(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { cocheId, lineaId, sentido, latitud, longitud } = req.body;
  const userId = req.user?.id;

  if (!userId || !cocheId || !latitud || !longitud || !lineaId || !sentido) {
    res.status(400).json({ error: 'Faltan parámetros físicos o telemetría inválida.' });
    return;
  }

  try {
    await sqlDb.transaction(async (trx) => {
      // 1. Acoplamiento de Cartón (Obligatorio)
      const asignacionActiva = await trx('roster_assignments')
        .where('coche_id', cocheId)
        .andWhere('estado', 'ACTIVO')
        .first();

      if (!asignacionActiva) {
        res.status(403).json({ error: 'Operación denegada: Coche no posee cartón activo en la grilla operativa.' });
        return;
      }

      // 2. Consulta Relacional Dinámica (Fuente Única de Verdad)
      const desvioActivo = await trx('route_deviations')
        .where('linea_id', lineaId)
        .andWhere('sentido_direccion', sentido)
        .andWhere('activo', true)
        .first();

      let distanciaMinima = 0;

      // 3. Algoritmo Haversine SQL Sincronizado (Cálculo de Distancia Esférica Real)
      // Se delega 100% al motor PostgreSQL para no saturar el Hilo Principal de Node.js
      if (desvioActivo) {
        const haversineQuery = `
          SELECT MIN(
            6371000 * 2 * ASIN(SQRT(
              POWER(SIN((? - CAST(pt.lat AS FLOAT)) * PI() / 180 / 2), 2) +
              COS(? * PI() / 180) * COS(CAST(pt.lat AS FLOAT) * PI() / 180) *
              POWER(SIN((? - CAST(pt.lng AS FLOAT)) * PI() / 180 / 2), 2)
            ))
          ) as dist_metros
          FROM json_to_recordset(?::json) AS pt(lat text, lng text)
        `;
        const result = await trx.raw(haversineQuery, [latitud, latitud, longitud, desvioActivo.geometria_desvio]);
        distanciaMinima = result.rows[0].dist_metros || 0;
      } else {
        // Usar la base de GTFS oficial
        const haversineQuery = `
          SELECT MIN(
            6371000 * 2 * ASIN(SQRT(
              POWER(SIN((? - CAST(s.shape_pt_lat AS FLOAT)) * PI() / 180 / 2), 2) +
              COS(? * PI() / 180) * COS(CAST(s.shape_pt_lat AS FLOAT) * PI() / 180) *
              POWER(SIN((? - CAST(s.shape_pt_lon AS FLOAT)) * PI() / 180 / 2), 2)
            ))
          ) as dist_metros
          FROM gtfs.shapes s
          JOIN gtfs.trips t ON s.shape_id = t.shape_id
          JOIN gtfs.routes r ON t.route_id = r.route_id
          WHERE r.route_short_name = ?
        `;
        const result = await trx.raw(haversineQuery, [latitud, latitud, longitud, lineaId]);
        distanciaMinima = result.rows[0].dist_metros || 0;
      }

      // 4. Alerta de Infracción Inmune
      if (distanciaMinima > 50) {
        await trx('incident_reports').insert({
          vehicle_id: cocheId,
          driver_id: asignacionActiva.driver_id,
          carton_id: asignacionActiva.id,
          latitud,
          longitud,
          tipo_incidente: 'DESVIO',
          mensaje: `Alerta de telemetría: Desvío crítico detectado (${Math.round(distanciaMinima)} metros del trazado dinámico)`,
          estado: 'ACTIVO'
        });

        // Trazabilidad Estricta ISO 27001
        writeAuditLog('WARN', userId, 'ROUTE_DEVIATION', { cocheId, driver_id: asignacionActiva.driver_id, latitud, longitud, metros: Math.round(distanciaMinima) });
      }

      res.status(200).json({ ok: true, message: 'Coordenada procesada bajo validación espacial estricta SQL.' });
    });
  } catch (error) {
    writeAuditLog('ERROR', userId || 'SYSTEM', 'CONFIG_CHANGE', { action: 'TELEMETRY_CRASH', error: String(error) });
    res.status(500).json({ error: 'Falla crítica en procesamiento espacial.' });
  }
}
