"use strict";
/**
 * Lógica de negocio para cartones (servicios completados)
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
exports.getAllCartones = getAllCartones;
exports.getCartonById = getCartonById;
exports.saveCarton = saveCarton;
exports.deleteCarton = deleteCarton;
const admin = __importStar(require("firebase-admin"));
const firebase_1 = require("../config/firebase");
const index_1 = require("../types/index");
const constants_1 = require("../config/constants");
const logger_1 = __importDefault(require("../config/logger"));
/**
 * Obtener todos los cartones
 */
async function getAllCartones() {
    try {
        const snap = await firebase_1.db.collection(constants_1.Config.Collections.CARTONES).get();
        const cartones = snap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
        logger_1.default.debug(`[CARTONES] Retrieved ${cartones.length} cartones`);
        return cartones;
    }
    catch (error) {
        logger_1.default.error('[CARTONES] Error getting all cartones', { error: String(error) });
        throw new index_1.AppError(500, 'Error al obtener cartones');
    }
}
/**
 * Obtener un cartón específico
 */
async function getCartonById(id) {
    try {
        const doc = await firebase_1.db.collection(constants_1.Config.Collections.CARTONES).doc(id).get();
        if (!doc.exists) {
            throw new index_1.AppError(404, 'Cartón no encontrado');
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
        logger_1.default.error(`[CARTONES] Error getting carton ${id}`, { error: String(error) });
        throw new index_1.AppError(500, 'Error al obtener cartón');
    }
}
/**
 * Crear o actualizar un cartón
 */
async function saveCarton(carton, userId) {
    try {
        if (!carton.serviceNumber) {
            throw new index_1.AppError(400, 'serviceNumber es requerido');
        }
        const docId = `${carton.serviceNumber}_${carton.line || '300'}`;
        const cartonData = {
            ...carton,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: userId,
        };
        await firebase_1.db
            .collection(constants_1.Config.Collections.CARTONES)
            .doc(docId)
            .set(cartonData, { merge: true });
        logger_1.default.info(`[CARTONES] Saved carton: ${docId} by user ${userId}`);
        return docId;
    }
    catch (error) {
        if (error instanceof index_1.AppError) {
            throw error;
        }
        logger_1.default.error('[CARTONES] Error saving carton', { error: String(error) });
        throw new index_1.AppError(500, 'Error al guardar cartón');
    }
}
/**
 * Eliminar un cartón
 */
async function deleteCarton(id, userId) {
    try {
        const doc = await firebase_1.db.collection(constants_1.Config.Collections.CARTONES).doc(id).get();
        if (!doc.exists) {
            throw new index_1.AppError(404, 'Cartón no encontrado');
        }
        await firebase_1.db.collection(constants_1.Config.Collections.CARTONES).doc(id).delete();
        logger_1.default.info(`[CARTONES] Deleted carton: ${id} by user ${userId}`);
    }
    catch (error) {
        if (error instanceof index_1.AppError) {
            throw error;
        }
        logger_1.default.error(`[CARTONES] Error deleting carton ${id}`, { error: String(error) });
        throw new index_1.AppError(500, 'Error al eliminar cartón');
    }
}
