import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { SobreposicionLinea, ConflictoHorario, AnalisisCompetitividadLinea } from '../types/competition';

// Hook para gestionar datos de competencia - Semana 4

interface UseCompetitionDataOptions {
  lineaId: string;
  autoRefresh?: boolean;
  refreshInterval?: number; // ms
}

export function useCompetitionData({
  lineaId,
  autoRefresh = false,
  refreshInterval = 300000 // 5 minutos por defecto
}: UseCompetitionDataOptions) {
  const [sobreposiciones, setSobreposiciones] = useState<SobreposicionLinea[]>([]);
  const [conflictos, setConflictos] = useState<ConflictoHorario[]>([]);
  const [analisis, setAnalisis] = useState<AnalisisCompetitividadLinea | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchCompetitionData = useCallback(async () => {
    if (!lineaId) return;

    setLoading(true);
    setError(null);

    try {
      const [overlapRes, conflictsRes, analysisRes] = await Promise.all([
        axios.get(`/api/competition/overlap/${lineaId}`),
        axios.get(`/api/competition/conflicts/${lineaId}`),
        axios.get(`/api/competition/analysis/${lineaId}`)
      ]);

      setSobreposiciones(overlapRes.data.data.sobreposiciones);
      setConflictos(conflictsRes.data.data.conflictosActivos);
      setAnalisis(analysisRes.data.data);
      setLastUpdate(new Date());
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error cargando datos de competencia');
      console.error('Error fetching competition data:', err);
    } finally {
      setLoading(false);
    }
  }, [lineaId]);

  // Auto-refresh
  useEffect(() => {
    fetchCompetitionData();

    if (!autoRefresh) return;

    const interval = setInterval(fetchCompetitionData, refreshInterval);
    return () => clearInterval(interval);
  }, [lineaId, autoRefresh, refreshInterval, fetchCompetitionData]);

  // Funciones auxiliares
  const getSobreposicionesPorNivel = (nivel: 'critico' | 'alto' | 'medio' | 'bajo') => {
    return sobreposiciones.filter(s => s.nivelesRiesgo === nivel);
  };

  const getConflictosPorPrioridad = (prioridad: 'critica' | 'alta' | 'media' | 'baja') => {
    return conflictos.filter(c => c.prioridad === prioridad);
  };

  const getTotalPasajerosEnRiesgo = () => {
    return sobreposiciones.reduce((sum, s) => sum + s.pasajerosEnRiesgo, 0);
  };

  const getCompetidoresPresentes = () => {
    return Array.from(new Set(sobreposiciones.map(s => s.competidor)));
  };

  return {
    // Datos
    sobreposiciones,
    conflictos,
    analisis,
    lastUpdate,

    // Estado
    loading,
    error,

    // Acciones
    refetch: fetchCompetitionData,

    // Cálculos
    totalSobreposiciones: sobreposiciones.length,
    totalConflictos: conflictos.length,
    totalPasajerosEnRiesgo: getTotalPasajerosEnRiesgo(),
    competidoresPresentes: getCompetidoresPresentes(),
    sobreposicionesCriticas: getSobreposicionesPorNivel('critico'),
    conflictosCriticos: getConflictosPorPrioridad('critica'),

    // Métodos
    getSobreposicionesPorNivel,
    getConflictosPorPrioridad
  };
}

// Hook para obtener amenazas principales
export function useMainThreats(operador: string = 'UCOT') {
  const [amenazas, setAmenazas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchThreats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await axios.get(`/api/competition/threats?operador=${operador}`);
      setAmenazas(res.data.data.amenazas);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error cargando amenazas');
    } finally {
      setLoading(false);
    }
  }, [operador]);

  useEffect(() => {
    fetchThreats();
  }, [operador, fetchThreats]);

  return {
    amenazas,
    loading,
    error,
    refetch: fetchThreats
  };
}

// Hook para obtener recomendaciones
export function useCompetitionRecommendations(lineaId: string) {
  const [recomendaciones, setRecomendaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecommendations = useCallback(async () => {
    if (!lineaId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await axios.get(`/api/competition/recommendations/${lineaId}`);
      setRecomendaciones(res.data.data.recomendacionesGenerales);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error cargando recomendaciones');
    } finally {
      setLoading(false);
    }
  }, [lineaId]);

  useEffect(() => {
    fetchRecommendations();
  }, [lineaId, fetchRecommendations]);

  return {
    recomendaciones,
    recomendacionesUrgentes: recomendaciones.filter(r => r.riesgo === 'alto'),
    loading,
    error,
    refetch: fetchRecommendations
  };
}
