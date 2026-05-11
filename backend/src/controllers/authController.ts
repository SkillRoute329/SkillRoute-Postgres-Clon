/**
 * Controladores para autenticación
 */

import { Response, NextFunction } from 'express';
import { AuthRequest, ApiResponse } from '../types/index';
import { authenticateUser } from '../services/authService';

/**
 * POST /api/auth/login
 */
export async function login(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { internalNumber, password } = req.body;

    const loginResponse = await authenticateUser({
      internalNumber,
      password,
    });

    const response: ApiResponse = {
      ok: true,
      data: loginResponse,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    // Pasar el error al middleware de error global para no tumbar node
    next(error);
  }
}

/**
 * GET /api/auth/me (obtener usuario actual)
 */
export function getCurrentUser(req: AuthRequest, res: Response): void {
  const response: ApiResponse = {
    ok: true,
    data: req.user,
    timestamp: new Date().toISOString(),
  };

  res.json(response);
}
