import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../config/firebase";

/**
 * Servicio de Almacenamiento Seguro (Direct-to-Cloud)
 * Elimina la carga del backend permitiendo subidas directas desde el navegador.
 */
export const StorageService = {

    /**
     * Sube una foto de evidencia para una sanción o reporte.
     * @param file El archivo seleccionado por el usuario (File object)
     * @param reportId ID del reporte/sanción para organizar carpetas
     * @returns URL pública de la imagen almacenada
     */
    async uploadSancionPhoto(file: File, reportId: string = 'temp'): Promise<string> {
        try {
            // 1. Definir ruta: sanciones/{fecha}/{id_reporte}/{nombre_unico}
            const timestamp = new Date().getTime();
            const uniqueName = `${timestamp}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
            const path = `sanciones/${new Date().toISOString().split('T')[0]}/${reportId}/${uniqueName}`;

            const storageRef = ref(storage, path);

            // 2. Subir archivo (Bytes directos)
            console.log(`📤 Iniciando subida a: ${path}`);
            const snapshot = await uploadBytes(storageRef, file);
            console.log('✅ Subida completada:', snapshot);

            // 3. Obtener URL de descarga
            const downloadURL = await getDownloadURL(snapshot.ref);
            console.log('🔗 URL Generada:', downloadURL);

            return downloadURL;

        } catch (error) {
            console.error("❌ Error subiendo imagen a Firebase Storage:", error);
            throw new Error("No se pudo subir la imagen. Verifica tu conexión.");
        }
    }
};
