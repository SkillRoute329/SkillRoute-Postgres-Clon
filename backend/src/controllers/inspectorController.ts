import { Request, Response } from 'express';
import { AuthRequest } from '../types/index';
import { logger } from '../config/logger';
import sqlDb from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export const inspectorController = {
  /**
   * POST /api/inspector/acta
   * Registra un acta de inspección (recaudación/evasión) validando geográficamente
   * que el inspector esté a menos de 30 metros del vehículo.
   */
  async registrarActaInspeccion(req: AuthRequest, res: Response): Promise<void> {
    const { agency_id, vehiculo_id, lat, lon, data_jsonb } = req.body;
    const inspector_id = req.user?.id;

    if (!agency_id || !vehiculo_id || !lat || !lon || !inspector_id) {
      res.status(400).json({ error: 'Faltan parámetros obligatorios (agency_id, vehiculo_id, lat, lon).' });
      return;
    }

    try {
      await sqlDb.transaction(async (trx) => {
        // 1. Obtener la configuración del inquilino para la proyección matemática (SRID)
        const tenant = await trx('tenant_configs').where('agency_id', agency_id).first();
        if (!tenant) {
          throw new Error('Configuración de inquilino no encontrada para la agencia provista.');
        }

        // 2. Sincronización de Listería (M1): Encontrar conductor asignado en este instante
        const roster = await trx('roster_assignments')
          .where('coche_id', vehiculo_id)
          .whereNotNull('hora_login_real')
          .whereNull('hora_logoff_real') // Activo
          .orderBy('hora_login_real', 'desc')
          .first();

        const driver_id = roster ? roster.driver_id : null;

        // 3. Validación Espacial Antifraude (PostGIS)
        // Último evento de telemetría del coche
        const lastTelemetry = await trx('vehicle_events')
          .where('id_bus', vehiculo_id)
          .orderBy('timestamp_gps', 'desc')
          .first();

        if (!lastTelemetry) {
          throw new Error('No hay telemetría reciente para el vehículo especificado.');
        }

        const pointInspectorGeom = trx.raw(`ST_SetSRID(ST_MakePoint(?, ?), 4326)`, [lon, lat]);

        const distQuery = await trx.raw(`
          SELECT ST_Distance(
            ST_Transform(?, ?),
            ST_Transform(?, ?)
          ) AS distancia_metros
        `, [
          pointInspectorGeom, tenant.postgis_srid,
          lastTelemetry.geom, tenant.postgis_srid
        ]);

        const distancia = parseFloat(distQuery.rows[0].distancia_metros);

        let estado_verificacion = 'FISCALIZADO_REAL';

        if (distancia > 30) {
          estado_verificacion = 'RECHAZADO_POR_FRAUDE';
          // Se requiere "lanzar un RAISE EXCEPTION impidiendo el fraude en frío."
          // Lanzamos error en la transacción Node.js que hará rollback.
          throw new Error(`Validación Antifraude: El inspector se encuentra a ${distancia.toFixed(2)}m del vehículo (límite 30m).`);
        }

        // 4. Inserción del Acta
        await trx('inspecciones').insert({
          id: uuidv4(),
          agency_id,
          vehiculo_id,
          fecha_inspeccion: trx.fn.now(),
          inspector_id,
          data_jsonb,
          geom: pointInspectorGeom,
          estado_verificacion,
          driver_id
        });
      });

      res.status(200).json({ success: true, message: 'Acta registrada e inspeccionada espacialmente.' });
    } catch (error: any) {
      logger.error(`Error en registrarActaInspeccion: ${error?.message || error}`);
      res.status(403).json({ error: error?.message || 'Error de validación espacial.' });
    }
  }
};
