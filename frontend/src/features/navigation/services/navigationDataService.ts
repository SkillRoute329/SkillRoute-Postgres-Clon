/**
 * navigationDataService — Wrapper para el Navegador estilo Waze.
 * ==============================================================
 * FUENTE ÚNICA: shapes estáticos en el bundle (shapesAllOperators.json).
 * Zero llamadas a Firestore en runtime — resuelve el bloqueo por
 * permission-denied en shapes_cross_operator (auditoría 2026-04-26).
 *
 * Política de fuentes (en orden de prioridad):
 *   1. crossOpShapesInjector — todos los operadores (JSON en el bundle).
 *   2. ucotShapesInjector — fallback adicional para UCOT (routeCache.json).
 *   3. linesService legacy — Firestore lineas_ucot como último recurso.
 */

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
import { LINE_ARCHETYPES } from '../../../data/lineTemplates';

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

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Catálogo de líneas para el dropdown del Navegador.
 * Prioridad: crossOpShapesInjector > ucotShapesInjector (UCOT) > linesService legacy.
 */
export async function getNavigationLineas(agencyId: number): Promise<LineaUCOTResumen[]> {
  // Fuente 1: shapes estáticos cross-operator (todos los operadores)
  const crossOp = listCrossOpLineasInyectadas(agencyId);

  // Fuente 2: routeCache UCOT (complementa para UCOT)
  const inyectadas = agencyId === 70 ? listUCOTLineasInyectadas().map(inyectadaToResumen) : [];

  // Fuente 3: legacy Firestore (solo si las estáticas no cubren nada)
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
 * Prioridad: crossOpShapesInjector > ucotShapesInjector (UCOT) > linesService legacy.
 */
export async function getNavigationLineaData(
  agencyId: number,
  codigo: string,
): Promise<LineaUCOT | null> {
  // 1. Shapes estáticos cross-operator
  const desdeShapes = getCrossOpLineaInyectada(agencyId, codigo);
  if (desdeShapes && desdeShapes.recorrido.length >= 3) return desdeShapes;

  // 2. routeCache estático UCOT
  if (agencyId === 70) {
    const inj = getUCOTLineaInyectada(codigo);
    if (inj && inj.recorrido.length >= 3) return inyectadaToLineaUCOT(inj);
  }

  // 3. Legacy linesService (Firestore lineas_ucot)
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
  return listCrossOpLineasInyectadas(agencyId).length > 0;
}

// Unused but kept for import compatibility with any existing callers
export { distribuirParadasSobreShape, haversineMetros };
