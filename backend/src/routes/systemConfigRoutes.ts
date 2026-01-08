
import { Router } from 'express';
import { getSystemConfig, updateSystemConfig, initSchema } from '../controllers/systemConfigController';
import { authenticate } from '../middleware/authMiddleware'; // Assuming this exists

const router = Router();

router.get('/', authenticate, getSystemConfig);
router.post('/', authenticate, updateSystemConfig);
router.post('/init-schema', initSchema); // Open for now to run easily, or protect if desired

export default router;
