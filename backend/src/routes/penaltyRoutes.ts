
import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import * as PenaltyController from '../controllers/penaltyController';

const router = Router();

router.use(authenticate);

// Rules
router.get('/rules', PenaltyController.getPenaltyRules);
router.post('/rules', PenaltyController.savePenaltyRule);
router.delete('/rules/:id', PenaltyController.deletePenaltyRule);

// Analysis
router.get('/red-numbers', PenaltyController.getRedNumbers);

// Penalties Management
router.get('/', PenaltyController.getPenalties);
router.post('/', PenaltyController.createPenalty);

export default router;
