
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';

// Configuración de almacenamiento temporal para streaming
// Usamos /tmp del sistema o una carpeta temp local para asegurar que no se llene la RAM
const TEMP_DIR = path.join(process.cwd(), 'temp_uploads');

if (!fs.existsSync(TEMP_DIR)) {
    try {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    } catch (e) {
        console.error('No se pudo crear carpeta temporal:', e);
    }
}

const diskStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, TEMP_DIR);
    },
    filename: (req, file, cb) => {
        // Nombre temporal seguro
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

/**
 * CONFIGURACIÓN CENTRAL DE CARGA
 * - Límite: 50MB (Para fotos de alta resolución o documentos PDF legales)
 * - Filtrado: Estricto para imágenes y PDFs.
 */
const uploadConfig = multer({
    storage: diskStorage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB Hard Limit
        files: 10 // Max 10 archivos por request
    },
    fileFilter: (req, file, cb) => {
        // Lista blanca de tipos MIME permitidos por auditoría
        const allowedTypes = [
            'image/jpeg',
            'image/png',
            'image/webp',
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // Excel (Opcional para matrices)
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Tipo de archivo NO PERMITIDO: ${file.mimetype}. Solo JPG, PNG, WEBP y PDF.`));
        }
    }
});

/**
 * MIDDLEWARE UNIVERSAL
 * Maneja errores de Multer (413 Payload Too Large) y limpia archivos en caso de fallo.
 */
export const UploadMiddleware = (fields: { name: string, maxCount: number }[] | string) => {

    // Determinar si es single, array o fields
    let multerHandler: any;
    if (typeof fields === 'string') {
        multerHandler = uploadConfig.any(); // Fallback para flexibilidad máxima si se pide 'any'
    } else {
        multerHandler = uploadConfig.fields(fields);
    }

    return (req: Request, res: Response, next: NextFunction) => {
        multerHandler(req, res, (err: any) => {
            if (err instanceof multer.MulterError) {
                // Errores específicos de Multer (Límites, etc)
                console.error('🚨 [UPLOAD SECURITY] Multer Error:', err);
                return res.status(400).json({
                    message: `Error de Carga: ${err.message}`,
                    code: err.code
                });
            } else if (err) {
                // Errores de FileFilter u otros
                console.error('🚨 [UPLOAD SECURITY] Blocked:', err.message);
                return res.status(415).json({ message: err.message });
            }

            // Si todo ok, continuamos al controlador
            next();
        });
    };
};
