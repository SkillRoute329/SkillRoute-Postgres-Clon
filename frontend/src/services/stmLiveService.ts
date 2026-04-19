/**
 * stmLiveService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Servicio de datos en tiempo real del STM (Sistema de Transporte Metropolitano)
 * de Montevideo.
 *
 * Fuente oficial: https://www.montevideo.gub.uy/buses/
 * Endpoint real: POST /buses/rest/stm-online (proxied a /stm-online en dev)
 *
 * EMPRESAS:
 *   10 = COETC
 *   20 = COME
 *   50 = CUTCSA
 *   70 = UCOT  ← nosotros
 *   -1 = Todas
 *
 * RESPUESTA: GeoJSON FeatureCollection con puntos de posición de cada bus.
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface BusSTM {
  id: string;
  codigoEmpresa: number;
  empresa: string;
  codigoBus: number;
  variante: number;
  linea: string;
  sublinea: string;
  tipoLineaDesc: string;
  destino: number;
  destinoDesc: string;
  velocidad: number;
  frecuencia: number;
  lat: number;
  lng: number;
}

export interface STMGeoResponse {
  type: 'FeatureCollection';
  features: STMFeature[];
}

export interface STMFeature {
  type: 'Feature';
  properties: {
    id: string;
    codigoEmpresa: number;
    frecuencia: number;
    codigoBus: number;
    variante: number;
    linea: string;
    sublinea: string;
    tipoLinea: number;
    tipoLineaDesc: string;
    destino: number;
    destinoDesc: string;
    subsistema: number;
    subsistemaDesc: string;
    version: number;
    velocidad: number;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
}

export const EMPRESA_NOMBRES: Record<number, string> = {
  10: 'COETC',
  20: 'COME',
  50: 'CUTCSA',
  70: 'UCOT',
};

export const EMPRESA_COLORES: Record<number, string> = {
  10: '#ef4444', // rojo
  20: '#22c55e', // verde
  50: '#3b82f6', // azul
  70: '#eab308', // amarillo UCOT
};

// ─── Cliente API ──────────────────────────────────────────────────────────────

export interface FiltroSTM {
  empresa?: number | -1;    // -1 = todas
  lineas?: string[];        // ej: ["300", "310"]
  variante?: number[];
  bus?: number;
}

/**
 * Obtiene posiciones en tiempo real del STM.
 * En dev: usa el proxy de Vite a /stm-online
 * En prod: la petición va al mismo dominio (configurar en firebase/cloud)
 */
export async function fetchSTMPosiciones(filtro: FiltroSTM = {}): Promise<BusSTM[]> {
  const body: Record<string, unknown> = {};

  if (filtro.empresa !== undefined) {
    body.empresa = String(filtro.empresa);
  } else {
    body.empresa = '-1'; // Todas por defecto
  }

  if (filtro.lineas && filtro.lineas.length > 0) {
    body.lineas = filtro.lineas;
  }
  if (filtro.variante && filtro.variante.length > 0) {
    body.variante = filtro.variante;
  }
  if (filtro.bus !== undefined) {
    body.bus = filtro.bus;
  }

  // En dev: proxy Vite → https://www.montevideo.gub.uy/buses/rest/stm-online
  // En prod Firebase Hosting: necesita Cloud Function relay (ver nota abajo)
  const url = '/proxy-stm';

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`STM API error: ${response.status} ${response.statusText}`);
  }

  const geo: STMGeoResponse = await response.json();

  // Si empresa === "0" o la respuesta es vacía, retornar []
  if (!geo.features || geo.features.length === 0) return [];

  return geo.features.map(featureTobus);
}

function featureTobus(f: STMFeature): BusSTM {
  const p = f.properties;
  return {
    id: p.id || '',
    codigoEmpresa: p.codigoEmpresa || 0,
    empresa: EMPRESA_NOMBRES[p.codigoEmpresa] ?? `Empresa ${p.codigoEmpresa}`,
    codigoBus: p.codigoBus || 0,
    variante: p.variante || 0,
    linea: String(p.linea || '-'),
    sublinea: String(p.sublinea || '-'),
    tipoLineaDesc: p.tipoLineaDesc || '',
    destino: p.destino || 0,
    destinoDesc: p.destinoDesc || '-',
    velocidad: p.velocidad || 0,
    frecuencia: p.frecuencia || 0,
    lat: Number(f.geometry?.coordinates?.[1] ?? 0),
    lng: Number(f.geometry?.coordinates?.[0] ?? 0),
  };
}

/**
 * Obtiene todas las empresas a la vez y agrupa por empresa
 */
export async function fetchTodasEmpresas(): Promise<Map<number, BusSTM[]>> {
  const buses = await fetchSTMPosiciones({ empresa: -1 });
  const mapa = new Map<number, BusSTM[]>();

  for (const bus of buses) {
    const lista = mapa.get(bus.codigoEmpresa) ?? [];
    lista.push(bus);
    mapa.set(bus.codigoEmpresa, lista);
  }

  return mapa;
}

/**
 * Detecta buses rivales en el mismo corredor que una línea UCOT
 * Criterio: < 1km de distancia de algún bus UCOT
 */
export function detectarSolapamiento(
  busesUCOT: BusSTM[],
  busesRival: BusSTM[],
  umbralKm = 1.0
): BusSTM[] {
  return busesRival.filter((rival) => {
    return busesUCOT.some((ucot) => {
      const distancia = haversineKm(ucot.lat, ucot.lng, rival.lat, rival.lng);
      return distancia <= umbralKm;
    });
  });
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
