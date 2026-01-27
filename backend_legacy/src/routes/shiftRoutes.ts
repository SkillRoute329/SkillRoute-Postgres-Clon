import { Router } from 'express';
import { getAllShifts, createShift, updateShiftStatus, deleteShift, updateShift, getBalances, getUnpaidShifts, payBalance, registerPayment } from '../controllers/shiftController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.get('/balances', authenticate, getBalances);
router.get('/unpaid/:userId', authenticate, getUnpaidShifts);
router.post('/pay', authenticate, payBalance);
router.post('/payment', authenticate, registerPayment);
router.get('/', authenticate, getAllShifts);
router.post('/', authenticate, createShift);
router.patch('/:id/status', authenticate, updateShiftStatus);
router.put('/:id', authenticate, updateShift);
router.delete('/:id', authenticate, deleteShift);

export default router;
