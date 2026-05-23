/**
 * crossOpShapesInjector — shapes estáticos para todos los operadores (10/20/50/70).
 * ==================================================================================
 * Fuente: `frontend/src/data/shapesAllOperators.json`
 * Generado por: `node scripts/dump_shapes_to_json.cjs` (Firebase Admin SDK)
 * Zero llamadas a Firestore en runtime — los shapes van en el bundle.
 */

import type { LineaUCOT, ParadaUcot, PuntoLatLng, SentidoLinea } from '../../../types/lineasUcot';
import type { LineaUCOTResumen } from '../../../services/linesService';
import { LINE_ARCHETYPES } from '../../../data/lineTemplates';
import { distanciaMetros } from '../../../utils/geomath';

// ─── Tipos internos ──────────────────────────────────────────────────────────

interface ShapeEntry {
  agencyId: string | null;
  linea: string;
  sentido: string;
  variante: number | null;
  origen: string | null;
  destino: string | null;
  points: Array<{ lat: number; lng: number }>;
  paradas: Array<{ lat: number; lng: number; nombre: string | null }>;
}

// Lazy-loading cache — el JSON (9.7 MB) se descarga solo cuando se necesita,
// no en el bundle inicial. La promesa se crea una sola vez y se reutiliza.
let _shapesCache: Record<string, ShapeEntry> | null = null;
let _shapesPromise: Promise<Record<string, ShapeEntry>> | null = null;

function getShapes(): Promise<Record<string, ShapeEntry>> {
  if (_shapesCache) return Promise.resolve(_shapesCache);
  if (_shapesPromise) return _shapesPromise;
  _shapesPromise = import('../../../data/shapesAllOperators.json').then((mod) => {
    _shapesCache = mod.default as Record<string, ShapeEntry>;
    return _shapesCache;
  });
  return _shapesPromise;
}

const AGENCY_NAME: Record<number, string> = {
  10: 'COETC',
  20: 'COME',
  50: 'CUTCSA',
  70: 'UCOT',
};

// ─── Helpers geométricos ─────────────────────────────────────────────────────

// FASE 5.16: delega en utils/geomath (fuente única). API local intacta.
function haversineMetros(p1: PuntoLatLng, p2: PuntoLatLng): number {
  return distanciaMetros(p1, p2);
}

/**
 * Parte el array de puntos en segmentos contiguos (corta cuando hay un salto
 * > MAX_JUMP_M entre puntos consecutivos) y devuelve el segmento más largo.
 * Evita que Leaflet dibuje líneas rectas entre trips/bloques concatenados
 * por el scraper, que causaban "múltiples líneas azules" en el mapa.
 */
const MAX_JUMP_M = 800; // salto máximo tolerable entre puntos consecutivos

function longestContiguousSegment(points: Array<{ lat: number; lng: number }>): Array<{ lat: number; lng: number }> {
  // RETORNAR EL RECORRIDO COMPLETO 100% SIN CORTAR TRAMOS
  // Permite que la edición de desvíos pueda marcar cualquier sección de la línea
  return points;
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

function mockTimestamp(ahora: Date): LineaUCOT['ultimaActualizacion'] {
  return {
    toDate: () => ahora,
    toMillis: () => ahora.getTime(),
    seconds: Math.floor(ahora.getTime() / 1000),
    nanoseconds: 0,
  } as unknown as LineaUCOT['ultimaActualizacion'];
}

// ─── Construcción de LineaUCOT desde un ShapeEntry ───────────────────────────

function entryToLineaUCOT(docId: string, entry: ShapeEntry, codigo: string, agencyId: number): LineaUCOT {
  const ahora = new Date();
  const rawPoints = entry.points.map((p) => ({ lat: p.lat, lng: p.lng }));
  let recorrido: PuntoLatLng[] = longestContiguousSegment(rawPoints);
  const sentidoLinea: SentidoLinea = (String(entry.sentido).toUpperCase() === 'VUELTA' ? 'VUELTA' : 'IDA') as SentidoLinea;
  const baseCodigo = String(entry.linea).trim();

  let needsReversal = false;
  // HEURÍSTICA DE SEGURIDAD: Si el JSON estático reutilizó el mismo shape para IDA y VUELTA
  // (mismos extremos y mismo recuento), revertimos en VUELTA para que sea navegable en sentido opuesto.
  if (sentidoLinea === 'VUELTA' && recorrido.length > 2 && _shapesCache) {
    const agencyStr = String(agencyId);
    const idIDA = `${agencyStr}_${baseCodigo}_IDA`;
    const entryIDA = _shapesCache[idIDA];
    
    if (entryIDA && entryIDA.points && entryIDA.points.length === entry.points.length) {
      const firstCoincide = Math.abs(entry.points[0].lat - entryIDA.points[0].lat) < 0.0001 && Math.abs(entry.points[0].lng - entryIDA.points[0].lng) < 0.0001;
      const lastCoincide = Math.abs(entry.points[entry.points.length - 1].lat - entryIDA.points[entryIDA.points.length - 1].lat) < 0.0001 && Math.abs(entry.points[entry.points.length - 1].lng - entryIDA.points[entryIDA.points.length - 1].lng) < 0.0001;
      
      if (firstCoincide && lastCoincide) {
        console.warn(`[crossOpShapesInjector] Detectado shape duplicado para VUELTA en línea ${baseCodigo}. Revirtiendo recorrido.`);
        needsReversal = true;
        recorrido = [...recorrido].reverse();
      }
    }
  }

  // Usar paradas del JSON si tienen nombres; si no, distribuir desde LINE_ARCHETYPES
  let paradas: ParadaUcot[];
  const rawParadas = [...entry.paradas];
  if (needsReversal) rawParadas.reverse();
  const paradasConNombre = rawParadas.filter((p) => p.nombre);
  if (paradasConNombre.length >= 2) {
    paradas = paradasConNombre.map((p, i) => ({
      id: `p${i + 1}`,
      nombre: p.nombre ?? `Parada ${i + 1}`,
      lat: p.lat,
      lng: p.lng,
      orden: i + 1,
    }));
  } else {
    const archetype = LINE_ARCHETYPES[baseCodigo] as { headers?: string[] } | undefined;
    const nombres = archetype?.headers ?? [];
    paradas = distribuirParadasSobreShape(recorrido, nombres, sentidoLinea === 'VUELTA');
  }

  return {
    codigo,
    numeroAPI: baseCodigo,
    nombre:
      entry.origen && entry.destino
        ? `${baseCodigo} · ${entry.origen} → ${entry.destino}`
        : `Línea ${baseCodigo} (${sentidoLinea})`,
    empresa: AGENCY_NAME[agencyId] ?? `Empresa ${agencyId}`,
    sentido: sentidoLinea,
    origen: entry.origen ?? undefined,
    destino: entry.destino ?? undefined,
    terminalSalida: entry.origen ?? undefined,
    terminalLlegada: entry.destino ?? undefined,
    varianteIdx: sentidoLinea === 'VUELTA' ? 1 : 0,
    paradas,
    recorrido,
    desviosFijos: [],
    desviosTemporales: [],
    ultimaActualizacion: mockTimestamp(ahora),
    _docId: docId,
  } as unknown as LineaUCOT;
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Lista todas las variantes disponibles para un operador.
 * Retorna resúmenes para el dropdown del Navegador.
 */
export async function listCrossOpLineasInyectadas(agencyId: number): Promise<LineaUCOTResumen[]> {
  const allShapes = await getShapes();
  const agencyStr = String(agencyId);
  const out: LineaUCOTResumen[] = [];

  for (const [docId, entry] of Object.entries(allShapes)) {
    // Comparar con String() porque algunos docs tienen agencyId como number (50) y otros como string ('50').
    if (String(entry.agencyId) !== agencyStr) continue;
    const linea = String(entry.linea).trim();
    if (!linea) continue;
    const sentido: 'IDA' | 'VUELTA' = String(entry.sentido).toUpperCase() === 'VUELTA' ? 'VUELTA' : 'IDA';
    const codigoLegacy = sentido === 'VUELTA' ? `${linea}b` : `${linea}a`;

    out.push({
      id: docId,
      codigo: codigoLegacy,
      nombre:
        entry.origen && entry.destino
          ? `${linea} · ${entry.origen} → ${entry.destino}`
          : `Línea ${linea} (${sentido})`,
      empresa: AGENCY_NAME[agencyId] ?? `Empresa ${agencyId}`,
      origen: entry.origen ?? undefined,
      destino: entry.destino ?? undefined,
      sentido,
    });
  }

  return out.sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
}

/**
 * Devuelve el shape completo (recorrido + paradas) para un operador+código.
 * `codigo` puede ser '300a' (IDA) o '300b' (VUELTA).
 *
 * Busca por campos (agencyId + linea + sentido) en vez de construir docId,
 * porque algunos docs tienen prefijo legacy `imm_` (scraper original sin
 * agencyId) y otros tienen el prefijo canónico `{agencyId}_`. Después del
 * reassign de agencyId, ambos formatos conviven en el JSON.
 */
export async function getCrossOpLineaInyectada(agencyId: number, codigo: string): Promise<LineaUCOT | null> {
  const allShapes = await getShapes();
  const agencyStr = String(agencyId);
  const baseCodigo = String(codigo).replace(/[ab]$/i, '').trim();
  const sentidoBuscado: 'IDA' | 'VUELTA' = String(codigo).toLowerCase().endsWith('b') ? 'VUELTA' : 'IDA';

  // 1. Fast path: docId canónico `{agencyId}_{linea}_{sentido}`.
  const canonicalId = `${agencyStr}_${baseCodigo}_${sentidoBuscado}`;
  const canonical = allShapes[canonicalId];
  if (canonical && canonical.points.length > 0 && String(canonical.agencyId) === agencyStr) {
    return entryToLineaUCOT(canonicalId, canonical, codigo, agencyId);
  }

  // 2. Fallback: scan por campos. Cubre docs `imm_X_SENTIDO` y cualquier otro
  //    naming heredado que tenga agencyId asignado correctamente.
  const baseCodigoNorm = baseCodigo.toLowerCase();
  for (const [docId, entry] of Object.entries(allShapes)) {
    if (String(entry.agencyId) !== agencyStr) continue;
    if (String(entry.linea).trim().toLowerCase() !== baseCodigoNorm) continue;
    const sentidoEntry = String(entry.sentido).toUpperCase() === 'VUELTA' ? 'VUELTA' : 'IDA';
    if (sentidoEntry !== sentidoBuscado) continue;
    if (entry.points.length === 0) continue;
    return entryToLineaUCOT(docId, entry, codigo, agencyId);
  }

  return null;
}
