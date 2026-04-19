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

      // Consumimos el endpoint central de inteligencia de la flota (Cloud Function)
      // Este endpoint reemplaza la necesidad del viejo bridge-server para la vista general
      const fleetRes = await fetch('/api/ucot/fleet-intel');
      
      if (!fleetRes.ok) {
        throw new Error(`Error HTTP: ${fleetRes.status}`);
      }

      const fleetData = await fleetRes.json();

      if (fleetData && fleetData.ok && fleetData.lineas) {
        // Mapeamos los datos de la flota al formato que espera el Dashboard
        const ecosystems: EcosistemaLinea[] = fleetData.lineas.map((l: any) => ({
          lineId: l.lineId,
          lineNombre: l.nombreComercial,
          status: l.estadoOperativo === 'OPERATIVO' || l.estadoOperativo === 'ALERTA' ? 'ACTIVO' : 'INACTIVO',
          totalAgents: (l.busesActivos > 0 ? 1 : 0) + l.rivalCount, // Agente inspector propio + agentes rivales
          orchestrator: `Orquestador-${l.lineId}`,
          ownAgents: l.busesActivos > 0 ? 1 : 0,
          competitorAgents: l.rivalCount
        }));

        setStatus({
          timestamp: fleetData.timestamp,
          total_lines: fleetData.totalLineas,
          ecosystems,
          total_agents: ecosystems.reduce((sum, e) => sum + e.totalAgents, 0)
        });

        // Extraemos 'alertas' sintéticas basadas en las líneas con problemas
        const lineasConAlerta = fleetData.lineas.filter((l: any) => l.nivelAlerta === 'ALTA' || l.nivelAlerta === 'MEDIA');
        const alertasFicticias: AlertaAgente[] = lineasConAlerta.map((l: any, i: number) => ({
          alerta_id: `alerta-dinamica-${l.lineId}-${i}`,
          linea: parseInt(l.lineId.toString().replace(/\D/g, '') || '0'),
          tipo: l.bunchingPares > 0 ? 'BUNCHING_DETECTADO' : 'COMPETENCIA_ALTA',
          recorrido: '-',
          sentido: 'Ambos',
          tiempo_minutos: null,
          timestamp: fleetData.timestamp,
          mensaje: l.bunchingPares > 0 
            ? `Se detectaron ${l.bunchingPares} pares de buses agrupados en el corredor.`
            : `El ${l.pctFlotaEnDisputa}% de la flota está en disputa directa con la competencia.`,
          acciones_recomendadas: ['Ingresar a la vista táctica de la línea para generar acciones.'],
          severidad: l.nivelAlerta === 'ALTA' ? 'CRÍTICA' : 'MEDIA',
          fuente: 'INTELIGENCIA_TIEMPO_REAL'
        }));

        setAlertas(alertasFicticias);
        
        // Estadísticas mockeadas temporalmente ya que la UI las usa minimamente
        setEstadisticas({});
      }

      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al conectar con la API de Inteligencia');
      
      // En entorno local sin proxy configurado, esto puede fallar si no apuntamos a /api
      // La UI debe informar correctamente
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
