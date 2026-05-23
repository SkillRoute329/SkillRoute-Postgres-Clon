import type { PuntoLatLng } from '../types/lineasUcot';
import { distanciaMetros } from './geomath';

/**
 * Distancia en metros entre dos puntos (Haversine).
 * FASE 5.16: delega en utils/geomath (fuente única). API intacta.
 */
export function getDistance(p1: PuntoLatLng, p2: PuntoLatLng): number {
  return distanciaMetros(p1, p2);
}

/**
 * Detecta tramos de fricción (donde dos recorridos se solapan a menos de una distancia umbral).
 * Devuelve una lista de segmentos (conjunto de puntos) que representan el solapamiento.
 */
export function findFrictionZones(
  path1: PuntoLatLng[],
  path2: PuntoLatLng[],
  thresholdMeters: number = 50,
): PuntoLatLng[][] {
  const zones: PuntoLatLng[][] = [];
  let currentZone: PuntoLatLng[] = [];

  for (const pt1 of path1) {
    // Buscamos si hay algún punto en path2 cerca de pt1
    const isNear = path2.some((pt2) => getDistance(pt1, pt2) <= thresholdMeters);

    if (isNear) {
      currentZone.push(pt1);
    } else {
      if (currentZone.length > 2) {
        zones.push([...currentZone]);
      }
      currentZone = [];
    }
  }

  if (currentZone.length > 2) {
    zones.push(currentZone);
  }

  return zones;
}

/**
 * Divide una lista plana de puntos en sub-segmentos continuos, rompiendo
 * el trazo cada vez que la distancia entre dos puntos consecutivos supera maxJumpMeters.
 * Esto previene el efecto "zig-zag" en el mapa sin recortar partes de la ruta.
 */
export function splitIntoSegments(
  points: PuntoLatLng[],
  maxJumpMeters: number = 800,
): PuntoLatLng[][] {
  if (points.length === 0) return [];
  const segments: PuntoLatLng[][] = [];
  let currentSegment: PuntoLatLng[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    
    // Ignorar puntos inválidos (Null Island)
    if ((prev.lat === 0 && prev.lng === 0) || (curr.lat === 0 && curr.lng === 0)) {
      continue;
    }

    const dist = getDistance(prev, curr);
    if (dist > maxJumpMeters) {
      segments.push(currentSegment);
      currentSegment = [curr];
    } else {
      currentSegment.push(curr);
    }
  }
  segments.push(currentSegment);
  return segments.filter(seg => seg.length > 0);
}
