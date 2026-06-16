/**
 * Lógica de negocio para cartones (servicios completados)
 *
 * FASE 2.1 (2026-05-10): Migrado de Firestore (cartones_completados) a
 * PostgreSQL local. Schema en backend/src/database/schema_fase2.sql.
 *
 * Política de datos (regla -2):
 *   - Toda salida proviene de tabla `cartones_completados` en `skillroute_master`.
 *   - Si la DB no responde, el endpoint devuelve 500 (no inventa datos).
 *
 * No regresión (regla -1):
 *   - API pública preservada: getAllCartones, getCartonById, saveCarton, deleteCarton.
 *   - Shape del Carton retornado preserva la estructura Firestore (vía data_jsonb).
 */

import sqlDb from '../config/database';
import { Carton, AppError } from '../types/index';
import logger from '../config/logger';

interface CartonRow {
  id: string;
  agency_id: string | null;
  service_number: string | null;
  line: string | null;
  vehiculo_id: string | null;
  conductor_id: string | null;
  data_jsonb: Record<string, unknown> | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

function rowToCarton(row: CartonRow): Carton {
  // Preservar shape original Firestore: campos del data_jsonb se "spread" al raíz,
  // las columnas indexables (service_number, line, etc.) se exponen en camelCase.
  const data = row.data_jsonb ?? {};
  return {
    id: row.id,
    serviceNumber: row.service_number ?? (data as any).serviceNumber,
    line: row.line ?? (data as any).line,
    agencyId: row.agency_id ?? (data as any).agencyId,
    vehicleId: row.vehiculo_id ?? (data as any).vehicleId,
    conductorId: row.conductor_id ?? (data as any).conductorId,
    updatedBy: row.updated_by ?? (data as any).updatedBy,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    ...data,
  } as unknown as Carton;
}

/**
 * Obtener todos los cartones (con paginación implícita: máx 500 por defecto).
 * Regla -4 ESCALABILIDAD: nunca devolver tabla entera sin tope.
 */
export async function getAllCartones(limit = 500): Promise<Carton[]> {
  try {
    const rows = await sqlDb<CartonRow>('cartones_completados')
      .select('*')
      .orderBy('updated_at', 'desc')
      .limit(limit);

    logger.debug(`[CARTONES] Retrieved ${rows.length} cartones (limit=${limit})`);
    return rows.map(rowToCarton);
  } catch (error) {
    logger.error('[CARTONES] Error getting all cartones', { error: String(error) });
    throw new AppError(500, 'Error al obtener cartones');
  }
}

/**
 * Obtener un cartón específico por id.
 */
export async function getCartonById(id: string): Promise<Carton> {
  try {
    const row = await sqlDb<CartonRow>('cartones_completados')
      .where('id', id)
      .first();

    if (!row) {
      throw new AppError(404, 'Cartón no encontrado');
    }

    return rowToCarton(row);
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error(`[CARTONES] Error getting carton ${id}`, { error: String(error) });
    throw new AppError(500, 'Error al obtener cartón');
  }
}

/**
 * Crear o actualizar un cartón (UPSERT idempotente por id derivado).
 */
export async function saveCarton(carton: Carton, userId: string): Promise<string> {
  try {
    if (!carton.serviceNumber) {
      throw new AppError(400, 'serviceNumber es requerido');
    }

    const docId = `${carton.serviceNumber}_${carton.line || '300'}`;
    const now = new Date();

    // Datos derivados a columnas indexables; el resto va a data_jsonb completo.
    const row = {
      id: docId,
      agency_id: (carton as any).agencyId ?? null,
      service_number: carton.serviceNumber,
      line: carton.line ?? null,
      vehiculo_id: (carton as any).vehicleId ?? null,
      conductor_id: (carton as any).conductorId ?? null,
      data_jsonb: JSON.stringify({
        ...carton,
        updatedAt: now.toISOString(),
        updatedBy: userId,
      }),
      updated_by: userId,
      updated_at: now,
    };

    await sqlDb('cartones_completados')
      .insert(row)
      .onConflict('id')
      .merge();

    logger.info(`[CARTONES] Saved carton: ${docId} by user ${userId}`);
    return docId;
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('[CARTONES] Error saving carton', { error: String(error) });
    throw new AppError(500, 'Error al guardar cartón');
  }
}

/**
 * Eliminar un cartón.
 */
export async function deleteCarton(id: string, userId: string): Promise<void> {
  try {
    const deleted = await sqlDb('cartones_completados').where('id', id).delete();

    if (deleted === 0) {
      throw new AppError(404, 'Cartón no encontrado');
    }

    logger.info(`[CARTONES] Deleted carton: ${id} by user ${userId}`);
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error(`[CARTONES] Error deleting carton ${id}`, { error: String(error) });
    throw new AppError(500, 'Error al eliminar cartón');
  }
}
