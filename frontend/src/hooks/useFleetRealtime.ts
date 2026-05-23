/**
 * useFleetRealtime — Hook GPS en tiempo real
 * ===========================================
 * Consulta viajes_activos via REST polling y retorna la flota activa actualizada.
 * Usado por FleetMonitorModule, CEODashboard y cualquier widget de mapa.
 * TODO FASE 4.5: Socket.io firestore:viajes_activos
 *
 * DÓNDE COLOCAR: frontend/src/hooks/useFleetRealtime.ts
 *
 * USO:
 *   const { vehiculos, total, loading } = useFleetRealtime();
 *   const { vehiculos } = useFleetRealtime({ soloEmpresa: 'UCOT', inactividadMin: 10 });
 */

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../clients/apiClient';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface VehiculoEnMapa {
  id: string;
  cocheId: string;
  empresa: string;
  codigoLinea: string;
  conductorNombre: string;
  lat: number;
  lng: number;
  velocidad: number | null;
  estado: string;
  updatedAtMs: number;
  hacieCuantoMin: number;
}

export interface UseFleetRealtimeOptions {
  soloEmpresa?: string; // Filtrar por empresa, ej: 'UCOT'
  inactividadMin?: number; // Descartar vehículos inactivos hace N min (default: 15)
  habilitado?: boolean; // Pausar el polling si false
}

export interface UseFleetRealtimeResult {
  vehiculos: VehiculoEnMapa[];
  total: number;
  totalUCOT: number;
  totalCompetencia: number;
  loading: boolean;
  error: string | null;
  ultimaActualizacion: Date | null;
  refrescar: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const COL_VIAJES = 'viajes_activos';

export function useFleetRealtime(opciones: UseFleetRealtimeOptions = {}): UseFleetRealtimeResult {
  const { soloEmpresa, inactividadMin = 15, habilitado = true } = opciones;

  const [vehiculos, setVehiculos] = useState<VehiculoEnMapa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refrescar = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!habilitado) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    const inactividadMs = inactividadMin * 60 * 1000;

    const fetchFleet = async () => {
      try {
        const queryParams: Record<string, string | number> = { limit: 2000 };
        if (soloEmpresa) {
          queryParams.where = `empresa:${soloEmpresa}`;
        }
        const raw = await apiClient.get(`/api/db/${COL_VIAJES}`, { query: queryParams }) as any[];
        if (!active) return;

        const ahora = Date.now();
        const cutoff = ahora - inactividadMs;
        const lista: VehiculoEnMapa[] = [];

        (Array.isArray(raw) ? raw : []).forEach((data: any) => {
          // Filtrar inactivos
          const updatedAtMs = toMillis(data.updatedAt);
          if (updatedAtMs < cutoff) return;

          // Filtrar por empresa si se especificó (belt-and-suspenders when query not supported)
          if (soloEmpresa && data.empresa !== soloEmpresa) return;

          // Extraer posición — soportar GeoPoint object o campos planos lat/lng
          const pos = data.posicion as { latitude?: number; longitude?: number } | undefined;
          const lat = pos?.latitude ?? data.lat ?? data.latitude;
          const lng = pos?.longitude ?? data.lng ?? data.longitude;
          if (typeof lat !== 'number' || typeof lng !== 'number') return;

          const hacieCuantoMin = Math.floor((ahora - updatedAtMs) / 60000);

          lista.push({
            id: data.id,
            cocheId: String(data.cocheId ?? data.id),
            empresa: String(data.empresa ?? 'UCOT'),
            codigoLinea: String(data.codigoLinea ?? '—'),
            conductorNombre: String(data.conductorNombre ?? 'Conductor'),
            lat,
            lng,
            velocidad: data.velocidad != null ? Number(data.velocidad) : null,
            estado: String(data.estado ?? 'en_servicio'),
            updatedAtMs,
            hacieCuantoMin,
          });
        });

        // Ordenar por empresa UCOT primero, luego por línea
        lista.sort((a, b) => {
          if (a.empresa === 'UCOT' && b.empresa !== 'UCOT') return -1;
          if (a.empresa !== 'UCOT' && b.empresa === 'UCOT') return 1;
          return a.codigoLinea.localeCompare(b.codigoLinea);
        });

        setVehiculos(lista);
        setLoading(false);
        setUltimaActualizacion(new Date());
        setError(null);
      } catch (err: any) {
        if (!active) return;
        console.error('[useFleetRealtime] Error REST:', err?.message ?? err);
        setError(err?.message ?? 'Error cargando flota');
        setLoading(false);
      }
    };

    fetchFleet();
    // TODO FASE 4.5: Socket.io firestore:viajes_activos
    const interval = setInterval(fetchFleet, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [habilitado, inactividadMin, soloEmpresa, refreshKey]);

  const totalUCOT = vehiculos.filter((v) => v.empresa === 'UCOT').length;
  const totalCompetencia = vehiculos.filter((v) => v.empresa !== 'UCOT').length;

  return {
    vehiculos,
    total: vehiculos.length,
    totalUCOT,
    totalCompetencia,
    loading,
    error,
    ultimaActualizacion,
    refrescar,
  };
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function toMillis(updatedAt: unknown): number {
  if (!updatedAt) return 0;
  if (typeof updatedAt === 'string') {
    const ms = new Date(updatedAt).getTime();
    return isNaN(ms) ? 0 : ms;
  }
  if (typeof updatedAt === 'number') return updatedAt;
  const ts = updatedAt as { toMillis?: () => number; seconds?: number };
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return 0;
}
