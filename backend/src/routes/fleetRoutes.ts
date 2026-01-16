
import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { getVehicles, createVehicle, getLastInspection, createInspection } from '../controllers/fleetController';

const router = Router();

// Vehicles
router.get('/vehicles', authenticate, getVehicles);
router.post('/vehicles', authenticate, createVehicle);

// Inspections
router.get('/vehicles/:vehicleId/last-inspection', authenticate, getLastInspection);
router.post('/inspections', authenticate, createInspection);

export default router;
