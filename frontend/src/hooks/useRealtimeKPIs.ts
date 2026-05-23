/**
 * Hook especializado para CEODashboard
 * Escucha actualizaciones de KPIs en tiempo real desde REST backend (polling).
 * TODO FASE 4.5: Socket.io firestore:system
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { apiClient } from '../clients/apiClient';

export interface KPIUpdate {
  timestamp: number;
  kpiType: 'occupancy' | 'punctuality' | 'revenue' | 'safety' | 'efficiency' | 'maintenance';
  value: number;
  lineId?: number;
  previousValue?: number;
  trend?: 'up' | 'down' | 'stable';
  metadata?: Record<string, any>;
}

interface KPIData {
  occupancy: number;
  punctuality: number;
  revenue: number;
  safety: number;
  efficiency: number;
  maintenance: number;
  lastUpdate: number;
  updateCount: number;
}

export function useRealtimeKPIs() {
  const [kpis, setKpis] = useState<KPIData>({
    occupancy: 0,
    punctuality: 0,
    revenue: 0,
    safety: 0,
    efficiency: 0,
    maintenance: 0,
    lastUpdate: Date.now(),
    updateCount: 0,
  });

  const [lastKPIUpdate, setLastKPIUpdate] = useState<KPIUpdate | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [latency, setLatency] = useState<number | null>(null);
  const updateTimestampRef = useRef<number>(Date.now());

  useEffect(() => {
    let active = true;

    const fetchKPIs = async () => {
      const t0 = Date.now();
      try {
        const data = await apiClient.get('/api/db/system/' + encodeURIComponent('current_kpis')) as any;
        if (!active) return;
        const receiveTime = Date.now();
        setLatency(receiveTime - t0);
        setConnectionStatus('connected');

        if (data) {
          setKpis((prev) => ({
            ...prev,
            occupancy: data.occupancy ?? prev.occupancy,
            punctuality: data.punctuality ?? prev.punctuality,
            revenue: data.revenue ?? prev.revenue,
            safety: data.safety ?? prev.safety,
            efficiency: data.efficiency ?? prev.efficiency,
            maintenance: data.maintenance ?? prev.maintenance,
            lastUpdate: receiveTime,
            updateCount: prev.updateCount + 1,
          }));

          setLastKPIUpdate({
            timestamp: receiveTime,
            kpiType: 'efficiency', // mock default for generic update
            value: data.efficiency ?? 0,
          });
          updateTimestampRef.current = receiveTime;
        }
      } catch (error) {
        if (!active) return;
        console.error('[CEODashboard] Error fetching KPIs from REST backend', error);
        setConnectionStatus('disconnected');
      }
    };

    fetchKPIs();
    // TODO FASE 4.5: Socket.io firestore:system
    const interval = setInterval(fetchKPIs, 10000);

    return () => {
      active = false;
      clearInterval(interval);
      setConnectionStatus('disconnected');
    };
  }, []);

  const getKPI = useCallback(
    (kpiType: keyof Omit<KPIData, 'lastUpdate' | 'updateCount'>) => {
      return kpis[kpiType];
    },
    [kpis],
  );

  return {
    kpis,
    lastKPIUpdate,
    connectionStatus,
    latency,
    getKPI,
    updateCount: kpis.updateCount,
    isConnected: connectionStatus === 'connected',
  };
}
