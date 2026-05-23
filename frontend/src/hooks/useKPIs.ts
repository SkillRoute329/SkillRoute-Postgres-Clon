/**
 * useKPIs — KPIs en tiempo real para el CEO Dashboard
 * =====================================================
 * Combina datos de REST backend y calcula los KPIs operativos clave.
 * TODO FASE 4.5: Socket.io firestore:viajes_activos
 *
 * DÓNDE COLOCAR: frontend/src/hooks/useKPIs.ts
 *
 * USO:
 *   const { kpis, loading } = useKPIs();
 */

import { useState, useEffect } from 'react';
import { apiClient } from '../clients/apiClient';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface KPIs {
  // Flota
  vehiculosTotal: number;
  vehiculosActivos: number;
  vehiculosEnServicioGPS: number;
  flotaActivaPct: number;

  // Puntualidad
  puntualidadPct: number | null;
  serviciosConAtraso: number;
  atrasoPromedioMin: number;

  // Operativo del día
  serviciosHoy: number;
  alertasActivas: number;
  mantenimientosPendientes: number;

  // Financiero (si hay datos)
  boletosHoy: number | null;
  ingresosHoy: number | null; // En pesos UY

  // Metadata
  fechaCalculo: string;
  horaCalculo: string;
}

const KPI_INICIAL: KPIs = {
  vehiculosTotal: 0,
  vehiculosActivos: 0,
  vehiculosEnServicioGPS: 0,
  flotaActivaPct: 0,
  puntualidadPct: null,
  serviciosConAtraso: 0,
  atrasoPromedioMin: 0,
  serviciosHoy: 0,
  alertasActivas: 0,
  mantenimientosPendientes: 0,
  boletosHoy: null,
  ingresosHoy: null,
  fechaCalculo: '',
  horaCalculo: '',
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useKPIs(autoRefreshMs = 60_000) {
  const [kpis, setKpis] = useState<KPIs>(KPI_INICIAL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const INACTIVIDAD_MS = 15 * 60 * 1000;

  useEffect(() => {
    let active = true;

    const calcularKPIs = async () => {
      try {
        const ahora = Date.now();
        const cutoff = ahora - INACTIVIDAD_MS;

        const [gpsRaw, vehiculosRaw, estadosRaw, alertasRaw, mantenimientoRaw] = await Promise.all([
          apiClient.get('/api/db/viajes_activos', { query: { limit: 2000 } }) as Promise<any[]>,
          apiClient.get('/api/db/vehicles', { query: { limit: 5000 } }) as Promise<any[]>,
          apiClient.get('/api/db/servicio_estado', { query: { where: `fecha:${today}`, limit: 2000 } }) as Promise<any[]>,
          apiClient.get('/api/db/road_alerts', { query: { where: 'estado:activa', limit: 500 } }) as Promise<any[]>,
          apiClient.get('/api/db/maintenance', { query: { where: 'estado:pendiente', limit: 500 } }) as Promise<any[]>,
        ]);

        if (!active) return;

        const gpsArr = Array.isArray(gpsRaw) ? gpsRaw : [];
        const gpsActivos = gpsArr.filter((d: any) => {
          const tsMs = d.updatedAt ? new Date(d.updatedAt).getTime() : 0;
          return tsMs > cutoff;
        }).length;

        // Flota
        const vehiculosArr = Array.isArray(vehiculosRaw) ? vehiculosRaw : [];
        const total = vehiculosArr.length;
        const activos = vehiculosArr.filter(
          (d: any) => !/mantenimiento|taller|paralizado|baja/i.test(String(d.status ?? '')),
        ).length;

        // Puntualidad
        const estadosArr = Array.isArray(estadosRaw) ? estadosRaw : [];
        const conAtraso = estadosArr.filter((e: any) => e.atrasoMinutos != null);
        const puntuales = conAtraso.filter((e: any) => (e.atrasoMinutos ?? 0) <= 3).length;
        const puntualidadPct =
          conAtraso.length > 0 ? Math.round((puntuales / conAtraso.length) * 100) : null;
        const atrasoTotal = conAtraso.reduce((s: number, e: any) => s + Number(e.atrasoMinutos ?? 0), 0);
        const atrasoPromedio =
          conAtraso.length > 0 ? Math.round(atrasoTotal / conAtraso.length) : 0;

        const alertasArr = Array.isArray(alertasRaw) ? alertasRaw : [];
        const mantenimientoArr = Array.isArray(mantenimientoRaw) ? mantenimientoRaw : [];

        const now = new Date();
        setKpis({
          vehiculosTotal: total,
          vehiculosActivos: activos,
          vehiculosEnServicioGPS: gpsActivos,
          flotaActivaPct: total > 0 ? Math.round((activos / total) * 100) : 0,
          puntualidadPct,
          serviciosConAtraso: conAtraso.length - puntuales,
          atrasoPromedioMin: atrasoPromedio,
          serviciosHoy: estadosArr.length,
          alertasActivas: alertasArr.length,
          mantenimientosPendientes: mantenimientoArr.length,
          boletosHoy: null,
          ingresosHoy: null,
          fechaCalculo: today,
          horaCalculo: now.toTimeString().slice(0, 5),
        });

        setLoading(false);
        setError(null);
      } catch (err) {
        if (!active) return;
        console.error('[useKPIs] Error:', err);
        setError(err instanceof Error ? err.message : 'Error cargando KPIs');
        setLoading(false);
      }
    };

    calcularKPIs();
    // TODO FASE 4.5: Socket.io firestore:viajes_activos
    const interval = setInterval(calcularKPIs, autoRefreshMs);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [today, autoRefreshMs]);

  return { kpis, loading, error };
}
