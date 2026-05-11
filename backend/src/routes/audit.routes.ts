/**
 * audit.routes.ts — Endpoints de auditoría para reporte IMM (FASE 3.5)
 *
 * Todos requieren JWT (regla -3 OWASP A07: rutas sensibles auth-gated).
 * Mount point: /api/audit/*
 */

import { Router } from 'express';
import { verifyAuth } from '../middleware/auth';
import {
  getPollerStatsHandler,
  getCoverageHandler,
  getActiveBusesHandler,
  getEtaSnapshotHandler,
} from '../controllers/auditController';

const router = Router();

// GET /api/audit/poller-stats
router.get('/poller-stats', verifyAuth, getPollerStatsHandler);

// GET /api/audit/coverage?from=YYYY-MM-DD&to=YYYY-MM-DD&agency=70
router.get('/coverage', verifyAuth, getCoverageHandler);

// GET /api/audit/buses-active?agency=70&minutes=5
router.get('/buses-active', verifyAuth, getActiveBusesHandler);

// GET /api/audit/eta-snapshot?agency=70&limit=50
router.get('/eta-snapshot', verifyAuth, getEtaSnapshotHandler);

export default router;
