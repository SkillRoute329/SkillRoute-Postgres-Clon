/**
 * geomath.ts — distancia geográfica canónica (Haversine).
 *
 * FASE 5.16 (2026-05-16): consolidación. La fórmula de Haversine estaba
 * reimplementada ~10 veces (navigationDataService, ucotShapesInjector,
 * crossOpShapesInjector, variantIntelligenceService, headwayInsightsService,
 * tacticalGeom, CompetitorIntelligence, LiveDataContext inline, etc.) con
 * firmas distintas. Son todas matemáticamente equivalentes — no causaban
 * bugs, pero sí dispersión. Esta es la implementación única.
 *
 * Hay `geomath.test.ts` que ya valida `haversineMetros(lat1,lng1,lat2,lng2)`.
 *
 * Acepta tanto args sueltos como objetos `{lat, lon|lng}` para cubrir todos
 * los call sites sin fricción.
 */

const R_METROS = 6_371_000;

export interface LatLngLike {
  lat: number;
  lon?: number;
  lng?: number;
}

function lonOf(p: LatLngLike): number {
  return p.lon ?? p.lng ?? 0;
}

/** Distancia en METROS entre dos puntos (lat/lng en grados). */
export function haversineMetros(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R_METROS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Distancia en KILÓMETROS. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  return haversineMetros(lat1, lng1, lat2, lng2) / 1000;
}

/** Distancia en metros entre dos objetos `{lat, lon|lng}`. */
export function distanciaMetros(p1: LatLngLike, p2: LatLngLike): number {
  return haversineMetros(p1.lat, lonOf(p1), p2.lat, lonOf(p2));
}

/** Distancia en km entre dos objetos `{lat, lon|lng}`. */
export function distanciaKm(p1: LatLngLike, p2: LatLngLike): number {
  return distanciaMetros(p1, p2) / 1000;
}
