/**
 * useDashboardAgents.ts
 * Hook para consumir datos del sistema de agentes inteligentes
 * Integración con ExecutiveDashboard sin romper funcionalidad existente
 */

import { useState, useEffect, useCallback } from 'react';

interface AlertaAgente {
  alerta_id: string;
  linea: number;
  tipo: string;
  recorrido: string;
  sentido: string;
  tiempo_minutos: number | null;
  timestamp: string;
  mensaje: string;
  acciones_recomendadas: string[];
  severidad: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRÍTICA';
  fuente: string;
}

interface EcosistemaLinea {
  lineId: number;
  lineNombre: string;
  status: string;
  totalAgents: number;
  orchestrator: string;
  ownAgents: number;
  competitorAgents: number;
}

interface EstadisticasAgentes {
  timestamp: string;
  total_lines: number;
  ecosystems: EcosistemaLinea[];
  total_agents: number;
}

interface DatosAgentes {
  status: EstadisticasAgentes | null;
  alertas: AlertaAgente[];
  estadisticas: Record<number, any>;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useDashboardAgents(autoRefresh = true, refreshInterval = 60000): DatosAgentes {
  const [status, setStatus] = useState<EstadisticasAgentes | null>(null);
  const [alertas, setAlertas] = useState<AlertaAgente[]>([]);
  const [estadisticas, setEstadisticas] = useState<Record<number, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);

      // Fetch each endpoint independently — one failure should not block the others
      const [statusRes, alertasRes, statsRes] = await Promise.allSettled([
        fetch('/api/agents/status').then(r => r.ok ? r.json() : null),
        fetch('/api/agents/alerts/history').then(r => r.ok ? r.json() : null),
        fetch('/api/agents/alerts/statistics').then(r => r.ok ? r.json() : null),
      ]);

      if (statusRes.status === 'fulfilled' && statusRes.value) {
        setStatus(statusRes.value);
      }
      if (alertasRes.status === 'fulfilled' && alertasRes.value) {
        setAlertas(alertasRes.value.alerts || []);
      }
      if (statsRes.status === 'fulfilled' && statsRes.value) {
        setEstadisticas(statsRes.value.statistics || {});
      }

      // Solo reportar error si TODOS fallaron
      const allFailed = [statusRes, alertasRes, statsRes].every(r => r.status === 'rejected');
      if (allFailed) {
        setError('Backend de agentes no disponible. Los datos se actualizarán cuando el servidor esté activo.');
      }

      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    if (autoRefresh) {
      const interval = setInterval(fetchData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, autoRefresh, refreshInterval]);

  return {
    status,
    alertas,
    estadisticas,
    loading,
    error,
    refetch: fetchData,
  };
}
