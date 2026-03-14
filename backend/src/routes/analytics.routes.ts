/**
 * Rutas de Analytics - Semana 5
 * Validador de viabilidad de cartones y análisis de datos
 */

import { Router } from 'express';
import { verifyAuth } from '../middleware/auth';

const router = Router();

// Placeholder routes - Las funcionalidades están en competitionService y dashboardService
router.get('/health', (req, res) => {
  res.json({ status: 'analytics service ok' });
});

export default router;
