
import { Router } from 'express';
import { RoadAlertController } from '../controllers/roadAlertController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

// Public/Protected
router.get('/', authenticate, RoadAlertController.getActive);

// Admin/Inspector Actions
router.post('/', authenticate, RoadAlertController.create);
router.put('/:id/resolve', authenticate, RoadAlertController.resolve);

export default router;
