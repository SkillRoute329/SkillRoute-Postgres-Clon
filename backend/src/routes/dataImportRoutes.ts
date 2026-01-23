import { Router } from 'express';
import { IngestController } from '../controllers/IngestController';
import { authenticate } from '../middleware/authMiddleware';
import { downloadTemplate } from '../controllers/dataImportController';

const router = Router();

// New JSON Ingestion Endpoint (Transactional)
router.post('/ingest/json', authenticate, IngestController.ingestJson);

// Legacy Upload (Deprecated/Removed)
// router.post('/upload/data', ...) 

router.get('/template/download', authenticate, downloadTemplate);

export default router;
