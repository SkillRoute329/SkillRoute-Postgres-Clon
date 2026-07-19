import sqlDb from '../config/database';
import { logger } from '../config/logger';
import fs from 'fs';
import path from 'path';

// Cargar el mapping maestro de lineas -> empresa
const agencyMappingPath = path.join(__dirname, '../data/gtfs/agency_mapping.json');
let agencyMapping: Record<string, string> = {};
try {
  agencyMapping = JSON.parse(fs.readFileSync(agencyMappingPath, 'utf8'));
} catch (e) {
  logger.warn('No se pudo cargar agency_mapping.json, usando heuristica vacia.');
}

/**
 * Servicio de acceso ultrarrápido a la base de datos GTFS Local
 */
export const gtfsService = {
  /**
   * Obtener todas las paradas registradas oficiales.
   * Opcional: limitar por región bounding box si se requiere performance extremo.
   */
  async getAllStops() {
    try {
      // Usamos Knex directo a gtfs.stops
      const stops = await sqlDb('gtfs.stops')
        .select('stop_id', 'stop_name', 'stop_lat', 'stop_lon', 'stop_code')
        .orderBy('stop_name', 'asc');
      return stops;
    } catch (err) {
      logger.error('[GTFS Service] Error fetching stops', err);
      throw err;
    }
  },

  /**
   * Obtiene el shape (geometría de ruta) ordenado por secuencia
   */
  async getShape(shapeId: string) {
    try {
      const points = await sqlDb('gtfs.shapes')
        .where('shape_id', shapeId)
        .select('shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence')
        .orderBy('shape_pt_sequence', 'asc');
      
      // Mapear a formato que entiende el Map (lat, lon array o feature)
      return points.map(p => [p.shape_pt_lat, p.shape_pt_lon]);
    } catch (err) {
      logger.error(`[GTFS Service] Error fetching shape ${shapeId}`, err);
      throw err;
    }
  },

  /**
   * Busca las rutas activas por su número corto (ej: 103, 300)
   */
  async getRouteDetails(routeShortName: string) {
    try {
      const route = await sqlDb('gtfs.routes')
        .where('route_short_name', routeShortName)
        .first();
      return route;
    } catch (err) {
      logger.error(`[GTFS Service] Error fetching route ${routeShortName}`, err);
      throw err;
    }
  },

  /**
   * Obtiene las próximas salidas teóricas programadas para una parada específica
   * Consultando el cruce de stop_times -> trips -> routes -> calendar
   */
  async getNextDepartures(stopId: string, limit = 10) {
    try {
      const now = new Date();
      
      // 1. Formatear hora actual compatible con HH:MM:SS del GTFS en timezone de Montevideo
      const timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'America/Montevideo' };
      const localTimeStr = new Intl.DateTimeFormat('en-US', timeOptions).format(now);
      
      // 2. Determinar el nombre de columna del día de la semana (monday, tuesday, etc)
      const dayOptions: Intl.DateTimeFormatOptions = { weekday: 'long', timeZone: 'America/Montevideo' };
      const currentDayName = new Intl.DateTimeFormat('en-US', dayOptions).format(now).toLowerCase();

      logger.info(`[Oráculo] Consultando salidas para parada ${stopId} a las ${localTimeStr} (${currentDayName})`);

      const departures = await sqlDb('gtfs.stop_times as st')
        .join('gtfs.trips as t', 'st.trip_id', 't.trip_id')
        .join('gtfs.routes as r', 't.route_id', 'r.route_id')
        .join('gtfs.calendar as c', 't.service_id', 'c.service_id')
        .where('st.stop_id', stopId)
        .andWhere(`c.${currentDayName}`, 1) // Filtrar para el servicio activo hoy
        .andWhere('st.arrival_time', '>=', localTimeStr)
        .select(
          'st.arrival_time as arrivalTime',
          'r.route_short_name as route',
          'r.route_long_name as routeName',
          't.trip_headsign as destination'
        )
        .orderBy('st.arrival_time', 'asc')
        .limit(limit);

      return departures;
    } catch (err) {
      logger.error(`[GTFS Service] Error calculating departures for ${stopId}`, err);
      throw err;
    }
  },

  /**
   * Devuelve un resumen del feed
   */
  async getStats() {
    const stopsCount = await sqlDb('gtfs.stops').count('stop_id as total');
    const routesCount = await sqlDb('gtfs.routes').count('route_id as total');
    return {
      stops: stopsCount[0].total,
      routes: routesCount[0].total
    };
  },

  /**
   * Analiza en SQL puro qué líneas cruzan con la línea especificada, 
   * calculando porcentaje de solapamiento basado en paradas compartidas.
   */
  async getCompetitiveOverlaps(routeShortName: string) {
    try {
      const rawQuery = `
        WITH TargetStops AS (
          SELECT DISTINCT st.stop_id, s.stop_name
          FROM gtfs.routes r
          JOIN gtfs.trips t ON t.route_id = r.route_id
          JOIN gtfs.stop_times st ON st.trip_id = t.trip_id
          JOIN gtfs.stops s ON s.stop_id = st.stop_id
          WHERE r.route_short_name = ?
        ),
        TargetStats AS (
          SELECT COUNT(*) as total_stops FROM TargetStops
        ),
        MatchData AS (
          SELECT 
            r.route_short_name as rival_route,
            MIN(r.route_long_name) as rival_name,
            COUNT(DISTINCT st.stop_id) as shared_count,
            STRING_AGG(DISTINCT ts.stop_name, ' || ') as shared_zones
          FROM gtfs.stop_times st
          JOIN gtfs.trips t ON st.trip_id = t.trip_id
          JOIN gtfs.routes r ON t.route_id = r.route_id
          JOIN TargetStops ts ON st.stop_id = ts.stop_id
          WHERE r.route_short_name != ?
          GROUP BY r.route_short_name
        )
        SELECT 
          o.rival_route, 
          o.rival_name,
          o.shared_count,
          o.shared_zones,
          ts.total_stops as target_total_stops,
          ROUND((o.shared_count * 100.0 / ts.total_stops), 1) as overlap_percentage
        FROM MatchData o, TargetStats ts
        ORDER BY o.shared_count DESC
        LIMIT 15;
      `;

      const result = await sqlDb.raw(rawQuery, [routeShortName, routeShortName]);
      
      // Inferencia de empresa clásica de Montevideo por numeración si es posible
      // 100-199 = CUTCSA/COMESA, 400 = UCOT/COETC, G, L, etc
      const data = (result.rows || result).map((r: any) => {
        const routeNum = parseInt(r.rival_route, 10);
        let inferredCompany = 'STM Metropolitana';
        if (!isNaN(routeNum)) {
          if (routeNum < 100) inferredCompany = 'CUTCSA / Varios';
          else if (routeNum >= 100 && routeNum < 200) inferredCompany = 'CUTCSA';
          else if (routeNum >= 200 && routeNum < 300) inferredCompany = 'COME';
          else if (routeNum >= 300 && routeNum < 400) inferredCompany = 'UCOT / COETC';
          else if (routeNum >= 400 && routeNum < 500) inferredCompany = 'COETC / UCOT';
        }

        // Procesamos las zonas compartidas para que se vea lindo (primeros 4 puntos de referencia)
        const zonesArray = (r.shared_zones || '').split(' || ');
        const topZones = zonesArray.slice(0, 4).map((z: string) => 
          z.toLowerCase().replace(/(^|\s)\S/g, (l: string) => l.toUpperCase()) // Capitalize nice
        );

        return {
          ...r,
          shared_count: Number(r.shared_count),
          overlap_percentage: Number(r.overlap_percentage),
          inferred_company: inferredCompany,
          principales_puntos_coincidencia: topZones,
          shared_zones: undefined // Limpiar el raw para no contaminar contexto
        };
      });

      return data;
    } catch (err) {
      logger.error(`[GTFS Service] Error in getCompetitiveOverlaps`, err);
      throw err;
    }
  },

  /**
   * Genera el timetable masivo para el componente VistaDia 
   * directamente consumiendo el PostgreSQL. Mucho más rápido que Firestore.
   */
  async getDailyTimetable(serviceType: 'HABIL' | 'SABADO' | 'DOMINGO', agencyId: string) {
    try {
      let dayFilter = 'monday = 1';
      if (serviceType === 'SABADO') dayFilter = 'saturday = 1';
      if (serviceType === 'DOMINGO') dayFilter = 'sunday = 1';

      // Filtro estricto consultando el diccionario oficial en memoria
      const validRoutes = Object.keys(agencyMapping).filter(route => agencyMapping[route] === agencyId);
      let routeCondition = "AND 1=0"; // fallback si no hay líneas
      if (validRoutes.length > 0) {
        const routesList = validRoutes.map(r => `'${r}'`).join(', ');
        routeCondition = `AND r.route_short_name IN (${routesList})`;
      }

      const query = `
        WITH Timestamps AS (
          SELECT 
            t.route_id,
            r.route_short_name,
            t.direction_id,
            t.trip_id,
            MIN(st.departure_time) as start_time,
            MAX(st.arrival_time) as end_time
          FROM gtfs.trips t
          JOIN gtfs.routes r ON t.route_id = r.route_id
          JOIN gtfs.stop_times st ON st.trip_id = t.trip_id
          JOIN gtfs.calendar c ON t.service_id = c.service_id
          WHERE c.${dayFilter}
          ${routeCondition}
          GROUP BY t.route_id, r.route_short_name, t.direction_id, t.trip_id
        )
        SELECT 
          route_short_name as linea,
          direction_id,
          start_time,
          end_time
        FROM Timestamps
        ORDER BY linea, direction_id, start_time;
      `;

      const raw = await sqlDb.raw(query);
      const rows = raw.rows || raw;

      // Helper to convert "HH:MM:SS" to minutes from midnight
      const timeToMin = (timeStr: string) => {
        const [h, m] = timeStr.split(':').map(Number);
        return (h * 60) + m;
      };

      // Agrupar por Fila (linea + sentido)
      const groups = new Map<string, any>();

      rows.forEach((r: any) => {
        const key = `${r.linea}_${r.direction_id}`;
        if (!groups.has(key)) {
          groups.set(key, {
            id: `sql_${agencyId}_${r.linea}_${r.direction_id}`,
            linea: r.linea,
            directionId: Number(r.direction_id),
            sentido: Number(r.direction_id) === 0 ? 'IDA' : 'VUELTA',
            serviceType,
            viajes: []
          });
        }
        const sMin = timeToMin(r.start_time);
        const eMin = timeToMin(r.end_time);
        
        groups.get(key).viajes.push({
          s: r.start_time.substring(0, 5),
          t: [sMin, eMin] // Formato mínimo compatible que espera VistaDia
        });
      });

      const finalResult = Array.from(groups.values());
      logger.info(`[GTFS DIAGNOSTIC] Complete. Returning ${finalResult.length} mapped rows to UI.`);
      if (finalResult.length > 0) {
        logger.info(`[GTFS DIAGNOSTIC] Row sample: ${JSON.stringify(finalResult[0]).substring(0, 300)}`);
      } else {
        logger.warn(`[GTFS DIAGNOSTIC] CRITICAL: Returning 0 rows to frontend! Raw rows retrieved from DB was ${rows.length}`);
      }
      return finalResult;
    } catch (err) {
      logger.error(`[GTFS Service] Error computing daily timetable`, err);
      throw err;
    }
  },

  /**
   * Obtiene todas las líneas detectadas para un operador específico en SQL.
   */
  async listLinesForAgency(agencyId: string) {
    try {
      const query = `
        SELECT DISTINCT 
          r.route_short_name as codigo,
          r.route_long_name as nombre
        FROM gtfs.routes r
        JOIN gtfs.agency_routes ar ON r.route_short_name = ar.route_short_name
        WHERE ar.agency_id = ? AND ar.detection_count >= 50
        ORDER BY codigo ASC
      `;
      const raw = await sqlDb.raw(query, [agencyId]);
      return raw.rows || raw;
    } catch (err) {
      logger.error(`[GTFS Service] Error listing lines for agency`, err);
      throw err;
    }
  },

  /**
   * Extrae el recorrido exacto (polyline) y las paradas oficiales de PostgreSQL para el Navegador.
   */
  async getLineGeometry(agencyId: string, linea: string, directionId: number) {
    try {
      // 1. Fetch SHAPE (puntos polilínea)
      const shapeQuery = `
        WITH TargetShape AS (
          SELECT t.shape_id, COUNT(*) as pts
          FROM gtfs.trips t
          JOIN gtfs.routes r ON t.route_id = r.route_id
          JOIN gtfs.shapes s ON s.shape_id = t.shape_id
          WHERE r.route_short_name = ?
          AND t.direction_id = ?
          GROUP BY t.shape_id
          ORDER BY pts DESC
          LIMIT 1
        )
        SELECT s.shape_pt_lat as lat, s.shape_pt_lon as lng
        FROM gtfs.shapes s
        JOIN TargetShape ts ON s.shape_id = ts.shape_id
        ORDER BY s.shape_pt_sequence ASC;
      `;
      const shapeRaw = await sqlDb.raw(shapeQuery, [linea, directionId]);
      const shape = (shapeRaw.rows || shapeRaw).map((r: any) => ({
        lat: Number(r.lat),
        lng: Number(r.lng)
      }));

      // 2. Fetch PARADAS (stops)
      const stopsQuery = `
        WITH TargetTrip AS (
          SELECT t.trip_id, COUNT(*) as num_stops
          FROM gtfs.trips t
          JOIN gtfs.routes r ON t.route_id = r.route_id
          JOIN gtfs.stop_times st ON st.trip_id = t.trip_id
          WHERE r.route_short_name = ?
          AND t.direction_id = ?
          GROUP BY t.trip_id
          ORDER BY num_stops DESC
          LIMIT 1
        )
        SELECT 
          st.stop_id as id,
          st.stop_sequence as orden,
          s.stop_name as nombre,
          s.stop_lat as lat,
          s.stop_lon as lng
        FROM gtfs.stop_times st
        JOIN gtfs.stops s ON st.stop_id = s.stop_id
        JOIN TargetTrip tt ON st.trip_id = tt.trip_id
        ORDER BY st.stop_sequence ASC;
      `;
      const stopsRaw = await sqlDb.raw(stopsQuery, [linea, directionId]);
      const paradas = (stopsRaw.rows || stopsRaw).map((r: any) => ({
        id: String(r.id),
        nombre: r.nombre,
        orden: Number(r.orden),
        lat: Number(r.lat),
        lng: Number(r.lng)
      }));

      logger.info(`[GTFS GEOMETRY] Resolved ${linea} DIR ${directionId}: ${shape.length} points, ${paradas.length} stops.`);

      return {
        linea,
        directionId,
        sentido: directionId === 0 ? 'IDA' : 'VUELTA',
        recorrido: shape,
        paradas
      };
    } catch (err) {
      logger.error(`[GTFS Service] Error getting line geometry`, err);
      throw err;
    }
  },

  /**
   * Busca los viajes programados para UNA línea y sentido específico.
   */
  async getSpecificTimetable(agencyId: string, linea: string, directionId: number, serviceType: 'HABIL'|'SABADO'|'DOMINGO') {
    try {
      let dayFilter = 'monday = 1';
      if (serviceType === 'SABADO') dayFilter = 'saturday = 1';
      if (serviceType === 'DOMINGO') dayFilter = 'sunday = 1';

      const query = `
        SELECT 
          t.trip_id,
          MIN(st.departure_time) as start_time,
          MAX(st.arrival_time) as end_time
        FROM gtfs.trips t
        JOIN gtfs.routes r ON t.route_id = r.route_id
        JOIN gtfs.stop_times st ON st.trip_id = t.trip_id
        JOIN gtfs.calendar c ON t.service_id = c.service_id
        WHERE c.${dayFilter}
          AND r.route_short_name = ?
          AND t.direction_id = ?
        GROUP BY t.trip_id
        ORDER BY start_time ASC;
      `;

      const raw = await sqlDb.raw(query, [linea, directionId]);
      const rows = raw.rows || raw;

      const timeToMin = (timeStr: string) => {
        const [h, m] = timeStr.split(':').map(Number);
        return (h * 60) + m;
      };

      const viajes = rows.map((r: any) => ({
        s: r.start_time.substring(0, 5),
        t: [timeToMin(r.start_time), timeToMin(r.end_time)]
      }));

      return {
        agencyId,
        linea,
        directionId,
        sentido: directionId === 0 ? 'IDA' : 'VUELTA',
        serviceType,
        viajes,
        totalViajes: viajes.length
      };
    } catch (err) {
      logger.error(`[GTFS Service] Error loading specific timetable for ${linea}`, err);
      return null;
    }
  }
};
