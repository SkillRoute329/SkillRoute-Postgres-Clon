/**
 * Cálculo de timeDelta (atraso/adelanto en minutos) para inspecciones.
 * Se ejecuta en frontend en el momento del "Marcar pasada".
 *
 * Convención:
 * - timeDeltaMinutes > 0  → atraso (el vehículo pasó después de la hora programada)
 * - timeDeltaMinutes < 0  → adelanto (pasó antes)
 * - timeDeltaMinutes === 0 → en hora
 *
 * Fórmula: timeDeltaMinutes = (hora real en minutos) - (hora programada en minutos)
 *          en la misma jornada (serviceDate), usando hora local del dispositivo.
 */

/**
 * Calcula la diferencia en minutos entre la hora real de pasada y la hora programada.
 *
 * @param scheduledTime - Hora teórica del cartón en formato "HH:mm" (ej. "08:15")
 * @param serviceDate - Fecha del servicio "YYYY-MM-DD" (ej. "2026-02-25")
 * @param actualPassedAt - Hora real de pasada: Date o timestamp en ms (ej. Date.now())
 * @returns Minutos de diferencia: positivo = atraso, negativo = adelanto (redondeado a entero)
 */
export function computeTimeDeltaMinutes(
  scheduledTime: string,
  serviceDate: string,
  actualPassedAt: Date | number,
): number {
  const actualMs = typeof actualPassedAt === 'number' ? actualPassedAt : actualPassedAt.getTime();

  // Construir fecha-hora programada en hora local (misma jornada que serviceDate)
  const [hours, minutes] = scheduledTime.trim().split(':').map(Number);
  const [y, m, d] = serviceDate.split('-').map(Number);
  const scheduledDate = new Date(y, m - 1, d, hours, minutes, 0, 0);
  if (isNaN(scheduledDate.getTime())) {
    return 0;
  }

  const scheduledMs = scheduledDate.getTime();
  const diffMs = actualMs - scheduledMs;
  let diffMinutes = diffMs / (60 * 1000);

  // Cruce de medianoche: turnos que empiezan un día y terminan al siguiente.
  // Si la diferencia es extrema (> 10 h en valor absoluto), inferir día equivocado y ajustar ±24 h.
  const MINUTES_PER_DAY = 1440;
  const ANOMALY_THRESHOLD = 600; // 10 horas

  if (diffMinutes < -ANOMALY_THRESHOLD) {
    // Ej.: programado 23:00 del día 25, pasada real 00:30 del día 26 → delta bruto ≈ -1380 min.
    // Ajuste: sumar 24 h → -1380 + 1440 = +60 min (1 h de atraso).
    diffMinutes += MINUTES_PER_DAY;
  } else if (diffMinutes > ANOMALY_THRESHOLD) {
    // Ej.: programado 01:00 del día 26, pasada real 23:45 del día 25 → delta bruto ≈ +1365 min.
    // Ajuste: restar 24 h → 1365 - 1440 = -75 min (adelanto).
    diffMinutes -= MINUTES_PER_DAY;
  }

  return Math.round(diffMinutes);
}
