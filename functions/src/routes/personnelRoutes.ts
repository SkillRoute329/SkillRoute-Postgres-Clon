
import { Router } from 'express';
import * as PersonnelController from '../controllers/personnelController';

const router = Router();

router.get('/', PersonnelController.getPersonnel);
router.post('/', PersonnelController.createEmployee);
router.put('/:id', PersonnelController.updateEmployee);

// Advanced Config
router.post('/transfer', PersonnelController.transferPartner);
router.post('/daily-work', PersonnelController.registerDailyWork);
router.get('/stats', PersonnelController.getPersonnelStats);

// Tools
router.post('/simulate-payroll', PersonnelController.simulatePayroll);
router.get('/alerts/expirations', PersonnelController.checkExpirations);
router.get('/export/xlsx', PersonnelController.exportPersonnel);

export default router;
