import type { PuntoLatLng } from '../types/lineasUcot';

/**
 * Calcula la distancia en metros entre dos puntos usando la fórmula de Haversine.
 */
export function getDistance(p1: PuntoLatLng, p2: PuntoLatLng): number {
  const R = 6371e3; // Radio de la tierra en metros
  const φ1 = (p1.lat * Math.PI) / 180;
  const φ2 = (p2.lat * Math.PI) / 180;
  const Δφ = ((p2.lat - p1.lat) * Math.PI) / 180;
  const Δλ = ((p2.lng - p1.lng) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
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
