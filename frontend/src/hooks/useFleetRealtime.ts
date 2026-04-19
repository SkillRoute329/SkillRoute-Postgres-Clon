/**
 * useFleetRealtime — Hook GPS en tiempo real
 * ===========================================
 * Escucha viajes_activos en Firestore y retorna la flota activa actualizada.
 * Usado por FleetMonitorModule, CEODashboard y cualquier widget de mapa.
 *
 * DÓNDE COLOCAR: frontend/src/hooks/useFleetRealtime.ts
 *
 * USO:
 *   const { vehiculos, total, loading } = useFleetRealtime();
 *   const { vehiculos } = useFleetRealtime({ soloEmpresa: 'UCOT', inactividadMin: 10 });
 */

import { useState, useEffect, useCallback } from 'react';
import { collection, onSnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '../config/firebase';

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
  habilitado?: boolean; // Pausar el listener si false
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

    setLoading(true);
    setError(null);

    const colRef = collection(db, COL_VIAJES);
    const inactividadMs = inactividadMin * 60 * 1000;

    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const ahora = Date.now();
        const cutoff = ahora - inactividadMs;

        const lista: VehiculoEnMapa[] = [];

        snapshot.docs.forEach((docSnap: DocumentData) => {
          const data = docSnap.data() as Record<string, unknown>;

          // Filtrar inactivos
          const updatedAtMs = toMillis(data.updatedAt);
          if (updatedAtMs < cutoff) return;

          // Filtrar por empresa si se especificó
          if (soloEmpresa && data.empresa !== soloEmpresa) return;

          // Extraer posición
          const pos = data.posicion as { latitude?: number; longitude?: number } | undefined;
          if (!pos || typeof pos.latitude !== 'number' || typeof pos.longitude !== 'number') return;

          const hacieCuantoMin = Math.floor((ahora - updatedAtMs) / 60000);

          lista.push({
            id: docSnap.id,
            cocheId: String(data.cocheId ?? docSnap.id),
            empresa: String(data.empresa ?? 'UCOT'),
            codigoLinea: String(data.codigoLinea ?? '—'),
            conductorNombre: String(data.conductorNombre ?? 'Conductor'),
            lat: pos.latitude,
            lng: pos.longitude,
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
      },
      (err) => {
        console.error('[useFleetRealtime] Error Firestore:', err.message);
        setError(err.message);
        setLoading(false);
      },
    );

    return () => unsubscribe();
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
  const ts = updatedAt as { toMillis?: () => number; seconds?: number };
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return 0;
}
