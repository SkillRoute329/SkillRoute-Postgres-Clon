import { Router } from 'express';
import { IngestController } from '../controllers/IngestController';
import { authenticate } from '../middleware/authMiddleware';
import { downloadTemplate, uploadEmployeeData, exportEmployeeData } from '../controllers/dataImportController';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

// New JSON Ingestion Endpoint (Transactional)
router.post('/ingest/json', authenticate, IngestController.ingestJson);
router.delete('/ingest/clear', authenticate, IngestController.clearAllData);

// New JSON Ingestion Endpoint (Transactional)
router.post('/ingest/json', authenticate, IngestController.ingestJson);
router.delete('/ingest/clear', authenticate, IngestController.clearAllData);

// Data Upload (NUCLEAR - RAW EXCEL)
import { UploadMiddleware } from '../middleware/UploadMiddleware';
import { uploadServiceData } from '../controllers/dataImportController';

// DMS Protection: 50MB Limit, only Excel allowed by filter (need to check if filter supports xlsx, otherwise 'any')
// Using 'any' for now to allow controller to handle parsing, but Middleware streams to disk.
// Note: dataImportController expects req.file.buffer. We need to refactor controller OR use different middleware for this specific route if we want stream.
// BUT USER SAID: "Eliminate logic of synthetic traffic... Connect the form to upload the file RAW... using UploadMiddleware".
// Refactoring Controller to assume File on Disk is safer for memory.
router.post('/upload/data', authenticate, UploadMiddleware('single'), uploadServiceData);

router.get('/template/download', authenticate, downloadTemplate);
router.post('/upload/employees', authenticate, UploadMiddleware('single'), uploadEmployeeData);
router.get('/export/employees', authenticate, exportEmployeeData);

export default router;
