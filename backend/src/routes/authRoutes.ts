import { Router } from 'express';
import { login, register, getMe } from '../controllers/authController';
import { authenticate, requireAdmin } from '../middleware/authMiddleware';

const router = Router();

router.post('/login', login);
router.post('/register', authenticate, requireAdmin, register);
router.get('/me', authenticate, getMe);

export default router;
