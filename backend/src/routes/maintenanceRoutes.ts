import { Router } from 'express';
import multer from 'multer';
import { maintenanceController } from '../controllers/maintenanceController';
import { authenticate } from '../middleware/authMiddleware';
import { debugMulter } from '../middleware/telemetryMiddleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Routes
router.post('/', authenticate, upload.any(), debugMulter, maintenanceController.createReport);
router.get('/', authenticate, maintenanceController.getReports); // Supports filters
router.get('/:id', authenticate, maintenanceController.getReportDetails);
router.put('/:id', authenticate, upload.any(), debugMulter, maintenanceController.updateReport); // Status changes, logs, transfers
router.post('/:id/close', authenticate, maintenanceController.closeTicket);

export default router;
