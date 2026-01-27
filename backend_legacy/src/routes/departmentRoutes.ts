import express from 'express';
import { departmentController } from '../controllers/departmentController';
import { authenticate, requireAdmin } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', authenticate, departmentController.getAll);
router.post('/', authenticate, requireAdmin, departmentController.create);
router.put('/:id', authenticate, requireAdmin, departmentController.update);
router.delete('/:id', authenticate, requireAdmin, departmentController.delete);
router.post('/:id/roles', authenticate, requireAdmin, departmentController.addJobRole);
router.delete('/roles/:roleId', authenticate, requireAdmin, departmentController.deleteJobRole);

export default router;
