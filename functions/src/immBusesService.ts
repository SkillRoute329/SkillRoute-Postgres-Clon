/**
 * immBusesService — GPS enriquecido de TODAS las empresas via API oficial IMM.
 *
 * Agrega los campos que NO tiene stm-online:
 *   speed (km/h), access (PISO BAJO / COMÚN), thermalConfort, emissions
 *
 * GET /immBusesLive?empresa=all|UCOT|CUTCSA|COME|COETC
 *
 * Respuesta cross-empresa lista para consumir desde el Fleet Monitor.
 * Cache interna de 30 seg para no saturar la API IMM.
 */
import * as logger from 'firebase-functions/logger';
import { onRequest } from 'firebase-functions/v2/https';
import { getImmToken, immApiGet } from './immTokenService';

const CACHE_TTL_MS = 15_000;

interface ImmBusRaw {
  eType:        string;
  company:      string;
  timestamp:    string;
  busId:        number;
  line:         string;
  lineVariantId: number;
  location:     { type: string; coordinates: [number, number] };
  origin:       string;
  destination:  string;
  subline:      string;
  special:      boolean;
  speed?:       number;
  access?:      string;
  thermalConfort?: string;
  emissions?:   string;
}

export interface BusEnriquecido {
  idBus:           string;
  empresa:         string;
  empresaId:       number;
  linea:           string;
  lineaVariante:   number;
  origen:          string;
  destino:         string;
  sublinea:        string;
  lat:             number;
  lng:             number;
  velocidadKmh:    number;
  acceso:          string;       // "PISO BAJO" | "COMÚN" | "SIN DATOS"
  climatizacion:   string;       // "Aire Acondicionado" | "SIN DATOS"
  emisiones:       string;       // "Cero emisiones" | "SIN DATOS"
  especial:        boolean;
  timestamp:       string;
  fuente:          'IMM_OFICIAL';
}

const EMPRESA_ID: Record<string, number> = {
  UCOT: 70, CUTCSA: 50, COME: 20, COETC: 10,
};

const TODAS_EMPRESAS = ['UCOT', 'CUTCSA', 'COME', 'COETC'];

// ─── Cache en memoria ─────────────────────────────────────────────────────────

const cache: {
  data: BusEnriquecido[];
  fetchedAt: number;
  empresa: string;
} = { data: [], fetchedAt: 0, empresa: '' };

// ─── Fetch y normalización ────────────────────────────────────────────────────

async function fetchEmpresa(empresa: string, token: string): Promise<BusEnriquecido[]> {
  const raw = await immApiGet<ImmBusRaw[]>(`/buses?company=${empresa}&format=json`, token);
  if (!raw) return [];

  return raw.map((b): BusEnriquecido => ({
    idBus:         String(b.busId),
    empresa:       b.company,
    empresaId:     EMPRESA_ID[b.company] ?? 0,
    linea:         b.line,
    lineaVariante: b.lineVariantId,
    origen:        b.origin,
    destino:       b.destination,
    sublinea:      b.subline,
    lat:           b.location.coordinates[1],
    lng:           b.location.coordinates[0],
    velocidadKmh:  b.speed ?? 0,
    acceso:        b.access ?? 'SIN DATOS',
    climatizacion: b.thermalConfort ?? 'SIN DATOS',
    emisiones:     b.emissions ?? 'SIN DATOS',
    especial:      b.special,
    timestamp:     b.timestamp,
    fuente:        'IMM_OFICIAL',
  }));
}

async function getBusesEnriquecidos(empresa: string): Promise<BusEnriquecido[]> {
  const now = Date.now();
  if (now - cache.fetchedAt < CACHE_TTL_MS && cache.empresa === empresa) {
    return cache.data;
  }

  const token = await getImmToken();
  if (!token) return [];

  let buses: BusEnriquecido[];

  if (empresa === 'all') {
    const resultados = await Promise.all(TODAS_EMPRESAS.map(e => fetchEmpresa(e, token)));
    buses = resultados.flat();
  } else {
    buses = await fetchEmpresa(empresa, token);
  }

  cache.data      = buses;
  cache.fetchedAt = now;
  cache.empresa   = empresa;

  logger.info('[IMM Buses]', buses.length, 'buses de empresa:', empresa);
  return buses;
}

// ─── Cloud Function HTTP ──────────────────────────────────────────────────────

/**
 * GET /immBusesLive?empresa=all|UCOT|CUTCSA|COME|COETC
 *
 * Devuelve GPS enriquecido con speed, acceso, climatizacion, emisiones.
 * Cross-empresa: pasá empresa=all para todas las empresas del sistema.
 */
export const immBusesLive = onRequest(
  { region: 'us-central1', cors: true },
  async (req, res) => {
    const rawEmpresa = typeof req.query.empresa === 'string' ? req.query.empresa : 'all';
    const empresa = rawEmpresa.toLowerCase() === 'all' ? 'all' : rawEmpresa.toUpperCase();

    if (empresa !== 'all' && !TODAS_EMPRESAS.includes(empresa)) {
      res.status(400).json({
        ok: false,
        error: `empresa inválida. Usar: all, ${TODAS_EMPRESAS.join(', ')}`,
      });
      return;
    }

    const buses = await getBusesEnriquecidos(empresa);

    // Resumen por empresa para el frontend
    const porEmpresa: Record<string, number> = {};
    buses.forEach(b => { porEmpresa[b.empresa] = (porEmpresa[b.empresa] ?? 0) + 1; });

    res.json({
      ok:         true,
      total:      buses.length,
      porEmpresa,
      empresa,
      buses,
      timestamp:  new Date().toISOString(),
      fuente:     'IMM_OFICIAL',
      cacheEdadSeg: Math.round((Date.now() - cache.fetchedAt) / 1000),
    });
  },
);
