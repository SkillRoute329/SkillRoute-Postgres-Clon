/**
 * Controladores para autenticación
 */

import { Response } from 'express';
import { AuthRequest, ApiResponse } from '../types/index';
import { authenticateUser } from '../services/authService';

/**
 * POST /api/auth/login
 */
export async function login(req: AuthRequest, res: Response): Promise<void> {
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
    // El error será capturado por el error handler middleware
    throw error;
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
