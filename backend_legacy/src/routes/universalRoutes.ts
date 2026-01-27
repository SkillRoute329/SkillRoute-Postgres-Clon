
import { Router } from 'express';
import { UniversalController } from '../controllers/universalController';
import { LegacyImportController } from '../controllers/LegacyImportController';
import { SimulationReportController } from '../controllers/SimulationReportController';
import { SimulationResetController } from '../controllers/SimulationResetController';
import { authenticate, requireRole } from '../middleware/authMiddleware';
import multer from 'multer';

// Multer Setup (Memory Storage)
const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

// Todas las rutas requieren autenticación.
// Dependiendo del nivel de seguridad deseado, podríamos requerir 'Admin' para importar/editar.
router.use(authenticate);

// Legacy "Dirty" Import
router.post('/legacy-import', requireRole(['Admin', 'SuperAdmin']), upload.single('file'), LegacyImportController.upload);
router.get('/legacy-audit', requireRole(['Admin', 'SuperAdmin']), LegacyImportController.audit);

// SIMULATION & REPORTS
router.get('/simulation/report', SimulationReportController.generatePDF);
router.post('/simulation/reset', requireRole(['Admin', 'SuperAdmin']), SimulationResetController.reset);

router.get('/:entity/list', UniversalController.list);
router.post('/:entity/import', requireRole(['Admin', 'SuperAdmin']), UniversalController.import);
router.post('/:entity', requireRole(['Admin', 'SuperAdmin']), UniversalController.create);
router.put('/:entity/:id', requireRole(['Admin', 'SuperAdmin']), UniversalController.update);
router.delete('/:entity/:id', requireRole(['Admin', 'SuperAdmin']), UniversalController.delete);

export default router;
