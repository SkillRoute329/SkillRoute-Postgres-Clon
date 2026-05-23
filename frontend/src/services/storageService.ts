import { apiClient } from '../clients/apiClient';

/**
 * Servicio de Almacenamiento Seguro
 * TODO FASE 5: migrar storage a MinIO
 * Actualmente delega a endpoint REST del backend.
 */
export const StorageService = {
  /**
   * Sube un archivo al backend en la carpeta especificada.
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
      // TODO FASE 5: migrar storage a MinIO
      const cleanFolder = folder.replace(/[^a-zA-Z0-9-_]/g, '');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', cleanFolder);
      formData.append('entityId', entityId);

      const result = await apiClient.post('/api/files/upload', formData) as { url?: string };
      if (!result?.url) {
        throw new Error('El backend no devolvió una URL de descarga');
      }
      return result.url;
    } catch (error) {
      console.error('Error Storage:', error);
      throw error;
    }
  },
};
