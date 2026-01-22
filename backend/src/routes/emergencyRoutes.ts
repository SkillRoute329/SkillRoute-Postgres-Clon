
import { Router } from 'express';
import { EmergencyController } from '../controllers/EmergencyController';

const router = Router();

// Public endpoint (obscure URL intended for ops/emergency use)
router.get('/restore-0000', EmergencyController.restoreAdmin);
router.post('/seed-tenant-1', EmergencyController.seedTenant1);

export default router;
