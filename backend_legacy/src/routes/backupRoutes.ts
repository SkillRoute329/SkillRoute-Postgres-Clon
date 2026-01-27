
import { Router } from 'express';
import { createBackup } from '../controllers/backupController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.get('/download', authenticate, createBackup);
// Alias for consistency
router.post('/create', authenticate, createBackup);

export default router;
