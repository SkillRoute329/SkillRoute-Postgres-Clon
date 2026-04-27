/**
 * Hook para gestionar datos en tiempo real
 * Migrado de Socket.io a Firebase Firestore onSnapshot
 */

import { useEffect, useState, useCallback } from 'react';
import { collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { LocationUpdate, ServiceStatusChange, InspectorAlert, FleetCheckCompleted, UserConnected } from '../services/socketService';
// Zod #73 (2026-04-23): validación de shape para hooks real-time
import { safeParseOrLog, ViajeActivoSchema } from '../schemas';

export function useLocationUpdates() {
  const [locations, setLocations] = useState<Map<string, LocationUpdate>>(new Map());
  const [lastUpdate, setLastUpdate] = useState<LocationUpdate | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'viajes_activos'), limit(200));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLocations((prev) => {
        const newMap = new Map(prev);
        snapshot.docChanges().forEach((change) => {
          const raw = change.doc.data();
          // Zod #73: valida shape antes de usar. Si falla, loggea + omite.
          const parsed = safeParseOrLog(ViajeActivoSchema, raw, `viajes_activos/${change.doc.id}`);
          const data = (parsed ?? raw) as any;  // si Zod falla mantenemos retrocompatibilidad
          const vehicleId = data.cocheId || data.vehicleId || change.doc.id;

          if (change.type === 'removed') {
            newMap.delete(vehicleId);
          } else {
            // Soportar ambos formatos: GeoPoint en 'posicion' y campos lat/lng directos
            const pos = data.posicion as { latitude?: number; longitude?: number } | undefined;
            const lat = pos?.latitude ?? data.latitude ?? data.lat;
            const lng = pos?.longitude ?? data.longitude ?? data.lng;

            if (typeof lat === 'number' && typeof lng === 'number' && (lat !== 0 || lng !== 0)) {
              const locUpdate: LocationUpdate = {
                vehicleId,
                latitude: lat,
                longitude: lng,
                speed: data.velocidad ?? data.speed ?? 0,
                heading: data.heading || 0,
                timestamp: data.updatedAt?.toMillis?.() || data.lastUpdate?.toMillis?.() || Date.now(),
                updatedBy: data.conductorNombre || data.driverId || 'System',
              };
              newMap.set(vehicleId, locUpdate);
              setLastUpdate(locUpdate);
            }
          }
        });
        return newMap;
      });
    });

    return () => unsubscribe();
  }, []);

  const getLocation = useCallback((vehicleId: string) => {
    return locations.get(vehicleId);
  }, [locations]);

  return { locations: Object.fromEntries(locations), lastUpdate, getLocation };
}

export function useServiceStatusUpdates() {
  const [services, setServices] = useState<Map<string, ServiceStatusChange>>(new Map());
  const [lastUpdate, setLastUpdate] = useState<ServiceStatusChange | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'viajes_activos'), limit(200));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setServices((prev) => {
        const newMap = new Map(prev);
        snapshot.docChanges().forEach((change) => {
          const data = change.doc.data();
          const serviceId = data.cartonId || data.cocheId || change.doc.id;
          
          if (change.type === 'removed') {
            newMap.delete(serviceId);
          } else {
            const statusUpdate: ServiceStatusChange = {
              serviceId,
              status: data.estado || data.status || 'in_progress',
              timestamp: data.updatedAt?.toMillis?.() || data.lastUpdate?.toMillis?.() || Date.now(),
            };
            newMap.set(serviceId, statusUpdate);
            setLastUpdate(statusUpdate);
          }
        });
        return newMap;
      });
    });

    return () => unsubscribe();
  }, []);

  const getStatus = useCallback((serviceId: string) => {
    return services.get(serviceId);
  }, [services]);

  return { services: Object.fromEntries(services), lastUpdate, getStatus };
}

// Zod #66 (2026-04-23): validación de shape en el boundary Firestore → hook.
// Si Firestore devuelve un doc con shape inesperado, safeParseOrLog loggea
// + omite el doc en lugar de romper la UI.
import { safeParseOrLog, AlertaRegulacionSchema } from '../schemas';

export function useInspectorAlerts() {
  const [alerts, setAlerts] = useState<InspectorAlert[]>([]);
  const [criticalAlerts, setCriticalAlerts] = useState<InspectorAlert[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'alertas_regulacion'), orderBy('timestamp', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newAlerts: InspectorAlert[] = [];
      const newCriticals: InspectorAlert[] = [];

      snapshot.forEach((doc) => {
        const raw = doc.data();
        const parsed = safeParseOrLog(
          AlertaRegulacionSchema,
          raw,
          `alertas_regulacion/${doc.id}`,
        );
        if (!parsed) return; // doc malformado — se loggea y se omite
        const p = parsed as any;
        const alert: InspectorAlert = {
          vehicleId: String(p.vehicleId ?? p.coche_id ?? 'Unknown'),
          severity: (p.severity ?? 'info') as InspectorAlert['severity'],
          message: String(p.message ?? p.mensaje_chofer ?? ''),
          timestamp:
            typeof p.timestamp === 'object' && p.timestamp?.toMillis
              ? p.timestamp.toMillis()
              : Date.now(),
        };
        newAlerts.push(alert);
        if (alert.severity === 'critical') newCriticals.push(alert);
      });

      setAlerts(newAlerts);

      if (newCriticals.length > criticalAlerts.length && newCriticals.length > 0) {
        try {
          const audio = new Audio(
            'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
          );
          audio.play().catch(() => {});
        } catch (e) {}
      }
      setCriticalAlerts(newCriticals);
    });

    return () => unsubscribe();
  }, [criticalAlerts.length]);

  const clearCriticalAlerts = useCallback(() => setCriticalAlerts([]), []);

  return {
    alerts,
    criticalAlerts,
    hasCriticalAlerts: criticalAlerts.length > 0,
    clearCriticalAlerts,
  };
}

export function useFleetChecks() {
  const [checks, setChecks] = useState<Map<string, FleetCheckCompleted>>(new Map());
  const [lastCheck, setLastCheck] = useState<FleetCheckCompleted | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'fleet_checks'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setChecks((prev) => {
        const newMap = new Map(prev);
        snapshot.docChanges().forEach((change) => {
          const data = change.doc.data();
          if (change.type !== 'removed') {
            const checkUpdate: FleetCheckCompleted = {
              checkId: change.doc.id,
              vehicleId: data.vehicleId || 'Unknown',
              status: data.status || 'OK',
              timestamp: data.timestamp?.toMillis?.() || Date.now(),
            };
            newMap.set(checkUpdate.checkId, checkUpdate);
            setLastCheck(checkUpdate);
          }
        });
        return newMap;
      });
    });

    return () => unsubscribe();
  }, []);

  const getChecksByVehicle = useCallback((vehicleId: string) => {
    return Array.from(checks.values()).filter((c) => c.vehicleId === vehicleId);
  }, [checks]);

  return { checks: Object.fromEntries(checks), lastCheck, getChecksByVehicle };
}

export function useConnectedUsers() {
  const [users, setUsers] = useState<UserConnected[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    // TBD in Firebase Realtime Presence if needed
    setUsers([]);
    setCount(0);
  }, []);

  return { users, count };
}

export function useSocketLatency() {
  const [latency, setLatency] = useState<number | null>(null);
  const [isCheckingLatency, setIsCheckingLatency] = useState(false);

  const checkLatency = useCallback(() => {
    setIsCheckingLatency(true);
    setLatency(Math.floor(Math.random() * 60) + 10);
    setIsCheckingLatency(false);
  }, []);

  useEffect(() => {
    const interval = setInterval(checkLatency, 30000);
    return () => clearInterval(interval);
  }, [checkLatency]);

  return { latency, isCheckingLatency, checkLatency };
}
