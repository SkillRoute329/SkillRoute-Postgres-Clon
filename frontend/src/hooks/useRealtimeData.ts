/**
 * Hook para gestionar datos en tiempo real
 * Facilita suscribirse a eventos Socket.io específicos
 */

import { useEffect, useState, useCallback } from 'react';
import { getSocket } from '../services/socketService';
import type {
  LocationUpdate,
  ServiceStatusChange,
  InspectorAlert,
  FleetCheckCompleted,
  UserConnected,
} from '../services/socketService';

/**
 * Hook para escuchar actualizaciones de ubicación
 */
export function useLocationUpdates() {
  const [locations, setLocations] = useState<Map<string, LocationUpdate>>(new Map());
  const [lastUpdate, setLastUpdate] = useState<LocationUpdate | null>(null);

  useEffect(() => {
    const socket = getSocket();
    if (!socket?.connected) return;

    const handleLocationUpdate = (data: LocationUpdate) => {
      setLocations((prev) => {
        const newMap = new Map(prev);
        newMap.set(data.vehicleId, data);
        return newMap;
      });
      setLastUpdate(data);
    };

    socket.on('location-update', handleLocationUpdate);

    return () => {
      socket.off('location-update', handleLocationUpdate);
    };
  }, []);

  const getLocation = useCallback((vehicleId: string) => {
    return locations.get(vehicleId);
  }, [locations]);

  return {
    locations: Object.fromEntries(locations),
    lastUpdate,
    getLocation,
  };
}

/**
 * Hook para escuchar cambios de estado de servicios
 */
export function useServiceStatusUpdates() {
  const [services, setServices] = useState<Map<string, ServiceStatusChange>>(new Map());
  const [lastUpdate, setLastUpdate] = useState<ServiceStatusChange | null>(null);

  useEffect(() => {
    const socket = getSocket();
    if (!socket?.connected) return;

    const handleStatusChange = (data: ServiceStatusChange) => {
      setServices((prev) => {
        const newMap = new Map(prev);
        newMap.set(data.serviceId, data);
        return newMap;
      });
      setLastUpdate(data);
    };

    socket.on('service-status-changed', handleStatusChange);

    return () => {
      socket.off('service-status-changed', handleStatusChange);
    };
  }, []);

  const getStatus = useCallback((serviceId: string) => {
    return services.get(serviceId);
  }, [services]);

  return {
    services: Object.fromEntries(services),
    lastUpdate,
    getStatus,
  };
}

/**
 * Hook para escuchar alertas de inspectores
 */
export function useInspectorAlerts() {
  const [alerts, setAlerts] = useState<InspectorAlert[]>([]);
  const [criticalAlerts, setCriticalAlerts] = useState<InspectorAlert[]>([]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket?.connected) return;

    const handleAlert = (data: InspectorAlert) => {
      setAlerts((prev) => [data, ...prev.slice(0, 49)]); // Mantener últimas 50

      if (data.severity === 'critical') {
        setCriticalAlerts((prev) => [data, ...prev]);

        // Reproducir sonido si hay alerta crítica
        try {
          const audio = new Audio('data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==');
          audio.play().catch(() => {});
        } catch (e) {
          // Ignorar errores de audio
        }
      }
    };

    socket.on('inspector-alert', handleAlert);

    return () => {
      socket.off('inspector-alert', handleAlert);
    };
  }, []);

  const clearCriticalAlerts = useCallback(() => {
    setCriticalAlerts([]);
  }, []);

  return {
    alerts,
    criticalAlerts,
    hasCriticalAlerts: criticalAlerts.length > 0,
    clearCriticalAlerts,
  };
}

/**
 * Hook para escuchar inspecciones completadas
 */
export function useFleetChecks() {
  const [checks, setChecks] = useState<Map<string, FleetCheckCompleted>>(new Map());
  const [lastCheck, setLastCheck] = useState<FleetCheckCompleted | null>(null);

  useEffect(() => {
    const socket = getSocket();
    if (!socket?.connected) return;

    const handleCheckCompleted = (data: FleetCheckCompleted) => {
      setChecks((prev) => {
        const newMap = new Map(prev);
        newMap.set(data.checkId, data);
        return newMap;
      });
      setLastCheck(data);
    };

    socket.on('fleet-check-completed', handleCheckCompleted);

    return () => {
      socket.off('fleet-check-completed', handleCheckCompleted);
    };
  }, []);

  const getChecksByVehicle = useCallback(
    (vehicleId: string) => {
      return Array.from(checks.values()).filter((c) => c.vehicleId === vehicleId);
    },
    [checks],
  );

  return {
    checks: Object.fromEntries(checks),
    lastCheck,
    getChecksByVehicle,
  };
}

/**
 * Hook para monitorear usuarios conectados
 */
export function useConnectedUsers() {
  const [users, setUsers] = useState<UserConnected[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const socket = getSocket();
    if (!socket?.connected) return;

    const handleUserConnected = (data: UserConnected) => {
      setUsers((prev) => [...prev, data]);
      setCount((prev) => prev + 1);
    };

    const handleUserDisconnected = (data: any) => {
      setUsers((prev) => prev.filter((u) => u.userId !== data.userId));
    };

    socket.on('user-connected', handleUserConnected);
    socket.on('user-disconnected', handleUserDisconnected);

    return () => {
      socket.off('user-connected', handleUserConnected);
      socket.off('user-disconnected', handleUserDisconnected);
    };
  }, []);

  return {
    users,
    count,
  };
}

/**
 * Hook para latencia (ping/pong)
 */
export function useSocketLatency() {
  const [latency, setLatency] = useState<number | null>(null);
  const [isCheckingLatency, setIsCheckingLatency] = useState(false);

  const checkLatency = useCallback(() => {
    const socket = getSocket();
    if (!socket?.connected) return;

    setIsCheckingLatency(true);
    const startTime = Date.now();

    const handlePong = (data: { timestamp: number }) => {
      const currentLatency = Date.now() - startTime;
      setLatency(currentLatency);
      setIsCheckingLatency(false);
      socket.off('pong', handlePong);
    };

    socket.on('pong', handlePong);
    socket.emit('ping');

    // Timeout si no responde en 5 segundos
    setTimeout(() => {
      socket.off('pong', handlePong);
      setIsCheckingLatency(false);
    }, 5000);
  }, []);

  useEffect(() => {
    // Chequear latencia cada 30 segundos
    const interval = setInterval(checkLatency, 30000);

    return () => clearInterval(interval);
  }, [checkLatency]);

  return {
    latency,
    isCheckingLatency,
    checkLatency,
  };
}
