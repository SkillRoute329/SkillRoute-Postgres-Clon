/**
 * positionsController — endpoint /api/positions (FASE 5.27, 2026-05-19)
 *
 * Sirve la última posición GPS conocida de cada bus desde `bus_last_pos`
 * (tabla alimentada por el poller IMM en tiempo real).
 *
 * Shape de respuesta acordado con el frontend (CEODashboardV7,
 * FleetMonitorModule, DistribucionDiaria, CUTCSAFleetDashboard, etc.):
 *
 *   {
 *     ok: true,
 *     total: <N>,
 *     buses: [{
 *       idBus, codigoBus, linea, sublinea?, destino?,
 *       empresa, empresaId,        // 70=UCOT, 50=CUTCSA, 20=COME, 10=COETC
 *       lat, lng,                  // ¡lng! no lon
 *       timestamp                  // ISO
 *     }],
 *     timestamp, fuente
 *   }
 *
 * Cero síntesis: si no hay filas en bus_last_pos, total=0, buses=[].
 */

import { Request, Response } from 'express';
import sqlDb from '../config/database';
import logger from '../config/logger';

interface BusRow {
  id_bus: string;
  agency_id: string | null;
  linea: string | null;
  destino: string | null;
  sentido: string | null;
  lat: number | null;
  lon: number | null;
  velocidad: number | null;
  estado_cumplimiento: string | null;
  timestamp_gps: Date | null;
  nombre_empresa: string | null;
}

function rowToBus(r: BusRow) {
  return {
    idBus: r.id_bus,
    codigoBus: r.id_bus,
    linea: r.linea ?? '',
    sublinea: r.sentido ?? undefined,
    destino: r.destino ?? undefined,
    empresa: r.nombre_empresa ?? r.agency_id ?? '',
    empresaId: r.agency_id ? Number(r.agency_id) : 0,
    lat: r.lat ?? 0,
    lng: r.lon ?? 0,
    velocidad: r.velocidad ?? null,
    estado: r.estado_cumplimiento ?? null,
    timestamp: r.timestamp_gps ? new Date(r.timestamp_gps).toISOString() : '',
  };
}

async function queryBuses(agencyFilter?: string): Promise<BusRow[]> {
  let q = sqlDb('bus_last_pos as b')
    .leftJoin('empresas as e', 'b.agency_id', 'e.agency_id')
    .select<BusRow[]>(
      'b.id_bus',
      'b.agency_id',
      'b.linea',
      'b.destino',
      'b.sentido',
      'b.lat',
      'b.lon',
      'b.velocidad',
      'b.estado_cumplimiento',
      'b.timestamp_gps',
      'e.nombre as nombre_empresa',
    )
    .whereNotNull('b.lat')
    .whereNotNull('b.lon')
    // Solo pings recientes (60 min) — descartamos buses muertos del feed.
    .where('b.timestamp_gps', '>=', sqlDb.raw("NOW() - INTERVAL '60 minutes'"));

  if (agencyFilter) {
    q = q.andWhere('b.agency_id', agencyFilter);
  }
  return q;
}

/**
 * GET /api/positions
 * Devuelve todas las posiciones recientes de los 4 operadores.
 */
export async function getAllPositions(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await queryBuses();
    const buses = rows.map(rowToBus);
    res.json({
      ok: true,
      total: buses.length,
      buses,
      timestamp: new Date().toISOString(),
      fuente: 'bus_last_pos (poller IMM)',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('[positions] getAllPositions error', { error: msg });
    res.status(500).json({ ok: false, error: 'Error consultando posiciones', details: msg, buses: [] });
  }
}

/**
 * GET /api/positions/cutcsa
 * Sólo CUTCSA (agency_id=50). Usado por CUTCSAFleetDashboard.
 */
export async function getCutcsaPositions(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await queryBuses('50');
    const buses = rows.map(rowToBus);
    res.json({
      ok: true,
      total: buses.length,
      buses,
      timestamp: new Date().toISOString(),
      fuente: 'bus_last_pos filtro agency_id=50',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('[positions] getCutcsaPositions error', { error: msg });
    res.status(500).json({ ok: false, error: 'Error consultando posiciones CUTCSA', details: msg, buses: [] });
  }
}
