import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { PronosticoIngreso, SimulacionResultado, CambioHorario } from '../types/analytics';

// Hook para gestionar datos de pronósticos - Semana 6-7

interface UseForecastDataOptions {
  lineaId: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function useForecastData({
  lineaId,
  autoRefresh = false,
  refreshInterval = 600000,
}: UseForecastDataOptions) {
  const [pronostico, setPronostico] = useState<PronosticoIngreso | null>(null);
  const [mejorEscenario, setMejorEscenario] = useState<any>(null);
  const [peorEscenario, setPeorEscenario] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPronostico = useCallback(async () => {
    if (!lineaId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await axios.get(`/api/forecast/income/${lineaId}`);
      setPronostico(res.data.data.pronostico);
      setMejorEscenario(res.data.data.mejorEscenario);
      setPeorEscenario(res.data.data.peorEscenario);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error cargando pronóstico');
    } finally {
      setLoading(false);
    }
  }, [lineaId]);

  useEffect(() => {
    fetchPronostico();

    if (!autoRefresh) return;

    const interval = setInterval(fetchPronostico, refreshInterval);
    return () => clearInterval(interval);
  }, [lineaId, autoRefresh, refreshInterval, fetchPronostico]);

  return {
    pronostico,
    mejorEscenario,
    peorEscenario,
    loading,
    error,
    refetch: fetchPronostico,
  };
}

// Hook para simulador de horarios
export function useSimulator() {
  const [simulacion, setSimulacion] = useState<SimulacionResultado | null>(null);
  const [resumen, setResumen] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const simular = useCallback(async (lineaId: string, cambios: CambioHorario[]) => {
    setLoading(true);
    setError(null);

    try {
      const res = await axios.post('/api/forecast/simulate', {
        lineaId,
        cambios,
      });

      setSimulacion(res.data.data.simulacion);
      setResumen(res.data.data.resumen);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error en simulación');
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setSimulacion(null);
    setResumen(null);
    setError(null);
  }, []);

  return {
    simulacion,
    resumen,
    loading,
    error,
    simular,
    reset,
  };
}

// Hook para horarios pico
export function usePeakHours(lineaId: string) {
  const [horariosAlta, setHorariosAlta] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPeakHours = useCallback(async () => {
    if (!lineaId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await axios.get(`/api/forecast/peak-hours/${lineaId}`);
      setHorariosAlta(res.data.data.horariosAlta);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error cargando horarios');
    } finally {
      setLoading(false);
    }
  }, [lineaId]);

  useEffect(() => {
    fetchPeakHours();
  }, [lineaId, fetchPeakHours]);

  return {
    horariosAlta,
    loading,
    error,
    refetch: fetchPeakHours,
  };
}

// Hook para proyección de crecimiento
export function useGrowthProjection(lineaId: string, meses: number = 6) {
  const [proyeccion, setProyeccion] = useState<any>(null);
  const [resumen, setResumen] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProjection = useCallback(async () => {
    if (!lineaId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await axios.get(`/api/forecast/growth/${lineaId}?meses=${meses}`);
      setProyeccion(res.data.data.proyeccion);
      setResumen(res.data.data.resumen);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error cargando proyección');
    } finally {
      setLoading(false);
    }
  }, [lineaId, meses]);

  useEffect(() => {
    fetchProjection();
  }, [lineaId, meses, fetchProjection]);

  return {
    proyeccion,
    resumen,
    loading,
    error,
    refetch: fetchProjection,
  };
}

// Hook para benchmark
export function useBenchmark(lineaId: string) {
  const [comparacion, setComparacion] = useState<any>(null);
  const [analisis, setAnalisis] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBenchmark = useCallback(async () => {
    if (!lineaId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await axios.get(`/api/forecast/benchmark/${lineaId}`);
      setComparacion(res.data.data.comparacion);
      setAnalisis(res.data.data.analisis);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error cargando benchmark');
    } finally {
      setLoading(false);
    }
  }, [lineaId]);

  useEffect(() => {
    fetchBenchmark();
  }, [lineaId, fetchBenchmark]);

  return {
    comparacion,
    analisis,
    loading,
    error,
    refetch: fetchBenchmark,
  };
}
