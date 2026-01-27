
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

/**
 * INTERFAZ DE CONTRATO (SLA)
 * Define cómo debe comportarse cualquier proveedor de almacenamiento.
 */
interface IStorageProvider {
    save(file: Express.Multer.File, folder: string, tenantId?: number): Promise<StoredFile>;
    delete(relativePath: string): Promise<void>;
    generateHash(filePath: string): Promise<string>;
}

export interface StoredFile {
    url: string;      // URL pública para acceder
    path: string;     // Ruta física o Key en S3
    hash: string;     // SHA-256 para auditoría
    size: number;     // Bytes
    mimeType: string; // Mimetype real
    filename: string; // Nombre guardado
}

// Configuración de rutas persistentes
const IS_RAILWAY = fs.existsSync('/app');
const STORAGE_ROOT = IS_RAILWAY ? '/app/uploads' : path.join(process.cwd(), 'uploads');

/**
 * PROVEEDOR DE DISCO (PERSISTENT VOLUME COMPLIANT)
 * Guarda archivos físicamente en el disco montado.
 */
class DiskStorageProvider implements IStorageProvider {
    constructor() {
        console.log(`💽 [DMS] Inicializando. Root: ${STORAGE_ROOT}`);
        if (!fs.existsSync(STORAGE_ROOT)) {
            fs.mkdirSync(STORAGE_ROOT, { recursive: true });
        }
    }

    async save(file: Express.Multer.File, folder: string, tenantId: number = 1): Promise<StoredFile> {
        // El archivo YA fue guardado por Multer en una ubicación temporal o final.
        // Aquí lo movemos a su estructura canónica de largo plazo.

        const year = new Date().getFullYear().toString();
        const tenantDir = path.join(STORAGE_ROOT, String(tenantId), folder, year);

        if (!fs.existsSync(tenantDir)) {
            fs.mkdirSync(tenantDir, { recursive: true });
        }

        const ext = path.extname(file.originalname) || '.bin';
        const finalFilename = `${uuidv4()}-${Date.now()}${ext}`;
        const finalPath = path.join(tenantDir, finalFilename);

        // Mover desde el path temporal de Multer a la ubicación final
        await fs.promises.rename(file.path, finalPath);

        // Generar Hash de Auditoría (SHA-256)
        const hash = await this.generateHash(finalPath);

        // Construir URL relativa universal
        // /uploads/1/inspections/2026/abc.jpg
        const relativeUrl = `/uploads/${tenantId}/${folder}/${year}/${finalFilename}`;

        return {
            url: relativeUrl.replace(/\\/g, '/'),
            path: finalPath,
            hash: hash,
            size: file.size,
            mimeType: file.mimetype,
            filename: finalFilename
        };
    }

    async delete(relativePath: string): Promise<void> {
        if (!relativePath) return;
        const cleanPath = relativePath.replace(/^\/uploads\//, '');
        const absolutePath = path.join(STORAGE_ROOT, cleanPath);

        try {
            if (fs.existsSync(absolutePath)) {
                await fs.promises.unlink(absolutePath);
                console.log(`🗑️ [DMS] Eliminado: ${absolutePath}`);
            }
        } catch (error) {
            console.error('Error borrando archivo:', error);
        }
    }

    async generateHash(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);

            stream.on('error', err => reject(err));
            stream.on('data', chunk => hash.update(chunk));
            stream.on('end', () => resolve(hash.digest('hex')));
        });
    }
}

// Singleton Export
export const StorageService = new DiskStorageProvider();
