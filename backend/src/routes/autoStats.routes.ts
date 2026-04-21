import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import {
  listAgencies,
  getComplianceRealtime,
  getAgencyRoutes,
  getActiveTrips,
  getVehicleHistoryHandler,
  getActiveSnapshot,
} from '../controllers/autoStatsController';

const router = Router();

// Todas las rutas requieren auth
router.use(verifyToken);

router.get('/agencies',                         listAgencies);
router.get('/compliance/:agencyId',             getComplianceRealtime);
router.get('/routes/:agencyId',                 getAgencyRoutes);
router.get('/routes/:agencyId/:routeShort/active', getActiveTrips);
router.get('/vehicle/:idBus',                   getVehicleHistoryHandler);
router.get('/active/:agencyId',                 getActiveSnapshot);

export default router;
