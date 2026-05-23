/**
 * gpsPlaybackService.ts — Timeline replay histórico de buses
 * =============================================================
 * Sprint 2 entrega 2.2 del roadmap international-grade.
 *
 * Diferenciador: paridad con Swiftly GPS Playback. Forensic analysis
 * de incidentes y reclamos.
 *
 * Schema verificado bajo §12 (vehicle_events):
 *   - idBus: string
 *   - agencyId: string
 *   - empresa: string
 *   - linea: string
 *   - lat: number
 *   - lon: number
 *   - velocidad: number (km/h)
 *   - estadoCumplimiento: string
 *   - desviacionMin: number
 *   - proximaParada: string
 *   - sentido: string
 *   - bearing: number
 *   - createdAt: Timestamp
 *
 * Índice usado: (idBus ASC, createdAt DESC) — ya existente en
 * firestore.indexes.json desde antes de Sprint 1.
 */
import { apiClient } from '../clients/apiClient';
import { distanciaKm } from '../utils/geomath';

export interface GpsPing {
  idBus: string;
  empresa: string;
  linea: string;
  lat: number;
  lon: number;
  velocidad: number;
  estadoCumplimiento: string;
  desviacionMin: number | null;
  proximaParada: string;
  sentido: string;
  bearing: number;
  timestamp: Date;
}

export interface TrayectoriaResultado {
  pings: GpsPing[];
  meta: {
    idBus: string;
    desde: Date;
    hasta: Date;
    pingsEncontrados: number;
    distanciaTotalKm: number;
    velocidadPromedio: number | null;
    tiempoTotal: { minutos: number };
    advertencias: string[];
  };
}

// FASE 5.16: delega en utils/geomath (fuente única). API local intacta.
function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  return distanciaKm(a, b);
}

/**
 * Obtiene la trayectoria histórica de un bus en un rango temporal.
 * Por defecto últimas 24 horas. Máximo 1 semana de rango (limit
 * implícito por seguridad de query).
 */
export async function getTrayectoria(
  idBus: string,
  desde?: Date,
  hasta?: Date,
  agencyId?: string,
): Promise<TrayectoriaResultado> {
  const hastaFinal = hasta || new Date();
  const desdeFinal = desde || new Date(hastaFinal.getTime() - 24 * 3600 * 1000);
  const advertencias: string[] = [];
  const rangoHs = (hastaFinal.getTime() - desdeFinal.getTime()) / 3600 / 1000;
  if (rangoHs > 24 * 7) {
    advertencias.push(
      `Rango solicitado ${Math.round(rangoHs)}h excede 7 días. Truncando a 7 días desde 'hasta'.`,
    );
    desdeFinal.setTime(hastaFinal.getTime() - 24 * 7 * 3600 * 1000);
  }

  // FASE 5.14 (2026-05-13): id_bus en vehicle_events es el codigoBus crudo,
  // que puede coincidir entre operadores. Sin agencyId, la trayectoria
  // mezcla pings de buses distintos. Tambien aceleramos la query (existe
  // indice compuesto agency_id+created_at).
  const parts = [
    `idBus:${idBus}`,
    `createdAt>=${desdeFinal.toISOString()}`,
    `createdAt<=${hastaFinal.toISOString()}`,
  ];
  if (agencyId) parts.push(`agencyId:${agencyId}`);
  const whereClause = parts.join(',');
  const raw = await apiClient.get('/api/db/vehicle_events', {
    query: { where: whereClause, orderBy: 'createdAt:asc', limit: 5000 },
  }) as any[];
  const arr = Array.isArray(raw) ? raw : [];

  const pings: GpsPing[] = [];
  arr.forEach((data: any) => {
    const lat = Number(data.lat ?? 0);
    const lon = Number(data.lon ?? 0);
    if (!lat || !lon) return;
    pings.push({
      idBus: String(data.idBus || idBus),
      empresa: String(data.empresa || ''),
      linea: String(data.linea || ''),
      lat,
      lon,
      velocidad: Number(data.velocidad ?? 0),
      estadoCumplimiento: String(data.estadoCumplimiento || ''),
      desviacionMin:
        typeof data.desviacionMin === 'number' ? Number(data.desviacionMin) : null,
      proximaParada: String(data.proximaParada || ''),
      sentido: String(data.sentido || ''),
      bearing: Number(data.bearing ?? 0),
      timestamp: data.createdAt ? new Date(data.createdAt) : new Date(),
    });
  });

  let distanciaTotalKm = 0;
  for (let i = 1; i < pings.length; i++) {
    distanciaTotalKm += haversineKm(pings[i - 1], pings[i]);
  }

  const velPromedios = pings.filter((p) => p.velocidad > 0).map((p) => p.velocidad);
  const velocidadPromedio =
    velPromedios.length > 0
      ? Math.round(
          (velPromedios.reduce((s, v) => s + v, 0) / velPromedios.length) * 10,
        ) / 10
      : null;

  if (pings.length === 0) {
    advertencias.push(
      `No se encontraron pings para idBus="${idBus}" en el rango. Verificar que el bus operó en ese período.`,
    );
  }

  return {
    pings,
    meta: {
      idBus,
      desde: desdeFinal,
      hasta: hastaFinal,
      pingsEncontrados: pings.length,
      distanciaTotalKm: Math.round(distanciaTotalKm * 100) / 100,
      velocidadPromedio,
      tiempoTotal: {
        minutos: Math.round((hastaFinal.getTime() - desdeFinal.getTime()) / 60000),
      },
      advertencias,
    },
  };
}

/**
 * Devuelve la lista de buses únicos que tuvieron pings en las últimas
 * 24h. Útil para popular el selector de bus en GPSPlayback.tsx.
 *
 * FASE 5.14 (2026-05-13): antes filtraba por `empresa:UCOT` (texto sin
 * índice) → scan completo de vehicle_events (~10M filas) → la pantalla
 * se quedaba "no activa". Ahora consume el endpoint dedicado
 * /api/autostats/fleet-ranking que ya devuelve los buses activos del
 * operador agrupados por id_bus, en <2s.
 */
export async function getBusesActivosUltimas24h(
  agencyId?: string,
): Promise<string[]> {
  if (!agencyId) return [];
  try {
    const res = await apiClient.get(`/api/autostats/fleet-ranking/${agencyId}`, {
      query: { days: 1, limit: 500 },
    }) as { vehicles?: Array<{ idBus: string }> } | Array<{ idBus: string }>;
    const arr = Array.isArray(res) ? res : (res?.vehicles ?? []);
    const set = new Set<string>();
    arr.forEach((v) => { if (v?.idBus) set.add(String(v.idBus)); });
    return [...set].sort((a, b) => Number(a) - Number(b));
  } catch {
    return [];
  }
}
