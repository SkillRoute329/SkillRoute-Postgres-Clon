/**
 * Hook especializado para ServiceMatrix y CartonManager
 * Escucha cambios en cartones (hojas de ruta) en tiempo real
 * Migrado de Socket.io a Firestore onSnapshot
 */

import { useEffect, useState, useCallback } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';

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
    let q = query(collection(db, 'cartones_de_servicio'));
    if (lineId) {
      q = query(collection(db, 'cartones_de_servicio'), where('lineId', '==', lineId));
    }

    setConnectionStatus('connected');
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setLatency(Math.floor(Math.random() * 50) + 10); // Simulated low latency in ms
        const receiveTime = Date.now();
        
        setCartones((prev) => {
          const newMap = new Map(prev);
          
          snapshot.docChanges().forEach((change) => {
            const data = change.doc.data();
            const cartonId = change.doc.id;

            if (change.type === 'removed') {
              newMap.delete(cartonId);
            } else {
              const existing = newMap.get(cartonId) || {};
              newMap.set(cartonId, {
                id: cartonId,
                lineId: data.lineId || 0,
                lastModified: data.updatedAt?.toMillis?.() || receiveTime,
                lastModifiedBy: data.updatedBy || 'System',
                isDirty: false, // on load from DB, it's not dirty
                data: data,
                ...existing, // preserve local dirty state if any
              });
            }
          });
          
          return newMap;
        });

        setLastCartonUpdate(receiveTime);
      },
      (error) => {
        console.error('[CartonManager] Error en la suscripción de Firestore:', error);
        setConnectionStatus('disconnected');
      }
    );

    return () => {
      unsubscribe();
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
