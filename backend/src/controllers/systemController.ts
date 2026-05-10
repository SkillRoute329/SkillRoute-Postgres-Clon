/**
 * Controladores para endpoints del sistema
 */

import { Request, Response } from 'express';
import sqlDb, { db } from '../config/database';
import { ApiResponse } from '../types/index';
import { Config } from '../config/constants';
import logger from '../config/logger';

/**
 * GET /api/doctor - Diagnóstico del sistema
 *
 * Política de datos (regla -2 NO SIMULACIÓN):
 *  - vehicleCount: PostgreSQL local (tabla `vehiculos`) — fuente soberana.
 *  - cartonCount:  Firestore (`cartones_completados`) — migración pendiente FASE 2;
 *                  si Firestore es inalcanzable se loggea WARN y se devuelve 0,
 *                  el doctor sigue HEALTHY mientras Postgres responda.
 *
 * No regresión (regla -1): el shape de la respuesta se mantiene idéntico
 * al previo a la migración FASE 0 (campos `vehicleCount` y `cartonCount`
 * dentro de `data.database`).
 */
export async function systemDoctor(_req: Request, res: Response): Promise<void> {
  try {
    // Vehículos — Postgres soberano (migrado de Firestore en FASE 0)
    const vRow = await sqlDb('vehiculos')
      .count<Array<{ count: string }>>({ count: '*' })
      .first();
    const vehicleCount = parseInt((vRow?.count as string) ?? '0', 10);

    // Cartones — Firestore (TODO FASE 2). Tolerante a fallos: si Firebase está
    // caído, devolvemos 0 + warn, no rompemos el doctor.
    let cartonCount = 0;
    try {
      const snap = await db.collection(Config.Collections.CARTONES).get();
      cartonCount = snap.size;
    } catch (firebaseErr: unknown) {
      const msg = firebaseErr instanceof Error ? firebaseErr.message : String(firebaseErr);
      logger.warn('[doctor] Firestore inalcanzable para cartones, devolviendo 0', {
        error: msg,
        action: 'pendiente migración FASE 2 a Postgres',
      });
    }

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
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: string })?.code;
    logger.error('[doctor] SICK — Postgres inalcanzable', { error: msg, code });

    // Endpoint de diagnóstico: incluir detalle del error en el body para que
    // un operador pueda diagnosticar sin entrar a los logs del servidor.
    // No expone PII ni secrets; solo el mensaje del driver y código (ej. ECONNREFUSED, 28P01).
    const response: ApiResponse = {
      ok: false,
      error: 'SICK',
      timestamp: new Date().toISOString(),
      details: { message: msg, code },
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
