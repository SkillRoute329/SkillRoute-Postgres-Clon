/**
 * Controladores para endpoints del sistema
 */

import { Request, Response } from 'express';
import { db } from '../config/firebase';
import { ApiResponse } from '../types/index';
import { Config } from '../config/constants';

/**
 * GET /api/doctor - Diagnóstico del sistema
 */
export async function systemDoctor(_req: Request, res: Response): Promise<void> {
  try {
    const vehicleCount = (await db.collection(Config.Collections.VEHICLES).get()).size;
    const cartonCount = (await db.collection(Config.Collections.CARTONES).get()).size;

    const response: ApiResponse = {
      ok: true,
      data: {
        status: 'HEALTHY',
        timestamp: new Date().toISOString(),
        version: '2.0.1-MODULAR',
        environment: Config.NODE_ENV,
        database: {
          connected: true,
          vehicleCount,
          cartonCount,
        },
      },
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      ok: false,
      error: 'SICK',
      timestamp: new Date().toISOString(),
    };

    res.status(500).json(response);
  }
}

/**
 * GET /api/health - Health check simple
 */
export function healthCheck(_req: Request, res: Response): void {
  const response: ApiResponse = {
    ok: true,
    data: {
      status: 'UP',
      timestamp: new Date().toISOString(),
      version: '2.0.1-MODULAR',
    },
  };

  res.json(response);
}

/**
 * GET /api/version - Obtener versión
 */
export function getVersion(_req: Request, res: Response): void {
  const response: ApiResponse = {
    ok: true,
    data: {
      version: '2.0.1-MODULAR',
      environment: Config.NODE_ENV,
      timestamp: new Date().toISOString(),
    },
  };

  res.json(response);
}
