import { Router } from 'express';
import multer from 'multer';
import * as Minio from 'minio';
import { v4 as uuidv4 } from 'uuid';
import { verifyAuth } from '../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || '127.0.0.1',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
});

const BUCKET_NAME = process.env.MINIO_BUCKET || 'skillroute-bucket';

// Ensure bucket exists (best effort for dev)
minioClient.bucketExists(BUCKET_NAME).then(exists => {
  if (!exists) {
    minioClient.makeBucket(BUCKET_NAME, 'us-east-1').catch(console.error);
  }
}).catch(console.error);

router.post('/upload', verifyAuth, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, buffer, mimetype } = file;
    const extension = originalname.split('.').pop() || 'bin';
    const fileName = `${uuidv4()}.${extension}`;
    
    // Si envían un path personalizado en el body (ej: path="inspections/service_1_img.jpg")
    let objectName = req.body.path ? req.body.path : `uploads/${fileName}`;

    await minioClient.putObject(BUCKET_NAME, objectName, buffer, undefined, { 'Content-Type': mimetype });

    // Endpoint local para servir las imágenes en dev (sin firmar URL complejas)
    const url = `/api/storage/download/${encodeURIComponent(objectName)}`;
    res.json({ url, objectName, bucket: BUCKET_NAME });
  } catch (err) {
    console.error('MinIO upload error:', err);
    res.status(500).json({ error: 'Failed to upload to storage' });
  }
});

router.get('/download/:objectName(*)', async (req, res) => {
  try {
    const objectName = req.params.objectName;
    const stream = await minioClient.getObject(BUCKET_NAME, objectName);
    stream.pipe(res);
  } catch (err) {
    console.error('MinIO download error:', err);
    res.status(404).json({ error: 'File not found' });
  }
});

export default router;
