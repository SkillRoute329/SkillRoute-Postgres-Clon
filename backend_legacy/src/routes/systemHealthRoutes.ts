import { Router } from 'express';
import { SystemHealthController } from '../controllers/SystemHealthController';
import { authenticate, requireRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticate);
router.use(requireRole(['SuperAdmin', 'Admin']));

router.get('/status', SystemHealthController.getStatus);
router.get('/logs', SystemHealthController.getLogs);
router.post('/update', SystemHealthController.triggerUpdate);

export default router;
