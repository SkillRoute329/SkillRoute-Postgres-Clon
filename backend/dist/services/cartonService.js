"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllCartones = getAllCartones;
exports.getCartonById = getCartonById;
exports.saveCarton = saveCarton;
exports.deleteCarton = deleteCarton;
const database_1 = __importDefault(require("../config/database"));
const index_1 = require("../types/index");
const logger_1 = __importDefault(require("../config/logger"));
function rowToCarton(row) {
    // Preservar shape original Firestore: campos del data_jsonb se "spread" al raíz,
    // las columnas indexables (service_number, line, etc.) se exponen en camelCase.
    const data = row.data_jsonb ?? {};
    return {
        id: row.id,
        serviceNumber: row.service_number ?? data.serviceNumber,
        line: row.line ?? data.line,
        agencyId: row.agency_id ?? data.agencyId,
        vehicleId: row.vehiculo_id ?? data.vehicleId,
        conductorId: row.conductor_id ?? data.conductorId,
        updatedBy: row.updated_by ?? data.updatedBy,
        updatedAt: row.updated_at,
        createdAt: row.created_at,
        ...data,
    };
}
/**
 * Obtener todos los cartones (con paginación implícita: máx 500 por defecto).
 * Regla -4 ESCALABILIDAD: nunca devolver tabla entera sin tope.
 */
async function getAllCartones(limit = 500) {
    try {
        const rows = await (0, database_1.default)('cartones_completados')
            .select('*')
            .orderBy('updated_at', 'desc')
            .limit(limit);
        logger_1.default.debug(`[CARTONES] Retrieved ${rows.length} cartones (limit=${limit})`);
        return rows.map(rowToCarton);
    }
    catch (error) {
        logger_1.default.error('[CARTONES] Error getting all cartones', { error: String(error) });
        throw new index_1.AppError(500, 'Error al obtener cartones');
    }
}
/**
 * Obtener un cartón específico por id.
 */
async function getCartonById(id) {
    try {
        const row = await (0, database_1.default)('cartones_completados')
            .where('id', id)
            .first();
        if (!row) {
            throw new index_1.AppError(404, 'Cartón no encontrado');
        }
        return rowToCarton(row);
    }
    catch (error) {
        if (error instanceof index_1.AppError)
            throw error;
        logger_1.default.error(`[CARTONES] Error getting carton ${id}`, { error: String(error) });
        throw new index_1.AppError(500, 'Error al obtener cartón');
    }
}
/**
 * Crear o actualizar un cartón (UPSERT idempotente por id derivado).
 */
async function saveCarton(carton, userId) {
    try {
        if (!carton.serviceNumber) {
            throw new index_1.AppError(400, 'serviceNumber es requerido');
        }
        const docId = `${carton.serviceNumber}_${carton.line || '300'}`;
        const now = new Date();
        // Datos derivados a columnas indexables; el resto va a data_jsonb completo.
        const row = {
            id: docId,
            agency_id: carton.agencyId ?? null,
            service_number: carton.serviceNumber,
            line: carton.line ?? null,
            vehiculo_id: carton.vehicleId ?? null,
            conductor_id: carton.conductorId ?? null,
            data_jsonb: JSON.stringify({
                ...carton,
                updatedAt: now.toISOString(),
                updatedBy: userId,
            }),
            updated_by: userId,
            updated_at: now,
        };
        await (0, database_1.default)('cartones_completados')
            .insert(row)
            .onConflict('id')
            .merge();
        logger_1.default.info(`[CARTONES] Saved carton: ${docId} by user ${userId}`);
        return docId;
    }
    catch (error) {
        if (error instanceof index_1.AppError)
            throw error;
        logger_1.default.error('[CARTONES] Error saving carton', { error: String(error) });
        throw new index_1.AppError(500, 'Error al guardar cartón');
    }
}
/**
 * Eliminar un cartón.
 */
async function deleteCarton(id, userId) {
    try {
        const deleted = await (0, database_1.default)('cartones_completados').where('id', id).delete();
        if (deleted === 0) {
            throw new index_1.AppError(404, 'Cartón no encontrado');
        }
        logger_1.default.info(`[CARTONES] Deleted carton: ${id} by user ${userId}`);
    }
    catch (error) {
        if (error instanceof index_1.AppError)
            throw error;
        logger_1.default.error(`[CARTONES] Error deleting carton ${id}`, { error: String(error) });
        throw new index_1.AppError(500, 'Error al eliminar cartón');
    }
}
