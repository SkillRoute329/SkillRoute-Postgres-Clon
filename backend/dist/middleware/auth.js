"use strict";
/**
 * Middleware de autenticación y autorización
 *
 * FASE 1 (2026-05-10): Eliminado el ESCAPE BRIDGE a Firebase Admin.
 * El sistema ahora valida exclusivamente JWT locales firmados con
 * Config.JWT_SECRET (regla -3 OWASP A07: Auth Failures).
 *
 * Si necesitás re-habilitar autenticación Firebase puntualmente, NO la
 * agregues como fallback aquí — montá un endpoint dedicado /api/auth/import-firebase-token
 * que migre el user a la tabla `users` y emita un JWT local. Eso mantiene
 * un único path de autenticación auditable.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = exports.requireRole = exports.requireAdmin = exports.verifyAuth = void 0;
const index_1 = require("../types/index");
const constants_1 = require("../config/constants");
const logger_1 = __importDefault(require("../config/logger"));
const authService_1 = require("../services/authService");
/**
 * Verificar que el request tenga un JWT local válido.
 */
const verifyAuth = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        const error = new index_1.AppError(401, 'No token provided (Local JWT Token required)');
        return res.status(error.statusCode).json({ error: error.message });
    }
    try {
        // SOBERANÍA TOTAL: validar localmente la firma del JWT (HS256, sin Firebase, sin internet).
        const decodedUser = (0, authService_1.validateToken)(token);
        req.user = {
            id: decodedUser.id,
            internalNumber: decodedUser.internalNumber || decodedUser.id,
            fullName: decodedUser.fullName || 'Usuario Soberano',
            role: (decodedUser.role || constants_1.Config.Roles.USER),
        };
        next();
    }
    catch (err) {
        logger_1.default.warn('[AUTH] Token rechazado', { error: String(err) });
        const error = new index_1.AppError(401, 'Token inválido o caducado');
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
    // FASE 5.28 (2026-05-19) — aceptar también las variantes mayúsculas/
    // minúsculas (legacy Firestore JWT trae 'SUPERADMIN'). requireRole ya
    // hace esto desde 5.1; alineamos requireAdmin con el mismo criterio para
    // que /api/admin/seed-*, /api/system-config, /api/emergency, etc. respondan
    // correctamente cuando el usuario es SUPERADMIN.
    const role = String(req.user.role ?? '');
    const isAdmin = role === constants_1.Config.Roles.SUPER_ADMIN ||
        role === constants_1.Config.Roles.ADMIN ||
        role === 'SUPERADMIN' ||
        role === 'superadmin' ||
        role === 'ADMIN' ||
        role === 'admin';
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
        // FASE 5.1 (2026-05-13): SUPERADMIN es superset universal — pasa cualquier
        // requireRole. Antes este check no consideraba SUPERADMIN y devolvía 403
        // para todas las rutas con requireRole('admin','manager'), rompiendo
        // dashboard ejecutivo, competition, forecast, etc.
        const role = req.user.role;
        const isSuperAdmin = role === constants_1.Config.Roles.SUPER_ADMIN || role === 'SUPERADMIN' || role === 'superadmin';
        if (isSuperAdmin) {
            next();
            return;
        }
        if (!requiredRoles.includes(role)) {
            logger_1.default.warn(`[AUTH] Insufficient permissions: user ${req.user.id} needs [${requiredRoles.join(', ')}] but has ${role}`);
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
