/**
 * IMM Realtime Service
 * Cliente del endpoint público de tracking GPS de buses de Montevideo.
 *
 * Endpoint: POST https://www.montevideo.gub.uy/buses/rest/stm-online
 * Body: {"empresa": "<codigo>"}
 *   - "10" COETC | "20" COME | "50" CUTCSA | "70" UCOT | "-1" todas
 *
 * Respuesta: GeoJSON FeatureCollection — cada feature es un bus con
 *   properties.linea, codigoEmpresa, sublinea, destinoDesc, tipoLineaDesc,
 *   variante, codigoBus, velocidad, frecuencia + geometry.coordinates [lng,lat].
 */

import axios from 'axios';
import { logger } from '../config/logger';
import { getImmToken } from './immEtaService';

const API_BASE = 'https://api.montevideo.gub.uy/api/transportepublico/';

// Mantenemos STM_ONLINE_URL como fallback extremo
const STM_ONLINE_URL = 'https://www.montevideo.gub.uy/buses/rest/stm-online';

export const EMPRESA_CODES = {
  COETC: '10',
  COME: '20',
  CUTCSA: '50',
  UCOT: '70',
  TODAS: '-1',
} as const;

export const EMPRESA_NAMES: Record<number, string> = {
  10: 'COETC',
  20: 'COME',
  50: 'CUTCSA',
  70: 'UCOT',
};

export interface BusFeatureProps {
  id: string;
  codigoEmpresa: number;
  codigoBus: number;
  linea: string;
  sublinea?: string;
  variante?: number;
  tipoLinea?: number;
  tipoLineaDesc?: string;
  destino?: number;
  destinoDesc?: string;
  subsistema?: number;
  subsistemaDesc?: string;
  frecuencia?: number;
  velocidad?: number;
  version?: number;
}

export interface BusFeature {
  type: 'Feature';
  properties: BusFeatureProps;
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
}

export interface BusFeatureCollection {
  type: 'FeatureCollection';
  features: BusFeature[];
}

const httpClient = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent':
      'TransformaFacil/2.0 (Official IMM B2B API Client)',
    'Content-Type': 'application/json'
  },
});

/**
 * Obtiene snapshot GPS en vivo de buses operando usando la API Oficial (OAuth2).
 * @param empresaCode Código de empresa o "-1" para todas
 */
export async function fetchBusesLive(
  empresaCode: string = EMPRESA_CODES.TODAS
): Promise<BusFeatureCollection> {
  const started = Date.now();
  try {
    const token = await getImmToken();
    const response = await httpClient.get(`${API_BASE}buses`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const rawData = response.data || [];
    const features: BusFeature[] = [];

    for (const bus of rawData) {
      let codigoEmpresa = 0;
      if (bus.company === 'CUTCSA') codigoEmpresa = 50;
      else if (bus.company === 'UCOT') codigoEmpresa = 70;
      else if (bus.company === 'COETC') codigoEmpresa = 10;
      else if (bus.company === 'COME') codigoEmpresa = 20;

      // Filtrar por empresa si no es "-1"
      if (empresaCode !== '-1' && codigoEmpresa.toString() !== empresaCode) {
        continue;
      }

      features.push({
        type: 'Feature',
        geometry: bus.location, // Asume que es {"type":"Point","coordinates":[-56,-34]}
        properties: {
          id: bus.busId?.toString() ?? '',
          codigoEmpresa,
          codigoBus: bus.busId,
          linea: bus.line,
          sublinea: bus.subline,
          variante: bus.lineVariantId,
          destinoDesc: bus.destination,
          velocidad: bus.speed,
        }
      });
    }

    const ms = Date.now() - started;
    logger.info(`[immRealtime] API Oficial: empresa=${empresaCode} buses=${features.length} ${ms}ms`);
    return { type: 'FeatureCollection', features };
  } catch (error: any) {
    logger.warn(`[immRealtime] API Oficial falló, intentando Fallback (Scraper): ${error.message}`);
    // Fallback al Scraper
    try {
      const fbResponse = await httpClient.post<BusFeatureCollection>(
        STM_ONLINE_URL,
        { empresa: empresaCode },
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            Referer: 'https://www.montevideo.gub.uy/buses/',
            Origin: 'https://www.montevideo.gub.uy',
          }
        }
      );
      return fbResponse.data;
    } catch (fbError: any) {
      logger.error(`[immRealtime] Ambos métodos fallaron: ${fbError.message}`);
      throw fbError;
    }
  }
}

/**
 * Agrupa features por empresa → líneas → buses actuales.
 * Util para construir snapshots de competencia.
 */
export interface LineaLive {
  numero: string;
  sublineas: Set<string>;
  destinos: Set<string>;
  variantes: Set<number>;
  tipoLineaDesc?: string;
  busesActivos: number;
  posiciones: Array<{ lat: number; lng: number; busId: number; velocidad?: number }>;
}

export interface EmpresaLive {
  codigo: number;
  nombre: string;
  totalBuses: number;
  lineas: Map<string, LineaLive>;
}

export function agruparPorEmpresa(
  coll: BusFeatureCollection
): Map<number, EmpresaLive> {
  const map = new Map<number, EmpresaLive>();

  for (const feat of coll.features ?? []) {
    const p = feat.properties;
    if (!p?.codigoEmpresa || !p?.linea) continue;

    let empresa = map.get(p.codigoEmpresa);
    if (!empresa) {
      empresa = {
        codigo: p.codigoEmpresa,
        nombre: EMPRESA_NAMES[p.codigoEmpresa] ?? `Empresa ${p.codigoEmpresa}`,
        totalBuses: 0,
        lineas: new Map(),
      };
      map.set(p.codigoEmpresa, empresa);
    }
    empresa.totalBuses += 1;

    let linea = empresa.lineas.get(p.linea);
    if (!linea) {
      linea = {
        numero: p.linea,
        sublineas: new Set(),
        destinos: new Set(),
        variantes: new Set(),
        tipoLineaDesc: p.tipoLineaDesc,
        busesActivos: 0,
        posiciones: [],
      };
      empresa.lineas.set(p.linea, linea);
    }
    linea.busesActivos += 1;
    if (p.sublinea) linea.sublineas.add(p.sublinea);
    if (p.destinoDesc) linea.destinos.add(p.destinoDesc);
    if (typeof p.variante === 'number') linea.variantes.add(p.variante);
    if (feat.geometry?.coordinates?.length === 2) {
      const [lng, lat] = feat.geometry.coordinates;
      linea.posiciones.push({
        lat,
        lng,
        busId: p.codigoBus,
        velocidad: p.velocidad,
      });
    }
  }

  return map;
}

export default { fetchBusesLive, agruparPorEmpresa, EMPRESA_CODES, EMPRESA_NAMES };
