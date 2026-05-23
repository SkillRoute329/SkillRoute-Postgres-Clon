/**
 * Hook para gestionar datos en tiempo real
 * Migrado de Firebase onSnapshot a polling REST (apiClient).
 * TODO FASE 4.5: Socket.io firestore:viajes_activos / alertas_regulacion / fleet_checks
 */

import { useEffect, useState, useCallback } from 'react';
import { apiClient } from '../clients/apiClient';
import type { LocationUpdate, ServiceStatusChange, InspectorAlert, FleetCheckCompleted, UserConnected } from '../services/socketService';
// Zod #73/#66 (2026-04-23): validación de shape para hooks real-time
import { safeParseOrLog, ViajeActivoSchema, AlertaRegulacionSchema } from '../schemas';

export function useLocationUpdates() {
  const [locations, setLocations] = useState<Map<string, LocationUpdate>>(new Map());
  const [lastUpdate, setLastUpdate] = useState<LocationUpdate | null>(null);

  useEffect(() => {
    let active = true;

    const fetch = async () => {
      try {
        const raw = await apiClient.get('/api/db/viajes_activos', { query: { limit: 200 } }) as any[];
        if (!active) return;
        setLocations(() => {
          const newMap = new Map<string, LocationUpdate>();
          (Array.isArray(raw) ? raw : []).forEach((data: any) => {
            const parsed = safeParseOrLog(ViajeActivoSchema, data, `viajes_activos/${data.id}`);
            const d = (parsed ?? data) as any;
            const vehicleId = d.cocheId || d.vehicleId || d.id;

            const pos = d.posicion as { latitude?: number; longitude?: number } | undefined;
            const lat = pos?.latitude ?? d.latitude ?? d.lat;
            const lng = pos?.longitude ?? d.longitude ?? d.lng;

            if (typeof lat === 'number' && typeof lng === 'number' && (lat !== 0 || lng !== 0)) {
              const tsMs = d.updatedAt ? new Date(d.updatedAt).getTime() : Date.now();
              const locUpdate: LocationUpdate = {
                vehicleId,
                latitude: lat,
                longitude: lng,
                speed: d.velocidad ?? d.speed ?? 0,
                heading: d.heading || 0,
                timestamp: isNaN(tsMs) ? Date.now() : tsMs,
                updatedBy: d.conductorNombre || d.driverId || 'System',
              };
              newMap.set(vehicleId, locUpdate);
              setLastUpdate(locUpdate);
            }
          });
          return newMap;
        });
      } catch {
        // No-op: keep previous data on error
      }
    };

    fetch();
    // TODO FASE 4.5: Socket.io firestore:viajes_activos
    const interval = setInterval(fetch, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
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
    let active = true;

    const fetch = async () => {
      try {
        const raw = await apiClient.get('/api/db/viajes_activos', { query: { limit: 200 } }) as any[];
        if (!active) return;
        setServices(() => {
          const newMap = new Map<string, ServiceStatusChange>();
          (Array.isArray(raw) ? raw : []).forEach((data: any) => {
            const serviceId = data.cartonId || data.cocheId || data.id;
            const tsMs = data.updatedAt ? new Date(data.updatedAt).getTime() : Date.now();
            const statusUpdate: ServiceStatusChange = {
              serviceId,
              status: data.estado || data.status || 'in_progress',
              timestamp: isNaN(tsMs) ? Date.now() : tsMs,
            };
            newMap.set(serviceId, statusUpdate);
            setLastUpdate(statusUpdate);
          });
          return newMap;
        });
      } catch {
        // No-op
      }
    };

    fetch();
    // TODO FASE 4.5: Socket.io firestore:viajes_activos
    const interval = setInterval(fetch, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const getStatus = useCallback((serviceId: string) => {
    return services.get(serviceId);
  }, [services]);

  return { services: Object.fromEntries(services), lastUpdate, getStatus };
}

export function useInspectorAlerts() {
  const [alerts, setAlerts] = useState<InspectorAlert[]>([]);
  const [criticalAlerts, setCriticalAlerts] = useState<InspectorAlert[]>([]);

  useEffect(() => {
    let active = true;

    const fetch = async () => {
      try {
        const raw = await apiClient.get('/api/db/alertas_regulacion', {
          query: { orderBy: 'timestamp:desc', limit: 50 },
        }) as any[];
        if (!active) return;
        const newAlerts: InspectorAlert[] = [];
        const newCriticals: InspectorAlert[] = [];

        (Array.isArray(raw) ? raw : []).forEach((data: any) => {
          const parsed = safeParseOrLog(AlertaRegulacionSchema, data, `alertas_regulacion/${data.id}`);
          if (!parsed) return;
          const p = parsed as any;
          const tsMs = p.timestamp ? new Date(p.timestamp).getTime() : Date.now();
          const alert: InspectorAlert = {
            vehicleId: String(p.vehicleId ?? p.coche_id ?? 'Unknown'),
            severity: (p.severity ?? 'info') as InspectorAlert['severity'],
            message: String(p.message ?? p.mensaje_chofer ?? ''),
            timestamp: isNaN(tsMs) ? Date.now() : tsMs,
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
      } catch {
        // No-op
      }
    };

    fetch();
    // TODO FASE 4.5: Socket.io firestore:alertas_regulacion
    const interval = setInterval(fetch, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
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
    let active = true;

    const fetch = async () => {
      try {
        const raw = await apiClient.get('/api/db/fleet_checks', { query: { limit: 500 } }) as any[];
        if (!active) return;
        setChecks(() => {
          const newMap = new Map<string, FleetCheckCompleted>();
          (Array.isArray(raw) ? raw : []).forEach((data: any) => {
            const tsMs = data.timestamp ? new Date(data.timestamp).getTime() : Date.now();
            const checkUpdate: FleetCheckCompleted = {
              checkId: data.id,
              vehicleId: data.vehicleId || 'Unknown',
              status: data.status || 'OK',
              timestamp: isNaN(tsMs) ? Date.now() : tsMs,
            };
            newMap.set(checkUpdate.checkId, checkUpdate);
            setLastCheck(checkUpdate);
          });
          return newMap;
        });
      } catch {
        // No-op
      }
    };

    fetch();
    // TODO FASE 4.5: Socket.io firestore:fleet_checks
    const interval = setInterval(fetch, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
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

  const checkLatency = useCallback(async () => {
    setIsCheckingLatency(true);
    const t0 = Date.now();
    try {
      await apiClient.get('/api/db/system/' + encodeURIComponent('current_kpis'));
      setLatency(Date.now() - t0);
    } catch {
      setLatency(null);
    } finally {
      setIsCheckingLatency(false);
    }
  }, []);

  useEffect(() => {
    checkLatency();
    const interval = setInterval(checkLatency, 30000);
    return () => clearInterval(interval);
  }, [checkLatency]);

  return { latency, isCheckingLatency, checkLatency };
}
