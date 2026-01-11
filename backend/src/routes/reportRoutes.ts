
import { Router } from 'express';
import { generateShiftsReport } from '../controllers/reportController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.get('/shifts-pdf', authenticate, generateShiftsReport);

export default router;
