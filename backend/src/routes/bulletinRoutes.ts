import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { saveBulletinEntries, getMyStats, getVehicleStats, generateCartonFromBulletin, getBulletinTemplate } from '../controllers/bulletinController';

const router = Router();

router.post('/', authenticate, saveBulletinEntries);
router.post('/generate-carton', authenticate, generateCartonFromBulletin); // New
router.get('/template', authenticate, getBulletinTemplate); // New
router.get('/my-stats', authenticate, getMyStats);
router.get('/vehicle-stats', authenticate, getVehicleStats);

export default router;
