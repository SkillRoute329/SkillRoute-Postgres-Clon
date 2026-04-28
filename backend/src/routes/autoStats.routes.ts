import { Router } from 'express';
import { verifyAuth } from '../middleware/auth';
import {
  listAgencies,
  getComplianceRealtime,
  getAgencyRoutes,
  getActiveTrips,
  getVehicleHistoryHandler,
  getActiveSnapshot,
  getEndpointHealthHandler,
  getHistorySummaryHandler,
} from '../controllers/autoStatsController';

const router = Router();

// Todas las rutas requieren auth
router.use(verifyAuth);

router.get('/health',                           getEndpointHealthHandler);
router.get('/agencies',                         listAgencies);
router.get('/compliance/:agencyId',             getComplianceRealtime);
router.get('/routes/:agencyId',                 getAgencyRoutes);
router.get('/routes/:agencyId/:routeShort/active', getActiveTrips);
router.get('/vehicle/:idBus',                   getVehicleHistoryHandler);
router.get('/active/:agencyId',                 getActiveSnapshot);
router.get('/history/:agencyId',                getHistorySummaryHandler);

export default router;
