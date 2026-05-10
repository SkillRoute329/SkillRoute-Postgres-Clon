/**
 * Lógica de negocio para gestión de flota
 *
 * FASE 2.2 (2026-05-10): Limpieza del import muerto de firebase-admin.
 * El service ya estaba 100% migrado a Postgres en una fase previa.
 * Tablas usadas: vehiculos, inspecciones (ambas en schema_inicial.sql).
 */

import sqlDb from '../config/database';
import { Vehicle, FleetCheck, AppError } from '../types/index';
import logger from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Obtener todos los vehículos (Desde PostgreSQL Local)
 */
export async function getAllVehicles(): Promise<Vehicle[]> {
  try {
    const rows = await sqlDb('vehiculos').select('*');
    
    // Normalizar salida JSONB y columnas mapeadas
    const vehicles = rows.map(row => {
      const data = row.data_jsonb || {};
      return {
        id: row.id,
        internalNumber: row.internal_number,
        plate: row.plate,
        agencyId: row.agency_id,
        ...data
      } as Vehicle;
    });

    logger.info(`[FLEET-SOBERANO] Recuperados ${vehicles.length} vehículos del servidor local.`);
    return vehicles;
  } catch (error) {
    logger.error('[FLEET] Error al recuperar flota local', { error: String(error) });
    throw new AppError(500, 'Error en servidor de flota');
  }
}

/**
 * Obtener un vehículo específico (Desde PostgreSQL Local)
 */
export async function getVehicleById(id: string): Promise<Vehicle> {
  try {
    const row = await sqlDb('vehiculos').where('id', id).first();

    if (!row) {
      throw new AppError(404, 'Vehículo no registrado localmente');
    }

    return {
      id: row.id,
      internalNumber: row.internal_number,
      plate: row.plate,
      agencyId: row.agency_id,
      ...(row.data_jsonb || {})
    } as Vehicle;

  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error(`[FLEET] Error getting local vehicle ${id}`, { error: String(error) });
    throw new AppError(500, 'Error al obtener vehículo');
  }
}

/**
 * Crear inspección de vehículo en DB Local (Soberanía Total)
 */
export async function createFleetCheck(check: FleetCheck, userId: string): Promise<string> {
  try {
    if (!check.vehicleId) {
      throw new AppError(400, 'vehicleId es requerido');
    }

    const newId = uuidv4(); // Generar ID único local
    const now = new Date();

    // 1. Insertar en la tabla `inspecciones` PostgreSQL
    await sqlDb('inspecciones').insert({
      id: newId,
      agency_id: '70', // Default por simplificación en demo, o tomar de middleware req.user.agencyId
      vehiculo_id: String(check.vehicleId),
      fecha_inspeccion: now,
      inspector_id: userId,
      data_jsonb: JSON.stringify({
        ...check,
        driverId: userId,
        timestamp: now.toISOString(),
        fuente: 'LOCAL_SOVEREIGN'
      })
    });

    // 2. Actualizar metadatos del vehículo (lastCheck) atómicamente
    await sqlDb('vehiculos')
      .where('id', String(check.vehicleId))
      .update({
        data_jsonb: sqlDb.raw("data_jsonb || ?", [JSON.stringify({
          lastCheckStatus: check.status || 'OK',
          lastCheckDate: now.toISOString(),
          currentDriver: check.driverLegajo
        })])
      });

    logger.info(`[FLEET-SOBERANO] Inspección registrada LOCALMENTE: ${newId} para coche ${check.vehicleId}`);
    return newId;

  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('[FLEET-SOBERANO] Error creando inspección local', { error: String(error) });
    throw new AppError(500, 'Error procesando inspección en servidor físico');
  }
}

/**
 * Obtener histórico de inspecciones desde PostgreSQL
 */
export async function getVehicleChecks(vehicleId: string): Promise<FleetCheck[]> {
  try {
    const rows = await sqlDb('inspecciones')
      .where('vehiculo_id', vehicleId)
      .orderBy('fecha_inspeccion', 'desc')
      .limit(50);

    const checks = rows.map(row => {
      return {
        id: row.id,
        ...(row.data_jsonb || {}),
        timestamp: row.fecha_inspeccion
      } as FleetCheck;
    });

    logger.info(`[FLEET-SOBERANO] Recuperadas ${checks.length} inspecciones locales para coche ${vehicleId}`);
    return checks;

  } catch (error) {
    logger.error(`[FLEET] Error getting local inspections`, { error: String(error) });
    throw new AppError(500, 'Error al leer histórico local');
  }
}

