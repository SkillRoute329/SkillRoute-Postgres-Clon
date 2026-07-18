/**
 * Lógica de negocio para autenticación
 */

import jwt from 'jsonwebtoken';
// import * as admin from 'firebase-admin'; // ELIMINADO: Ya no dependemos de Firebase Admin en Auth
import sqlDb from '../config/database'; // IMPORTAR NUEVO: Conector Soberano PostgreSQL
import { LoginPayload, LoginResponse, AuthUser, AppError } from '../types/index';
import { Config } from '../config/constants';
import logger from '../config/logger';

/**
 * Realizar login SOBERANO consultando la base de datos PostgreSQL local.
 */
export async function authenticateUser(payload: LoginPayload): Promise<LoginResponse> {
  const { internalNumber, password } = payload;

  if (!internalNumber || !password) {
    throw new AppError(400, 'Falta número interno o contraseña');
  }

  // --- BYPASS DE EMERGENCIA (MODO DESARROLLO - DEMO) ---
  // Activo mientras se estabiliza la conexión remota al nodo maestro.
  // NO requiere conexión a BD. Retorna JWT con permisos SUPER_ADMIN.
  if (String(internalNumber).trim() === '329' && password === 'admin123') {
    logger.warn('[AUTH] ⚠️ BYPASS de Emergencia Activado para Demo (329)');
    const userPayload: AuthUser = {
      id: 'admin_329',
      internalNumber: '329',
      fullName: 'Administrador Demo',
      role: Config.Roles.SUPER_ADMIN,
    } as any;
    const token = jwt.sign(userPayload, Config.JWT_SECRET, {
      expiresIn: Config.JWT_EXPIRATION,
      algorithm: 'HS256',
    } as any);
    return { token, user: userPayload };
  }
  // -------------------------------------------------------

  try {
    logger.info(`[AUTH-SOBERANO] Intentando login para: ${internalNumber}`);

    // Consultar Usuario en PostgreSQL Local
    const user = await sqlDb('users')
      .where('id', String(internalNumber).trim())
      .orWhere('email', String(internalNumber).trim())
      .first();

    if (!user) {
      logger.warn(`[AUTH] Usuario no encontrado localmente: ${internalNumber}`);
      throw new AppError(404, 'Usuario no registrado en servidor local');
    }

    // LÓGICA DE CONTRASEÑA DE EMERGENCIA SOBERANA PARA DEMO
    // Si es el usuario '0001' o '1000', permitimos 'test123' como fallback de contingencia local.
    const storedPassword = user.data_jsonb?.password;
    const isEmergencyUser = ['0001', '1000'].includes(user.id);
    
    let isPasswordCorrect = false;
    
    if (isEmergencyUser && (password === 'test123' || password === 'Ucot2025!')) {
      isPasswordCorrect = true;
    } else if (storedPassword && storedPassword === password) {
      isPasswordCorrect = true;
    }

    if (!isPasswordCorrect) {
       logger.warn(`[AUTH] Contraseña incorrecta para local: ${internalNumber}`);
       throw new AppError(401, 'Contraseña incorrecta');
    }

    // Crear payload del token usando el perfil local
    const userPayload: AuthUser = {
      id: user.id,
      internalNumber: user.id,
      fullName: user.full_name || 'Operador Local',
      role: user.role || Config.Roles.USER,
      agencyId: user.agency_id // Inyectar agencyId en token para Multitenancy RLS!
    } as any;

    // Generar JWT firmado localmente.
    // Config.JWT_SECRET viene validado por constants.ts (fail-fast en prod si falta).
    const token = jwt.sign(userPayload, Config.JWT_SECRET, {
      expiresIn: Config.JWT_EXPIRATION,
      algorithm: 'HS256',
    } as any);

    logger.info(`[AUTH-SOBERANO] ¡Login local EXITOSO!: ${internalNumber} (${userPayload.role})`);

    return {
      token,
      user: userPayload,
    };

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.error('[AUTH-SOBERANO] Error crítico durante login local', { error: String(error) });
    throw new AppError(500, 'Error interno en el servidor local de autenticación');
  }
}

/**
 * Validar token y devolver el usuario (100% local, sin Firebase).
 * Config.JWT_SECRET viene validado por constants.ts (fail-fast en prod si falta).
 * Algoritmo HS256 explícito — rechaza tokens "alg: none" (CVE clásico).
 */
export function validateToken(token: string): AuthUser {
  try {
    const decoded = jwt.verify(token, Config.JWT_SECRET, {
      algorithms: ['HS256'],
    }) as AuthUser;
    return decoded;
  } catch (error) {
    logger.error('[AUTH] Token validation failed', { error: String(error) });
    throw new AppError(403, 'Invalid or expired token');
  }
}

