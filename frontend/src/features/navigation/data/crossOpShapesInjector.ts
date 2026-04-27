/**
 * crossOpShapesInjector — shapes estáticos para todos los operadores (10/20/50/70).
 * ==================================================================================
 * Fuente: `frontend/src/data/shapesAllOperators.json`
 * Generado por: `node scripts/dump_shapes_to_json.cjs` (Firebase Admin SDK)
 * Zero llamadas a Firestore en runtime — los shapes van en el bundle.
 */

import shapesRaw from '../../../data/shapesAllOperators.json';
import type { LineaUCOT, ParadaUcot, PuntoLatLng, SentidoLinea } from '../../../types/lineasUcot';
import type { LineaUCOTResumen } from '../../../services/linesService';
import { LINE_ARCHETYPES } from '../../../data/lineTemplates';

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

const allShapes = shapesRaw as Record<string, ShapeEntry>;

const AGENCY_NAME: Record<number, string> = {
  10: 'COETC',
  20: 'COME',
  50: 'CUTCSA',
  70: 'UCOT',
};

// ─── Helpers geométricos ─────────────────────────────────────────────────────

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

/**
 * Parte el array de puntos en segmentos contiguos (corta cuando hay un salto
 * > MAX_JUMP_M entre puntos consecutivos) y devuelve el segmento más largo.
 * Evita que Leaflet dibuje líneas rectas entre trips/bloques concatenados
 * por el scraper, que causaban "múltiples líneas azules" en el mapa.
 */
const MAX_JUMP_M = 800; // salto máximo tolerable entre puntos consecutivos

function longestContiguousSegment(points: Array<{ lat: number; lng: number }>): Array<{ lat: number; lng: number }> {
  if (points.length <= 2) return points;

  const segments: Array<Array<{ lat: number; lng: number }>> = [];
  let current: Array<{ lat: number; lng: number }> = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const dist = haversineMetros(points[i - 1], points[i]);
    if (dist > MAX_JUMP_M) {
      segments.push(current);
      current = [points[i]];
    } else {
      current.push(points[i]);
    }
  }
  segments.push(current);

  // Devolver el segmento con más puntos
  return segments.reduce((best, seg) => (seg.length > best.length ? seg : best), segments[0]);
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
  const recorrido: PuntoLatLng[] = longestContiguousSegment(rawPoints);
  const sentidoLinea: SentidoLinea = (String(entry.sentido).toUpperCase() === 'VUELTA' ? 'VUELTA' : 'IDA') as SentidoLinea;
  const baseCodigo = String(entry.linea).trim();

  // Usar paradas del JSON si tienen nombres; si no, distribuir desde LINE_ARCHETYPES
  let paradas: ParadaUcot[];
  const paradasConNombre = entry.paradas.filter((p) => p.nombre);
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
export function listCrossOpLineasInyectadas(agencyId: number): LineaUCOTResumen[] {
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
export function getCrossOpLineaInyectada(agencyId: number, codigo: string): LineaUCOT | null {
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
