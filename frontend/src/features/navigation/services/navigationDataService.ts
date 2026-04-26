/**
 * navigationDataService — Wrapper para el Navegador estilo Waze.
 * ==============================================================
 * Sustituye las llamadas directas a `linesService.getLineas/getLineaData`
 * desde NavigationModule por una API que prioriza la INYECCIÓN ESTÁTICA
 * (datos en el bundle frontend) y la fuente unificada
 * `shapes_cross_operator` (poblada por shapeBuilder Cloud Function),
 * cayendo a los servicios legacy solo si las anteriores no cubren.
 *
 * Política de fuentes (en orden de prioridad):
 *   1. `shapes_cross_operator/{agencyId}_{linea}_{variante}` — fuente
 *      oficial generada por shapeBuilder desde GPS history real.
 *   2. Injector estático `routeCache.json` (solo UCOT) — fallback de
 *      mientras shapeBuilder se llena (24-72 h iniciales).
 *   3. linesService legacy (Firestore + lineTemplates).
 *
 * Independencia: una vez (1) tiene datos, el módulo funciona aunque la
 * IMM caiga, aunque no haya bundle nuevo, aunque el legacy esté vacío.
 */

import {
  collection,
  query,
  where,
  getDocs,
  getDocsFromServer,
  limit as limitDocs,
  doc,
  getDoc,
} from 'firebase/firestore';
import { db, auth } from '../../../config/firebase';
import type { LineaUCOT, ParadaUcot, PuntoLatLng, SentidoLinea } from '../../../types/lineasUcot';
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
import { LINE_ARCHETYPES } from '../../../data/lineTemplates';

const SHAPES_COL = 'shapes_cross_operator';

// Fuerza al Firestore SDK a sincronizar el auth token antes de cualquier query.
// Con persistentMultipleTabManager, el SDK puede no tener el token en cold start
// aunque Firebase Auth sí lo tenga — getIdToken() dispara la sincronización interna.
async function ensureAuthToken(): Promise<void> {
  if (auth.currentUser) {
    await auth.currentUser.getIdToken();
  }
}

const AGENCY_NAME: Record<number, string> = {
  10: 'COETC',
  20: 'COME',
  50: 'CUTCSA',
  70: 'UCOT',
};

// ─── Conversores ─────────────────────────────────────────────────────────────

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

/**
 * Distribuye paradas nominales del JSON Maestro sobre un shape arbitrario
 * proporcionalmente a la distancia haversine acumulada. Reusable para
 * shapes que vengan de `shapes_cross_operator` (sin paradas embebidas).
 */
function distribuirParadasSobreShape(
  recorrido: PuntoLatLng[],
  nombres: string[],
  reverse: boolean,
): ParadaUcot[] {
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

  const distAcum: number[] = [0];
  for (let i = 1; i < recorrido.length; i++) {
    distAcum.push(distAcum[i - 1] + haversineMetros(recorrido[i - 1], recorrido[i]));
  }
  const distTotal = distAcum[distAcum.length - 1];

  const ordenNombres = reverse ? [...nombres].reverse() : nombres;
  const N = ordenNombres.length;

  const paradas: ParadaUcot[] = [];
  for (let j = 0; j < N; j++) {
    const target = N === 1 ? 0 : (distTotal * j) / (N - 1);
    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < distAcum.length; i++) {
      const diff = Math.abs(distAcum[i] - target);
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

function haversineMetros(p1: PuntoLatLng, p2: PuntoLatLng): number {
  const R = 6371000;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Lectura desde shapes_cross_operator (fuente oficial) ───────────────────

/**
 * Devuelve TODOS los shapes de un operador desde shapes_cross_operator.
 * Si la colección está vacía o sin docs para ese operador, retorna [].
 */
async function fetchShapesCrossOperator(agencyId: number): Promise<LineaUCOTResumen[]> {
  try {
    await ensureAuthToken();
    const snap = await getDocsFromServer(
      query(
        collection(db, SHAPES_COL),
        where('agencyId', '==', String(agencyId)),
        limitDocs(2000),
      ),
    );
    const seen = new Set<string>();
    const out: LineaUCOTResumen[] = [];
    snap.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      const linea = String(data.linea ?? '').trim();
      const variante = (data.variante as number | undefined) ?? null;
      const sentidoRaw = String(data.sentido ?? 'IDA').toUpperCase();
      const sentido: 'IDA' | 'VUELTA' = sentidoRaw === 'VUELTA' ? 'VUELTA' : 'IDA';
      if (!linea) return;

      // ID del resumen: usa el doc ID (agencyId_linea_variante) para preservar
      // la variante. Para retro-compat con NavigationModule (que espera
      // sufijo a/b), generamos también un codigo legacy.
      const codigoLegacy = sentido === 'VUELTA' ? `${linea}b` : `${linea}a`;
      const seenKey = `${linea}_${variante ?? sentido}`;
      if (seen.has(seenKey)) return;
      seen.add(seenKey);

      out.push({
        id: d.id,
        codigo: codigoLegacy,
        nombre:
          data.origen && data.destino
            ? `${linea} · ${data.origen} → ${data.destino}`
            : `Línea ${linea} (${sentido})`,
        empresa: AGENCY_NAME[agencyId] ?? `Empresa ${agencyId}`,
        origen: typeof data.origen === 'string' ? data.origen : undefined,
        destino: typeof data.destino === 'string' ? data.destino : undefined,
        sentido,
      });
    });
    return out.sort((a, b) =>
      a.codigo.localeCompare(b.codigo, undefined, { numeric: true }),
    );
  } catch (err) {
    console.error(`[navigationDataService] fetchShapesCrossOperator(${agencyId}) falló:`, err);
    return [];
  }
}

/**
 * Devuelve un shape específico de shapes_cross_operator para línea+sentido.
 * Si hay múltiples variantes con el mismo sentido, toma la de mayor
 * `puntosSimplificados` (la más completa).
 */
async function fetchShapeForLinea(
  agencyId: number,
  codigo: string,
): Promise<LineaUCOT | null> {
  const baseCodigo = codigo.replace(/[ab]$/i, '');
  const sentidoFiltro: 'IDA' | 'VUELTA' = codigo.endsWith('b') ? 'VUELTA' : 'IDA';

  try {
    await ensureAuthToken();
    const snap = await getDocsFromServer(
      query(
        collection(db, SHAPES_COL),
        where('agencyId', '==', String(agencyId)),
        where('linea', '==', baseCodigo),
        limitDocs(20),
      ),
    );
    if (snap.empty) return null;

    const candidatos = snap.docs
      .map((d) => ({ data: d.data() as Record<string, unknown>, id: d.id }))
      .filter((c) => {
        const s = String(c.data.sentido ?? 'IDA').toUpperCase();
        return s === sentidoFiltro;
      })
      .sort((a, b) => {
        const pa = (a.data.puntosSimplificados as number | undefined) ?? 0;
        const pb = (b.data.puntosSimplificados as number | undefined) ?? 0;
        return pb - pa;
      });

    if (candidatos.length === 0) return null;

    const elegido = candidatos[0];
    const points = (elegido.data.points as Array<{ lat: number; lng: number }> | undefined) ?? [];
    if (points.length === 0) return null;

    const recorrido: PuntoLatLng[] = points.map((p) => ({ lat: p.lat, lng: p.lng }));
    const archetype = LINE_ARCHETYPES[baseCodigo] as { headers?: string[] } | undefined;
    const nombresParadas = archetype?.headers ?? [];
    const paradas = distribuirParadasSobreShape(
      recorrido,
      nombresParadas,
      sentidoFiltro === 'VUELTA',
    );

    const ahora = new Date();
    return {
      codigo,
      numeroAPI: baseCodigo,
      nombre:
        elegido.data.origen && elegido.data.destino
          ? `${baseCodigo} · ${elegido.data.origen} → ${elegido.data.destino}`
          : `Línea ${baseCodigo}`,
      empresa: AGENCY_NAME[agencyId] ?? `Empresa ${agencyId}`,
      sentido: sentidoFiltro as SentidoLinea,
      origen: typeof elegido.data.origen === 'string' ? elegido.data.origen : undefined,
      destino: typeof elegido.data.destino === 'string' ? elegido.data.destino : undefined,
      terminalSalida: typeof elegido.data.origen === 'string' ? elegido.data.origen : undefined,
      terminalLlegada: typeof elegido.data.destino === 'string' ? elegido.data.destino : undefined,
      varianteIdx: sentidoFiltro === 'VUELTA' ? 1 : 0,
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
  } catch (err) {
    console.error(`[navigationDataService] fetchShapeForLinea(${agencyId}, ${codigo}) falló:`, err);
    return null;
  }
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Catálogo de líneas para el dropdown del Navegador.
 * Mergea (en orden de prioridad):
 *   1. shapes_cross_operator (fuente oficial — shapeBuilder)
 *   2. routeCache estático (solo UCOT)
 *   3. linesService legacy
 */
export async function getNavigationLineas(agencyId: number): Promise<LineaUCOTResumen[]> {
  const [crossOp, legacy] = await Promise.all([
    fetchShapesCrossOperator(agencyId),
    getLineasByAgency(agencyId).catch(() => [] as LineaUCOTResumen[]),
  ]);

  const inyectadas = agencyId === 70 ? listUCOTLineasInyectadas().map(inyectadaToResumen) : [];

  // Merge: prioridad crossOp > inyectadas > legacy. Dedupe por codigo.
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
 * Prioridad:
 *   1. shapes_cross_operator (oficial, GPS-derived)
 *   2. routeCache injector (solo UCOT, fallback estático)
 *   3. linesService legacy
 */
export async function getNavigationLineaData(
  agencyId: number,
  codigo: string,
): Promise<LineaUCOT | null> {
  // 1. Shapes oficiales desde GPS history
  const desdeShapes = await fetchShapeForLinea(agencyId, codigo);
  if (desdeShapes && desdeShapes.recorrido.length >= 3) return desdeShapes;

  // 2. Injector estático para UCOT
  if (agencyId === 70) {
    const inj = getUCOTLineaInyectada(codigo);
    if (inj && inj.recorrido.length >= 3) return inyectadaToLineaUCOT(inj);
  }

  // 3. Legacy linesService
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
 * Indica si un doc en shapes_cross_operator existe para el operador.
 * Útil para mostrar "Datos en construcción" mientras shapeBuilder se llena.
 */
export async function hayShapesParaOperador(agencyId: number): Promise<boolean> {
  try {
    await ensureAuthToken();
    const snap = await getDocsFromServer(
      query(
        collection(db, SHAPES_COL),
        where('agencyId', '==', String(agencyId)),
        limitDocs(1),
      ),
    );
    return !snap.empty;
  } catch (err) {
    console.error(`[navigationDataService] hayShapesParaOperador(${agencyId}) falló:`, err);
    return false;
  }
}

