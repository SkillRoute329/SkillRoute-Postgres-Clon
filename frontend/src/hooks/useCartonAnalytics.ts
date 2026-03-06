import { useState, useEffect, useCallback } from 'react';
import { InspectionService } from '../services/api';
import type { Inspection } from '../types/inspections';

/** Umbral en minutos: promedio de atraso por encima = "mal tiempo". */
const DELAY_THRESHOLD_MINUTES = 5;

/** Mínimo de inspecciones en un punto para considerar "frecuente" la carga. */
const MIN_SAMPLES_FOR_FREQUENCY = 2;

/** Ratio mínimo de inspecciones con carga ALTO para considerar "alta demanda" (ej. 40%). */
const ALTO_RATIO_THRESHOLD = 0.4;

export type CartonAlert = {
  pointId: string;
  type: 'warning';
  message: string;
};

/**
 * Agrupa inspecciones por controlPointId y aplica la regla de negocio:
 * Si el promedio de timeDeltaMinutes (atraso) en un punto > 5 min
 * Y el passengerLoad es frecuentemente 'ALTO' → genera alerta de sugerencia.
 */
function computeAlerts(inspections: Inspection[]): CartonAlert[] {
  const byPoint = new Map<string, Inspection[]>();
  for (const i of inspections) {
    const key = i.controlPointId;
    if (!byPoint.has(key)) byPoint.set(key, []);
    byPoint.get(key)!.push(i);
  }

  const alerts: CartonAlert[] = [];

  for (const [pointId, list] of byPoint.entries()) {
    if (list.length === 0) continue;

    const avgDelta = list.reduce((sum, x) => sum + x.timeDeltaMinutes, 0) / list.length;
    const altoCount = list.filter((x) => x.passengerLoad === 'ALTO').length;
    const altoRatio = altoCount / list.length;

    const isBadTime = avgDelta > DELAY_THRESHOLD_MINUTES;
    const isFrequentAlto =
      list.length >= MIN_SAMPLES_FOR_FREQUENCY && altoRatio >= ALTO_RATIO_THRESHOLD;

    if (isBadTime && isFrequentAlto) {
      alerts.push({
        pointId,
        type: 'warning',
        message:
          'Mal tiempo crónico pero alta demanda. Sugerencia: Ampliar margen de minutos en esta etapa.',
      });
    }
  }

  return alerts;
}

export function useCartonAnalytics(cartonServiceId: string | null) {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [alerts, setAlerts] = useState<CartonAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!cartonServiceId) {
      setInspections([]);
      setAlerts([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await InspectionService.getByCartonServiceId(cartonServiceId);
      setInspections(data);
      setAlerts(computeAlerts(data));
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setInspections([]);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [cartonServiceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { inspections, alerts, loading, error, refresh };
}
