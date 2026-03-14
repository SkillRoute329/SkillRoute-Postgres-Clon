/**
 * Lógica de negocio para autenticación
 */

import jwt from 'jsonwebtoken';
import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { LoginPayload, LoginResponse, AuthUser, AppError } from '../types/index';
import { Config } from '../config/constants';
import logger from '../config/logger';

/**
 * Realizar login con internalNumber y contraseña
 */
export async function authenticateUser(payload: LoginPayload): Promise<LoginResponse> {
  const { internalNumber, password } = payload;

  if (!internalNumber || !password) {
    throw new AppError(400, 'Missing internalNumber or password');
  }

  try {
    let userDoc: admin.firestore.DocumentSnapshot | null = null;

    // Intentar buscar por internalNumber
    const snapNum = await db
      .collection(Config.Collections.PERSONAL)
      .where('internalNumber', '==', String(internalNumber).trim())
      .limit(1)
      .get();

    if (!snapNum.empty) {
      userDoc = snapNum.docs[0];
    } else {
      // Intentar por legajo (compatibilidad)
      const snapLeg = await db
        .collection(Config.Collections.PERSONAL)
        .where('legajo', '==', String(internalNumber).trim())
        .limit(1)
        .get();
      if (!snapLeg.empty) {
        userDoc = snapLeg.docs[0];
      }
    }

    if (!userDoc) {
      logger.warn(`[AUTH] User not found: ${internalNumber}`);
      throw new AppError(404, 'Usuario no encontrado');
    }

    const userData = userDoc.data()!;

    // Validar contraseña
    const storedPassword = userData.password;
    const isAdminRole =
      userData.role === Config.Roles.SUPER_ADMIN || userData.role === Config.Roles.ADMIN;

    if (storedPassword) {
      if (storedPassword !== password) {
        logger.warn(`[AUTH] Wrong password for: ${internalNumber}`);
        throw new AppError(401, 'Contraseña incorrecta');
      }
    } else if (isAdminRole) {
      // Un admin sin contraseña es un riesgo
      logger.error(`[AUTH] Admin ${internalNumber} has no password set`);
      throw new AppError(500, 'Configuración de seguridad incompleta para administrador');
    }

    // Crear payload del token
    const userPayload: AuthUser = {
      id: userDoc.id,
      internalNumber: String(userData.internalNumber || userData.legajo).trim(),
      fullName: userData.fullName || userData.nombreCompleto || userData.nombre || 'Personal',
      role: userData.role || Config.Roles.USER,
    };

    // Generar JWT
    const secret = Config.JWT_SECRET || 'fallback-secret-change-in-production';
    const token = jwt.sign(userPayload, secret, {
      expiresIn: Config.JWT_EXPIRATION,
    } as any);

    logger.info(`[AUTH] Login success: ${internalNumber} (${userPayload.role})`);

    return {
      token,
      user: userPayload,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.error('[AUTH] Unexpected error during login', { error: String(error) });
    throw new AppError(500, 'Error interno del servidor');
  }
}

/**
 * Validar token y devolver el usuario
 */
export function validateToken(token: string): AuthUser {
  try {
    const secret = Config.JWT_SECRET || 'fallback-secret-change-in-production';
    const decoded = jwt.verify(token, secret) as AuthUser;
    return decoded;
  } catch (error) {
    logger.error('[AUTH] Token validation failed', { error: String(error) });
    throw new AppError(403, 'Invalid or expired token');
  }
}
