"use strict";
/**
 * Middleware de autenticación y autorización
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = exports.requireRole = exports.requireAdmin = exports.verifyAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const index_1 = require("../types/index");
const constants_1 = require("../config/constants");
const logger_1 = __importDefault(require("../config/logger"));
/**
 * Verificar que el request tenga un token válido
 */
const verifyAuth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        // En desarrollo, permitir acceso anónimo como desarrollador
        if (constants_1.Config.NODE_ENV === 'development') {
            logger_1.default.warn('[AUTH] Missing token in development - allowing as ANONYMOUS');
            req.user = {
                id: 'dev-user',
                internalNumber: '0000',
                fullName: 'Developer God',
                role: 'SuperAdmin',
            };
            return next();
        }
        // En producción, rechazar
        const error = new index_1.AppError(401, 'No token provided');
        return res.status(error.statusCode).json({ error: error.message });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, constants_1.Config.JWT_SECRET);
        req.user = decoded;
        next();
    }
    catch (err) {
        logger_1.default.error('[AUTH] Invalid token', { error: String(err) });
        const error = new index_1.AppError(403, 'Invalid or expired token');
        return res.status(error.statusCode).json({ error: error.message });
    }
};
exports.verifyAuth = verifyAuth;
/**
 * Verificar que el usuario sea admin
 */
const requireAdmin = (req, res, next) => {
    if (!req.user) {
        const error = new index_1.AppError(401, 'Authentication required');
        return res.status(error.statusCode).json({ error: error.message });
    }
    const isAdmin = req.user.role === constants_1.Config.Roles.SUPER_ADMIN || req.user.role === constants_1.Config.Roles.ADMIN;
    if (!isAdmin) {
        logger_1.default.warn(`[AUTH] Unauthorized access attempt by ${req.user.id} (${req.user.role})`);
        const error = new index_1.AppError(403, 'Admin privileges required');
        return res.status(error.statusCode).json({ error: error.message });
    }
    next();
};
exports.requireAdmin = requireAdmin;
/**
 * Verificar que el usuario tenga un rol específico
 */
const requireRole = (...requiredRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            const error = new index_1.AppError(401, 'Authentication required');
            return res.status(error.statusCode).json({ error: error.message });
        }
        if (!requiredRoles.includes(req.user.role)) {
            logger_1.default.warn(`[AUTH] Insufficient permissions: user ${req.user.id} needs [${requiredRoles.join(', ')}] but has ${req.user.role}`);
            const error = new index_1.AppError(403, `Role required: ${requiredRoles.join(' or ')}`);
            return res.status(error.statusCode).json({ error: error.message });
        }
        next();
    };
};
exports.requireRole = requireRole;
/**
 * Alias para verifyAuth (compatibilidad)
 */
exports.requireAuth = exports.verifyAuth;
