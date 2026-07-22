/**
 * intelligenceController — endpoints de inteligencia operativa (FASE 5.28, 2026-05-19)
 *
 * Antes 404. Agrupa los endpoints de inteligencia que no caen en un módulo
 * propio: rotación del día y briefing de inteligencia por línea.
 *
 *   GET /api/rotacion/:fecha       → coches del día (DistribucionDiaria)
 *   GET /api/inteligencia/:linea   → briefing por línea (DigitalAgentsModule)
 */

import { Request, Response } from 'express';
import sqlDb from '../config/database';
import logger from '../config/logger';

// ─── /api/rotacion/:fecha ─────────────────────────────────────────────────
//
// Lee `cartones_historial` (lo que capturó el watcher diario UCOT). Devuelve
// shape esperado por DistribucionDiaria.tsx:
//   { ok, fecha, meta: { totalCoches, archivo }, coches: [{coche, servicio, horaSalida, linea}] }

export async function getRotacionDiaria(req: Request, res: Response): Promise<void> {
  try {
    const fecha = String(req.params.fecha ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      res.status(400).json({ ok: false, error: 'Formato esperado: YYYY-MM-DD' });
      return;
    }
    const rows: Array<{
      vehiculo_id: string;
      service_number: string | null;
      line: string | null;
      service_manana: string | null;
    }> = await sqlDb('cartones_historial')
      .select('vehiculo_id', 'service_number', 'line', 'service_manana')
      .where('fecha', fecha)
      .orderBy(['line', 'vehiculo_id']);

    const coches = rows.map((r) => ({
      coche: r.vehiculo_id,
      servicio: r.service_number ?? '',
      servicioManana: r.service_manana ?? undefined,
      horaSalida: '',                            // cartones_historial no guarda horario; se obtiene del cartón oficial vía /api/cartones/oficiales/:id
      linea: r.line ?? '',
    }));

    res.json({
      ok: true,
      fecha,
      meta: {
        totalCoches: coches.length,
        archivo: 'cartones_historial (watcher UCOT diario)',
      },
      coches,
    });
  } catch (err) {
    logger.error('[rotacion/diaria]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error leyendo rotación', coches: [] });
  }
}

// ─── /api/inteligencia/:linea ─────────────────────────────────────────────
//
// Briefing por línea: cuántos buses propios circulan ahora, cuántos
// competidores hay en la misma línea/corredor, qué servicios oficiales
// existen, y métricas básicas. DigitalAgentsModule consume esto.

export async function getInteligenciaPorLinea(req: Request, res: Response): Promise<void> {
  try {
    const linea = String(req.params.linea ?? '').trim();
    if (!linea) {
      res.status(400).json({ ok: false, error: 'Falta línea' });
      return;
    }

    const buses: Array<{ id_bus: string; agency_id: string | null; lat: number; lon: number; timestamp_gps: Date; velocidad: number | null; estado_cumplimiento: string | null }>
      = await sqlDb('bus_last_pos')
        .select('id_bus', 'agency_id', 'lat', 'lon', 'timestamp_gps', 'velocidad', 'estado_cumplimiento')
        .where('linea', linea)
        .andWhere('timestamp_gps', '>=', sqlDb.raw("NOW() - INTERVAL '60 minutes'"));

    const porOperador: Record<string, number> = {};
    let propios = 0;
    let competidores = 0;
    for (const b of buses) {
      const op = b.agency_id ?? 'NA';
      porOperador[op] = (porOperador[op] ?? 0) + 1;
      // Convención UCOT (70). El resto = competidores en el corredor.
      if (op === '70') propios++; else competidores++;
    }

    // Buses con estado_cumplimiento problemático en la última hora
    const enRiesgo = buses.filter((b) =>
      ['ATRASADO', 'ADELANTADO', 'BUNCHING'].includes(String(b.estado_cumplimiento ?? '').toUpperCase()),
    ).length;

    // Promedio de velocidad observada (km/h)
    const velocidades = buses.map((b) => Number(b.velocidad ?? 0)).filter((v) => Number.isFinite(v));
    const velocidadMedia = velocidades.length ? velocidades.reduce((s, v) => s + v, 0) / velocidades.length : null;

    res.json({
      ok: true,
      linea,
      ventana: 'últimos 60 min (bus_last_pos)',
      buses: {
        total: buses.length,
        propios,
        competidores,
        porOperador,
      },
      desempeno: {
        velocidadMedia,
        enRiesgo,                 // buses con estado ATRASADO/ADELANTADO/BUNCHING
        porcentajeEnRiesgo: buses.length ? (enRiesgo / buses.length) * 100 : 0,
      },
      timestamp: new Date().toISOString(),
      fuente: 'bus_last_pos (poller IMM en vivo)',
    });
  } catch (err) {
    logger.error('[inteligencia/linea]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error armando briefing' });
  }
}

// ─── /api/intelligence/competitors ────────────────────────────────────────
//
// Devuelve las líneas competidoras para una línea y sentido base.
export const getCompetitors = async (req: Request, res: Response) => {
  try {
    const { route_id, direction_id } = req.query;

    if (!route_id || direction_id === undefined) {
      return res.status(400).json({ error: 'Faltan parámetros route_id o direction_id' });
    }

    // 1. Encontrar los route_ids (variantes) reales en GTFS que corresponden a este nombre corto (ej. "316")
    const targetRoutes = await sqlDb('gtfs.routes')
      .where('route_short_name', route_id as string)
      .orWhere('route_id', route_id as string)
      .select('route_id');

    if (targetRoutes.length === 0) {
      return res.json([]);
    }
    
    const targetRouteIds = targetRoutes.map(r => r.route_id);

    // 2. Obtener viajes (trips) para la ruta base como un proxy de su frecuencia (oferta total)
    const baseTripsRes = await sqlDb('gtfs.trips')
      .whereIn('route_id', targetRouteIds)
      .andWhere('direction_id', parseInt(direction_id as string, 10))
      .count('* as count');
    const baseTrips = Number(baseTripsRes[0]?.count || 1); // fallback a 1 para evitar division by zero

    // 3. Buscar competidores y hacer JOIN para obtener el route_short_name del competidor
    const allCompetitors = await sqlDb('gtfs.competitor_overlap as co')
      .join('gtfs.routes as r', 'co.competitor_route_id', 'r.route_id')
      .whereIn('co.base_route_id', targetRouteIds)
      .andWhere('co.base_direction_id', parseInt(direction_id as string, 10))
      .select('co.*', 'r.route_short_name as competitor_short_name')
      .orderBy('co.shared_stops_count', 'desc');

    // 4. Deduplicar por short_name y calcular asimetría de frecuencias y CTI
    const uniqueCompetitors: any[] = [];
    const seen = new Set();
    
    // Obtenemos todos los competitor_route_id para una sola consulta masiva de trips
    const allCompetitorRouteIds = allCompetitors.map(c => c.competitor_route_id);
    
    let compTripsMap: Record<string, number> = {};
    if (allCompetitorRouteIds.length > 0) {
      const tripsData = await sqlDb('gtfs.trips')
        .whereIn('route_id', allCompetitorRouteIds)
        .groupBy('route_id', 'direction_id')
        .select('route_id', 'direction_id')
        .count('* as count');
        
      for (const row of tripsData) {
        compTripsMap[`${row.route_id}_${row.direction_id}`] = Number(row.count || 0);
      }
    }

    const MAX_THEORETICAL_STOPS = 90; // Paradas promedio máximas para normalizar solapamiento (100% solapado)

    for (const comp of allCompetitors) {
      // Evitar considerar a sí misma (o sus variantes) como competidor
      if (targetRouteIds.includes(comp.competitor_route_id)) continue;
      if (comp.competitor_short_name === route_id) continue;

      const key = `${comp.competitor_short_name}_${comp.competitor_direction_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        
        const compTrips = compTripsMap[`${comp.competitor_route_id}_${comp.competitor_direction_id}`] || 1;
        
        const frequencyAsymmetry = Math.min(compTrips / baseTrips, 3); // Tope a 3x
        const spatialOverlapPct = Math.min(comp.shared_stops_count / MAX_THEORETICAL_STOPS, 1);
        
        // CTI (0-100) = 60% Solapamiento + 40% Asimetría de Frecuencias
        const cannibalizationScore = Math.round((spatialOverlapPct * 60) + ((frequencyAsymmetry / 3) * 40));

        uniqueCompetitors.push({
          ...comp,
          competitor_route_id: comp.competitor_short_name,
          base_daily_trips: baseTrips,
          competitor_daily_trips: compTrips,
          cannibalization_score: Math.min(cannibalizationScore, 100)
        });
      }
      
      if (uniqueCompetitors.length >= 20) break;
    }

    // Reordenar por cannibalization_score
    uniqueCompetitors.sort((a, b) => b.cannibalization_score - a.cannibalization_score);

    return res.json(uniqueCompetitors);
  } catch (error: any) {
    console.error('[IntelligenceController] Error en getCompetitors DETAILED:', error);
    logger.error('[IntelligenceController] Error en getCompetitors', error.message);
    return res.status(500).json({ error: 'Error interno del servidor', details: error.message });
  }
};

// ─── /api/intelligence/variants/:route_short_name ───────────────────────────
//
// Mapea los números de variante (shape_id) del GPS a direction_id oficiales del GTFS.
export const getLineVariantsDirection = async (req: Request, res: Response) => {
  try {
    const { route_short_name } = req.params;
    
    if (!route_short_name) {
      return res.status(400).json({ error: 'Falta parámetro route_short_name' });
    }

    // Buscamos todas las variantes (shape_id) que pertenecen a la línea base
    const variants = await sqlDb('gtfs.trips as t')
      .join('gtfs.routes as r', 't.route_id', 'r.route_id')
      .where('r.route_short_name', route_short_name)
      .select('t.shape_id', 't.direction_id')
      .distinct();

    // Convertimos la respuesta en un diccionario rápido { "8385": 0, "8398": 1 }
    const mapping: Record<string, number> = {};
    for (const v of variants) {
      if (v.shape_id != null && v.direction_id != null) {
        mapping[String(v.shape_id)] = Number(v.direction_id);
      }
    }

    return res.json({
      ok: true,
      route: route_short_name,
      mapping
    });

  } catch (error: any) {
    logger.error('[IntelligenceController] Error en getLineVariantsDirection', error.message);
    return res.status(500).json({ error: 'Error interno del servidor', details: error.message });
  }
};

// ─── /api/intelligence/trends ─────────────────────────────────────────────
//
// Devuelve las tendencias de carga mensual.
export const getMonthlyTrends = async (req: Request, res: Response) => {
  try {
    const { route_id, direction_id, competitor_route_id, competitor_direction_id } = req.query;

    if (!route_id || direction_id === undefined) {
      return res.status(400).json({ error: 'Faltan parámetros de la línea base' });
    }

    const fetchTrend = async (shortName: string, dir: number) => {
      const rows = await sqlDb.raw(`
        SELECT month, passenger_count as boarding
        FROM gtfs.stm_passenger_trends
        WHERE route_id = ? AND direction_id = ?
        ORDER BY month ASC
      `, [shortName, dir]);
      
      return rows.rows.map((r: any) => ({
        month: r.month,
        boarding: Number(r.boarding)
      }));
    };

    const baseTrendIda = await fetchTrend(route_id as string, 0);
    const baseTrendVuelta = await fetchTrend(route_id as string, 1);
    
    // Calcular el total consolidado (macro) sumando ida y vuelta por mes
    const totalMap = new Map<string, number>();
    for (const t of baseTrendIda) totalMap.set(t.month, (totalMap.get(t.month) || 0) + t.boarding);
    for (const t of baseTrendVuelta) totalMap.set(t.month, (totalMap.get(t.month) || 0) + t.boarding);
    
    const baseTrendTotal = Array.from(totalMap.entries())
      .map(([month, boarding]) => ({ month, boarding }))
      .sort((a, b) => a.month.localeCompare(b.month));
    
    let compTrend = null;
    if (competitor_route_id && competitor_direction_id !== undefined) {
      const compData = await fetchTrend(competitor_route_id as string, parseInt(competitor_direction_id as string, 10));
      compTrend = {
        route_id: competitor_route_id,
        direction_id: parseInt(competitor_direction_id as string, 10),
        trend: compData
      };
    }

    const responseData = {
      base_line: {
        route_id,
        selected_direction: parseInt(direction_id as string, 10),
        trend_ida: baseTrendIda,
        trend_vuelta: baseTrendVuelta,
        trend_total: baseTrendTotal
      },
      competitor_line: compTrend,
      message: baseTrendTotal.length === 0 
        ? 'Aún no hay datos cargados de la IMM para estas líneas.' 
        : 'Datos auditables procesados directamente del Catálogo Abierto IMM.'
    };

    return res.json(responseData);
  } catch (error: any) {
    logger.error('[IntelligenceController] Error en getMonthlyTrends', error.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};


