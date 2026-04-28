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
import { db } from '../config/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from 'firebase/firestore';

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

function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
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

  const q = query(
    collection(db, 'vehicle_events'),
    where('idBus', '==', idBus),
    where('createdAt', '>=', Timestamp.fromDate(desdeFinal)),
    where('createdAt', '<=', Timestamp.fromDate(hastaFinal)),
    orderBy('createdAt', 'asc'),
  );

  const snap = await getDocs(q);
  const pings: GpsPing[] = [];
  snap.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    const ts = data.createdAt as { toDate?: () => Date } | undefined;
    if (!ts?.toDate) return;
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
      timestamp: ts.toDate(),
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
 */
export async function getBusesActivosUltimas24h(
  empresa?: string,
): Promise<string[]> {
  const desde = new Date(Date.now() - 24 * 3600 * 1000);
  const conds: Array<ReturnType<typeof where>> = [
    where('createdAt', '>=', Timestamp.fromDate(desde)),
  ];
  if (empresa) conds.push(where('empresa', '==', empresa));
  const q = query(collection(db, 'vehicle_events'), ...conds);
  const snap = await getDocs(q);
  const set = new Set<string>();
  snap.forEach((d) => {
    const idBus = String(d.data().idBus || '');
    if (idBus) set.add(idBus);
  });
  return [...set].sort((a, b) => Number(a) - Number(b));
}
