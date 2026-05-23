/**
 * Configuración global del sistema (Parámetros del Sistema).
 * Un solo documento en el backend; leído por el motor de desvíos (tolerancia, etc.).
 */
import { apiClient } from '../../clients/apiClient';

const DOC_PATH = 'system_config';
const DOC_ID = 'params';

export interface SystemConfigRecord {
  toleranciaMinutos: number;
  updatedAt?: string;
}

const DEFAULTS: SystemConfigRecord = {
  toleranciaMinutos: 10,
};

export const SystemConfigService = {
  async get(): Promise<SystemConfigRecord> {
    try {
      const res = await apiClient.get<Record<string, unknown>>(`/api/db/${DOC_PATH}/${encodeURIComponent(DOC_ID)}`);
      if (!res.data) return { ...DEFAULTS };
      const d = res.data;
      return {
        toleranciaMinutos:
          typeof d?.toleranciaMinutos === 'number' ? d.toleranciaMinutos : DEFAULTS.toleranciaMinutos,
        updatedAt: d?.updatedAt as string | undefined,
      };
    } catch {
      return { ...DEFAULTS };
    }
  },

  async setToleranciaMinutos(minutos: number): Promise<void> {
    await apiClient.put(`/api/db/${DOC_PATH}/${encodeURIComponent(DOC_ID)}`, {
      toleranciaMinutos: Math.max(0, Math.min(60, minutos)),
      updatedAt: new Date().toISOString(),
    });
  },
};
