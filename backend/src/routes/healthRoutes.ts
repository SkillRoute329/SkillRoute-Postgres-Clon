
import { Router } from 'express';
import { runHealthCheck } from '../controllers/healthController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

// Protected Health Check to verify Tenant Context
router.get('/_healthcheck', authenticate, runHealthCheck);

export default router;
