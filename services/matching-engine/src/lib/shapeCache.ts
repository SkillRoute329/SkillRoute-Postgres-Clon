import { db } from './firestore';
import { Shape, Sentido } from '../types';

const SHAPES_COL = 'shapes_cross_operator';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Cache en memoria: clave = "agencyId_linea"
// Valor: { shapes, loadedAt }
interface CacheEntry {
  shapes: Shape[];
  loadedAt: number;
}

const cache = new Map<string, CacheEntry>();

// Convierte variante a sentido (par=IDA, impar=VUELTA)
function varianteToSentido(variante: number): Sentido {
  return variante % 2 === 0 ? 'IDA' : 'VUELTA';
}

// Carga todos los shapes de una linea+agencyId desde Firestore
async function loadFromFirestore(agencyId: string, linea: string): Promise<Shape[]> {
  const snap = await db
    .collection(SHAPES_COL)
    .where('agencyId', '==', agencyId)
    .where('linea', '==', linea)
    .get();

  if (snap.empty) return [];

  const shapes: Shape[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const varianteNum = typeof d.variante === 'number' ? d.variante : parseInt(String(d.variante ?? '0'), 10);
    const points: Array<{ lat: number; lng: number }> = Array.isArray(d.points) ? d.points : [];
    if (points.length < 2) continue; // shape inválido

    const sentido: Sentido = d.sentido === 'IDA' || d.sentido === 'VUELTA'
      ? d.sentido
      : varianteToSentido(varianteNum);

    const origen: string | null = d.origen ?? null;
    const destino: string | null = d.destino ?? null;

    // terminalIda = inicio del shape IDA = origen del IDA
    // terminalVuelta = fin del shape IDA = destino del IDA (origen del VUELTA)
    const terminalIda = sentido === 'IDA' ? origen : destino;
    const terminalVuelta = sentido === 'IDA' ? destino : origen;

    shapes.push({
      docId: doc.id,
      agencyId,
      linea,
      varianteNum,
      sentido,
      points,
      terminalIda,
      terminalVuelta,
      origen,
      destino,
    });
  }
  return shapes;
}

// Selecciona la mejor shape por sentido (la que tiene más puntos — mismo criterio que GTFS max-stops)
function selectBestPerSentido(shapes: Shape[]): Shape[] {
  const best = new Map<Sentido, Shape>();
  for (const s of shapes) {
    const current = best.get(s.sentido);
    if (!current || s.points.length > current.points.length) {
      best.set(s.sentido, s);
    }
  }
  return Array.from(best.values());
}

// API pública: obtiene [ShapeIDA, ShapeVUELTA] para una linea+agencyId.
// Retorna array vacío si no hay shapes en Firestore.
export async function getShapesForLinea(agencyId: string, linea: string): Promise<Shape[]> {
  const key = `${agencyId}_${linea}`;
  const now = Date.now();
  const entry = cache.get(key);

  if (entry && now - entry.loadedAt < CACHE_TTL_MS) {
    return entry.shapes;
  }

  const allShapes = await loadFromFirestore(agencyId, linea);
  const shapes = selectBestPerSentido(allShapes);
  cache.set(key, { shapes, loadedAt: now });
  return shapes;
}

// Invalida el cache de una línea específica (útil al re-indexar shapes)
export function invalidateCache(agencyId: string, linea: string): void {
  cache.delete(`${agencyId}_${linea}`);
}

// Invalida todo el cache (útil al hacer /reprocess)
export function clearCache(): void {
  cache.clear();
}

// Stats del cache para el /health endpoint
export function cacheStats(): { entries: number; oldestMs: number | null } {
  const now = Date.now();
  let oldest: number | null = null;
  for (const v of cache.values()) {
    const age = now - v.loadedAt;
    if (oldest === null || age > oldest) oldest = age;
  }
  return { entries: cache.size, oldestMs: oldest };
}
