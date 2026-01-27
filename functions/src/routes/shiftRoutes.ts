
import { Router } from 'express';
import * as ShiftController from '../controllers/shiftController';

const router = Router();

router.get('/', ShiftController.getAllShifts);
router.post('/', ShiftController.createShift);
router.put('/:id', ShiftController.updateShift);
router.patch('/:id/status', ShiftController.updateShiftStatus); // Frontend uses PATCH for status
router.delete('/:id', ShiftController.deleteShift);

export default router;
