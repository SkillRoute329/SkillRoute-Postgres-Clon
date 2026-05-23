/**
 * Servicio: Asignación de Servicios ↔ Categorías de Vehículos.
 * Colección: service_category_assignments
 */
import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';

export interface ServiceCategoryAssignment {
  id?: string;
  serviceNumber: string;
  linea?: string;
  categoryId: string;
  categoryName?: string;
  temporada: string;
  tipoDia: string;
  createdAt?: string;
  createdBy?: string;
}

const COL = 'service_category_assignments';

export const ServiceCategoryAssignmentService = {
  /** Obtener todas las asignaciones */
  async getAll(): Promise<ServiceCategoryAssignment[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, { query: { limit: 5000 } });
    return Array.isArray(res.data) ? (res.data as unknown as ServiceCategoryAssignment[]) : [];
  },

  /** Obtener asignaciones filtradas por temporada y tipo de día */
  async getBySeasonAndDay(
    temporada: string,
    tipoDia: string,
  ): Promise<ServiceCategoryAssignment[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { where: `temporada:${temporada},tipoDia:${tipoDia}`, limit: 5000 },
    });
    return Array.isArray(res.data) ? (res.data as unknown as ServiceCategoryAssignment[]) : [];
  },

  /** Obtener asignaciones de una categoría específica */
  async getByCategory(categoryId: string): Promise<ServiceCategoryAssignment[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { where: `categoryId:${categoryId}`, limit: 5000 },
    });
    return Array.isArray(res.data) ? (res.data as unknown as ServiceCategoryAssignment[]) : [];
  },

  /** Suscripción en tiempo real con filtro */
  // FASE 5.35 (2026-05-22): bus socket en lugar de polling 10s.
  subscribe(
    temporada: string,
    tipoDia: string,
    callback: (assignments: ServiceCategoryAssignment[]) => void,
  ): () => void {
    return subscribeViaBus<ServiceCategoryAssignment[]>(
      COL,
      () => this.getBySeasonAndDay(temporada, tipoDia),
      callback,
    );
  },

  /** Suscripción global sin filtros */
  // FASE 5.35 (2026-05-22): bus socket en lugar de polling 10s.
  subscribeAll(callback: (assignments: ServiceCategoryAssignment[]) => void): () => void {
    return subscribeViaBus<ServiceCategoryAssignment[]>(COL, () => this.getAll(), callback);
  },

  /** Crear una sola asignación */
  async create(data: Omit<ServiceCategoryAssignment, 'id'>): Promise<ServiceCategoryAssignment> {
    const res = await apiClient.post<{ id: string }>(`/api/db/${COL}`, {
      ...data,
      createdAt: new Date().toISOString(),
    });
    return { id: res.data?.id ?? String(Date.now()), ...data };
  },

  /** Asignar múltiples servicios a una categoría en lote */
  async bulkAssign(
    serviceNumbers: string[],
    categoryId: string,
    categoryName: string,
    temporada: string,
    tipoDia: string,
    linea?: string,
    createdBy?: string,
  ): Promise<number> {
    let count = 0;
    const now = new Date().toISOString();
    for (const serviceNumber of serviceNumbers) {
      const docId = `${serviceNumber}_${categoryId}_${temporada}_${tipoDia}`;
      await apiClient.put(`/api/db/${COL}/${encodeURIComponent(docId)}`, {
        serviceNumber,
        categoryId,
        categoryName: categoryName || '',
        temporada,
        tipoDia,
        linea: linea || '',
        createdAt: now,
        createdBy: createdBy || '',
      });
      count++;
    }
    return count;
  },

  /** Eliminar una asignación */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/api/db/${COL}/${encodeURIComponent(id)}`);
  },

  /** Eliminar todas las asignaciones de una categoría para una temporada/día */
  async deleteByCategory(categoryId: string, temporada: string, tipoDia: string): Promise<number> {
    const assignments = await this.getBySeasonAndDay(temporada, tipoDia);
    const toDelete = assignments.filter((a) => a.categoryId === categoryId);
    for (const a of toDelete) {
      if (a.id) await this.delete(a.id);
    }
    return toDelete.length;
  },

  /** Obtener resumen: cuántos servicios tiene cada categoría */
  async getSummary(
    temporada: string,
    tipoDia: string,
  ): Promise<Record<string, { categoryName: string; count: number; services: string[] }>> {
    const assignments = await this.getBySeasonAndDay(temporada, tipoDia);
    const summary: Record<string, { categoryName: string; count: number; services: string[] }> = {};

    for (const a of assignments) {
      if (!summary[a.categoryId]) {
        summary[a.categoryId] = { categoryName: a.categoryName || '', count: 0, services: [] };
      }
      summary[a.categoryId].count++;
      summary[a.categoryId].services.push(a.serviceNumber);
    }

    return summary;
  },
};
