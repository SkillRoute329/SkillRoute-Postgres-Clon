
import { Router } from 'express';
import { getSystemConfig, updateSystemConfig } from '../controllers/systemConfigController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

// Alias routes to SystemConfig controller
router.get('/', authenticate, getSystemConfig);
router.post('/', authenticate, updateSystemConfig);

export default router;
