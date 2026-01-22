
import { Router } from 'express';
import { EmergencyController } from '../controllers/EmergencyController';

const router = Router();

// Public endpoint (obscure URL intended for ops/emergency use)
router.get('/restore-0000', EmergencyController.restoreAdmin);

export default router;
