/**
 * Middleware de autenticación y autorización
 */

import { Response, NextFunction } from 'express';
import { auth } from '../config/firebase';
import { AuthRequest, AppError } from '../types/index';
import { Config } from '../config/constants';
import logger from '../config/logger';

/**
 * Verificar que el request tenga un token de Firebase válido
 */
export const verifyAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    const error = new AppError(401, 'No token provided (Firebase ID Token required)');
    return res.status(error.statusCode).json({ error: error.message });
  }

  try {
    // Validar criptográficamente el Token de Firebase
    const decodedToken = await auth.verifyIdToken(token);
    
    // Inyectar usuario en el request compatible con la lógica del backend
    req.user = {
      id: decodedToken.uid,
      internalNumber: decodedToken.internalNumber || 'unverified',
      fullName: decodedToken.name || decodedToken.email || 'Firebase User',
      role: (decodedToken.role as string) || Config.Roles.USER,
    };
    
    next();
  } catch (err) {
    logger.error('[AUTH] Invalid Firebase token', { error: String(err) });
    const error = new AppError(401, 'Invalid or expired Firebase token');
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
