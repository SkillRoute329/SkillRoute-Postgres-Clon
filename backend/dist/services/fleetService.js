"use strict";
/**
 * Lógica de negocio para gestión de flota
 *
 * FASE 2.2 (2026-05-10): Limpieza del import muerto de firebase-admin.
 * El service ya estaba 100% migrado a Postgres en una fase previa.
 * Tablas usadas: vehiculos, inspecciones (ambas en schema_inicial.sql).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllVehicles = getAllVehicles;
exports.getVehicleById = getVehicleById;
exports.createFleetCheck = createFleetCheck;
exports.getVehicleChecks = getVehicleChecks;
const database_1 = __importDefault(require("../config/database"));
const index_1 = require("../types/index");
const logger_1 = __importDefault(require("../config/logger"));
const uuid_1 = require("uuid");
/**
 * Obtener todos los vehículos (Desde PostgreSQL Local)
 */
async function getAllVehicles() {
    try {
        const rows = await (0, database_1.default)('vehiculos').select('*');
        // Normalizar salida JSONB y columnas mapeadas
        const vehicles = rows.map(row => {
            const data = row.data_jsonb || {};
            return {
                id: row.id,
                internalNumber: row.internal_number,
                plate: row.plate,
                agencyId: row.agency_id,
                ...data
            };
        });
        logger_1.default.info(`[FLEET-SOBERANO] Recuperados ${vehicles.length} vehículos del servidor local.`);
        return vehicles;
    }
    catch (error) {
        logger_1.default.error('[FLEET] Error al recuperar flota local', { error: String(error) });
        throw new index_1.AppError(500, 'Error en servidor de flota');
    }
}
/**
 * Obtener un vehículo específico (Desde PostgreSQL Local)
 */
async function getVehicleById(id) {
    try {
        const row = await (0, database_1.default)('vehiculos').where('id', id).first();
        if (!row) {
            throw new index_1.AppError(404, 'Vehículo no registrado localmente');
        }
        return {
            id: row.id,
            internalNumber: row.internal_number,
            plate: row.plate,
            agencyId: row.agency_id,
            ...(row.data_jsonb || {})
        };
    }
    catch (error) {
        if (error instanceof index_1.AppError)
            throw error;
        logger_1.default.error(`[FLEET] Error getting local vehicle ${id}`, { error: String(error) });
        throw new index_1.AppError(500, 'Error al obtener vehículo');
    }
}
/**
 * Crear inspección de vehículo en DB Local (Soberanía Total)
 */
async function createFleetCheck(check, userId) {
    try {
        if (!check.vehicleId) {
            throw new index_1.AppError(400, 'vehicleId es requerido');
        }
        const newId = (0, uuid_1.v4)(); // Generar ID único local
        const now = new Date();
        // 1. Insertar en la tabla `inspecciones` PostgreSQL
        await (0, database_1.default)('inspecciones').insert({
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
        await (0, database_1.default)('vehiculos')
            .where('id', String(check.vehicleId))
            .update({
            data_jsonb: database_1.default.raw("data_jsonb || ?", [JSON.stringify({
                    lastCheckStatus: check.status || 'OK',
                    lastCheckDate: now.toISOString(),
                    currentDriver: check.driverLegajo
                })])
        });
        logger_1.default.info(`[FLEET-SOBERANO] Inspección registrada LOCALMENTE: ${newId} para coche ${check.vehicleId}`);
        return newId;
    }
    catch (error) {
        if (error instanceof index_1.AppError)
            throw error;
        logger_1.default.error('[FLEET-SOBERANO] Error creando inspección local', { error: String(error) });
        throw new index_1.AppError(500, 'Error procesando inspección en servidor físico');
    }
}
/**
 * Obtener histórico de inspecciones desde PostgreSQL
 */
async function getVehicleChecks(vehicleId) {
    try {
        const rows = await (0, database_1.default)('inspecciones')
            .where('vehiculo_id', vehicleId)
            .orderBy('fecha_inspeccion', 'desc')
            .limit(50);
        const checks = rows.map(row => {
            return {
                id: row.id,
                ...(row.data_jsonb || {}),
                timestamp: row.fecha_inspeccion
            };
        });
        logger_1.default.info(`[FLEET-SOBERANO] Recuperadas ${checks.length} inspecciones locales para coche ${vehicleId}`);
        return checks;
    }
    catch (error) {
        logger_1.default.error(`[FLEET] Error getting local inspections`, { error: String(error) });
        throw new index_1.AppError(500, 'Error al leer histórico local');
    }
}
