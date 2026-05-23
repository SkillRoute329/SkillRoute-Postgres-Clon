/**
 * Hook especializado para ServiceMatrix y CartonManager
 * Escucha cambios en cartones (hojas de ruta) mediante polling REST.
 * TODO FASE 4.5: Socket.io firestore:cartones_de_servicio
 */

import { useEffect, useState, useCallback } from 'react';
import { apiClient } from '../clients/apiClient';

export interface CartonDraft {
  id: string;
  lineId: number;
  lastModified: number;
  lastModifiedBy: string;
  isDirty: boolean;
  changes?: Record<string, any>;
  data?: Record<string, any>;
}

export function useRealtimeCartones(lineId?: number) {
  const [cartones, setCartones] = useState<Map<string, CartonDraft>>(new Map());
  const [lastCartonUpdate, setLastCartonUpdate] = useState<number | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [conflictingEdits, setConflictingEdits] = useState<any[]>([]); // simplified conflict tracking
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    const fetch = async () => {
      const t0 = Date.now();
      try {
        const queryParams: Record<string, string | number> = { limit: 500 };
        if (lineId) {
          queryParams.where = `lineId:${lineId}`;
        }
        const raw = await apiClient.get('/api/db/cartones_de_servicio', { query: queryParams }) as any[];
        if (!active) return;
        const receiveTime = Date.now();
        setLatency(receiveTime - t0);
        setConnectionStatus('connected');

        setCartones((prev) => {
          const newMap = new Map(prev);
          (Array.isArray(raw) ? raw : []).forEach((data: any) => {
            const cartonId = data.id;
            const lastModMs = data.updatedAt ? new Date(data.updatedAt).getTime() : receiveTime;
            const existing = newMap.get(cartonId) || {};
            newMap.set(cartonId, {
              id: cartonId,
              lineId: data.lineId || 0,
              lastModified: isNaN(lastModMs) ? receiveTime : lastModMs,
              lastModifiedBy: data.updatedBy || 'System',
              isDirty: false, // on load from DB, it's not dirty
              data: data,
              ...existing, // preserve local dirty state if any
            });
          });
          return newMap;
        });

        setLastCartonUpdate(receiveTime);
      } catch (error) {
        if (!active) return;
        console.error('[CartonManager] Error en la solicitud REST:', error);
        setConnectionStatus('disconnected');
      }
    };

    fetch();
    // TODO FASE 4.5: Socket.io firestore:cartones_de_servicio
    const interval = setInterval(fetch, 10000);

    return () => {
      active = false;
      clearInterval(interval);
      setConnectionStatus('disconnected');
    };
  }, [lineId]);

  const getCarton = useCallback(
    (cartonId: string) => {
      return cartones.get(cartonId);
    },
    [cartones],
  );

  const clearConflict = useCallback(() => {
    setConflictingEdits([]);
  }, []);

  return {
    cartones: Object.fromEntries(cartones),
    lastCartonUpdate,
    connectionStatus,
    latency,
    conflictingEdits,
    hasConflicts: conflictingEdits.length > 0,
    getCarton,
    clearConflict,
    isConnected: connectionStatus === 'connected',
  };
}
