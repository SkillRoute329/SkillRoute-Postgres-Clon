import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authMiddleware';
import { uploadServiceData, downloadTemplate } from '../controllers/dataImportController';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload/data', authenticate, upload.single('file'), uploadServiceData);
router.get('/template/download', authenticate, downloadTemplate);

export default router;
