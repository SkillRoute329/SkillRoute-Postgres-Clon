/**
 * ucotShapesInjector — Inyección de shapes + paradas geo-localizadas para UCOT.
 * ============================================================================
 * Resuelve el bloqueo del Navegador (auditoría 2026-04-26): la API STM está
 * caída (proxy 403) y la colección `lineas_ucot` en Firestore tiene docs
 * vacíos de coordenadas. Este injector usa fuentes que SIEMPRE están en el
 * bundle del frontend, sin depender de servicios externos en runtime.
 *
 * FUENTES (todas estáticas, en el bundle):
 *   - `frontend/src/data/geo/routeCache.json` — shapes verificados de las
 *      16 variantes UCOT (300a/b … 396a/b), 538 puntos lat/lng
 *      reales sobre calles de Montevideo.
 *   - `frontend/src/data/lineTemplates.ts` — nombres de paradas (sin geo)
 *      por línea base (LINE_ARCHETYPES + serviceData).
 *
 * GENERACIÓN DE PARADAS GEO:
 *   Distribuye las paradas nominales del JSON Maestro sobre el shape
 *   proporcionalmente a la distancia ACUMULADA (haversine), no al índice
 *   de punto. Eso da paradas geo-localizadas razonables sin geocoder
 *   externo: la primera parada queda en `recorrido[0]`, la última en
 *   el último punto, las intermedias en los puntos del shape cuya
 *   distancia acumulada se acerca más al fraccional ideal.
 *
 * USO desde linesService:
 *   const inj = getUCOTLineaInyectada(codigo);
 *   if (inj) return inj;        // ← linea completa con recorrido + paradas
 *   // ...continuar con fallbacks
 */

import staticRouteData from '../../../data/geo/routeCache.json';
import { LINE_ARCHETYPES } from '../../../data/lineTemplates';
import { haversineMetros as geoHaversineMetros } from '../../../utils/geomath';

// ─── Tipos públicos ──────────────────────────────────────────────────────────

export interface InjectedParada {
  id: string;
  nombre: string;
  lat: number;
  lng: number;
  orden: number;
}

export interface InjectedLinea {
  codigo: string;
  baseCodigo: string;
  sentido: 'IDA' | 'VUELTA';
  origen?: string;
  destino?: string;
  recorrido: Array<{ lat: number; lng: number }>;
  paradas: InjectedParada[];
  fuente: 'static_injection_v1';
}

// ─── Tipo del JSON ───────────────────────────────────────────────────────────

interface RouteCacheEntry {
  code: string;
  lineId: string;
  origen?: string;
  destino?: string;
  recorrido?: Array<{ lat: number; lng: number }>;
}

const routeCache = staticRouteData as Record<string, RouteCacheEntry>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

// FASE 5.16: delega en utils/geomath (fuente única). API local intacta.
function haversineMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return geoHaversineMetros(lat1, lng1, lat2, lng2);
}

/**
 * Distribuye paradas nombradas a lo largo del shape proporcionalmente a la
 * distancia recorrida. Garantiza que la primera parada caiga en `recorrido[0]`
 * y la última en `recorrido[N-1]`.
 */
function distribuirParadasSobreShape(
  recorrido: Array<{ lat: number; lng: number }>,
  nombres: string[],
  reverse: boolean,
): InjectedParada[] {
  if (recorrido.length === 0 || nombres.length === 0) return [];
  if (recorrido.length === 1) {
    return [
      {
        id: 'p1',
        nombre: nombres[0],
        lat: recorrido[0].lat,
        lng: recorrido[0].lng,
        orden: 1,
      },
    ];
  }

  // Distancia acumulada en cada índice
  const distAcum: number[] = new Array(recorrido.length).fill(0);
  for (let i = 1; i < recorrido.length; i++) {
    distAcum[i] =
      distAcum[i - 1] +
      haversineMetros(
        recorrido[i - 1].lat,
        recorrido[i - 1].lng,
        recorrido[i].lat,
        recorrido[i].lng,
      );
  }
  const distTotal = distAcum[distAcum.length - 1];

  const ordenNombres = reverse ? [...nombres].reverse() : nombres;
  const N = ordenNombres.length;

  const paradas: InjectedParada[] = [];
  for (let j = 0; j < N; j++) {
    const targetDist = N === 1 ? 0 : (distTotal * j) / (N - 1);
    // Buscar el índice cuyo distAcum se acerca más a targetDist
    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < distAcum.length; i++) {
      const diff = Math.abs(distAcum[i] - targetDist);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    const punto = recorrido[bestIdx];
    paradas.push({
      id: `p${j + 1}`,
      nombre: ordenNombres[j],
      lat: punto.lat,
      lng: punto.lng,
      orden: j + 1,
    });
  }

  return paradas;
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Devuelve la línea UCOT completamente armada (recorrido + paradas geo) si
 * los datos estáticos cubren el código solicitado. Null si no hay shape.
 *
 * `codigo` puede ser '300a', '300b', '300' (auto-detecta IDA), 'CE1', etc.
 */
export function getUCOTLineaInyectada(codigo: string): InjectedLinea | null {
  const codeLower = String(codigo).toLowerCase();
  const baseCodigo = codeLower.replace(/[ab]$/i, '');
  const isExplicitVariant = /[ab]$/i.test(codeLower);
  const sentido: 'IDA' | 'VUELTA' = codeLower.endsWith('b') ? 'VUELTA' : 'IDA';
  const isReverse = sentido === 'VUELTA';

  // SOLO usamos el shape de la VARIANTE EXACTA pedida.
  // Las líneas reales suelen tener IDA y VUELTA por calles distintas
  // (sentido único, terminales asimétricas), así que NO inventamos
  // invirtiendo el otro sentido. Si la variante no está, retornamos null
  // y dejamos que el caller caiga al fallback de Firestore.
  let entry: RouteCacheEntry | undefined;
  if (isExplicitVariant) {
    entry = routeCache[codeLower];
  } else {
    // Caso edge: pidieron solo "300" sin a/b → tomamos IDA por convención.
    entry = routeCache[`${baseCodigo}a`];
  }
  if (!entry || !entry.recorrido || entry.recorrido.length === 0) {
    return null;
  }

  const recorrido = entry.recorrido.filter(
    (p) => p && typeof p.lat === 'number' && typeof p.lng === 'number' && (p.lat !== 0 || p.lng !== 0),
  );
  if (recorrido.length === 0) return null;

  // El shape ya está en el orden correcto del sentido pedido.
  const recorridoFinal = recorrido;

  const archetype = LINE_ARCHETYPES[baseCodigo] as { headers?: string[] } | undefined;
  const nombresParadas = archetype?.headers ?? [];

  // LINE_ARCHETYPES.headers están en orden IDA siempre. Si la línea va en
  // sentido VUELTA, los nombres se recorren al revés.
  const paradas = distribuirParadasSobreShape(recorridoFinal, nombresParadas, isReverse);

  return {
    codigo: codeLower,
    baseCodigo,
    sentido,
    origen: entry.origen,
    destino: entry.destino,
    recorrido: recorridoFinal,
    paradas,
    fuente: 'static_injection_v1',
  };
}

/**
 * Devuelve la lista de TODAS las variantes UCOT cubiertas por el cache
 * estático. Útil para alimentar el dropdown del Navegador sin depender
 * del catálogo hardcodeado en LINEAS_UCOT_BASE.
 */
export function listUCOTLineasInyectadas(): Array<{
  codigo: string;
  baseCodigo: string;
  sentido: 'IDA' | 'VUELTA';
  origen?: string;
  destino?: string;
  paradas: number;
  recorridoPuntos: number;
}> {
  const out: Array<{
    codigo: string;
    baseCodigo: string;
    sentido: 'IDA' | 'VUELTA';
    origen?: string;
    destino?: string;
    paradas: number;
    recorridoPuntos: number;
  }> = [];

  for (const [code, entry] of Object.entries(routeCache)) {
    if (code.startsWith('_')) continue;
    if (!entry || !entry.recorrido || entry.recorrido.length === 0) continue;
    const baseCodigo = code.replace(/[ab]$/i, '');
    const archetype = LINE_ARCHETYPES[baseCodigo] as { headers?: string[] } | undefined;
    out.push({
      codigo: code,
      baseCodigo,
      sentido: code.endsWith('b') ? 'VUELTA' : 'IDA',
      origen: entry.origen,
      destino: entry.destino,
      paradas: archetype?.headers?.length ?? 0,
      recorridoPuntos: entry.recorrido.length,
    });
  }

  return out.sort((a, b) =>
    a.codigo.localeCompare(b.codigo, undefined, { numeric: true }),
  );
}
