/**
 * Servicio de correcciones manuales para líneas UCOT.
 * - Metadatos (nombre, origen, destino): corrige etiquetas invertidas del GeoServer.
 * - Recorridos editados: guarda correcciones de trazado hechas por el usuario (drag).
 *
 * Formato metadatos : { [variantCode]: { nombre?, origen?, destino? } }
 * Formato recorridos: { [variantCode]: [{ lat, lng }, ...] }
 */

const STORAGE_KEY = 'ucot_line_overrides';
const ROUTE_STORAGE_KEY = 'ucot_route_overrides';

export interface LineOverride {
  nombre?: string;
  origen?: string;
  destino?: string;
}

type OverridesMap = Record<string, LineOverride>;

function readAll(): OverridesMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as OverridesMap;
  } catch {
    return {};
  }
}

function writeAll(map: OverridesMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage lleno o no disponible
  }
}

/** Obtiene la corrección manual para un código de variante. */
export function getOverride(variantCode: string): LineOverride | null {
  const map = readAll();
  return map[variantCode] ?? null;
}

/** Guarda una corrección manual. Solo los campos no‐vacíos se almacenan. */
export function setOverride(variantCode: string, override: LineOverride): void {
  const map = readAll();
  const cleaned: LineOverride = {};
  if (override.nombre?.trim()) cleaned.nombre = override.nombre.trim();
  if (override.origen?.trim()) cleaned.origen = override.origen.trim();
  if (override.destino?.trim()) cleaned.destino = override.destino.trim();

  if (Object.keys(cleaned).length === 0) {
    delete map[variantCode];
  } else {
    map[variantCode] = cleaned;
  }
  writeAll(map);
}

/** Elimina la corrección manual de una variante. */
export function clearOverride(variantCode: string): void {
  const map = readAll();
  delete map[variantCode];
  writeAll(map);
}

/** Obtiene todas las correcciones (para exportar/debug). */
export function getAllOverrides(): OverridesMap {
  return readAll();
}

/**
 * Aplica correcciones a un objeto con campos origen, destino, nombre.
 * Devuelve una copia con los campos corregidos.
 */
export function applyOverride<T extends { origen?: string; destino?: string; nombre?: string }>(
  variantCode: string,
  item: T,
): T {
  const ov = getOverride(variantCode);
  if (!ov) return item;
  return {
    ...item,
    ...(ov.nombre ? { nombre: ov.nombre } : {}),
    ...(ov.origen ? { origen: ov.origen } : {}),
    ...(ov.destino ? { destino: ov.destino } : {}),
  };
}

/** Intercambia origen y destino de una variante (atajo rápido). */
export function swapOrigenDestino(
  variantCode: string,
  currentOrigen: string,
  currentDestino: string,
): void {
  setOverride(variantCode, {
    origen: currentDestino,
    destino: currentOrigen,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RECORRIDOS EDITADOS POR EL USUARIO (drag sobre el mapa)
// ─────────────────────────────────────────────────────────────────────────────

export interface LatLng {
  lat: number;
  lng: number;
}

type RouteOverridesMap = Record<string, LatLng[]>;

function readAllRoutes(): RouteOverridesMap {
  try {
    const raw = localStorage.getItem(ROUTE_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as RouteOverridesMap;
  } catch {
    return {};
  }
}

function writeAllRoutes(map: RouteOverridesMap): void {
  try {
    localStorage.setItem(ROUTE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage lleno o no disponible
  }
}

/** Obtiene el recorrido editado para una variante, o null si no hay. */
export function getRouteOverride(variantCode: string): LatLng[] | null {
  const map = readAllRoutes();
  return map[variantCode] ?? null;
}

/** Guarda el recorrido editado para una variante. */
export function setRouteOverride(variantCode: string, points: LatLng[]): void {
  const map = readAllRoutes();
  map[variantCode] = points;
  writeAllRoutes(map);
}

/** Elimina el recorrido editado (vuelve al original del GeoServer). */
export function clearRouteOverride(variantCode: string): void {
  const map = readAllRoutes();
  delete map[variantCode];
  writeAllRoutes(map);
}

/** Devuelve true si existe un recorrido editado para esa variante. */
export function hasRouteOverride(variantCode: string): boolean {
  return getRouteOverride(variantCode) !== null;
}
