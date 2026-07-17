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

import { apiClient } from '../clients/apiClient';
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
 * Utiliza Autodescubrimiento Dinámico desde el backend como fuente de verdad,
 * complementado con metadatos del catálogo estático.
 */
export async function getLineasByAgency(agencyId: number): Promise<LineaUCOTResumen[]> {
  const key = String(agencyId);
  const cached = lineasCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  // 1. Obtener metadatos estáticos (nombres, orígenes, destinos)
  let staticData: LineaUCOTResumen[] = [];
  if (agencyId === 70) {
    // UCOT: delegate al service histórico
    staticData = await getLineasUCOT();
  } else {
    // Cross-operador: leer de shapes_cross_operator
    try {
      const raw = await apiClient.get('/api/db/shapes_cross_operator', {
        query: { where: `agencyId:${String(agencyId)}`, limit: 1000 },
      }) as any[];
      const arr = Array.isArray(raw) ? raw : [];
      
      if (arr.length === 0) {
        const inyectadas = await import('../features/navigation/data/crossOpShapesInjector');
        staticData = await inyectadas.listCrossOpLineasInyectadas(agencyId);
      } else {
        const seen = new Set<string>();
        const empresaName = AGENCY_NAME[agencyId] ?? `EMP_${agencyId}`;
        arr.forEach((d: any) => {
          const codigo = String(d.linea ?? '').trim();
          if (!codigo || codigo === '—') return;
          const sentido = String(d.sentido ?? 'IDA').toUpperCase();
          const key2 = `${codigo}_${sentido}`;
          if (seen.has(key2)) return;
          seen.add(key2);
          staticData.push({
            id: d.id,
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
      }
    } catch (err) {
      console.warn(
        `[linesService] Falló shapes_cross_operator para agencyId=${agencyId}. Usando inyector estático fallback.`,
        err,
      );
      const inyectadas = await import('../features/navigation/data/crossOpShapesInjector');
      staticData = await inyectadas.listCrossOpLineasInyectadas(agencyId);
    }
  }

  // 2. Obtener catálogo dinámico desde la IMM (fuente de verdad)
  let dynamicCodes: Set<string> | null = null;
  try {
    const rawDyn = await apiClient.get(`/api/lines/${agencyId}`);
    if (rawDyn && Array.isArray((rawDyn as any).lineas)) {
      dynamicCodes = new Set((rawDyn as any).lineas.map((l: any) => String(l.linea).trim()));
    }
  } catch (err) {
    console.warn(`[linesService] Autodescubrimiento falló para agencyId=${agencyId}:`, err);
  }

  let data: LineaUCOTResumen[] = [];

  if (dynamicCodes && dynamicCodes.size > 0) {
    // Intersección: Mantenemos solo líneas confirmadas operativamente
    data = staticData.filter(l => dynamicCodes!.has(l.codigo));
    
    // Adición: Añadimos líneas que el operador circula pero no estaban en el catálogo estático
    const staticCodes = new Set(staticData.map(l => l.codigo));
    const empresaName = AGENCY_NAME[agencyId] ?? `EMP_${agencyId}`;
    
    for (const code of dynamicCodes) {
      if (!staticCodes.has(code)) {
        data.push({
          id: `dyn_${code}`,
          codigo: code,
          nombre: `${code} (Detectada)`,
          empresa: empresaName,
          sentido: 'IDA',
        });
      }
    }
  } else {
    // Fallback absoluto si el poller está caído
    data = staticData;
  }

  data = data.sort((a, b) =>
    a.codigo.localeCompare(b.codigo, undefined, { numeric: true }),
  );

  lineasCache.set(key, { ts: Date.now(), data });
  return data;
}

/**
 * Detalle de una línea (incluye recorrido + paradas si están disponibles).
 * Para UCOT delega al service legacy. Para los demás operadores intenta
 * armar un objeto LineaUCOT mínimo desde shapes_cross_operator (recorrido
 * disponible, paradas no — falta scraping STM por línea cross-operador).
 */
/**
 * FASE 5.18 (2026-05-16) — GEOMETRÍA REAL.
 * Trae el recorrido REAL de gtfs.shapes (feed oficial IMM, 319 rutas) vía
 * /api/gtfs/geometry. Antes el trazado salía de shapes_cross_operator /
 * inyectores estáticos (simulado) — el centro de comando lo marcó como
 * descalificante. Esto es la fuente única de geometría real; devuelve []
 * si GTFS no la tiene (no rompe: el caller hace fallback).
 */
export async function getRecorridoRealGtfs(
  agencyId: number,
  linea: string,
  directionId = 0,
): Promise<{ lat: number; lng: number }[]> {
  try {
    const resp = (await apiClient.get('/api/gtfs/geometry', {
      query: { agencyId: String(agencyId), linea, directionId: String(directionId) },
    })) as { success?: boolean; data?: { recorrido?: Array<{ lat: number; lng: number }> } } | { recorrido?: Array<{ lat: number; lng: number }> };
    const rec =
      (resp as { data?: { recorrido?: Array<{ lat: number; lng: number }> } })?.data?.recorrido ??
      (resp as { recorrido?: Array<{ lat: number; lng: number }> })?.recorrido ??
      [];
    return Array.isArray(rec)
      ? rec
          .filter((p) => p && typeof p.lat === 'number' && typeof p.lng === 'number')
          .map((p) => ({ lat: p.lat, lng: p.lng }))
      : [];
  } catch {
    return [];
  }
}

export async function getLineaDataByAgency(
  agencyId: number,
  codigo: string,
): Promise<LineaUCOT | null> {
  if (agencyId === 70) {
    const ucot = await getLineaDataUCOT(codigo);
    if (ucot) {
      // Override con trazado REAL de GTFS si está disponible.
      const real = await getRecorridoRealGtfs(70, codigo, 0);
      if (real.length > 2) ucot.recorrido = real;
    }
    return ucot;
  }
  try {
    const raw = await apiClient.get('/api/db/shapes_cross_operator', {
      query: { where: `agencyId:${String(agencyId)},linea:${codigo}`, limit: 2 },
    }) as any[];
    const arr = Array.isArray(raw) ? raw : [];
    
    if (arr.length === 0) {
      // FALLBACK A INYECTOR LOCAL ESTÁTICO
      const inyectadas = await import('../features/navigation/data/crossOpShapesInjector');
      return inyectadas.getCrossOpLineaInyectada(agencyId, codigo);
    }

    // Toma el primer match (típicamente IDA). Para vuelta se pediría aparte.
    const d = arr[0];
    const empresaName = AGENCY_NAME[agencyId] ?? `EMP_${agencyId}`;

    // GEOMETRÍA REAL primero (gtfs.shapes); fallback al polyline de
    // shapes_cross_operator solo si GTFS no la tiene.
    let recorrido: { lat: number; lng: number }[] = await getRecorridoRealGtfs(
      agencyId,
      codigo,
      0,
    );
    if (recorrido.length <= 2) {
      recorrido = Array.isArray(d.points)
        ? d.points
            .filter((p: unknown): p is { lat: number; lng: number } =>
              typeof p === 'object' && p !== null && 'lat' in p && 'lng' in p,
            )
            .map((p: { lat: number; lng: number }) => ({ lat: p.lat, lng: p.lng }))
        : [];
    }

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
