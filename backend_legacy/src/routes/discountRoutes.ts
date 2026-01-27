import { Router } from 'express';
import { discountController } from '../controllers/discountController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.get('/', authenticate, discountController.getAll);
router.post('/', authenticate, discountController.create);
router.put('/:id', authenticate, discountController.update);
router.delete('/:id', authenticate, discountController.delete);

export default router;
