/**
 * Middleware de autenticación y autorización
 */

import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest, AppError } from '../types/index';
import { Config } from '../config/constants';
import logger from '../config/logger';

/**
 * Verificar que el request tenga un token válido
 */
export const verifyAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    // En desarrollo, permitir acceso anónimo como desarrollador
    if (Config.NODE_ENV === 'development') {
      logger.warn('[AUTH] Missing token in development - allowing as ANONYMOUS');
      req.user = {
        id: 'dev-user',
        internalNumber: '0000',
        fullName: 'Developer God',
        role: 'SuperAdmin',
      };
      return next();
    }

    // En producción, rechazar
    const error = new AppError(401, 'No token provided');
    return res.status(error.statusCode).json({ error: error.message });
  }

  try {
    const decoded = jwt.verify(token, Config.JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (err) {
    logger.error('[AUTH] Invalid token', { error: String(err) });
    const error = new AppError(403, 'Invalid or expired token');
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
