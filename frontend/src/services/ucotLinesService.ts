/**
 * Servicio de datos para el Navegador UCOT.
 * Offline-first con múltiples fuentes:
 *  1. Caché estática (routeCache.json + lines.ts) — instantáneo
 *  2. Firestore colección lineas_ucot
 *  3. Cartones + lineTemplates (hitos teóricos)
 *  4. API STM en vivo (último recurso)
 * CORRIDOR_MAP provee origen/destino para el selector.
 */
import { apiClient } from '../clients/apiClient';
import type { LineaUCOT, ParadaUcot, PuntoLatLng, SentidoLinea } from '../types/lineasUcot';
import { CORRIDOR_MAP } from './CompetitorIntelligence';
import { LINE_ARCHETYPES, line300Data, line300ReverseData } from '../data/lineTemplates';
import { getRealRouteCoordinates, ALL_UCOT_ROUTES } from '../data/routesGeoData';
// NOTA: routeCacheService y lines.ts DESACTIVADOS — sus datos no están verificados.
// import { getRouteWithFallback, loadStaticRoutes } from '../data/geo/routeCacheService';
// import { LINES_DB } from '../data/geo/lines';

const COL = 'lineas_ucot';
const PROXY_BASE = import.meta.env.VITE_STM_PROXY_URL || 'http://localhost:3001/api/stm/proxy';

/**
 * Códigos de línea UCOT verificados contra el registro oficial IMM/STM.
 * POLÍTICA: CERO SIMULACIÓN — solo líneas con número oficial confirmado.
 * Fuente: https://www.montevideo.gub.uy/app/stm/horarios/
 */
export const LINEAS_UCOT_BASE = [
  '300',  // 300 Cementerio Central ↔ Instrucciones y Belloni
  '306',  // 306 Casabó ↔ Géant
  '316',  // 316 Cno. Maldonado ↔ Pocitos
  '328',  // 328 Punta Carretas ↔ Mendoza
  '329',  // 329 Colón ↔ Saint Bois
  '330',  // 330 Instrucciones ↔ Ciudadela
  '370',  // 370 Portones ↔ Cerro
  '396',  // 396 (verificar destino en IMM)
  // CE1, DM1, L-12, L-13, L-31, L-32, L-33, XA1, XA2 → no tienen variante a/b; tratar aparte
];

/** Líneas de la COMPETENCIA para inteligencia de mercado. */
export const LINEAS_COMPETENCIA_BASE = ['103', '110', '128', '169', '185', '505', '522'];

/** Lista completa de códigos con variantes (para selector). */
export const LINEAS_UCOT_ALL = ((): string[] => {
  const out: string[] = [];
  // UCOT Lines
  for (const base of LINEAS_UCOT_BASE) {
    out.push(`${base}a`, `${base}b`);
  }
  // Competitor Lines (usually don't have a/b in this way or we treat them as single for now)
  for (const comp of LINEAS_COMPETENCIA_BASE) {
    out.push(comp);
  }
  return out;
})();

function getProxyUrl(endpoint: string): string {
  return `${PROXY_BASE}?endpoint=${encodeURIComponent(endpoint)}`;
}

/**
 * Helper geográfico a prueba de balas: En Uruguay (MVD), la Longitud (~ 56) es SIEMPRE
 * mayor en valor absoluto que la Latitud (~ 34).
 * Además, obligamos el signo negativo (Hemisferio Sur y Oeste) para evitar
 * coordenadas erróneas de la API de Montevideo.
 */
function fixUruguayCoords(val1: number, val2: number): { lat: number; lng: number } {
  if (val1 === 0 && val2 === 0) return { lat: 0, lng: 0 };

  const abs1 = Math.abs(val1);
  const abs2 = Math.abs(val2);

  // abs mayor === Longitud, abs menor === Latitud
  if (abs1 > abs2) {
    return { lat: -abs2, lng: -abs1 };
  } else {
    return { lat: -abs1, lng: -abs2 };
  }
}

/**
 * Extrae lat/lng de un nodo (parada o punto). Soporta:
 * - lat/lng, latitude/longitude, latitud/longitud, lon
 * - geometry.coordinates (GeoJSON: [lng, lat])
 */
function extractLatLng(p: Record<string, unknown>): { lat: number; lng: number } {
  const geom = p.geometry as { coordinates?: [number, number] } | undefined;
  if (geom && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
    return fixUruguayCoords(Number(geom.coordinates[0]), Number(geom.coordinates[1]));
  }
  const latR = Number(p.lat ?? p.latitude ?? (p as Record<string, unknown>).latitud ?? 0);
  const lngR = Number(
    p.lng ?? p.longitude ?? (p as Record<string, unknown>).longitud ?? p.lon ?? 0,
  );
  if (latR !== 0 || lngR !== 0) {
    return fixUruguayCoords(latR, lngR);
  }
  return { lat: 0, lng: 0 };
}

/**
 * Convierte respuesta de API Montevideo a LineaUCOT.
 * Ajustado a variantes habituales: propiedades en español/inglés, GeoJSON, anidación.
 */
function mapApiToLineaUCOT(
  codigo: string,
  numeroAPI: string,
  varianteIdx: number,
  apiLinea: Record<string, unknown>,
  apiParadas: unknown,
  apiRecorrido: unknown,
): Omit<LineaUCOT, 'desviosFijos' | 'desviosTemporales' | 'ultimaActualizacion'> {
  const rawParadas: unknown[] = Array.isArray(apiParadas)
    ? apiParadas
    : Array.isArray((apiParadas as Record<string, unknown>)?.paradas)
      ? ((apiParadas as Record<string, unknown>).paradas as unknown[])
      : Array.isArray((apiParadas as Record<string, unknown>)?.data)
        ? ((apiParadas as Record<string, unknown>).data as unknown[])
        : [];

  const paradas: ParadaUcot[] = rawParadas.map((p, i) => {
    const obj = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
    const { lat, lng } = extractLatLng(obj);
    return {
      id: String(obj.id ?? obj.codigo ?? `p-${i}`),
      nombre: String(obj.nombre ?? obj.name ?? obj.descripcion ?? ''),
      lat,
      lng,
      orden: Number(obj.orden ?? obj.order ?? i + 1),
    };
  });

  let recorrido: PuntoLatLng[] = [];
  if (Array.isArray(apiRecorrido)) {
    const first = apiRecorrido[0];
    if (Array.isArray(first) && first.length >= 2) {
      // Aplicamos fix generalizado
      recorrido = (apiRecorrido as [number, number][]).map(([v1, v2]) =>
        fixUruguayCoords(Number(v1), Number(v2)),
      );
    } else {
      recorrido = (apiRecorrido as Record<string, unknown>[]).map((pt) => extractLatLng(pt));
    }
  } else if (apiRecorrido && typeof apiRecorrido === 'object') {
    const obj = apiRecorrido as Record<string, unknown>;
    const coords = obj.coordinates as [number, number][] | undefined;
    const geom = obj.geometry as { coordinates?: [number, number][] } | undefined;
    const list = coords ?? geom?.coordinates ?? obj.recorrido ?? obj.data;
    if (Array.isArray(list) && list.length > 0) {
      const first = list[0];
      if (Array.isArray(first) && first.length >= 2) {
        recorrido = (list as [number, number][]).map(([v1, v2]) =>
          fixUruguayCoords(Number(v1), Number(v2)),
        );
      } else {
        recorrido = (list as unknown[]).map((pt) =>
          extractLatLng((pt && typeof pt === 'object' ? pt : {}) as Record<string, unknown>),
        );
      }
    }
  }

  return {
    codigo,
    numeroAPI,
    nombre: String(apiLinea?.nombre ?? apiLinea?.name ?? codigo),
    varianteIdx,
    paradas,
    recorrido,
  };
}

/** Tipo para ingesta desde archivo (ultimaActualizacion se asigna al escribir). */
export type LineaUCOTParaEscritura = Omit<LineaUCOT, 'ultimaActualizacion'> & {
  ultimaActualizacion?: string;
};

const BATCH_SIZE_STM = 500;

const UCOT_EMPRESA_COD = 2;
const UCOT_EMPRESA_NOMBRE = 'UCOT';

function isUCOT(props: Record<string, unknown>): boolean {
  const cod = props.COD_EMPRESA ?? props.cod_empresa ?? props.empresa;
  const desc = String(
    props.DESC_EMPRESA ?? props.desc_empresa ?? props.EMPRESA ?? props.empresa ?? '',
  ).toUpperCase();
  if (cod !== undefined && cod !== null) {
    if (Number(cod) === UCOT_EMPRESA_COD) return true;
    if (String(cod).trim() !== '') return false;
  }
  if (desc && desc.includes(UCOT_EMPRESA_NOMBRE)) return true;
  if (desc && String(desc).trim() !== '') return false;
  return true;
}

function numeroComercialFromProps(props: Record<string, unknown>, fallbackIndex: number): string {
  const raw =
    props.DESC_LINEA ??
    props.desc_linea ??
    props.SIGLA ??
    props.sigla ??
    props.LINEA ??
    props.linea ??
    props.NUMERO ??
    props.numero ??
    props.codigo ??
    props.id ??
    `linea-${fallbackIndex}`;
  return String(raw).trim();
}

/**
 * Parsea un JSON o GeoJSON (Datos Abiertos IMM) y devuelve líneas listas para escribir en lineas_ucot.
 * Soporta: { lineas: [ { codigo, nombre?, paradas?, recorrido? } ] } o FeatureCollection con LineString.
 * En FeatureCollection filtra por empresa UCOT y mapea número comercial (DESC_LINEA, SIGLA, etc.).
 */
export function parseGeoJSONOrJSONToLineasUCOT(raw: string): LineaUCOTParaEscritura[] {
  const data = JSON.parse(raw) as Record<string, unknown>;
  const out: LineaUCOTParaEscritura[] = [];

  if (Array.isArray(data.lineas)) {
    for (const line of data.lineas as Array<Record<string, unknown>>) {
      const codigo = String(line.codigo ?? line.id ?? 'sin-codigo');
      const partial = mapApiToLineaUCOT(
        codigo,
        String(line.numeroAPI ?? line.codigo ?? codigo),
        Number(line.varianteIdx ?? line.variante ?? 0),
        { nombre: line.nombre ?? line.name ?? codigo },
        line.paradas ?? [],
        line.recorrido ?? [],
      );
      out.push({
        ...partial,
        desviosFijos: [],
        desviosTemporales: [],
      });
    }
    return out;
  }

  if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
    const features = data.features as Array<{
      type?: string;
      geometry?: { type?: string; coordinates?: [number, number][] };
      properties?: Record<string, unknown>;
    }>;
    for (let idx = 0; idx < features.length; idx++) {
      const f = features[idx];
      if (f.geometry?.type !== 'LineString' || !Array.isArray(f.geometry.coordinates)) continue;
      const props = f.properties ?? {};
      if (!isUCOT(props)) continue;
      const numeroReal = numeroComercialFromProps(props, idx);
      const codigo = numeroReal || 'linea-' + idx;
      const partial = mapApiToLineaUCOT(
        codigo,
        String(props.numeroAPI ?? props.codigo ?? codigo),
        Number(props.varianteIdx ?? props.variante ?? 0),
        { nombre: numeroReal },
        props.paradas ?? [],
        f.geometry.coordinates,
      );
      out.push({
        ...partial,
        desviosFijos: [],
        desviosTemporales: [],
      });
    }
    return out;
  }

  return out;
}

/**
 * Escribe líneas en el backend (lineas_ucot) en lotes paralelos.
 */
export async function writeLineasUCOTInBatches(
  lineas: LineaUCOTParaEscritura[],
  onProgress?: (written: number, total: number) => void,
): Promise<{ written: number; errors: string[] }> {
  const errors: string[] = [];
  let written = 0;
  const now = new Date().toISOString();
  for (let offset = 0; offset < lineas.length; offset += BATCH_SIZE_STM) {
    const chunk = lineas.slice(offset, offset + BATCH_SIZE_STM);
    try {
      await Promise.all(chunk.map(async (linea) => {
        await apiClient.put(`/api/db/${COL}/` + encodeURIComponent(linea.codigo), {
          ...linea,
          ultimaActualizacion: now,
        });
      }));
      written += chunk.length;
      onProgress?.(written, lineas.length);
    } catch (e) {
      errors.push(
        `${lineas[offset]?.codigo ?? offset}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  return { written, errors };
}

/**
 * Pre-carga datos de una línea (offline-first, multi-fuente).
 * Cadena de fallback:
 *  1. Firestore lineas_ucot (datos sincronizados)
 *  2. Cartones (hitos teóricos)
 *  3. lineTemplates (datos manuales)
 *  4. ALL_UCOT_ROUTES (datos GPS reales del GeoServer IMM)
 * Si el recorrido está vacío, NavigationModule disparará auto-sync desde la API.
 */
export async function getLineaData(codigo: string): Promise<LineaUCOT | null> {
  let result: LineaUCOT | null = null;

  // 1. Fuente principal: colección lineas_ucot (tolerante a offline)
  try {
    const data = await apiClient.get(`/api/db/${COL}/` + encodeURIComponent(codigo)) as LineaUCOT | null;
    if (data) {
      data.desviosFijos = data.desviosFijos ?? [];
      data.desviosTemporales = data.desviosTemporales ?? [];
      data.paradas = data.paradas ?? [];
      data.recorrido = data.recorrido ?? [];
      if (data.paradas.length > 0 || data.recorrido.length > 0) {
        result = data;
      }
    }
  } catch (backendError) {
    console.warn('[UCOT] Backend offline para getLineaData:', codigo, backendError);
  }

  // 2. Fallback: construir paradas desde colección cartones (DESACTIVADO según opción 1)
  // if (!result) {
  //   try {
  //     result = await buildLineaFromCartones(codigo);
  //   } catch (cartError) {
  //     console.warn('[UCOT] Cartones no disponibles para:', codigo);
  //   }
  // }

  // 3. Fallback: datos manuales de lineTemplates.ts
  if (!result) {
    result = buildLineaFromTemplates(codigo);
  }

  // 4. Fallback FINAL: construir directamente desde ALL_UCOT_ROUTES (GeoServer IMM)
  if (!result) {
    result = buildLineaFromGeoData(codigo);
  }

  // 5. ENRIQUECER con coordenadas GPS reales del GeoServer oficial
  if (result) {
    result = enrichWithOfficialGeoData(result, codigo);
  }

  // 6. FASE 5.18 — GEOMETRÍA REAL: el recorrido visible debe ser el de
  // gtfs.shapes (feed oficial IMM), no inyectores/templates simulados (el
  // centro de comando marcó el trazado simulado como descalificante).
  // Override solo si GTFS tiene la geometría; si no, se conserva la previa.
  if (result) {
    try {
      const base = codigo.replace(/[ab]$/i, '');
      const dir = /b$/i.test(codigo) ? 1 : 0;
      const resp = (await apiClient.get('/api/gtfs/geometry', {
        query: { agencyId: '70', linea: base, directionId: String(dir) },
      })) as { data?: { recorrido?: Array<{ lat: number; lng: number }> } };
      const real = resp?.data?.recorrido;
      if (Array.isArray(real) && real.length > 2) {
        result.recorrido = real
          .filter((p) => p && typeof p.lat === 'number' && typeof p.lng === 'number')
          .map((p) => ({ lat: p.lat, lng: p.lng }));
      }
    } catch {
      /* GTFS no disponible → se conserva el recorrido previo (fallback) */
    }
  }

  return result;
}

/**
 * Construye una LineaUCOT directamente desde los datos del GeoServer IMM
 * almacenados en ALL_UCOT_ROUTES. Este es el fallback de último recurso
 * que funciona incluso sin Firestore ni cartones.
 */
function buildLineaFromGeoData(codigo: string): LineaUCOT | null {
  const baseCodigo = codigo.replace(/[ab]$/i, '');
  const isVariantB = /b$/i.test(codigo);
  const sentido: SentidoLinea = isVariantB ? 'VUELTA' : 'IDA';

  const lineRoutes = ALL_UCOT_ROUTES[baseCodigo];
  if (!lineRoutes) return null;

  // Buscar variante A (IDA) o B (VUELTA)
  const targetDesc = isVariantB ? 'B' : 'A';
  const matchedVariant =
    Object.values(lineRoutes).find((v) => v.descVariante === targetDesc) ||
    Object.values(lineRoutes)[0];

  if (!matchedVariant || matchedVariant.coordinates.length === 0) return null;

  const recorrido = matchedVariant.coordinates.map((c) => ({ lat: c.lat, lng: c.lng }));

  // Generar paradas equidistantes a lo largo del recorrido (cada ~20 puntos)
  const step = Math.max(1, Math.floor(recorrido.length / 15));
  const paradas: ParadaUcot[] = [];
  for (let i = 0; i < recorrido.length; i += step) {
    paradas.push({
      id: `gps-${i}`,
      nombre:
        i === 0
          ? matchedVariant.origen
          : i + step >= recorrido.length
            ? matchedVariant.destino
            : `Punto ${paradas.length + 1}`,
      lat: recorrido[i].lat,
      lng: recorrido[i].lng,
      orden: paradas.length + 1,
    });
  }

  return {
    codigo,
    numeroAPI: baseCodigo,
    nombre: `Línea ${baseCodigo}: ${matchedVariant.origen} → ${matchedVariant.destino}`,
    empresa: 'UCOT',
    sentido,
    origen: matchedVariant.origen,
    destino: matchedVariant.destino,
    varianteIdx: isVariantB ? 1 : 0,
    paradas,
    recorrido,
    desviosFijos: [],
    desviosTemporales: [],
    ultimaActualizacion: Timestamp.now(),
  };
}

/**
 * Enriquece una LineaUCOT con coordenadas GPS reales del GeoServer oficial.
 * Fuente: Intendencia de Montevideo, capa v_uptu_sentido_variante.
 * Solo se aplica a líneas que tienen datos oficiales verificados.
 */
function enrichWithOfficialGeoData(linea: LineaUCOT, codigo: string): LineaUCOT {
  const realCoords = getRealRouteCoordinates(codigo);
  if (!realCoords || realCoords.length === 0) return linea;

  // Inyectar recorrido real (polyline para el mapa)
  linea.recorrido = realCoords.map((c) => ({ lat: c.lat, lng: c.lng }));

  // Actualizar origen/destino desde los datos oficiales (para TODAS las líneas UCOT)
  const baseCodigo = codigo.replace(/[ab]$/i, '');
  const lineRoutes = ALL_UCOT_ROUTES[baseCodigo];
  if (lineRoutes) {
    // Buscar la variante que corresponde a este recorrido
    const suffix = codigo.match(/[ab]$/i)?.[0]?.toLowerCase() || 'a';
    const isIda = suffix !== 'b';
    // Buscar variante A (IDA) o B (VUELTA)
    const targetDesc = isIda ? 'A' : 'B';
    const matchedVariant =
      Object.values(lineRoutes).find((v) => v.descVariante === targetDesc) ||
      Object.values(lineRoutes)[0];
    if (matchedVariant) {
      linea.origen = matchedVariant.origen;
      linea.destino = matchedVariant.destino;
      linea.nombre = `Línea ${baseCodigo}: ${matchedVariant.origen} → ${matchedVariant.destino}`;
    }
  }

  return linea;
}

/**
 * Construye LineaUCOT desde la colección Firestore 'cartones'.
 * Los cartones tienen paradas[] con nombres y tiempos — que son los puntos de control del recorrido.
 */
async function _buildLineaFromCartones(codigo: string): Promise<LineaUCOT | null> {
  const baseCodigo = codigo.replace(/[ab]$/i, '');
  const isVariantB = /b$/i.test(codigo);
  const sentido: SentidoLinea = isVariantB ? 'VUELTA' : 'IDA';

  try {
    const raw = await apiClient.get('/api/db/cartones', {
      query: { where: `linea:${baseCodigo}`, limit: 1 },
    }) as any[];
    const arr = Array.isArray(raw) ? raw : [];
    if (arr.length === 0) return null;

    // Tomar el primer cartón para extraer las paradas
    const cartonData = arr[0];
    const paradasRaw = (cartonData.paradas as Array<{ nombre: string; tiempos?: string[] }>) || [];
    if (paradasRaw.length === 0) return null;

    // Para VUELTA, invertir el orden de paradas
    const paradasOrdenadas = isVariantB ? [...paradasRaw].reverse() : paradasRaw;

    const paradas: ParadaUcot[] = paradasOrdenadas.map((p, i) => ({
      id: `p-${i}`,
      nombre: (p.nombre || '').trim() || `Punto ${i + 1}`,
      lat: 0, // Sin coordenadas GPS — se mostrarán como hitos teóricos
      lng: 0,
      orden: i + 1,
    }));

    // Buscar metadatos en CORRIDOR_MAP
    const corridor =
      CORRIDOR_MAP.find((c) => c.variantCode === codigo) ??
      CORRIDOR_MAP.find((c) => c.lineId === baseCodigo);

    return {
      codigo,
      numeroAPI: baseCodigo,
      nombre: corridor?.label ?? `Línea ${baseCodigo} (${sentido})`,
      empresa: 'UCOT',
      sentido,
      origen: corridor?.terminalOrigen ?? paradas[0]?.nombre,
      destino: corridor?.terminalDestino ?? paradas[paradas.length - 1]?.nombre,
      terminalSalida: corridor?.terminalOrigen,
      terminalLlegada: corridor?.terminalDestino,
      varianteIdx: isVariantB ? 1 : 0,
      paradas,
      recorrido: [], // Sin datos GPS — el mapa mostrará hitos teóricos
      desviosFijos: [],
      desviosTemporales: [],
      ultimaActualizacion: new Date().toISOString() as any,
    };
  } catch (e) {
    console.warn('[getLineaData] Error leyendo cartones:', e);
    return null;
  }
}

/**
 * Construye LineaUCOT desde lineTemplates.ts (datos manuales hardcodeados).
 * Actualmente solo tiene 300 IDA y 300 VUELTA completos.
 */
function buildLineaFromTemplates(codigo: string): LineaUCOT | null {
  const baseCodigo = codigo.replace(/[ab]$/i, '');
  const isVariantB = /b$/i.test(codigo);
  const sentido: SentidoLinea = isVariantB ? 'VUELTA' : 'IDA';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let templateData: any = null;
  if (baseCodigo === '300') {
    templateData = isVariantB ? line300ReverseData : line300Data;
  }

  // LINE_ARCHETYPES tiene headers (nombres de paradas) para más líneas
  const archetype = LINE_ARCHETYPES[baseCodigo];

  if (!templateData && !archetype) return null;

  // Coordenadas GPS del archetype (si las tiene)
  const archetypeCoords: Array<{ lat: number; lng: number }> | null =
    archetype?.coordinates && Array.isArray(archetype.coordinates) ? archetype.coordinates : null;

  // Construir paradas desde template o archetype
  let paradas: ParadaUcot[];
  if (templateData?.headers) {
    const headers = isVariantB ? [...templateData.headers].reverse() : templateData.headers;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    paradas = headers.map((h: any, i: number) => {
      if (typeof h === 'string') {
        return { id: `p-${i}`, nombre: h, lat: 0, lng: 0, orden: i + 1 };
      }
      return {
        id: h.id || `p-${i}`,
        nombre: h.location || 'Parada',
        lat: 0,
        lng: 0,
        orden: i + 1,
      };
    });
  } else if (archetype?.headers) {
    const headers = isVariantB ? [...archetype.headers].reverse() : archetype.headers;
    const coords = archetypeCoords
      ? isVariantB
        ? [...archetypeCoords].reverse()
        : archetypeCoords
      : null;
    paradas = headers.map((name: string, i: number) => ({
      id: `p-${i}`,
      nombre: name,
      lat: coords?.[i]?.lat ?? 0,
      lng: coords?.[i]?.lng ?? 0,
      orden: i + 1,
    }));
  } else {
    return null;
  }

  // Generar recorrido (polyline) desde las coordenadas del archetype
  let recorrido: PuntoLatLng[] = [];
  if (archetypeCoords && archetypeCoords.length > 0) {
    const coordsOrdenados = isVariantB ? [...archetypeCoords].reverse() : archetypeCoords;
    recorrido = coordsOrdenados.map((c) => ({ lat: c.lat, lng: c.lng }));
  }

  const corridor =
    CORRIDOR_MAP.find((c) => c.variantCode === codigo) ??
    CORRIDOR_MAP.find((c) => c.lineId === baseCodigo);

  return {
    codigo,
    numeroAPI: baseCodigo,
    nombre: corridor?.label ?? templateData?.title ?? `Línea ${baseCodigo} (${sentido})`,
    empresa: 'UCOT',
    sentido,
    origen: corridor?.terminalOrigen ?? paradas[0]?.nombre,
    destino: corridor?.terminalDestino ?? paradas[paradas.length - 1]?.nombre,
    terminalSalida: corridor?.terminalOrigen,
    terminalLlegada: corridor?.terminalDestino,
    varianteIdx: isVariantB ? 1 : 0,
    paradas,
    recorrido,
    desviosFijos: [],
    desviosTemporales: [],
    ultimaActualizacion: Timestamp.now(),
  };
}

/**
 * Obtiene datos de una VARIANTE específica (ej: '370a' para IDA, '370b' para VUELTA).
 * Si la variante no existe, intenta fallback al doc base (ej: '370').
 */
export async function getVariantData(variantCode: string): Promise<LineaUCOT | null> {
  const data = await getLineaData(variantCode);
  if (data && (data.paradas?.length > 0 || data.recorrido?.length > 0)) return data;

  // Fallback: doc base sin sufijo a/b
  const baseCodigo = variantCode.replace(/[ab]$/i, '');
  if (baseCodigo !== variantCode) {
    return getLineaData(baseCodigo);
  }
  return null;
}

/**
 * Obtiene los dos variantes (IDA + VUELTA) de una línea.
 */
export async function getLineVariants(baseLine: string): Promise<{
  ida: LineaUCOT | null;
  vuelta: LineaUCOT | null;
}> {
  const cleanBase = baseLine.replace(/[ab]$/i, '');
  const [ida, vuelta] = await Promise.all([
    getVariantData(`${cleanBase}a`),
    getVariantData(`${cleanBase}b`),
  ]);
  return { ida, vuelta };
}

/** Resumen de una variante para el selector. */
export interface LineaUCOTResumen {
  id: string;
  codigo: string;
  nombre: string;
  empresa?: string;
  origen?: string;
  destino?: string;
  sentido?: SentidoLinea;
}

/**
 * Lista todas las variantes UCOT.
 * Offline-first: si Firestore falla, genera la lista desde datos estáticos locales.
 * Fuentes: 1) Firestore lineas_ucot, 2) CORRIDOR_MAP, 3) ALL_UCOT_ROUTES (GeoServer IMM).
 */
export async function getLineasUCOT(): Promise<LineaUCOTResumen[]> {
  const firestoreMap = new Map<string, LineaUCOTResumen>();

  // 1. Intentar cargar desde el backend (tolerante a modo offline)
  try {
    const raw = await apiClient.get(`/api/db/${COL}`, { query: { limit: 5000 } }) as any[];
    const arr = Array.isArray(raw) ? raw : [];
    arr
      .filter((d: any) => d.id || d.codigo)
      .forEach((d: any) => {
        const id = String(d.id ?? d.codigo ?? '');
        if (!id) return;
        firestoreMap.set(id, {
          id,
          codigo: String(d?.codigo ?? id),
          nombre: String(d?.nombre ?? d?.codigo ?? id),
          empresa: d?.empresa != null ? String(d.empresa) : undefined,
          origen: d?.origen != null ? String(d.origen) : undefined,
          destino: d?.destino != null ? String(d.destino) : undefined,
          sentido: d?.sentido as SentidoLinea | undefined,
        });
      });
  } catch (backendError) {
    // Backend offline o sin permisos — continuamos con datos estáticos
    console.warn('[UCOT] Backend no disponible, usando datos locales:', backendError);
  }

  // 2. Generar lista completa con CORRIDOR_MAP + ALL_UCOT_ROUTES para origen/destino
  const result = new Map<string, LineaUCOTResumen>();

  for (const variantCode of LINEAS_UCOT_ALL) {
    const existing = firestoreMap.get(variantCode);
    const corridor = CORRIDOR_MAP.find((c) => c.variantCode === variantCode);
    const baseCodigo = variantCode.replace(/[ab]$/i, '');
    const isCompetitor = LINEAS_COMPETENCIA_BASE.includes(variantCode);

    if (isCompetitor) {
      result.set(
        variantCode,
        existing ?? {
          id: variantCode,
          codigo: variantCode,
          nombre: `Competencia: ${variantCode}`,
        },
      );
      continue;
    }

    const sentido: SentidoLinea = variantCode.endsWith('b') ? 'VUELTA' : 'IDA';

    // Obtener origen/destino desde multiples fuentes (prioridad: Firestore > GeoData > Corridor)
    let origen = existing?.origen || corridor?.terminalOrigen;
    let destino = existing?.destino || corridor?.terminalDestino;

    // Enriquecer con datos reales del GeoServer IMM (ALL_UCOT_ROUTES)
    const lineRoutes = ALL_UCOT_ROUTES[baseCodigo];
    if (lineRoutes && (!origen || !destino)) {
      const targetDesc = variantCode.endsWith('b') ? 'B' : 'A';
      const matchedVariant =
        Object.values(lineRoutes).find((v) => v.descVariante === targetDesc) ||
        Object.values(lineRoutes)[0];
      if (matchedVariant) {
        origen = origen || matchedVariant.origen;
        destino = destino || matchedVariant.destino;
      }
    }

    // Nombre descriptivo: "300 — Cementerio Central → Instrucciones (IDA)"
    const displayName =
      origen && destino
        ? `${baseCodigo} — ${origen} → ${destino} (${sentido})`
        : (corridor?.label ?? existing?.nombre ?? `Línea ${variantCode}`);

    result.set(variantCode, {
      id: variantCode,
      codigo: variantCode,
      nombre: displayName,
      empresa: 'UCOT',
      origen,
      destino,
      sentido,
    });
  }

  // 3. Agregar docs de Firestore que no están en LINEAS_UCOT_ALL (importaciones manuales)
  for (const [id, item] of firestoreMap) {
    if (!result.has(id)) {
      if (id.startsWith('linea-')) continue;
      // Bloqueo de IDs fantasma ya eliminados — no deben reaparecer desde Firestore
      if (/^(317|371|379)[a-z]?$/i.test(id)) continue;

      const tieneVarianteA = result.has(`${id}a`);
      const tieneVarianteB = result.has(`${id}b`);
      if (tieneVarianteA || tieneVarianteB) continue;

      const tieneEmpresaUCOT = String(item.empresa || '').toUpperCase() === 'UCOT';
      const esCodigoUCOT = LINEAS_UCOT_BASE.some(
        (base) => item.codigo === base || id.startsWith(base),
      );

      if (tieneEmpresaUCOT || (!item.empresa && esCodigoUCOT)) {
        result.set(id, { ...item, empresa: 'UCOT' });
      }
    }
  }

  const list = Array.from(result.values());
  list.sort((a, b) => {
    const c = a.codigo.localeCompare(b.codigo, undefined, { numeric: true });
    return c !== 0 ? c : (a.nombre || a.id).localeCompare(b.nombre || b.id);
  });
  return list;
}

/**
 * Fuerza re-fetch desde API Montevideo (vía proxy) y actualiza Firestore.
 * numeroAPI: número usado en la API (ej: "300", "CE1").
 */
export async function syncLineaFromAPI(codigo: string, numeroAPI: string): Promise<void> {
  // Detectar si es variante a/b
  const isVariantA = codigo.endsWith('a');
  const isVariantB = codigo.endsWith('b');
  const varianteIdx = isVariantB ? 1 : 0;
  const sentido: SentidoLinea = isVariantB ? 'VUELTA' : 'IDA';

  // Para variantes, intentar obtener recorrido específico por índice de variante
  // STM API: /recorrido/{linea}/{varianteIdx} diferencia IDA de VUELTA
  const recorridoEndpoint =
    isVariantA || isVariantB
      ? `transporteRest/infoTransporte/recorrido/${numeroAPI}/${varianteIdx}`
      : `transporteRest/infoTransporte/recorrido/${numeroAPI}`;

  const paradasEndpoint =
    isVariantA || isVariantB
      ? `transporteRest/infoTransporte/paradas/${numeroAPI}/${varianteIdx}`
      : `transporteRest/infoTransporte/paradas/${numeroAPI}`;

  const [lineaRes, paradasRes, recorridoRes] = await Promise.all([
    fetch(getProxyUrl(`transporteRest/infoTransporte/linea/${numeroAPI}`)).then((r) => r.json()),
    fetch(getProxyUrl(paradasEndpoint))
      .then((r) => r.json())
      .catch(() => []),
    fetch(getProxyUrl(recorridoEndpoint))
      .then((r) => r.json())
      .catch(() => []),
  ]);

  // Si el recorrido por variante falló, intentar fallback sin variante
  let finalRecorrido = recorridoRes;
  let finalParadas = paradasRes;

  if (
    (!Array.isArray(finalRecorrido) || finalRecorrido.length === 0) &&
    typeof finalRecorrido === 'object' &&
    !finalRecorrido?.coordinates &&
    !finalRecorrido?.geometry
  ) {
    // Fallback: fetch sin variante index
    try {
      finalRecorrido = await fetch(
        getProxyUrl(`transporteRest/infoTransporte/recorrido/${numeroAPI}`),
      ).then((r) => r.json());
    } catch {
      /* keep empty */
    }
  }

  if (!Array.isArray(finalParadas) || finalParadas.length === 0) {
    try {
      finalParadas = await fetch(
        getProxyUrl(`transporteRest/infoTransporte/paradas/${numeroAPI}`),
      ).then((r) => r.json());
    } catch {
      /* keep empty */
    }
  }

  const apiLinea = (
    typeof lineaRes === 'object' && lineaRes !== null ? lineaRes : { nombre: codigo }
  ) as Record<string, unknown>;

  const existing = await getLineaData(codigo);
  const desviosFijos = existing?.desviosFijos ?? [];
  const desviosTemporales = existing?.desviosTemporales ?? [];

  const partial = mapApiToLineaUCOT(
    codigo,
    numeroAPI,
    varianteIdx,
    apiLinea,
    finalParadas,
    finalRecorrido,
  );

  // Determinar origen/destino a partir de las paradas
  const primeraParada = partial.paradas[0]?.nombre || '';
  const ultimaParada = partial.paradas[partial.paradas.length - 1]?.nombre || '';

  const docData: LineaUCOT = {
    ...partial,
    sentido,
    origen: primeraParada || existing?.origen,
    destino: ultimaParada || existing?.destino,
    terminalSalida: primeraParada || existing?.terminalSalida,
    terminalLlegada: ultimaParada || existing?.terminalLlegada,
    desviosFijos,
    desviosTemporales,
    ultimaActualizacion: new Date().toISOString() as any,
  };

  await apiClient.put(`/api/db/${COL}/` + encodeURIComponent(codigo), {
    ...docData,
    empresa: 'UCOT', // Siempre etiquetar como UCOT al sincronizar desde este servicio
  });
}

/**
 * Sincroniza todas las líneas UCOT desde la API (una por una).
 * Retorna { synced, errors }.
 */
export async function syncAllLineasFromAPI(
  onProgress?: (current: number, total: number, codigo: string) => void,
): Promise<{ synced: number; errors: string[] }> {
  const total = LINEAS_UCOT_ALL.length;
  const errors: string[] = [];
  let synced = 0;

  for (let i = 0; i < LINEAS_UCOT_ALL.length; i++) {
    const codigo = LINEAS_UCOT_ALL[i];
    const numeroAPI = codigo.replace(/[ab]$/, '') || codigo;
    onProgress?.(i + 1, total, codigo);
    try {
      await syncLineaFromAPI(codigo, numeroAPI);
      synced++;
    } catch (e) {
      errors.push(`${codigo}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { synced, errors };
}
