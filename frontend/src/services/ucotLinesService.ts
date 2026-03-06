/**
 * Servicio de datos para el Navegador UCOT.
 * Offline-first: lee desde Firestore; sincronización con API Montevideo vía proxy.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { LineaUCOT, ParadaUcot, PuntoLatLng } from '../types/lineasUcot';

const COL = 'lineas_ucot';
const PROXY_BASE = 'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/montevideoProxy';

/** Códigos de línea UCOT a sincronizar. */
export const LINEAS_UCOT_BASE = ['300', '306', '316', '317', '328', 'CE1'];

/** Líneas de la COMPETENCIA para inteligencia de mercado. */
export const LINEAS_COMPETENCIA_BASE = ['103', '110', '128', '169', '185', '505', '522'];

/** Lista completa de códigos con variantes (para selector). */
export const LINEAS_UCOT_ALL = ((): string[] => {
  const out: string[] = [];
  // UCOT Lines
  for (const base of LINEAS_UCOT_BASE) {
    if (base === 'CE1') {
      out.push('CE1');
    } else {
      out.push(`${base}a`, `${base}b`);
    }
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
 * Extrae lat/lng de un nodo (parada o punto). Soporta:
 * - lat/lng, latitude/longitude, latitud/longitud, lon
 * - geometry.coordinates (GeoJSON: [lng, lat])
 */
function extractLatLng(p: Record<string, unknown>): { lat: number; lng: number } {
  const geom = p.geometry as { coordinates?: [number, number] } | undefined;
  if (geom && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
    const [lng, lat] = geom.coordinates;
    return { lat: Number(lat), lng: Number(lng) };
  }
  const lat = Number(p.lat ?? p.latitude ?? (p as Record<string, unknown>).latitud ?? 0);
  const lng = Number(p.lng ?? p.longitude ?? (p as Record<string, unknown>).longitud ?? p.lon ?? 0);
  return { lat, lng };
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
      recorrido = (apiRecorrido as [number, number][]).map(([lng, lat]) => ({
        lat: Number(lat),
        lng: Number(lng),
      }));
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
        recorrido = (list as [number, number][]).map(([lng, lat]) => ({
          lat: Number(lat),
          lng: Number(lng),
        }));
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

/** Tipo para ingesta desde archivo (ultimaActualizacion se asigna al escribir con serverTimestamp). */
export type LineaUCOTParaEscritura = Omit<LineaUCOT, 'ultimaActualizacion'> & {
  ultimaActualizacion?: ReturnType<typeof serverTimestamp>;
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
 * Escribe líneas en Firestore (lineas_ucot) en lotes de 500 con writeBatch.
 */
export async function writeLineasUCOTInBatches(
  lineas: LineaUCOTParaEscritura[],
  onProgress?: (written: number, total: number) => void,
): Promise<{ written: number; errors: string[] }> {
  const errors: string[] = [];
  let written = 0;
  for (let offset = 0; offset < lineas.length; offset += BATCH_SIZE_STM) {
    const chunk = lineas.slice(offset, offset + BATCH_SIZE_STM);
    const batch = writeBatch(db);
    for (const linea of chunk) {
      const ref = doc(db, COL, linea.codigo);
      batch.set(ref, { ...linea, ultimaActualizacion: serverTimestamp() }, { merge: true });
    }
    try {
      await batch.commit();
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
 * Pre-carga datos de una línea desde Firestore (offline-first).
 */
export async function getLineaData(codigo: string): Promise<LineaUCOT | null> {
  const ref = doc(db, COL, codigo);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as LineaUCOT;
}

/** Resumen de una variante para el selector (id = doc id = variantId). */
export interface LineaUCOTResumen {
  id: string;
  codigo: string;
  nombre: string;
  empresa?: string;
  origen?: string;
  destino?: string;
}

/**
 * Lista todas las variantes UCOT en Firestore (cada una = línea + origen + destino).
 */
export async function getLineasUCOT(): Promise<LineaUCOTResumen[]> {
  const snap = await getDocs(collection(db, COL));
  const list: LineaUCOTResumen[] = snap.docs
    .filter((d) => d.id)
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        codigo: String(data?.codigo ?? d.id),
        nombre: String(data?.nombre ?? data?.codigo ?? d.id),
        empresa: data?.empresa != null ? String(data.empresa) : undefined,
        origen: data?.origen != null ? String(data.origen) : undefined,
        destino: data?.destino != null ? String(data.destino) : undefined,
      };
    });
  list.sort((a, b) => {
    const c = a.codigo.localeCompare(b.codigo, undefined, { numeric: true });
    return c !== 0 ? c : (a.nombre || a.id).localeCompare(b.nombre || b.id);
  });
  if (list.length > 0) return list;
  return LINEAS_UCOT_ALL.map((c) => ({
    id: c,
    codigo: c,
    nombre: /^\d+[ab]?$/i.test(c) ? `Línea ${c}` : c,
  }));
}

/**
 * Fuerza re-fetch desde API Montevideo (vía proxy) y actualiza Firestore.
 * numeroAPI: número usado en la API (ej: "300", "CE1").
 */
export async function syncLineaFromAPI(codigo: string, numeroAPI: string): Promise<void> {
  const [lineaRes, paradasRes, recorridoRes] = await Promise.all([
    fetch(getProxyUrl(`transporteRest/infoTransporte/linea/${numeroAPI}`)).then((r) => r.json()),
    fetch(getProxyUrl(`transporteRest/infoTransporte/paradas/${numeroAPI}`)).then((r) => r.json()),
    fetch(getProxyUrl(`transporteRest/infoTransporte/recorrido/${numeroAPI}`)).then((r) =>
      r.json(),
    ),
  ]);

  const apiLinea = (
    typeof lineaRes === 'object' && lineaRes !== null ? lineaRes : { nombre: codigo }
  ) as Record<string, unknown>;

  const existing = await getLineaData(codigo);
  const desviosFijos = existing?.desviosFijos ?? [];
  const desviosTemporales = existing?.desviosTemporales ?? [];

  const partial = mapApiToLineaUCOT(codigo, numeroAPI, 0, apiLinea, paradasRes, recorridoRes);
  const docData: LineaUCOT = {
    ...partial,
    desviosFijos,
    desviosTemporales,
    ultimaActualizacion: serverTimestamp() as LineaUCOT['ultimaActualizacion'],
  };

  await setDoc(doc(db, COL, codigo), docData, { merge: true });
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
