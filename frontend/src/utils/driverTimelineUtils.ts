/**
 * Lógica pura para DriverTimeline: punto actual, próximo hito, desvío (atraso/adelanto).
 * Fuente: hora del sistema vs puntos de control del JSON; sin GPS simulado.
 */

export interface PuntoHito {
  nombre: string;
  hora: string;
}

export interface TimelineState {
  indiceActual: number;
  proximo: PuntoHito | null;
  minutosAtraso: number;
}

export function parseHoraTimeline(h: string): number {
  const [hh, mm] = h.trim().split(':').map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}

/**
 * Calcula el estado del timeline: punto actual, próximo hito y minutos de atraso
 * (hora del sistema vs hora del punto de control).
 */
export function computeTimelineState(
  puntos: PuntoHito[],
  horaActual: string,
  atrasoMinutos?: number,
): TimelineState {
  const now = parseHoraTimeline(horaActual);
  let indiceActual = -1;
  let proximo: PuntoHito | null = null;
  for (let i = 0; i < puntos.length; i++) {
    const t = parseHoraTimeline(puntos[i].hora);
    if (t <= now) indiceActual = i;
    if (t > now && !proximo) {
      proximo = puntos[i];
      break;
    }
  }
  const atraso =
    atrasoMinutos !== undefined && atrasoMinutos > 0
      ? atrasoMinutos
      : indiceActual >= 0 && puntos[indiceActual]
        ? Math.max(0, now - parseHoraTimeline(puntos[indiceActual].hora))
        : 0;
  return { indiceActual, proximo, minutosAtraso: atraso };
}
