
import express from 'express';
import { getRoute } from '../controllers/navigationController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/route/:line', authenticate, getRoute);

export default router;
