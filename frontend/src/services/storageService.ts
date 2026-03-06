import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';

/**
 * Servicio de Almacenamiento Seguro (Direct-to-Cloud)
 * Elimina la carga del backend permitiendo subidas directas desde el navegador.
 */
export const StorageService = {
  /**
   * Sube un archivo a Firebase Storage en la carpeta especificada.
   * Estructura: reportes/{folder}/{YYYY-MM-DD}/{id}/{timestamp}_filename
   *
   * @param file Archivo a subir
   * @param folder Carpeta de destino (ej: 'sanciones', 'mantenimiento', 'flota')
   * @param entityId ID de la entidad relacionada (para agrupación)
   */
  async uploadFile(
    file: File,
    folder: string = 'general',
    entityId: string = 'temp',
  ): Promise<string> {
    try {
      // Validar folder para seguridad (opcional, pero buena práctica)
      const cleanFolder = folder.replace(/[^a-zA-Z0-9-_]/g, '');

      // Ruta base: reportes/ para aprovechar la regla {match /reportes/{allPaths=**}}
      const dateStr = new Date().toISOString().split('T')[0];
      const timestamp = new Date().getTime();
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');

      const path = `reportes/${cleanFolder}/${dateStr}/${entityId}/${timestamp}_${cleanFileName}`;

      const storageRef = ref(storage, path);

      // Subir
      console.log(`📤 [Storage] Subiendo a: ${path}`);
      const snapshot = await uploadBytes(storageRef, file);

      // Obtener URL
      const url = await getDownloadURL(snapshot.ref);
      console.log('✅ [Storage] URL Generada:', url);

      return url;
    } catch (error) {
      console.error('❌ Error Storage:', error);
      throw error; // Re-lanzar para que el componente maneje la UI
    }
  },
};
