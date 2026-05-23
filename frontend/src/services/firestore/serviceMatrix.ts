import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';

const COL = 'service_matrices';

export const ServiceMatrixService = {
  /**
   * Suscribe al historial de matrices filtrando por empresa.
   * Si empresaId es null/undefined, trae todas (comportamiento legacy para SuperAdmin sin empresa seleccionada).
   * FASE 5.35 (2026-05-22): bus socket en lugar de polling 10s.
   */
  subscribeToHistory(
    callback: (history: unknown[]) => void,
    empresaId?: number | null,
  ): () => void {
    const fetchFn = async (): Promise<unknown[]> => {
      const query: Record<string, unknown> = { orderBy: 'created_at:desc', limit: 5000 };
      if (empresaId != null) query.where = `empresaId:${empresaId}`;
      const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, { query });
      return Array.isArray(res.data) ? res.data : [];
    };
    return subscribeViaBus<unknown[]>(COL, fetchFn, callback);
  },

  /**
   * Sube el archivo al backend y registra el documento en service_matrices.
   * El archivo se envía como multipart/form-data al endpoint /api/db/service_matrices/upload.
   * Solo debe invocarse para usuarios SuperAdmin (validación en UI).
   */
  async uploadMatrix(
    file: File,
    opts?: { uploadedBy?: string; area?: string; empresaId?: number },
  ): Promise<{ id: string; fileUrl: string; fileName: string; storagePath: string }> {
    const formData = new FormData();
    formData.append('file', file);
    if (opts?.uploadedBy) formData.append('uploadedBy', opts.uploadedBy);
    if (opts?.area) formData.append('area', opts.area);
    if (opts?.empresaId != null) formData.append('empresaId', String(opts.empresaId));

    // POST multipart to backend upload endpoint
    const res = await apiClient.post<{ id: string; fileUrl: string; fileName: string; storagePath: string }>(
      `/api/db/${COL}/upload`,
      formData,
    );

    return {
      id: res.data?.id ?? String(Date.now()),
      fileUrl: res.data?.fileUrl ?? '',
      fileName: res.data?.fileName ?? file.name,
      storagePath: res.data?.storagePath ?? '',
    };
  },

  /**
   * Elimina el documento en el backend y el archivo físico asociado.
   * Solo debe invocarse para usuarios SuperAdmin (validación en UI).
   */
  async deleteMatrix(id: string): Promise<void> {
    await apiClient.delete(`/api/db/${COL}/${encodeURIComponent(id)}`);
  },
};
