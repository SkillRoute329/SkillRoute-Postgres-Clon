import { apiClient } from '../clients/apiClient';

export interface EamWorkOrder {
  id?: string;
  vehicleId: string;
  type: 'Preventivo' | 'Correctivo' | 'Inspeccion';
  description: string;
  status: 'PENDIENTE' | 'EN_PROCESO' | 'CERRADO' | 'CANCELADO';
  priority: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  mechanicId?: string;
  mechanicName?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  notes?: string;
}

class EamServiceClass {
  private COL_WO = 'work_orders';

  async getWorkOrders(vehicleId?: string): Promise<EamWorkOrder[]> {
    const query: Record<string, unknown> = { orderBy: 'created_at:desc', limit: 500 };
    if (vehicleId) {
      query.where = `coche_id:${vehicleId}`;
    }
    const res = await apiClient.get<any[]>(`/api/db/${this.COL_WO}`, { query });
    const arr = Array.isArray(res) ? res : (Array.isArray((res as any).data) ? (res as any).data : []);
    return arr.map(wo => ({
      ...wo,
      vehicleId: wo.vehicleId || wo.coche_id || wo.cocheId,
      type: wo.type || wo.tipo,
      status: wo.status || wo.estado,
      priority: wo.priority || wo.prioridad || 'MEDIA',
      createdAt: wo.createdAt || wo.created_at || wo.fecha,
      completedAt: wo.completedAt || wo.completed_at
    })) as EamWorkOrder[];
  }

  async createWorkOrder(data: Omit<EamWorkOrder, 'id' | 'createdAt'>): Promise<EamWorkOrder> {
    const payload = {
      ...data,
      createdAt: new Date().toISOString(),
    };
    const res = await apiClient.post<{ id: string }>(`/api/db/${this.COL_WO}`, payload);
    return { id: res.id, ...payload } as EamWorkOrder;
  }

  async updateWorkOrder(id: string, data: Partial<EamWorkOrder>): Promise<void> {
    await apiClient.put(`/api/db/${this.COL_WO}/${encodeURIComponent(id)}`, data);
  }

  /**
   * Mean Time Between Failures (MTBF)
   * Calcula el tiempo promedio (en horas) entre fallas (órdenes correctivas) para un vehículo.
   */
  async calculateMTBF(vehicleId: string): Promise<number | null> {
    const wos = await this.getWorkOrders(vehicleId);
    const failures = wos
      .filter((w) => w.type === 'Correctivo' && w.createdAt)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    if (failures.length < 2) return null; // Se necesitan al menos 2 fallas para calcular el tiempo entre ellas

    let totalHours = 0;
    for (let i = 1; i < failures.length; i++) {
      const prevDate = new Date(failures[i - 1].createdAt);
      const currDate = new Date(failures[i].createdAt);
      const diffMs = currDate.getTime() - prevDate.getTime();
      totalHours += diffMs / (1000 * 60 * 60);
    }

    return totalHours / (failures.length - 1);
  }

  /**
   * Mean Time To Repair (MTTR)
   * Calcula el tiempo promedio (en horas) que toma reparar una falla (desde createdAt hasta completedAt)
   */
  async calculateMTTR(vehicleId?: string): Promise<number | null> {
    const wos = await this.getWorkOrders(vehicleId);
    const completedRepairs = wos.filter(
      (w) => w.type === 'Correctivo' && w.status === 'CERRADO' && w.createdAt && w.completedAt
    );

    if (completedRepairs.length === 0) return null;

    let totalHours = 0;
    for (const wo of completedRepairs) {
      const start = new Date(wo.createdAt);
      const end = new Date(wo.completedAt!);
      const diffMs = end.getTime() - start.getTime();
      totalHours += diffMs / (1000 * 60 * 60);
    }

    return totalHours / completedRepairs.length;
  }
}

export const eamService = new EamServiceClass();
