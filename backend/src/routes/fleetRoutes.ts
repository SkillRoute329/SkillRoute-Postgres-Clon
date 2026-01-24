
import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { getVehicles, createVehicle, getLastInspection, getVehicleHistory, createInspection, getRotationSchemes, createVehicleCheck } from '../controllers/fleetController';

const router = Router();

// Vehicles
router.get('/vehicles', authenticate, getVehicles);
router.post('/vehicles', authenticate, createVehicle);
router.get('/rotation-schemes', authenticate, getRotationSchemes);

// Inspections
router.get('/vehicles/:vehicleId/last-inspection', authenticate, getLastInspection);
router.get('/vehicles/:vehicleId/history', authenticate, getVehicleHistory);
router.post('/inspections', authenticate, createInspection);
router.post('/check', authenticate, createVehicleCheck);

export default router;
