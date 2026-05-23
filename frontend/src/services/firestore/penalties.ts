import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';

const RULES_COL = 'penalty_rules';
const RED_NUMBERS_COL = 'abl_red_numbers';

export const PenaltyService = {
  async getRules(): Promise<unknown[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${RULES_COL}`, { query: { limit: 5000 } });
    return Array.isArray(res.data) ? res.data : [];
  },

  // FASE 5.31 (2026-05-21): bus socket en lugar de polling 10s.
  subscribeRules(callback: (items: unknown[]) => void): () => void {
    return subscribeViaBus<unknown[]>(RULES_COL, () => this.getRules(), callback);
  },

  async saveRule(data: Record<string, unknown>) {
    const res = await apiClient.post<{ id: string }>(`/api/db/${RULES_COL}`, data);
    return { id: res.data?.id ?? String(Date.now()), ...data };
  },

  async deleteRule(id: string) {
    await apiClient.delete(`/api/db/${RULES_COL}/${encodeURIComponent(id)}`);
  },

  async getRedNumbers(): Promise<unknown[]> {
    try {
      const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${RED_NUMBERS_COL}`, { query: { limit: 5000 } });
      return Array.isArray(res.data) ? res.data : [];
    } catch {
      return [];
    }
  },

  // FASE 5.27 (2026-05-19) — Cierra el botón "Aplicar Sanción" que estaba
  // sin onClick. Persiste el registro de la sanción aplicada (tabla
  // `penalties`, ya whitelisteada en dbBridge) y marca el número rojo como
  // sancionado, propagando al resto del sistema (balances, jornales).
  async applyPenalty(payload: {
    userId?: string | number;
    userName?: string;
    ruleId?: string;
    ruleName?: string;
    monto?: number;
    redNumberId?: string;
    motivo?: string;
  }) {
    const fecha = new Date().toISOString().slice(0, 10);
    const res = await apiClient.post<{ id: string }>(`/api/db/penalties`, {
      user_id: payload.userId,
      user_name: payload.userName,
      rule_id: payload.ruleId,
      rule_name: payload.ruleName,
      monto: payload.monto ?? 0,
      motivo: payload.motivo ?? payload.ruleName ?? 'Infracción',
      fecha,
      origen: 'abl',
      red_number_id: payload.redNumberId,
    });
    if (payload.redNumberId) {
      try {
        await apiClient.put(`/api/db/${RED_NUMBERS_COL}/${encodeURIComponent(payload.redNumberId)}`, {
          estado: 'sancionado',
          fecha_cierre: fecha,
        });
      } catch { /* no bloquear si el red number no existe en DB todavía */ }
    }
    return { id: res.data?.id ?? '', fecha };
  },
};
