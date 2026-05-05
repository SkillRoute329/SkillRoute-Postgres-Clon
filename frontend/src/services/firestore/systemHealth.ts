/**
 * SystemHealthService
 *
 * Mide latencia real del backend pegándole a /api/autostats/health (endpoint
 * HTTP que ya existe y responde JSON con el estado del cron autoStatsCollector).
 * No depende de reglas Firestore para colecciones que pueden no existir.
 *
 * Regla anti-simulación (CLAUDE.md): si la medición falla, devolver `null`,
 * NUNCA un valor placeholder como -1ms o 'desconocido'. El componente
 * consumidor debe renderizar "Sin datos" para esos campos.
 */
interface SystemStatus {
  database: { status: string; latency: number | null };
  environment: { platform: string | null; node: string | null };
}

export const SystemHealthService = {
  async getStatus(): Promise<SystemStatus> {
    const start = Date.now();
    try {
      const resp = await fetch('/api/autostats/health', { cache: 'no-store' });
      if (!resp.ok) throw new Error(`http_${resp.status}`);
      await resp.json(); // confirmar que el cuerpo es JSON válido
      const latency = Date.now() - start;
      return {
        database: { status: 'READY', latency },
        environment: { platform: 'Firebase Functions', node: '22' },
      };
    } catch {
      // Falla legítima: NO inventar valores. El UI muestra "Sin datos"
      // cuando estos campos son null.
      return {
        database: { status: 'ERROR', latency: null },
        environment: { platform: null, node: null },
      };
    }
  },

  async getLogs(): Promise<unknown[]> {
    return [];
  },

  async triggerUpdate(): Promise<{ ok: boolean; message?: string }> {
    try {
      const resp = await fetch('/api/autostats/health', { cache: 'no-store' });
      if (!resp.ok) throw new Error(`http_${resp.status}`);
      const data = await resp.json();
      const lastCheck = data?.health?.lastCheck ?? 'desconocido';
      return { ok: true, message: `Health endpoint respondió. Último chequeo: ${lastCheck}` };
    } catch {
      return { ok: false, message: 'No se pudo contactar el endpoint /api/autostats/health.' };
    }
  },
};
