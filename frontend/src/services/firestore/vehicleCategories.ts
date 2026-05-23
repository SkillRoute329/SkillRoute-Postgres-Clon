/**
 * Servicio para categorías de vehículos.
 * Colección: vehicle_categories
 */
import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';
import type { VehicleCategory } from './types';

const COL = 'vehicle_categories';

export const VehicleCategoryService = {
  /** Obtener todas las categorías */
  async getAll(): Promise<VehicleCategory[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { orderBy: 'name:asc', limit: 5000 },
    });
    return Array.isArray(res.data) ? (res.data as unknown as VehicleCategory[]) : [];
  },

  /** Suscripción en tiempo real */
  // FASE 5.35 (2026-05-22): bus socket en lugar de polling 10s.
  subscribe(callback: (cats: VehicleCategory[]) => void): () => void {
    return subscribeViaBus<VehicleCategory[]>(COL, () => this.getAll(), callback);
  },

  /** Crear nueva categoría */
  async create(data: Omit<VehicleCategory, 'id'>): Promise<VehicleCategory> {
    const res = await apiClient.post<{ id: string }>(`/api/db/${COL}`, {
      ...data,
      createdAt: new Date().toISOString(),
    });
    return { id: res.data?.id ?? String(Date.now()), ...data } as VehicleCategory;
  },

  /** Actualizar categoría */
  async update(id: string, data: Partial<VehicleCategory>): Promise<void> {
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(id)}`, data);
  },

  /** Eliminar categoría */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/api/db/${COL}/${encodeURIComponent(id)}`);
  },
};
