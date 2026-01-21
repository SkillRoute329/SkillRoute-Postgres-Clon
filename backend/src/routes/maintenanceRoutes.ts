import { Router } from 'express';
import { maintenanceController } from '../controllers/maintenanceController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

// Routes
router.post('/', authenticate, maintenanceController.createReport);
router.get('/', authenticate, maintenanceController.getReports); // Supports filters
router.get('/:id', authenticate, maintenanceController.getReportDetails);
router.put('/:id', authenticate, maintenanceController.updateReport); // Status changes, logs, transfers
router.post('/:id/close', authenticate, maintenanceController.closeTicket);

export default router;
