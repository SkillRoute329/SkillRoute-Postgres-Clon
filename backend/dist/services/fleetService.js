"use strict";
/**
 * Lógica de negocio para gestión de flota
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllVehicles = getAllVehicles;
exports.getVehicleById = getVehicleById;
exports.createFleetCheck = createFleetCheck;
exports.getVehicleChecks = getVehicleChecks;
const admin = __importStar(require("firebase-admin"));
const firebase_1 = require("../config/firebase");
const index_1 = require("../types/index");
const constants_1 = require("../config/constants");
const logger_1 = __importDefault(require("../config/logger"));
/**
 * Obtener todos los vehículos
 */
async function getAllVehicles() {
    try {
        const snap = await firebase_1.db.collection(constants_1.Config.Collections.VEHICLES).get();
        const vehicles = snap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
        logger_1.default.debug(`[FLEET] Retrieved ${vehicles.length} vehicles`);
        return vehicles;
    }
    catch (error) {
        logger_1.default.error('[FLEET] Error getting vehicles', { error: String(error) });
        throw new index_1.AppError(500, 'Error en flota');
    }
}
/**
 * Obtener un vehículo específico
 */
async function getVehicleById(id) {
    try {
        const doc = await firebase_1.db.collection(constants_1.Config.Collections.VEHICLES).doc(id).get();
        if (!doc.exists) {
            throw new index_1.AppError(404, 'Vehículo no encontrado');
        }
        return {
            id: doc.id,
            ...doc.data(),
        };
    }
    catch (error) {
        if (error instanceof index_1.AppError) {
            throw error;
        }
        logger_1.default.error(`[FLEET] Error getting vehicle ${id}`, { error: String(error) });
        throw new index_1.AppError(500, 'Error al obtener vehículo');
    }
}
/**
 * Crear inspección de vehículo (fleet check)
 */
async function createFleetCheck(check, userId) {
    try {
        if (!check.vehicleId) {
            throw new index_1.AppError(400, 'vehicleId es requerido');
        }
        const checkRef = firebase_1.db.collection(constants_1.Config.Collections.FLEET_CHECKS).doc();
        // Asegurar que el driverId venga del usuario autenticado (Zero-Trust)
        const checkData = {
            ...check,
            driverId: userId,
            timestamp: new Date(),
        };
        await checkRef.set(checkData);
        // Actualizar estado del vehículo
        await firebase_1.db
            .collection(constants_1.Config.Collections.VEHICLES)
            .doc(String(check.vehicleId))
            .set({
            lastCheckStatus: check.status || 'OK',
            lastCheckDate: admin.firestore.FieldValue.serverTimestamp(),
            currentDriver: check.driverLegajo,
        }, { merge: true });
        logger_1.default.info(`[FLEET] Fleet check created: ${checkRef.id} for vehicle ${check.vehicleId}`);
        return checkRef.id;
    }
    catch (error) {
        if (error instanceof index_1.AppError) {
            throw error;
        }
        logger_1.default.error('[FLEET] Error creating fleet check', { error: String(error) });
        throw new index_1.AppError(500, 'Error procesando inspección');
    }
}
/**
 * Obtener inspecciones de un vehículo
 */
async function getVehicleChecks(vehicleId) {
    try {
        const snap = await firebase_1.db
            .collection(constants_1.Config.Collections.FLEET_CHECKS)
            .where('vehicleId', '==', vehicleId)
            .orderBy('timestamp', 'desc')
            .get();
        const checks = snap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
        logger_1.default.debug(`[FLEET] Retrieved ${checks.length} checks for vehicle ${vehicleId}`);
        return checks;
    }
    catch (error) {
        logger_1.default.error(`[FLEET] Error getting vehicle checks`, { error: String(error) });
        throw new index_1.AppError(500, 'Error al obtener inspecciones');
    }
}
