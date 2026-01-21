import express from 'express';
import { getRoute, forceSeed } from '../controllers/navigationController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/route/:line', authenticate, getRoute);
router.get('/force-seed', forceSeed);

export default router;
