/**
 * linesService.ts — Catálogo de líneas cross-operador
 * ======================================================
 * Wrapper unificado que devuelve el catálogo de líneas del operador propio
 * indicado, abstrayendo la fuente de datos por operador:
 *
 *   - UCOT (agencyId=70): delega al `ucotLinesService.getLineasUCOT()`
 *     histórico, que combina Firestore `lineas_ucot` + CORRIDOR_MAP
 *     + ALL_UCOT_ROUTES para tener el catálogo más rico.
 *
 *   - CUTCSA (50) / COME (20) / COETC (10): reconstruye el catálogo
 *     desde `shapes_cross_operator` filtrado por agencyId. Catálogo
 *     básico (codigo, sentido, longitud) — suficiente para el navegador
 *     y proyecciones económicas.
 *
 * Permite a NavigationModule + EconomicProjectionsPage operar idéntico
 * para todos los operadores sin código branchy en el call site.
 *
 * Forward-compat: cuando el repo tenga una colección unificada
 * `lineas_cross_operator/{agencyId}_{codigo}` con metadatos enriquecidos,
 * este service apunta ahí y los demás módulos no se enteran.
 */

import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  getLineasUCOT,
  getLineaData as getLineaDataUCOT,
  type LineaUCOTResumen,
} from './ucotLinesService';
import type { LineaUCOT, SentidoLinea } from '../types/lineasUcot';

const AGENCY_NAME: Record<number, string> = {
  70: 'UCOT',
  50: 'CUTCSA',
  20: 'COME',
  10: 'COETC',
};

// ── Cache en memoria por agencyId (5 min TTL) ───────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;
const lineasCache = new Map<string, { ts: number; data: LineaUCOTResumen[] }>();

/**
 * Devuelve la lista de líneas resumida para el operador propio indicado.
 * Para UCOT delega al service legacy enriquecido. Para los demás operadores
 * lee de `shapes_cross_operator`.
 */
export async function getLineasByAgency(agencyId: number): Promise<LineaUCOTResumen[]> {
  const key = String(agencyId);
  const cached = lineasCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  let data: LineaUCOTResumen[];

  if (agencyId === 70) {
    // UCOT: delegate al service histórico
    data = await getLineasUCOT();
  } else {
    // Cross-operador: leer de shapes_cross_operator
    try {
      const snap = await getDocs(
        query(
          collection(db, 'shapes_cross_operator'),
          where('agencyId', '==', String(agencyId)),
          limit(1000),
        ),
      );
      const seen = new Set<string>();
      const result: LineaUCOTResumen[] = [];
      const empresaName = AGENCY_NAME[agencyId] ?? `EMP_${agencyId}`;
      snap.forEach((doc) => {
        const d = doc.data();
        const codigo = String(d.linea ?? '').trim();
        if (!codigo || codigo === '—') return;
        const sentido = String(d.sentido ?? 'IDA').toUpperCase();
        const key2 = `${codigo}_${sentido}`;
        if (seen.has(key2)) return;
        seen.add(key2);
        result.push({
          id: doc.id,
          codigo,
          nombre:
            d.origen && d.destino
              ? `${codigo} · ${d.origen} ↔ ${d.destino}`
              : `${codigo} (${sentido})`,
          empresa: empresaName,
          origen: typeof d.origen === 'string' ? d.origen : undefined,
          destino: typeof d.destino === 'string' ? d.destino : undefined,
          sentido: sentido === 'VUELTA' ? 'VUELTA' : ('IDA' as SentidoLinea),
        });
      });
      data = result.sort((a, b) =>
        a.codigo.localeCompare(b.codigo, undefined, { numeric: true }),
      );
    } catch (err) {
      console.warn(
        `[linesService] No se pudo cargar shapes_cross_operator para agencyId=${agencyId}:`,
        err,
      );
      data = [];
    }
  }

  lineasCache.set(key, { ts: Date.now(), data });
  return data;
}

/**
 * Detalle de una línea (incluye recorrido + paradas si están disponibles).
 * Para UCOT delega al service legacy. Para los demás operadores intenta
 * armar un objeto LineaUCOT mínimo desde shapes_cross_operator (recorrido
 * disponible, paradas no — falta scraping STM por línea cross-operador).
 */
export async function getLineaDataByAgency(
  agencyId: number,
  codigo: string,
): Promise<LineaUCOT | null> {
  if (agencyId === 70) {
    return getLineaDataUCOT(codigo);
  }
  try {
    const snap = await getDocs(
      query(
        collection(db, 'shapes_cross_operator'),
        where('agencyId', '==', String(agencyId)),
        where('linea', '==', codigo),
        limit(2), // ida + vuelta
      ),
    );
    if (snap.empty) return null;

    // Toma el primer match (típicamente IDA). Para vuelta se pediría aparte.
    const docu = snap.docs[0]!;
    const d = docu.data();
    const empresaName = AGENCY_NAME[agencyId] ?? `EMP_${agencyId}`;

    // Convertir polyline (lat/lng pairs) si está disponible
    const recorrido: { lat: number; lng: number }[] = Array.isArray(d.points)
      ? d.points
          .filter((p: unknown): p is { lat: number; lng: number } =>
            typeof p === 'object' && p !== null && 'lat' in p && 'lng' in p,
          )
          .map((p: { lat: number; lng: number }) => ({ lat: p.lat, lng: p.lng }))
      : [];

    const ahora = new Date();
    return {
      codigo,
      numeroAPI: codigo,
      nombre:
        d.origen && d.destino
          ? `${codigo} · ${d.origen} ↔ ${d.destino}`
          : `${codigo}`,
      empresa: empresaName,
      sentido: String(d.sentido ?? 'IDA') as SentidoLinea,
      origen: typeof d.origen === 'string' ? d.origen : undefined,
      destino: typeof d.destino === 'string' ? d.destino : undefined,
      terminalSalida: typeof d.origen === 'string' ? d.origen : undefined,
      terminalLlegada: typeof d.destino === 'string' ? d.destino : undefined,
      varianteIdx: 0,
      paradas: [], // TODO: scraping STM por línea cross-operador
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
    console.warn(
      `[linesService] No se pudo cargar línea ${codigo} de agencyId=${agencyId}:`,
      err,
    );
    return null;
  }
}

/**
 * Invalida cache de líneas para un operador. Usar después de
 * shapeReconstructionManual o cambios masivos.
 */
export function invalidateLinesCache(agencyId?: number): void {
  if (agencyId !== undefined) {
    lineasCache.delete(String(agencyId));
  } else {
    lineasCache.clear();
  }
}

/**
 * Cuenta de líneas catalogadas para un operador (rápido — usa cache).
 */
export async function countLineasByAgency(agencyId: number): Promise<number> {
  const list = await getLineasByAgency(agencyId);
  // Dedupe por codigo base (sin sentido)
  const codigos = new Set(list.map((l) => l.codigo.replace(/[ab]$/i, '')));
  return codigos.size;
}
