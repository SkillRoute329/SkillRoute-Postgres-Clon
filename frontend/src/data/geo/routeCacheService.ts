/**
 * routeCacheService.ts — Servicio de caché de recorridos.
 *
 * Estrategia de carga (en orden de prioridad):
 *  0. Archivo JSON estático (routeCache.json) — datos pre-cargados, siempre disponible
 *  1. Caché en memoria (más rápido, persiste durante la sesión)
 *  2. Firestore colección `lineas_ucot` (datos sincronizados previamente)
 *  3. API STM en vivo (fallback, rara vez necesario)
 *
 * Los recorridos de ómnibus NO cambian — se cachean agresivamente.
 */
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';

// ─── Import static route data ───────────────────────────────────────────────
import staticRouteData from './routeCache.json';

// ─── Types ──────────────────────────────────────────────────────────────────
export interface CachedRoute {
  code: string; // e.g. '300a', '306b'
  lineId: string; // e.g. '300', '306'
  variantIdx: number; // 0 = IDA, 1 = VUELTA
  recorrido: Array<{ lat: number; lng: number }>;
  paradas: Array<{
    nombre: string;
    lat: number;
    lng: number;
    orden: number;
  }>;
  origen?: string;
  destino?: string;
  source: 'STATIC_FILE' | 'FIRESTORE' | 'API_STM' | 'MEMORY_CACHE';
  cachedAt: string;
}

// ─── In-Memory Cache ────────────────────────────────────────────────────────
const ROUTE_CACHE = new Map<string, CachedRoute>();
let staticLoaded = false;
let firestoreBulkLoaded = false;

const PROXY_BASE = 'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/montevideoProxy';

function getProxyUrl(endpoint: string): string {
  return `${PROXY_BASE}?endpoint=${encodeURIComponent(endpoint)}`;
}

// ─── Helper: extract lat/lng ────────────────────────────────────────────────
function extractLatLng(p: Record<string, unknown>): { lat: number; lng: number } {
  const geom = p.geometry as { coordinates?: [number, number] } | undefined;
  if (geom && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
    const [lng, lat] = geom.coordinates;
    return { lat: Number(lat), lng: Number(lng) };
  }
  const lat = Number(p.lat ?? p.latitude ?? p.latitud ?? 0);
  const lng = Number(p.lng ?? p.longitude ?? p.longitud ?? p.lon ?? 0);
  return { lat, lng };
}

// ─── Parse recorrido from API response ──────────────────────────────────────
function parseRecorrido(data: unknown): Array<{ lat: number; lng: number }> {
  if (!data) return [];
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    if (Array.isArray(first) && first.length >= 2) {
      return (data as [number, number][]).map(([lng, lat]) => ({
        lat: Number(lat),
        lng: Number(lng),
      }));
    }
    return (data as Record<string, unknown>[])
      .map((pt) => extractLatLng(pt))
      .filter((p) => p.lat !== 0 && p.lng !== 0);
  }
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    const coords =
      (obj.coordinates as unknown[]) ??
      (obj.geometry as { coordinates?: unknown[] })?.coordinates ??
      (obj.recorrido as unknown[]) ??
      (obj.data as unknown[]);
    if (Array.isArray(coords) && coords.length > 0) {
      const first = coords[0];
      if (Array.isArray(first) && first.length >= 2) {
        return (coords as [number, number][]).map(([lng, lat]) => ({
          lat: Number(lat),
          lng: Number(lng),
        }));
      }
    }
  }
  return [];
}

// ─── 0. Load routes from static JSON file (HIGHEST PRIORITY) ───────────────
export function loadStaticRoutes(): number {
  if (staticLoaded) return ROUTE_CACHE.size;

  let loaded = 0;
  const data = staticRouteData as Record<string, unknown>;

  for (const [code, entry] of Object.entries(data)) {
    if (code.startsWith('_')) continue; // Skip metadata
    const routeData = entry as Record<string, unknown>;
    const recorrido = (routeData.recorrido || []) as Array<{ lat: number; lng: number }>;

    if (recorrido.length > 0) {
      const validRecorrido = recorrido.filter(
        (p) => p.lat !== 0 && p.lng !== 0 && !isNaN(p.lat) && !isNaN(p.lng),
      );

      if (validRecorrido.length > 0) {
        ROUTE_CACHE.set(code, {
          code,
          lineId: (routeData.lineId as string) || code.replace(/[ab]$/i, ''),
          variantIdx: code.endsWith('b') ? 1 : 0,
          recorrido: validRecorrido,
          paradas: [],
          origen: routeData.origen as string,
          destino: routeData.destino as string,
          source: 'STATIC_FILE',
          cachedAt: new Date().toISOString(),
        });
        loaded++;
      }
    }
  }

  staticLoaded = true;
  console.log(`[RouteCache] Loaded ${loaded} routes from static file (routeCache.json)`);
  return loaded;
}

// ─── 1. Load ALL routes from Firestore (bulk) ──────────────────────────────
export async function loadAllRoutesFromFirestore(): Promise<number> {
  // Always load static routes first
  loadStaticRoutes();

  if (firestoreBulkLoaded) return ROUTE_CACHE.size;

  try {
    const snap = await getDocs(collection(db, 'lineas_ucot'));
    let loaded = 0;

    snap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const code = docSnap.id; // e.g. '300a', '306b'
      const recorrido = (data.recorrido || []) as Array<{ lat: number; lng: number }>;
      const paradas = (data.paradas || []) as Array<{
        nombre: string;
        lat: number;
        lng: number;
        orden: number;
      }>;

      // Only override if Firestore has MORE data than static
      const existing = ROUTE_CACHE.get(code);
      const validRecorrido = recorrido.filter(
        (p) => p.lat !== 0 && p.lng !== 0 && !isNaN(p.lat) && !isNaN(p.lng),
      );
      const validParadas = paradas.filter((p) => p.lat !== 0 && p.lng !== 0);

      // Use Firestore data ONLY if it has more recorrido points than static
      const firestoreRecorrido =
        validRecorrido.length > 0
          ? validRecorrido
          : validParadas.map((p) => ({ lat: p.lat, lng: p.lng }));

      if (firestoreRecorrido.length > 0) {
        // Only replace if Firestore has MORE points than what we already have
        if (!existing || firestoreRecorrido.length > existing.recorrido.length) {
          ROUTE_CACHE.set(code, {
            code,
            lineId: code.replace(/[ab]$/i, ''),
            variantIdx: code.endsWith('b') ? 1 : 0,
            recorrido: firestoreRecorrido,
            paradas: validParadas,
            origen: data.origen as string,
            destino: data.destino as string,
            source: 'FIRESTORE',
            cachedAt: new Date().toISOString(),
          });
          loaded++;
        }
      }
    });

    firestoreBulkLoaded = true;
    console.log(
      `[RouteCache] Loaded ${loaded} routes from Firestore (${snap.size} docs, cache total: ${ROUTE_CACHE.size})`,
    );
    return ROUTE_CACHE.size;
  } catch (err) {
    console.warn('[RouteCache] Failed to bulk-load from Firestore:', err);
    return ROUTE_CACHE.size;
  }
}

// ─── 2. Get single route from cache ─────────────────────────────────────────
export async function getRoute(lineCode: string): Promise<CachedRoute | null> {
  // Ensure static data is loaded
  loadStaticRoutes();

  const cleanId = lineCode.replace(/[ab]$/i, '');

  // Try both variants and pick the best one
  for (const suffix of ['a', 'b', '']) {
    const key = suffix ? `${cleanId}${suffix}` : cleanId;

    if (ROUTE_CACHE.has(key)) {
      const cached = ROUTE_CACHE.get(key)!;
      return {
        ...cached,
        source: cached.source === 'STATIC_FILE' ? 'STATIC_FILE' : 'MEMORY_CACHE',
      };
    }
  }

  // Try loading from Firestore individually
  for (const suffix of ['a', 'b']) {
    const key = `${cleanId}${suffix}`;
    try {
      const docSnap = await getDoc(doc(db, 'lineas_ucot', key));
      if (docSnap.exists()) {
        const data = docSnap.data();
        const recorrido = (data.recorrido || []) as Array<{ lat: number; lng: number }>;
        const paradas = (data.paradas || []) as Array<{
          nombre: string;
          lat: number;
          lng: number;
          orden: number;
        }>;

        const validRecorrido = recorrido.filter(
          (p) => p.lat !== 0 && p.lng !== 0 && !isNaN(p.lat) && !isNaN(p.lng),
        );
        const finalRecorrido =
          validRecorrido.length > 0
            ? validRecorrido
            : paradas
                .filter((p) => p.lat !== 0 && p.lng !== 0)
                .map((p) => ({ lat: p.lat, lng: p.lng }));

        if (finalRecorrido.length > 0) {
          const cached: CachedRoute = {
            code: key,
            lineId: cleanId,
            variantIdx: suffix === 'b' ? 1 : 0,
            recorrido: finalRecorrido,
            paradas: paradas.filter((p) => p.lat !== 0 && p.lng !== 0),
            origen: data.origen as string,
            destino: data.destino as string,
            source: 'FIRESTORE',
            cachedAt: new Date().toISOString(),
          };
          ROUTE_CACHE.set(key, cached);
          return cached;
        }
      }
    } catch {
      // Individual read failed, try next
    }
  }

  return null;
}

// ─── 3. Get BOTH variants for a line ────────────────────────────────────────
export async function getBothVariants(lineId: string): Promise<{
  ida: CachedRoute | null;
  vuelta: CachedRoute | null;
}> {
  loadStaticRoutes();
  const cleanId = lineId.replace(/[ab]$/i, '');

  const idaKey = `${cleanId}a`;
  const vueltaKey = `${cleanId}b`;

  let ida = ROUTE_CACHE.get(idaKey) || null;
  let vuelta = ROUTE_CACHE.get(vueltaKey) || null;

  // If not in cache, try Firestore
  if (!ida) {
    try {
      const docSnap = await getDoc(doc(db, 'lineas_ucot', idaKey));
      if (docSnap.exists()) {
        const data = docSnap.data();
        const rec = ((data.recorrido || []) as Array<{ lat: number; lng: number }>).filter(
          (p) => p.lat !== 0 && p.lng !== 0 && !isNaN(p.lat) && !isNaN(p.lng),
        );
        if (rec.length > 0) {
          ida = {
            code: idaKey,
            lineId: cleanId,
            variantIdx: 0,
            recorrido: rec,
            paradas: [],
            origen: data.origen as string,
            destino: data.destino as string,
            source: 'FIRESTORE',
            cachedAt: new Date().toISOString(),
          };
          ROUTE_CACHE.set(idaKey, ida);
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (!vuelta) {
    try {
      const docSnap = await getDoc(doc(db, 'lineas_ucot', vueltaKey));
      if (docSnap.exists()) {
        const data = docSnap.data();
        const rec = ((data.recorrido || []) as Array<{ lat: number; lng: number }>).filter(
          (p) => p.lat !== 0 && p.lng !== 0 && !isNaN(p.lat) && !isNaN(p.lng),
        );
        if (rec.length > 0) {
          vuelta = {
            code: vueltaKey,
            lineId: cleanId,
            variantIdx: 1,
            recorrido: rec,
            paradas: [],
            origen: data.origen as string,
            destino: data.destino as string,
            source: 'FIRESTORE',
            cachedAt: new Date().toISOString(),
          };
          ROUTE_CACHE.set(vueltaKey, vuelta);
        }
      }
    } catch {
      /* ignore */
    }
  }

  return { ida, vuelta };
}

// ─── 4. Fetch from STM API (fallback) ──────────────────────────────────────
export async function fetchRouteFromAPI(lineCode: string): Promise<CachedRoute | null> {
  const cleanId = lineCode.replace(/[ab]$/i, '');
  const isB = lineCode.endsWith('b');
  const variantIdx = isB ? 1 : 0;

  try {
    const [recorridoRes, paradasRes] = await Promise.all([
      fetch(getProxyUrl(`transporteRest/infoTransporte/recorrido/${cleanId}/${variantIdx}`))
        .then((r) => r.json())
        .catch(() => null),
      fetch(getProxyUrl(`transporteRest/infoTransporte/paradas/${cleanId}/${variantIdx}`))
        .then((r) => r.json())
        .catch(() => []),
    ]);

    let recorrido = parseRecorrido(recorridoRes);

    // Fallback: try without variant
    if (recorrido.length === 0) {
      try {
        const fallback = await fetch(
          getProxyUrl(`transporteRest/infoTransporte/recorrido/${cleanId}`),
        ).then((r) => r.json());
        recorrido = parseRecorrido(fallback);
      } catch {
        /* ignore */
      }
    }

    // Parse paradas
    const rawParadas = Array.isArray(paradasRes)
      ? paradasRes
      : Array.isArray(paradasRes?.paradas)
        ? paradasRes.paradas
        : [];

    const paradas = rawParadas
      .map((p: Record<string, unknown>, i: number) => {
        const { lat, lng } = extractLatLng(p);
        return {
          nombre: String(p.nombre ?? p.name ?? `Parada ${i + 1}`),
          lat,
          lng,
          orden: Number(p.orden ?? i + 1),
        };
      })
      .filter((s: { lat: number; lng: number }) => s.lat !== 0 && s.lng !== 0);

    if (recorrido.length === 0 && paradas.length > 1) {
      recorrido = paradas.map((s: { lat: number; lng: number }) => ({
        lat: s.lat,
        lng: s.lng,
      }));
    }

    if (recorrido.length === 0) return null;

    const code = `${cleanId}${isB ? 'b' : 'a'}`;
    const cached: CachedRoute = {
      code,
      lineId: cleanId,
      variantIdx,
      recorrido,
      paradas,
      source: 'API_STM',
      cachedAt: new Date().toISOString(),
    };
    ROUTE_CACHE.set(code, cached);
    return cached;
  } catch {
    return null;
  }
}

// ─── 5. Main entry point: get route with full fallback chain ───────────────
export async function getRouteWithFallback(lineCode: string): Promise<CachedRoute | null> {
  // 0. Static file (loaded automatically)
  // 1. Try memory cache / Firestore
  const cached = await getRoute(lineCode);
  if (cached) return cached;

  // 2. Try STM API
  const fromAPI = await fetchRouteFromAPI(lineCode);
  if (fromAPI) return fromAPI;

  return null;
}

// ─── 6. Get route for rival lines ──────────────────────────────────────────
export async function getRivalRoutes(
  rivalIds: string[],
): Promise<Array<{ lineId: string; recorrido: Array<{ lat: number; lng: number }> }>> {
  const results: Array<{ lineId: string; recorrido: Array<{ lat: number; lng: number }> }> = [];

  for (const rivalId of rivalIds.slice(0, 5)) {
    const route = await getRouteWithFallback(rivalId);
    if (route && route.recorrido.length > 0) {
      results.push({ lineId: rivalId, recorrido: route.recorrido });
    }
  }

  return results;
}

// ─── 7. Get cache stats ────────────────────────────────────────────────────
export function getCacheStats(): {
  totalCached: number;
  routes: Array<{ code: string; points: number; source: string }>;
} {
  loadStaticRoutes(); // Ensure loaded
  const routes = Array.from(ROUTE_CACHE.entries()).map(([code, data]) => ({
    code,
    points: data.recorrido.length,
    source: data.source,
  }));
  return { totalCached: ROUTE_CACHE.size, routes };
}
