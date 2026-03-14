import { useState, useEffect, useCallback } from 'react';
import { api } from '../config/api';
import { DashboardEjecutivo, DashboardMetricas, EstadoLinea, AlertaLinea, RecomendacionEjecutiva, SaludOperacional, ProyeccionIngresos } from '../types/dashboard';

interface UseDashboardDataProps {
  operador: string;
  autoRefresh?: boolean;
  refreshInterval?: number; // en milisegundos
}

interface UseDashboardDataReturn {
  dashboard: DashboardEjecutivo | null;
  metricas: DashboardMetricas | null;
  lineas: EstadoLinea[];
  alertas: AlertaLinea[];
  recomendaciones: RecomendacionEjecutiva[];
  salud: SaludOperacional | null;
  proyecciones: ProyeccionIngresos[];
  resumen_ejecutivo: string;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook principal que obtiene el dashboard completo
 */
export function useDashboardData({
  operador,
  autoRefresh = false,
  refreshInterval = 300000 // 5 minutos por defecto
}: UseDashboardDataProps): UseDashboardDataReturn {
  const [dashboard, setDashboard] = useState<DashboardEjecutivo | null>(null);
  const [metricas, setMetricas] = useState<DashboardMetricas | null>(null);
  const [lineas, setLineas] = useState<EstadoLinea[]>([]);
  const [alertas, setAlertas] = useState<AlertaLinea[]>([]);
  const [recomendaciones, setRecomendaciones] = useState<RecomendacionEjecutiva[]>([]);
  const [salud, setSalud] = useState<SaludOperacional | null>(null);
  const [proyecciones, setProyecciones] = useState<ProyeccionIngresos[]>([]);
  const [resumen_ejecutivo, setResumenEjecutivo] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Obtener dashboard completo
      const response = await api.get<{ data: DashboardEjecutivo }>(
        `/dashboard/executive/${operador}`
      );

      const data = response.data;

      setDashboard(data);
      setMetricas(data.metricas);
      setLineas(data.lineas || []);
      setSalud(data.salud_operacional);
      setProyecciones(data.proyecciones || []);
      setAlertas(data.alertas_criticas || []);
      setRecomendaciones(data.recomendaciones || []);
      setResumenEjecutivo(data.resumen_texto);
    } catch (err: any) {
      setError(err.message || 'Error obteniendo dashboard');
      console.error('Error en useDashboardData:', err);
    } finally {
      setLoading(false);
    }
  }, [operador]);

  // Auto-refresh
  useEffect(() => {
    fetchDashboard();

    if (autoRefresh) {
      const interval = setInterval(fetchDashboard, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchDashboard, autoRefresh, refreshInterval]);

  return {
    dashboard,
    metricas,
    lineas,
    alertas,
    recomendaciones,
    salud,
    proyecciones,
    resumen_ejecutivo,
    loading,
    error,
    refetch: fetchDashboard
  };
}

/**
 * Hook para obtener solo métricas (carga rápida)
 */
export function useMetricas(operador: string) {
  const [metricas, setMetricas] = useState<DashboardMetricas | null>(null);
  const [salud, setSalud] = useState<SaludOperacional | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetricas = async () => {
      try {
        setLoading(true);
        const response = await api.get<{
          data: { metricas: DashboardMetricas; salud_operacional: SaludOperacional }
        }>(`/dashboard/metricas/${operador}`);

        setMetricas(response.data.metricas);
        setSalud(response.data.salud_operacional);
      } catch (err: any) {
        setError(err.message || 'Error obteniendo métricas');
      } finally {
        setLoading(false);
      }
    };

    fetchMetricas();
  }, [operador]);

  return { metricas, salud, loading, error };
}

/**
 * Hook para obtener estado de líneas
 */
export function useLineasEstado(operador: string) {
  const [lineas, setLineas] = useState<EstadoLinea[]>([]);
  const [resumen, setResumen] = useState({
    total: 0,
    operativas: 0,
    en_riesgo: 0,
    marginales: 0,
    criticas: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLineas = async () => {
      try {
        setLoading(true);
        const response = await api.get<{ data: any }>(`/dashboard/lineas/${operador}`);

        setLineas(response.data.lineas);
        setResumen({
          total: response.data.total,
          operativas: response.data.operativas,
          en_riesgo: response.data.en_riesgo,
          marginales: response.data.marginales,
          criticas: response.data.criticas
        });
      } catch (err: any) {
        setError(err.message || 'Error obteniendo líneas');
      } finally {
        setLoading(false);
      }
    };

    fetchLineas();
  }, [operador]);

  return { lineas, resumen, loading, error };
}

/**
 * Hook para obtener alertas
 */
export function useAlertas(operador: string) {
  const [alertas, setAlertas] = useState<AlertaLinea[]>([]);
  const [alertas_por_linea, setAlertasPorLinea] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAlertas = async () => {
      try {
        setLoading(true);
        const response = await api.get<{ data: any }>(`/dashboard/alertas/${operador}`);

        setAlertas(response.data.alertas_criticas);
        setAlertasPorLinea(response.data.alertas_por_linea);
        setTotal(response.data.total_alertas);
      } catch (err: any) {
        setError(err.message || 'Error obteniendo alertas');
      } finally {
        setLoading(false);
      }
    };

    fetchAlertas();
  }, [operador]);

  return { alertas, alertas_por_linea, total, loading, error };
}

/**
 * Hook para obtener recomendaciones
 */
export function useRecomendaciones(operador: string) {
  const [recomendaciones, setRecomendaciones] = useState<RecomendacionEjecutiva[]>([]);
  const [impacto_total, setImpactoTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRecomendaciones = async () => {
      try {
        setLoading(true);
        const response = await api.get<{ data: any }>(
          `/dashboard/recomendaciones/${operador}`
        );

        setRecomendaciones(response.data.recomendaciones);
        setImpactoTotal(response.data.impacto_total);
      } catch (err: any) {
        setError(err.message || 'Error obteniendo recomendaciones');
      } finally {
        setLoading(false);
      }
    };

    fetchRecomendaciones();
  }, [operador]);

  return { recomendaciones, impacto_total, loading, error };
}

/**
 * Hook para obtener salud operacional
 */
export function useSaludOperacional(operador: string) {
  const [salud, setSalud] = useState<SaludOperacional | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSalud = async () => {
      try {
        setLoading(true);
        const response = await api.get<{ data: SaludOperacional }>(
          `/dashboard/salud/${operador}`
        );

        setSalud(response.data);
      } catch (err: any) {
        setError(err.message || 'Error obteniendo salud operacional');
      } finally {
        setLoading(false);
      }
    };

    fetchSalud();
  }, [operador]);

  return { salud, loading, error };
}

/**
 * Hook para obtener proyecciones
 */
export function useProyecciones(operador: string) {
  const [proyecciones, setProyecciones] = useState<ProyeccionIngresos[]>([]);
  const [ingresos_promedio, setIngresoPromedio] = useState(0);
  const [crecimiento_promedio, setCrecimientoPromedio] = useState('0');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProyecciones = async () => {
      try {
        setLoading(true);
        const response = await api.get<{ data: any }>(
          `/dashboard/proyecciones/${operador}`
        );

        setProyecciones(response.data.proyecciones);
        setIngresoPromedio(response.data.ingresos_promedio);
        setCrecimientoPromedio(response.data.crecimiento_promedio);
      } catch (err: any) {
        setError(err.message || 'Error obteniendo proyecciones');
      } finally {
        setLoading(false);
      }
    };

    fetchProyecciones();
  }, [operador]);

  return { proyecciones, ingresos_promedio, crecimiento_promedio, loading, error };
}

/**
 * Hook para obtener resumen ejecutivo
 */
export function useResumenEjecutivo(operador: string) {
  const [resumen, setResumen] = useState<string>('');
  const [fecha, setFecha] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchResumen = async () => {
      try {
        setLoading(true);
        const response = await api.get<{ data: any }>(`/dashboard/resumen/${operador}`);

        setResumen(response.data.resumen_ejecutivo);
        setFecha(new Date(response.data.fecha_generacion));
      } catch (err: any) {
        setError(err.message || 'Error obteniendo resumen ejecutivo');
      } finally {
        setLoading(false);
      }
    };

    fetchResumen();
  }, [operador]);

  return { resumen, fecha, loading, error };
}
