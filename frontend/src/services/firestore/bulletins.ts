import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';

const COL = 'boletines';

export const BulletinService = {
  async getEntries(filters: { line?: string; date?: string }) {
    const whereParts: string[] = [];
    if (filters.line) whereParts.push(`line:${filters.line}`);
    if (filters.date) whereParts.push(`date:${filters.date}`);
    const query: Record<string, unknown> = { orderBy: 'date:desc', limit: 5000 };
    if (whereParts.length) query.where = whereParts.join(',');
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, { query });
    return Array.isArray(res.data) ? res.data : [];
  },

  // FASE 5.31 (2026-05-21): bus socket en lugar de polling 10s.
  subscribeEntries(
    callback: (entries: unknown[]) => void,
    filters: { line?: string; date?: string } = {},
  ): () => void {
    return subscribeViaBus<unknown[]>(
      COL,
      () => this.getEntries(filters),
      callback,
      { alsoListen: ['bus:db:bulletins:any'] },
    );
  },

  async save(data: Record<string, unknown>) {
    await apiClient.post(`/api/db/${COL}`, { ...data, createdAt: new Date().toISOString() });
  },

  async getMyStats(userId?: string | number): Promise<{ total: number; last30: number; ultimoBoletin: string | null }> {
    // FASE 5.28 (2026-05-19) — Antes solo devolvía {total}. Ahora calcula
    // total, últimos 30 días y fecha del último boletín del usuario.
    const query: Record<string, unknown> = { limit: 5000, orderBy: 'date:desc' };
    if (userId != null) query.where = `userId:${userId}`;
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, { query });
    const rows = Array.isArray(res.data) ? res.data : [];
    const ms30 = Date.now() - 30 * 24 * 3600 * 1000;
    const last30 = rows.filter((r) => {
      const d = String(r.date ?? r.createdAt ?? '');
      const t = Date.parse(d);
      return Number.isFinite(t) && t >= ms30;
    }).length;
    const ultimoBoletin = (rows[0]?.date as string) ?? (rows[0]?.createdAt as string) ?? null;
    return { total: rows.length, last30, ultimoBoletin };
  },

  async getVehicleStats(vehicleId: string): Promise<{ total: number; last30: number }> {
    // FASE 5.28 — Antes devolvía {}. Ahora cuenta boletines del vehículo.
    if (!vehicleId) return { total: 0, last30: 0 };
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { limit: 5000, where: `vehicleId:${vehicleId}` },
    });
    const rows = Array.isArray(res.data) ? res.data : [];
    const ms30 = Date.now() - 30 * 24 * 3600 * 1000;
    const last30 = rows.filter((r) => {
      const t = Date.parse(String(r.date ?? r.createdAt ?? ''));
      return Number.isFinite(t) && t >= ms30;
    }).length;
    return { total: rows.length, last30 };
  },

  async generateCarton(opts: { serviceNumber: string; date: string }) {
    // FASE 5.28 — Antes devolvía {}. Ahora consulta el endpoint real del
    // cartón oficial UCOT por número de servicio.
    if (!opts?.serviceNumber) return { ok: false, error: 'Falta serviceNumber' };
    const res = await apiClient.get<{ ok?: boolean; cartones?: unknown[] }>(
      `/api/cartones/oficiales/${encodeURIComponent(opts.serviceNumber)}`,
    );
    return res.data ?? { ok: false };
  },
};
