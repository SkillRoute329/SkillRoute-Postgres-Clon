/**
 * snapToShape.ts — Utility: proyectar GPS en vivo sobre la shape de su línea
 * ==========================================================================
 * MVP paso 3 (DIRECTRIZ 2026-04-24).
 *
 * Es la pieza que une el GPS vivo con la matriz DRO:
 *   - Dado un ping {lat, lon} y una shape (array de {lat, lon} ordenado),
 *     devuelve dónde cae ese ping sobre la ruta (chainage en metros),
 *     el punto proyectado (closest point on polyline), el bearing local
 *     y la distancia lateral al recorrido.
 *
 * Sin imports de React/Firestore: es utility puro, testeable en isolación.
 * Los helpers de carga (loadShape, findOverlappingCorridors) viven al final
 * y sí usan Firestore; se exportan aparte para poder mockearlos.
 */
import {
  collection,
  query,
  where,
  limit,
  getDocs,
  doc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';

// ─── Tipos exportados ─────────────────────────────────────────────────────────

export interface LatLon {
  lat: number;
  lon: number;
}

export type Sentido = 'IDA' | 'VUELTA';

export interface ShapeDoc {
  key: string;
  agencyId: string;
  empresa: string;
  linea: string;
  sentido: Sentido;
  points: LatLon[];
  lengthMeters: number;
}

export interface SnapResult {
  /** Metros recorridos desde el inicio de la shape hasta el punto proyectado. */
  chainageM: number;
  /** Punto de la polilínea más cercano al GPS, proyectado sobre el segmento. */
  projected: LatLon;
  /** Índice del segmento (0..N-2) sobre el que cae el ping. */
  segmentIndex: number;
  /** Distancia perpendicular (m) del GPS al segmento. */
  lateralDistM: number;
  /** Bearing del segmento en grados [0,360). */
  bearingLocal: number;
  /** Fracción [0,1] del recorrido total (chainageM / lengthMeters). */
  fractionOfRoute: number;
}

export interface CorridorOverlapDoc {
  key: string;
  shapeAKey: string;
  shapeBKey: string;
  agencyA: string;
  empresaA: string;
  lineaA: string;
  sentidoA: Sentido;
  agencyB: string;
  empresaB: string;
  lineaB: string;
  sentidoB: Sentido;
  pctAInB: number;
  sharedKm: number;
  sameEmpresa: boolean;
}

// ─── Helpers geométricos (iguales a droMatrix.ts, no importamos para evitar
//     acoplar frontend-functions) ──────────────────────────────────────────────

const EARTH_R = 6371000;

export function haversineM(a: LatLon, b: LatLon): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function bearingDeg(a: LatLon, b: LatLon): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const dλ = ((b.lon - a.lon) * Math.PI) / 180;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** Diferencia angular mínima entre dos bearings en grados [0,180]. */
export function bearingDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Proyecta el punto p sobre el segmento ab en planar local (equirectangular).
 * Devuelve { distM, t, proj } donde t ∈ [0,1] indica la posición relativa
 * sobre el segmento y proj es el punto proyectado en lat/lon.
 */
function projectOnSegment(p: LatLon, a: LatLon, b: LatLon): { distM: number; t: number; proj: LatLon } {
  const latRef = ((a.lat + b.lat + p.lat) / 3) * (Math.PI / 180);
  const sx = 111320 * Math.cos(latRef);
  const sy = 111320;
  const ax = a.lon * sx, ay = a.lat * sy;
  const bx = b.lon * sx, by = b.lat * sy;
  const px = p.lon * sx, py = p.lat * sy;
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return { distM: Math.hypot(px - ax, py - ay), t: 0, proj: { lat: a.lat, lon: a.lon } };
  }
  const tRaw = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  const t = Math.max(0, Math.min(1, tRaw));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const distM = Math.hypot(px - cx, py - cy);
  return { distM, t, proj: { lat: cy / sy, lon: cx / sx } };
}

// ─── Función principal ───────────────────────────────────────────────────────

/**
 * Snap GPS point → shape. Encuentra el segmento más cercano y devuelve
 * chainage (km lineal sobre la ruta), punto proyectado, bearing local.
 *
 * @returns null si la shape no tiene al menos 2 puntos.
 */
export function snapGpsToShape(gps: LatLon, shape: ShapeDoc): SnapResult | null {
  const pts = shape.points;
  if (!pts || pts.length < 2) return null;

  let bestDist = Infinity;
  let bestIdx = 0;
  let bestT = 0;
  let bestProj: LatLon = { lat: pts[0]!.lat, lon: pts[0]!.lon };

  for (let i = 0; i < pts.length - 1; i++) {
    const { distM, t, proj } = projectOnSegment(gps, pts[i]!, pts[i + 1]!);
    if (distM < bestDist) {
      bestDist = distM;
      bestIdx = i;
      bestT = t;
      bestProj = proj;
      if (bestDist < 1) break; // match exacto, corte temprano
    }
  }

  // Chainage = suma de segmentos anteriores + porción dentro del segmento actual
  let chainageM = 0;
  for (let i = 0; i < bestIdx; i++) {
    chainageM += haversineM(pts[i]!, pts[i + 1]!);
  }
  const segLen = haversineM(pts[bestIdx]!, pts[bestIdx + 1]!);
  chainageM += segLen * bestT;

  const bearingLocal = bearingDeg(pts[bestIdx]!, pts[bestIdx + 1]!);
  const total = shape.lengthMeters > 0 ? shape.lengthMeters : chainageM || 1;
  const fraction = Math.min(1, chainageM / total);

  return {
    chainageM: Math.round(chainageM),
    projected: bestProj,
    segmentIndex: bestIdx,
    lateralDistM: Math.round(bestDist),
    bearingLocal: Math.round(bearingLocal),
    fractionOfRoute: Math.round(fraction * 1000) / 1000,
  };
}

/**
 * Verifica si dos shapes tienen sentido de circulación compatible en el
 * tramo donde ambos buses están proyectados. Usa bearing local post-snap.
 */
export function sameDirection(a: SnapResult, b: SnapResult, maxDiffDeg = 60): boolean {
  return bearingDiff(a.bearingLocal, b.bearingLocal) <= maxDiffDeg;
}

// ─── Helpers de Firestore (opcionales, se pueden mockear en tests) ────────────

/**
 * Carga la shape de un (agencyId, linea, sentido).
 * @returns null si no existe todavía (la reconstrucción corre semanal).
 */
export async function loadShape(
  agencyId: string,
  linea: string,
  sentido: Sentido,
): Promise<ShapeDoc | null> {
  const key = `${agencyId}-${linea}-${sentido}`;
  const snap = await getDoc(doc(db, 'shapes_cross_operator', key));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    key: String(d.key ?? key),
    agencyId: String(d.agencyId),
    empresa: String(d.empresa),
    linea: String(d.linea),
    sentido: d.sentido as Sentido,
    points: (d.points ?? []) as LatLon[],
    lengthMeters: Number(d.lengthMeters ?? 0),
  };
}

/**
 * Carga los pares del corridor_overlap donde la shape dada es el "A".
 * Esto lista todas las shapes rivales que cubren al menos MIN_OVERLAP_PCT
 * del trazo de la shape solicitada.
 */
export async function findOverlappingCorridors(
  shapeAKey: string,
  opts?: { includeSameEmpresa?: boolean },
): Promise<CorridorOverlapDoc[]> {
  const q = query(
    collection(db, 'corridor_overlap'),
    where('shapeAKey', '==', shapeAKey),
    limit(500),
  );
  const snap = await getDocs(q);
  const out: CorridorOverlapDoc[] = [];
  for (const docSnap of snap.docs) {
    const d = docSnap.data() as CorridorOverlapDoc;
    if (!opts?.includeSameEmpresa && d.sameEmpresa) continue;
    out.push(d);
  }
  return out;
}

/**
 * Cargar varias shapes en bulk (útil para radar que sigue varias líneas UCOT).
 * Usa `in` queries (máx 30 keys por llamada en Firestore v9).
 */
export async function loadShapesBulk(keys: string[]): Promise<Map<string, ShapeDoc>> {
  const result = new Map<string, ShapeDoc>();
  if (keys.length === 0) return result;
  const chunks: string[][] = [];
  for (let i = 0; i < keys.length; i += 30) chunks.push(keys.slice(i, i + 30));

  for (const chunk of chunks) {
    const q = query(
      collection(db, 'shapes_cross_operator'),
      where('key', 'in', chunk),
    );
    const snap = await getDocs(q);
    for (const docSnap of snap.docs) {
      const d = docSnap.data();
      result.set(String(d.key), {
        key: String(d.key),
        agencyId: String(d.agencyId),
        empresa: String(d.empresa),
        linea: String(d.linea),
        sentido: d.sentido as Sentido,
        points: (d.points ?? []) as LatLon[],
        lengthMeters: Number(d.lengthMeters ?? 0),
      });
    }
  }
  return result;
}
