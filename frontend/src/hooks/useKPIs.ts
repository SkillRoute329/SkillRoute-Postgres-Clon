/**
 * useKPIs — KPIs en tiempo real para el CEO Dashboard
 * =====================================================
 * Combina datos de Firestore y calcula los KPIs operativos clave.
 *
 * DÓNDE COLOCAR: frontend/src/hooks/useKPIs.ts
 *
 * USO:
 *   const { kpis, loading } = useKPIs();
 */

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';

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

  // Listener en tiempo real para viajes_activos (GPS)
  useEffect(() => {
    const unsubGps = onSnapshot(
      collection(db, 'viajes_activos'),
      async (gpsSnap) => {
        try {
          const ahora = Date.now();
          const cutoff = ahora - INACTIVIDAD_MS;

          const gpsActivos = gpsSnap.docs.filter((d) => {
            const ts = d.data().updatedAt as { toMillis?: () => number } | undefined;
            return ts && typeof ts.toMillis === 'function' && ts.toMillis() > cutoff;
          }).length;

          // Obtener resto de datos en paralelo
          const [vehiculosSnap, estadosSnap, alertasSnap, mantenimientoSnap] = await Promise.all([
            getDocs(collection(db, 'vehicles')),
            getDocs(query(collection(db, 'servicio_estado'), where('fecha', '==', today))),
            getDocs(query(collection(db, 'road_alerts'), where('estado', '==', 'activa'))),
            getDocs(query(collection(db, 'maintenance'), where('estado', '==', 'pendiente'))),
          ]);

          // Flota
          const total = vehiculosSnap.size;
          const activos = vehiculosSnap.docs.filter(
            (d) => !/mantenimiento|taller|paralizado|baja/i.test(String(d.data().status ?? '')),
          ).length;

          // Puntualidad
          const estados = estadosSnap.docs.map((d) => d.data());
          const conAtraso = estados.filter((e) => e.atrasoMinutos != null);
          const puntuales = conAtraso.filter((e) => (e.atrasoMinutos ?? 0) <= 3).length;
          const puntualidadPct =
            conAtraso.length > 0 ? Math.round((puntuales / conAtraso.length) * 100) : null;
          const atrasoTotal = conAtraso.reduce((s, e) => s + Number(e.atrasoMinutos ?? 0), 0);
          const atrasoPromedio =
            conAtraso.length > 0 ? Math.round(atrasoTotal / conAtraso.length) : 0;

          const now = new Date();
          setKpis({
            vehiculosTotal: total,
            vehiculosActivos: activos,
            vehiculosEnServicioGPS: gpsActivos,
            flotaActivaPct: total > 0 ? Math.round((activos / total) * 100) : 0,
            puntualidadPct,
            serviciosConAtraso: conAtraso.length - puntuales,
            atrasoPromedioMin: atrasoPromedio,
            serviciosHoy: estados.length,
            alertasActivas: alertasSnap.size,
            mantenimientosPendientes: mantenimientoSnap.size,
            boletosHoy: null,
            ingresosHoy: null,
            fechaCalculo: today,
            horaCalculo: now.toTimeString().slice(0, 5),
          });

          setLoading(false);
          setError(null);
        } catch (err) {
          console.error('[useKPIs] Error:', err);
          setError(err instanceof Error ? err.message : 'Error cargando KPIs');
          setLoading(false);
        }
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );

    return () => unsubGps();
  }, [today]);

  return { kpis, loading, error };
}
