
import { Router } from 'express';
import * as FleetController from '../controllers/fleetController';

const router = Router();

router.get('/vehicles', FleetController.getVehicles);
router.post('/vehicles', FleetController.createVehicle);
router.get('/rotation-schemes', FleetController.getRotationSchemes);

// This endpoint receives Multipart/Form-Data
router.post('/inspections', FleetController.createInspection);

export default router;
