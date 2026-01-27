
import { Router } from 'express';
import { getNotifications, markAsRead } from '../controllers/notificationController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticate);
router.get('/', authenticate, getNotifications);
router.patch('/:id/read', markAsRead);

export default router;
