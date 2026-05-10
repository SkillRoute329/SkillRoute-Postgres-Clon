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

import { Response, NextFunction } from 'express';
import { AuthRequest, AppError } from '../types/index';
import { Config } from '../config/constants';
import logger from '../config/logger';

import { validateToken } from '../services/authService';

/**
 * Verificar que el request tenga un JWT local válido.
 */
export const verifyAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    const error = new AppError(401, 'No token provided (Local JWT Token required)');
    return res.status(error.statusCode).json({ error: error.message });
  }

  try {
    // SOBERANÍA TOTAL: validar localmente la firma del JWT (HS256, sin Firebase, sin internet).
    const decodedUser = validateToken(token);

    req.user = {
      id: decodedUser.id,
      internalNumber: decodedUser.internalNumber || decodedUser.id,
      fullName: decodedUser.fullName || 'Usuario Soberano',
      role: (decodedUser.role || Config.Roles.USER) as any,
    };

    next();
  } catch (err) {
    logger.warn('[AUTH] Token rechazado', { error: String(err) });
    const error = new AppError(401, 'Token inválido o caducado');
    return res.status(error.statusCode).json({ error: error.message });
  }
};

/**
 * Verificar que el usuario sea admin
 */
export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    const error = new AppError(401, 'Authentication required');
    return res.status(error.statusCode).json({ error: error.message });
  }

  const isAdmin =
    req.user.role === Config.Roles.SUPER_ADMIN || req.user.role === Config.Roles.ADMIN;

  if (!isAdmin) {
    logger.warn(`[AUTH] Unauthorized access attempt by ${req.user.id} (${req.user.role})`);
    const error = new AppError(403, 'Admin privileges required');
    return res.status(error.statusCode).json({ error: error.message });
  }

  next();
};

/**
 * Verificar que el usuario tenga un rol específico
 */
export const requireRole = (...requiredRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      const error = new AppError(401, 'Authentication required');
      return res.status(error.statusCode).json({ error: error.message });
    }

    if (!requiredRoles.includes(req.user.role)) {
      logger.warn(
        `[AUTH] Insufficient permissions: user ${req.user.id} needs [${requiredRoles.join(', ')}] but has ${req.user.role}`,
      );
      const error = new AppError(403, `Role required: ${requiredRoles.join(' or ')}`);
      return res.status(error.statusCode).json({ error: error.message });
    }

    next();
  };
};

/**
 * Alias para verifyAuth (compatibilidad)
 */
export const requireAuth = verifyAuth;
