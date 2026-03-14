"use strict";
/**
 * Lógica de negocio para autenticación
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateUser = authenticateUser;
exports.validateToken = validateToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const firebase_1 = require("../config/firebase");
const index_1 = require("../types/index");
const constants_1 = require("../config/constants");
const logger_1 = __importDefault(require("../config/logger"));
/**
 * Realizar login con internalNumber y contraseña
 */
async function authenticateUser(payload) {
    const { internalNumber, password } = payload;
    if (!internalNumber || !password) {
        throw new index_1.AppError(400, 'Missing internalNumber or password');
    }
    try {
        let userDoc = null;
        // Intentar buscar por internalNumber
        const snapNum = await firebase_1.db
            .collection(constants_1.Config.Collections.PERSONAL)
            .where('internalNumber', '==', String(internalNumber).trim())
            .limit(1)
            .get();
        if (!snapNum.empty) {
            userDoc = snapNum.docs[0];
        }
        else {
            // Intentar por legajo (compatibilidad)
            const snapLeg = await firebase_1.db
                .collection(constants_1.Config.Collections.PERSONAL)
                .where('legajo', '==', String(internalNumber).trim())
                .limit(1)
                .get();
            if (!snapLeg.empty) {
                userDoc = snapLeg.docs[0];
            }
        }
        if (!userDoc) {
            logger_1.default.warn(`[AUTH] User not found: ${internalNumber}`);
            throw new index_1.AppError(404, 'Usuario no encontrado');
        }
        const userData = userDoc.data();
        // Validar contraseña
        const storedPassword = userData.password;
        const isAdminRole = userData.role === constants_1.Config.Roles.SUPER_ADMIN || userData.role === constants_1.Config.Roles.ADMIN;
        if (storedPassword) {
            if (storedPassword !== password) {
                logger_1.default.warn(`[AUTH] Wrong password for: ${internalNumber}`);
                throw new index_1.AppError(401, 'Contraseña incorrecta');
            }
        }
        else if (isAdminRole) {
            // Un admin sin contraseña es un riesgo
            logger_1.default.error(`[AUTH] Admin ${internalNumber} has no password set`);
            throw new index_1.AppError(500, 'Configuración de seguridad incompleta para administrador');
        }
        // Crear payload del token
        const userPayload = {
            id: userDoc.id,
            internalNumber: String(userData.internalNumber || userData.legajo).trim(),
            fullName: userData.fullName || userData.nombreCompleto || userData.nombre || 'Personal',
            role: userData.role || constants_1.Config.Roles.USER,
        };
        // Generar JWT
        const secret = constants_1.Config.JWT_SECRET || 'fallback-secret-change-in-production';
        const token = jsonwebtoken_1.default.sign(userPayload, secret, {
            expiresIn: constants_1.Config.JWT_EXPIRATION,
        });
        logger_1.default.info(`[AUTH] Login success: ${internalNumber} (${userPayload.role})`);
        return {
            token,
            user: userPayload,
        };
    }
    catch (error) {
        if (error instanceof index_1.AppError) {
            throw error;
        }
        logger_1.default.error('[AUTH] Unexpected error during login', { error: String(error) });
        throw new index_1.AppError(500, 'Error interno del servidor');
    }
}
/**
 * Validar token y devolver el usuario
 */
function validateToken(token) {
    try {
        const secret = constants_1.Config.JWT_SECRET || 'fallback-secret-change-in-production';
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        return decoded;
    }
    catch (error) {
        logger_1.default.error('[AUTH] Token validation failed', { error: String(error) });
        throw new index_1.AppError(403, 'Invalid or expired token');
    }
}
