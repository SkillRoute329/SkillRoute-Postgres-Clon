
import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { getVehicles, createVehicle, getLastInspection, getVehicleHistory, createInspection, getRotationSchemes, createVehicleCheck, reportBreakdown } from '../controllers/fleetController';

const router = Router();

// Vehicles
router.get('/vehicles', authenticate, getVehicles);
router.post('/vehicles', authenticate, createVehicle);
router.get('/rotation-schemes', authenticate, getRotationSchemes);

// Operations (God Mode)
router.post('/breakdown', authenticate, reportBreakdown);

// DEBUG MIDDLEWARE FOR UPLOADS (TEMPORARY DIAGNOSTIC)
router.use('/inspections', (req, res, next) => {
    console.log('--- INTENTO DE SUBIDA (Fleet) ---');
    console.log('Method:', req.method);
    // console.log('Headers recibidos:', JSON.stringify(req.headers)); // Too noisy, only logging Auth
    console.log('Tiene Authorization?:', !!req.headers.authorization ? 'SI' : 'NO');
    if (req.headers.authorization) console.log('Auth Preview:', req.headers.authorization.substring(0, 20) + '...');
    next();
});

// Inspections
router.get('/vehicles/:vehicleId/last-inspection', authenticate, getLastInspection);
router.get('/vehicles/:vehicleId/history', authenticate, getVehicleHistory);
router.post('/inspections', authenticate, createInspection);
router.post('/check', authenticate, createVehicleCheck);

export default router;
