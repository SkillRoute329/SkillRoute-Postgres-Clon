
import { Router } from 'express';
import { getDriverSchedule } from '../controllers/driverScheduleController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.get('/schedule', authenticate, getDriverSchedule);

export default router;
