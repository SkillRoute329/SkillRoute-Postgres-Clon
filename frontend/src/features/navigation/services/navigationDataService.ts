/**
 * navigationDataService — Wrapper para el Navegador estilo Waze.
 * ==============================================================
 * Política de fuentes (en orden de prioridad):
 *   1. shapes_cross_operator (Firestore, GTFS oficial) — datos oficiales, actualizados semanalmente por gtfsImportTick.
 *   2. crossOpShapesInjector — JSON bundle (fallback offline / DEMO_MODE sin auth).
 *   3. ucotShapesInjector — routeCache UCOT (fallback adicional para UCOT).
 *   4. linesService legacy — Firestore lineas_ucot como último recurso.
 */

import { collection, getDocs, query, where, orderBy, limit, getDoc, doc } from '../../../config/firestoreShim';
import { db } from '../../../config/firebase';
import { getToken } from '../../../utils/tokenStore';
import type { LineaUCOT, SentidoLinea } from '../../../types/lineasUcot';
import {
  getLineasByAgency,
  getLineaDataByAgency,
  type LineaUCOTResumen,
} from '../../../services/linesService';
import {
  getUCOTLineaInyectada,
  listUCOTLineasInyectadas,
  type InjectedLinea,
} from '../data/ucotShapesInjector';
import {
  getCrossOpLineaInyectada,
  listCrossOpLineasInyectadas,
} from '../data/crossOpShapesInjector';
import type { ParadaUcot, PuntoLatLng } from '../../../types/lineasUcot';
import { distanciaMetros } from '../../../utils/geomath';
import { LINE_ARCHETYPES } from '../../../data/lineTemplates';
import api from '../../../services/api';

const ABSOLUTE_API_URL = '/api';

const AGENCY_NAME: Record<number, string> = {
  10: 'COETC',
  20: 'COME',
  50: 'CUTCSA',
  70: 'UCOT',
};

// ─── Conversor ucotShapesInjector → LineaUCOT ────────────────────────────────

function inyectadaToLineaUCOT(inj: InjectedLinea): LineaUCOT {
  const ahora = new Date();
  const recorrido: PuntoLatLng[] = inj.recorrido.map((p) => ({ lat: p.lat, lng: p.lng }));
  const paradas: ParadaUcot[] = inj.paradas.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    lat: p.lat,
    lng: p.lng,
    orden: p.orden,
  }));
  return {
    codigo: inj.codigo,
    numeroAPI: inj.baseCodigo,
    nombre: `${inj.baseCodigo} · ${inj.origen ?? ''} → ${inj.destino ?? ''}`,
    empresa: 'UCOT',
    sentido: inj.sentido as SentidoLinea,
    origen: inj.origen,
    destino: inj.destino,
    terminalSalida: inj.origen,
    terminalLlegada: inj.destino,
    varianteIdx: inj.sentido === 'VUELTA' ? 1 : 0,
    paradas,
    recorrido,
    desviosFijos: [],
    desviosTemporales: [],
    ultimaActualizacion: {
      toDate: () => ahora,
      toMillis: () => ahora.getTime(),
      seconds: Math.floor(ahora.getTime() / 1000),
      nanoseconds: 0,
    } as unknown as LineaUCOT['ultimaActualizacion'],
  };
}

function inyectadaToResumen(
  inj: ReturnType<typeof listUCOTLineasInyectadas>[number],
): LineaUCOTResumen {
  return {
    id: inj.codigo,
    codigo: inj.codigo,
    nombre:
      inj.origen && inj.destino
        ? `${inj.baseCodigo} · ${inj.origen} → ${inj.destino}`
        : `Línea ${inj.baseCodigo}`,
    empresa: 'UCOT',
    origen: inj.origen,
    destino: inj.destino,
    sentido: inj.sentido,
  };
}

// ─── Helpers (usados por linesService legacy fallback) ───────────────────────

// FASE 5.16: delega en utils/geomath (fuente única). API local intacta.
function haversineMetros(p1: PuntoLatLng, p2: PuntoLatLng): number {
  return distanciaMetros(p1, p2);
}

function distribuirParadasSobreShape(
  recorrido: PuntoLatLng[],
  nombres: string[],
  reverse: boolean,
): ParadaUcot[] {
  if (recorrido.length === 0 || nombres.length === 0) return [];
  if (recorrido.length === 1) {
    return [{ id: 'p1', nombre: nombres[0], lat: recorrido[0].lat, lng: recorrido[0].lng, orden: 1 }];
  }
  const distAcum: number[] = [0];
  for (let i = 1; i < recorrido.length; i++) {
    distAcum.push(distAcum[i - 1] + haversineMetros(recorrido[i - 1], recorrido[i]));
  }
  const distTotal = distAcum[distAcum.length - 1];
  const ordenNombres = reverse ? [...nombres].reverse() : nombres;
  const N = ordenNombres.length;
  return ordenNombres.map((nombre, j) => {
    const target = N === 1 ? 0 : (distTotal * j) / (N - 1);
    let bestIdx = 0, bestDiff = Infinity;
    for (let i = 0; i < distAcum.length; i++) {
      const diff = Math.abs(distAcum[i] - target);
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    }
    return { id: `p${j + 1}`, nombre, lat: recorrido[bestIdx].lat, lng: recorrido[bestIdx].lng, orden: j + 1 };
  });
}

// ─── Firestore shapes_cross_operator ────────────────────────────────────────

const SHAPES_COL = 'shapes_cross_operator';
const STOPS_COL = 'gtfs_stops';

function mockTimestamp(d: Date): LineaUCOT['ultimaActualizacion'] {
  return {
    toDate: () => d,
    toMillis: () => d.getTime(),
    seconds: Math.floor(d.getTime() / 1000),
    nanoseconds: 0,
  } as unknown as LineaUCOT['ultimaActualizacion'];
}

interface FirestoreShape {
  agencyId: string | number;
  empresa: string;
  linea: string;
  routeLongName?: string;
  variante?: number;
  sentido: 'IDA' | 'VUELTA';
  // GPS-derived docs usan { lat, lon }; GTFS importer usa { lat, lng }
  points: Array<{ lat: number; lng?: number; lon?: number }>;
  stopIds?: string[]; // IDs ordenados de paradas GTFS (pobla gtfsImporter.ts semanal)
  fuente?: string;
  generadoEn?: unknown;
}

function firestoreShapeToLinea(
  docId: string,
  data: FirestoreShape,
  codigoNav: string,
  agencyId: number,
): LineaUCOT {
  const ahora = new Date();
  const recorrido: PuntoLatLng[] = data.points.map((p) => ({
    lat: p.lat,
    lng: p.lng ?? p.lon ?? 0,
  }));
  const baseCodigo = String(data.linea ?? '').trim();
  const archetype = (LINE_ARCHETYPES as Record<string, { headers?: string[] }>)[baseCodigo];
  const nombres = archetype?.headers ?? [];
  const paradas = distribuirParadasSobreShape(recorrido, nombres, data.sentido === 'VUELTA');

  return {
    codigo: codigoNav,
    numeroAPI: baseCodigo,
    nombre: `${baseCodigo} · ${data.sentido}`,
    empresa: data.empresa,
    sentido: data.sentido as SentidoLinea,
    terminalSalida: undefined,
    terminalLlegada: undefined,
    varianteIdx: data.sentido === 'VUELTA' ? 1 : 0,
    paradas,
    recorrido,
    desviosFijos: [],
    desviosTemporales: [],
    ultimaActualizacion: mockTimestamp(ahora),
    _docId: docId,
  } as unknown as LineaUCOT;
}

/** Lista todas las líneas de un operador desde Firestore (shapes_cross_operator). */
async function firestoreLineas(agencyId: number): Promise<LineaUCOTResumen[]> {
  try {
    const q = query(
      collection(db, SHAPES_COL),
      where('agencyId', '==', String(agencyId)),
      orderBy('linea'),
      limit(1500),
    );
    const snap = await getDocs(q);
    if (snap.empty) return [];

    // Deduplicar por linea+sentido (pueden existir docs con naming distinto)
    const seen = new Set<string>();
    const result: LineaUCOTResumen[] = [];
    for (const d of snap.docs) {
      const data = d.data() as FirestoreShape;
      const sentido: 'IDA' | 'VUELTA' = data.sentido ?? 'IDA';
      const key = `${String(data.linea).toLowerCase()}-${sentido}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const codigoNav = sentido === 'VUELTA' ? `${data.linea}b` : `${data.linea}a`;
      const nombreDisplay = data.routeLongName
        ? `${data.linea} — ${data.routeLongName}`
        : `${data.linea} · ${sentido}`;
      result.push({
        id: d.id,
        codigo: codigoNav,
        nombre: nombreDisplay,
        empresa: data.empresa,
        sentido,
        origen: data.routeLongName?.split(/[-–—]/)[0]?.trim(),
        destino: data.routeLongName?.split(/[-–—]/)[1]?.trim(),
      } as LineaUCOTResumen);
    }
    return result;
  } catch {
    return [];
  }
}

/** Convierte datos crudos de Firestore en LineaUCOT — con manejo de errores aislado. */
function shapeRawToLinea(
  docId: string,
  raw: Record<string, unknown>,
  sentido: 'IDA' | 'VUELTA',
  codigo: string,
): LineaUCOT | null {
  try {
    const ahora = new Date();
    const pts = Array.isArray(raw['points']) ? (raw['points'] as Array<Record<string, number>>) : [];
    if (pts.length < 3) return null;
    const recorrido: PuntoLatLng[] = pts.map((p) => ({
      lat: Number(p['lat']) || 0,
      lng: Number(p['lng'] ?? p['lon']) || 0,
    }));
    const linea = String(raw['linea'] ?? '').trim();
    const empresa = String(raw['empresa'] ?? '');
    const archetype = (LINE_ARCHETYPES as Record<string, { headers?: string[] } | undefined>)[linea];
    const nombres = archetype?.headers ?? [];
    const paradas = distribuirParadasSobreShape(recorrido, nombres, sentido === 'VUELTA');
    return {
      codigo,
      numeroAPI: linea,
      nombre: `${linea} · ${sentido}`,
      empresa,
      sentido: sentido as SentidoLinea,
      terminalSalida: undefined,
      terminalLlegada: undefined,
      varianteIdx: sentido === 'VUELTA' ? 1 : 0,
      paradas,
      recorrido,
      desviosFijos: [],
      desviosTemporales: [],
      ultimaActualizacion: mockTimestamp(ahora),
      _docId: docId,
    } as unknown as LineaUCOT;
  } catch {
    return null;
  }
}

/**
 * Enriquece las paradas de una línea con nombres y coordenadas reales
 * desde gtfs_stops. Si el shape doc tiene stopIds (poblado por gtfsImporter),
 * las paradas genéticas de distribuirParadasSobreShape se reemplazan con
 * las paradas oficiales del GTFS.
 */
async function enrichParadasFromStops(linea: LineaUCOT, stopIds: string[]): Promise<LineaUCOT> {
  if (!stopIds.length) return linea;
  try {
    const CHUNK = 10;
    const fetched: ParadaUcot[] = [];
    for (let i = 0; i < stopIds.length; i += CHUNK) {
      const chunk = stopIds.slice(i, i + CHUNK);
      const snaps = await Promise.all(chunk.map(id => getDoc(doc(db, STOPS_COL, id))));
      for (const snap of snaps) {
        if (!snap.exists()) continue;
        const d = snap.data();
        fetched.push({
          id: snap.id,
          nombre: String(d['nombre'] || snap.id),
          lat: Number(d['lat']) || 0,
          lng: Number(d['lng']) || 0,
          orden: 0,
        } as ParadaUcot);
      }
    }
    // Reordenar según la secuencia original de stopIds
    const paradas: ParadaUcot[] = [];
    for (let i = 0; i < stopIds.length; i++) {
      const p = fetched.find(f => f.id === stopIds[i]);
      if (p) paradas.push({ ...p, orden: i + 1 });
    }
    if (paradas.length < 2) return linea;
    return { ...linea, paradas };
  } catch {
    return linea; // fallback silencioso — mejor paradas genéricas que error
  }
}

/** Obtiene el shape de una línea/sentido desde Firestore. */
async function firestoreLineaData(agencyId: number, codigo: string): Promise<LineaUCOT | null> {
  const baseCodigo = String(codigo).replace(/[ab]$/i, '').trim();
  const sentido: 'IDA' | 'VUELTA' = String(codigo).toLowerCase().endsWith('b') ? 'VUELTA' : 'IDA';
  const directionId = sentido === 'VUELTA' ? 1 : 0;

  // Prueba los dos formatos de docId conocidos: underscore (GTFS/GPS) y dash (legacy)
  const candidateIds = [
    `${agencyId}_${baseCodigo}_${directionId}`,  // 50_100_0
    `${agencyId}-${baseCodigo}-${sentido}`,       // 50-100-IDA
  ];

  for (const tryId of candidateIds) {
    try {
      const snap = await getDoc(doc(db, SHAPES_COL, tryId));
      if (!snap.exists()) continue;
      const raw = snap.data() as Record<string, unknown>;
      const result = shapeRawToLinea(tryId, raw, sentido, codigo);
      if (!result) continue;
      const stopIds = Array.isArray(raw['stopIds']) ? (raw['stopIds'] as string[]) : [];
      return stopIds.length >= 2 ? enrichParadasFromStops(result, stopIds) : result;
    } catch { continue; }
  }

  // Query fallback: busca por agencyId + linea (índice 2 campos existente), filtra sentido en JS
  try {
    const q = query(
      collection(db, SHAPES_COL),
      where('agencyId', '==', String(agencyId)),
      where('linea', '==', baseCodigo),
      limit(6),
    );
    const qs = await getDocs(q);
    for (const d of qs.docs) {
      try {
        const raw = d.data() as Record<string, unknown>;
        const docSentido = String(raw['sentido'] ?? '');
        if (docSentido && docSentido !== sentido) continue;
        const result = shapeRawToLinea(d.id, raw, sentido, codigo);
        if (!result) continue;
        const stopIds = Array.isArray(raw['stopIds']) ? (raw['stopIds'] as string[]) : [];
        return stopIds.length >= 2 ? enrichParadasFromStops(result, stopIds) : result;
      } catch { continue; }
    }
  } catch { /* fallthrough */ }

  return null;
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Catálogo de líneas para el dropdown del Navegador.
 * Prioridad: shapes_cross_operator (Firestore GTFS) > crossOpShapesInjector (JSON) > ucotShapesInjector > linesService legacy.
 */
export async function getNavigationLineas(agencyId: number): Promise<LineaUCOTResumen[]> {
  // SOBERANIA TOTAL: Fuente 1: Backend SQL local (Exacto y Seguro)
  try {
    const token = getToken();
    const resRaw = await fetch(`${ABSOLUTE_API_URL}/gtfs/lines?agencyId=${agencyId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (resRaw.ok) {
      const resData = await resRaw.json();
      const lines = resData.data || [];
      if (lines.length > 0) {
        const sqlResult: LineaUCOTResumen[] = [];
        for (const l of lines) {
          const baseCod = String(l.codigo).trim();
          const name = l.nombre || `${baseCod}`;
          const nameParts = name.split(/[-–—]/);
          const origen = nameParts[0]?.trim();
          const destino = nameParts[nameParts.length - 1]?.trim();

          sqlResult.push({
            id: `${baseCod}a`,
            codigo: `${baseCod}a`,
            nombre: name,
            empresa: AGENCY_NAME[agencyId] || '',
            sentido: 'IDA',
            origen,
            destino
          });
          sqlResult.push({
            id: `${baseCod}b`,
            codigo: `${baseCod}b`,
            nombre: name,
            empresa: AGENCY_NAME[agencyId] || '',
            sentido: 'VUELTA',
            origen: destino, // Flip labels for visual convenience
            destino: origen
          });
        }
        return sqlResult;
      }
    }
  } catch (err) {
    console.warn('[NavigationDataService] Failed fetching lines via absolute fetch:', err);
  }

  // Fuente 2: shapes_cross_operator Firestore (Legacy)
  const desdeFirestore = await firestoreLineas(agencyId);
  if (desdeFirestore.length > 0) return desdeFirestore;

  // Fuente 2: shapes estáticos cross-operator (JSON bundle — fallback offline/DEMO_MODE)
  const crossOp = await listCrossOpLineasInyectadas(agencyId);

  // Fuente 3: routeCache UCOT (complementa para UCOT)
  const inyectadas = agencyId === 70 ? listUCOTLineasInyectadas().map(inyectadaToResumen) : [];

  // Fuente 4: legacy Firestore lineas_ucot (último recurso)
  let legacy: LineaUCOTResumen[] = [];
  if (crossOp.length === 0 && inyectadas.length === 0) {
    legacy = await getLineasByAgency(agencyId).catch(() => []);
  }

  // Merge con deduplicación por codigo (prioridad crossOp > inyectadas > legacy)
  const result: LineaUCOTResumen[] = [];
  const seen = new Set<string>();
  for (const lst of [crossOp, inyectadas, legacy]) {
    for (const l of lst) {
      const key = String(l.codigo).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(l);
    }
  }

  return result.sort((a, b) =>
    a.codigo.localeCompare(b.codigo, undefined, { numeric: true }),
  );
}

/**
 * Detalle de línea (recorrido + paradas) — dato que consume el RouteMap.
 * Prioridad: shapes_cross_operator (Firestore GTFS) > crossOpShapesInjector (JSON) > ucotShapesInjector > linesService legacy.
 */
export async function getNavigationLineaData(
  agencyId: number,
  codigo: string,
): Promise<LineaUCOT | null> {
  // SOBERANIA TOTAL: Fuente 1: Local Backend SQL via Direct Absolute Call
  try {
    const baseCodigo = String(codigo).replace(/[ab]$/i, '').trim();
    const sentidoStr: 'IDA' | 'VUELTA' = String(codigo).toLowerCase().endsWith('b') ? 'VUELTA' : 'IDA';
    const directionId = sentidoStr === 'VUELTA' ? 1 : 0;

    const token = getToken();
    const resRaw = await fetch(`${ABSOLUTE_API_URL}/gtfs/geometry?agencyId=${agencyId}&linea=${baseCodigo}&directionId=${directionId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (resRaw.ok) {
      const resData = await resRaw.json();
      const data = resData.data;
      if (data && data.recorrido && data.recorrido.length >= 2) {
        console.warn('[DEBUG NAV DATA] Loaded PostgreSQL geometry via Direct Pipe:', baseCodigo);
        const ahora = new Date();
        return {
          codigo,
          numeroAPI: baseCodigo,
          nombre: `${baseCodigo} · ${sentidoStr}`,
          empresa: AGENCY_NAME[agencyId] || '',
          sentido: sentidoStr as SentidoLinea,
          recorrido: data.recorrido,
          paradas: data.paradas,
          desviosFijos: [],
          desviosTemporales: [],
          ultimaActualizacion: mockTimestamp(ahora),
        } as unknown as LineaUCOT;
      }
    }
  } catch (err) {
    console.warn('[NavigationDataService] SQL Geometry ABSOLUTE FETCH ERROR:', err);
  }

  // 2. shapes_cross_operator Firestore (GTFS oficial legacy)
  const desdeFirestore = await firestoreLineaData(agencyId, codigo);
  if (desdeFirestore) return desdeFirestore;

  // 2. Shapes estáticos cross-operator (JSON bundle fallback)
  const desdeShapes = await getCrossOpLineaInyectada(agencyId, codigo);
  if (desdeShapes && desdeShapes.recorrido.length >= 3) return desdeShapes;

  // 3. routeCache estático UCOT
  if (agencyId === 70) {
    const inj = getUCOTLineaInyectada(codigo);
    if (inj && inj.recorrido.length >= 3) return inyectadaToLineaUCOT(inj);
  }

  // 4. Legacy linesService (Firestore lineas_ucot)
  try {
    return await getLineaDataByAgency(agencyId, codigo);
  } catch {
    return null;
  }
}

/**
 * Etiqueta de empresa en español.
 */
export function getEmpresaLabel(agencyId: number): string {
  return AGENCY_NAME[agencyId] ?? `Empresa ${agencyId}`;
}

/**
 * Con shapes estáticos, siempre hay datos para cualquier operador en scope.
 */
export async function hayShapesParaOperador(agencyId: number): Promise<boolean> {
  return (await listCrossOpLineasInyectadas(agencyId)).length > 0;
}

// Unused but kept for import compatibility with any existing callers
export { distribuirParadasSobreShape, haversineMetros };
