import { useState, useEffect, useCallback } from 'react';
import { api } from '../config/api';
import type {
  LineaSTM,
  HorarioSTM,
  CambioHorarioDetectado,
  DatosEnVivoBus,
  CalidadDatos,
} from '../types/stm';

interface UseSTMDataReturn {
  lineas: LineaSTM[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface UseHorariosReturn {
  horarios: HorarioSTM | null;
  loading: boolean;
  error: string | null;
}

interface UseCambiosReturn {
  cambios: CambioHorarioDetectado[];
  cambios_detectados: number;
  requiere_accion: boolean;
  loading: boolean;
  error: string | null;
}

interface UseBusEnVivoReturn {
  datos: DatosEnVivoBus | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook principal para obtener líneas STM
 */
export function useSTMLineas(): UseSTMDataReturn {
  const [lineas, setLineas] = useState<LineaSTM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLineas = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get<{ data: { lineas: LineaSTM[] } }>('/stm/lineas');

      setLineas(response.data.lineas);
    } catch (err: any) {
      setError(err.message || 'Error obteniendo líneas STM');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLineas();
  }, [fetchLineas]);

  return { lineas, loading, error, refetch: fetchLineas };
}

/**
 * Hook para obtener horarios de una línea específica
 */
export function useHorarios(numeroLinea: number): UseHorariosReturn {
  const [horarios, setHorarios] = useState<HorarioSTM | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHorarios = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await api.get<{ data: HorarioSTM }>(`/stm/horarios/${numeroLinea}`);

        setHorarios(response.data);
      } catch (err: any) {
        setError(err.message || 'Error obteniendo horarios');
      } finally {
        setLoading(false);
      }
    };

    if (numeroLinea) {
      fetchHorarios();
    }
  }, [numeroLinea]);

  return { horarios, loading, error };
}

/**
 * Hook para detectar cambios de horarios
 */
export function useCambiosHorarios(numeroLinea: number): UseCambiosReturn {
  const [cambios, setCambios] = useState<CambioHorarioDetectado[]>([]);
  const [cambios_detectados, setCambiosDetectados] = useState(0);
  const [requiere_accion, setRequiereAccion] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCambios = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await api.get<{
          data: {
            cambios: CambioHorarioDetectado[];
            cambios_detectados: number;
            requiere_accion: boolean;
          };
        }>(`/stm/cambios/${numeroLinea}`);

        setCambios(response.data.cambios);
        setCambiosDetectados(response.data.cambios_detectados);
        setRequiereAccion(response.data.requiere_accion);
      } catch (err: any) {
        setError(err.message || 'Error detectando cambios');
      } finally {
        setLoading(false);
      }
    };

    if (numeroLinea) {
      fetchCambios();
    }
  }, [numeroLinea]);

  return { cambios, cambios_detectados, requiere_accion, loading, error };
}

/**
 * Hook para obtener datos en vivo de un bus
 */
export function useBusEnVivo(
  busId: string,
  autoRefresh = true,
  intervalo = 5000,
): UseBusEnVivoReturn {
  const [datos, setDatos] = useState<DatosEnVivoBus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDatos = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get<{ data: DatosEnVivoBus }>(`/stm/bus-en-vivo/${busId}`);

      setDatos(response.data);
    } catch (err: any) {
      setError(err.message || 'Error obteniendo datos en vivo');
    } finally {
      setLoading(false);
    }
  }, [busId]);

  useEffect(() => {
    if (!busId) return;

    fetchDatos();

    if (autoRefresh) {
      const interval = setInterval(fetchDatos, intervalo);
      return () => clearInterval(interval);
    }
  }, [busId, fetchDatos, autoRefresh, intervalo]);

  return { datos, loading, error, refetch: fetchDatos };
}

/**
 * Hook para obtener calidad de datos STM
 */
export function useCalidadDatos() {
  const [calidad, setCalidad] = useState<CalidadDatos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCalidad = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await api.get<{ data: CalidadDatos }>('/stm/calidad-datos');

        setCalidad(response.data);
      } catch (err: any) {
        setError(err.message || 'Error obteniendo calidad de datos');
      } finally {
        setLoading(false);
      }
    };

    fetchCalidad();
  }, []);

  return { calidad, loading, error };
}

/**
 * Hook para disparar sincronización manual (admin only)
 */
export function useSincronizacionSTM() {
  const [sincronizando, setSincronizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<any>(null);

  const sincronizar = async () => {
    try {
      setSincronizando(true);
      setError(null);

      const response = await api.post<{ data: any }>('/stm/sincronizar', {});

      setResultado(response.data);
      return response.data;
    } catch (err: any) {
      const errorMsg = err.message || 'Error sincronizando';
      setError(errorMsg);
      throw err;
    } finally {
      setSincronizando(false);
    }
  };

  return { sincronizar, sincronizando, error, resultado };
}
