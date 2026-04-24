/**
 * Stub de routesGeoData — los datos del GeoServer fueron removidos por tamaño.
 * Las funciones retornan vacío para que ucotLinesService continúe al siguiente fallback.
 */

export interface RouteVariant {
  descVariante: string;
  coordinates: Array<{ lat: number; lng: number }>;
  origen: string;
  destino: string;
}

export type RoutesGeoData = Record<string, Record<string, RouteVariant>>;

export const ALL_UCOT_ROUTES: RoutesGeoData = {};

export function getRealRouteCoordinates(_codigo: string): Array<{ lat: number; lng: number }> {
  return [];
}
