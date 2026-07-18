import { Router } from 'express';
import { competitionController } from '../controllers/competitionController';
import { requireAuth } from '../middleware/auth';

const router = Router();

/**
 * Obtiene la matriz de fricción de forma dinámica bajo demanda, usando JOINs
 * relacionales estrictos sobre la red de GTFS con soporte para dirección.
 * GET /api/competition/solapamiento
 */
router.get(
  '/solapamiento',
  requireAuth,
  competitionController.getSolapamientoDinamico
);

/**
 * Hook de Adelanto Táctico (Webhook).
 * Gatillado externamente por un CRON cuando detecta alteraciones
 * en la matriz de catálogos oficiales IMM. Reanaliza fricción en background.
 * POST /api/competition/webhook-mutacion
 */
router.post(
  '/webhook-mutacion',
  competitionController.triggerReanalisisMutacion
);

export default router;
