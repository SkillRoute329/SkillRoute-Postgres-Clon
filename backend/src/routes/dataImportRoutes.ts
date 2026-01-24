import { Router } from 'express';
import { IngestController } from '../controllers/IngestController';
import { authenticate } from '../middleware/authMiddleware';
import { downloadTemplate, uploadEmployeeData, exportEmployeeData } from '../controllers/dataImportController';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

// New JSON Ingestion Endpoint (Transactional)
router.post('/ingest/json', authenticate, IngestController.ingestJson);

// Legacy Upload (Deprecated/Removed)
// router.post('/upload/data', ...) 

router.get('/template/download', authenticate, downloadTemplate);
router.post('/upload/employees', authenticate, upload.single('file'), uploadEmployeeData);
router.get('/export/employees', authenticate, exportEmployeeData);

export default router;
