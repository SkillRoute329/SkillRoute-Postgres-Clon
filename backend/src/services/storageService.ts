
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Determine Storage Root
// On Railway, Mount Path is typically /app/uploads if configured as Volume
// Only use absolute /app/uploads if we are sure we are in Railway.
// Otherwise fall back to local relative path for dev on Windows.
const IS_RAILWAY = fs.existsSync('/app');
const STORAGE_ROOT = IS_RAILWAY ? '/app/uploads' : path.join(process.cwd(), 'uploads');

console.log(`📂 [STORAGE] Root configured at: ${STORAGE_ROOT}`);

// Create root if missing (redundancy check)
if (!fs.existsSync(STORAGE_ROOT)) {
    try {
        fs.mkdirSync(STORAGE_ROOT, { recursive: true });
    } catch (e) {
        console.error('Failed to create storage root', e);
    }
}

export const StorageService = {
    /**
     * Saves a buffer to disk and returns the relative URL path
     * @param fileBuffer Buffer of the file
     * @param originalName Original filename to extract extension
     * @param folder Subfolder (e.g. 'avatars', 'incidents')
     */
    saveFile: (fileBuffer: Buffer, originalName: string, folder: string = 'misc'): string => {
        // 1. Ensure Folder Exists
        const targetDir = path.join(STORAGE_ROOT, folder);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // 2. Generate Unique Name
        const ext = path.extname(originalName) || '.jpg';
        const fileName = `${uuidv4()}-${Date.now()}${ext}`;
        const finalPath = path.join(targetDir, fileName);

        // 3. Write Info
        console.log(`💾 [STORAGE] Writing ${fileBuffer.length} bytes to ${finalPath}`);
        fs.writeFileSync(finalPath, fileBuffer);

        // 4. Return Public URL Path (Relative)
        // e.g. /uploads/incidents/abc-123.jpg
        return `/uploads/${folder}/${fileName}`;
    },

    /**
     * Deletes a file from disk
     * @param relativePath Relative URL path (e.g. /uploads/incidents/...)
     */
    deleteFile: (relativePath: string | null) => {
        if (!relativePath) return;

        try {
            // Strip '/uploads/' to get internal structure
            // relativePath: /uploads/folder/file.ext
            // normalized: folder/file.ext
            const cleanPath = relativePath.replace(/^\/uploads\//, '');
            const absolutePath = path.join(STORAGE_ROOT, cleanPath);

            if (fs.existsSync(absolutePath)) {
                fs.unlinkSync(absolutePath);
                console.log(`🗑️ [STORAGE] Deleted: ${absolutePath}`);
            } else {
                console.warn(`⚠️ [STORAGE] File not found for deletion: ${absolutePath}`);
            }
        } catch (error) {
            console.error(`❌ [STORAGE] Error deleting file ${relativePath}:`, error);
        }
    }
};
