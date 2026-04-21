/**
 * scheduleComplianceEngine.ts
 * Motor de cumplimiento automático — compara posición GPS en tiempo real
 * contra la malla horaria GTFS oficial (invierno 2026).
 *
 * No requiere inspectores. Funciona para UCOT, CUTCSA, COETC, COME.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fetchBusesLive, EMPRESA_CODES, type BusFeature } from './immRealtimeService';
import { logger } from '../config/logger';

// ── Tipos ─────────────────────────────────────────────────────────────────

export interface ControlStop {
  seq: number;
  stop_id: string;
  name: string;
  desc: string;
  lat: number | null;
  lon: number | null;
  arrival: string; // "HH:MM:SS"
}

export interface ScheduledTrip {
  trip_id: string;
  departure: string | null;
  arrival: string | null;
  control_stops: ControlStop[];
}

export interface RouteSchedule {
  route_long_name: string;
  habiles: ScheduledTrip[];
  sabados: ScheduledTrip[];
  domingos: ScheduledTrip[];
}

export interface AgencySchedule {
  agency_name: string;
  routes: Record<string, RouteSchedule>;
}

export type ScheduleIndex = Record<string, AgencySchedule>; // agency_id → AgencySchedule
export type StopsGeo = Record<string, { name: string; desc: string; lat: number; lon: number }>;

// ── Carga de datos GTFS (una sola vez en memoria) ─────────────────────────

const DATA_DIR = path.join(__dirname, '../data/gtfs');

let _scheduleIndex: ScheduleIndex | null = null;
let _stopsGeo: StopsGeo | null = null;

function getScheduleIndex(): ScheduleIndex {
  if (!_scheduleIndex) {
    _scheduleIndex = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, 'schedule_index.json'), 'utf8'),
    ) as ScheduleIndex;
    logger.info('[ComplianceEngine] schedule_index.json cargado en memoria');
  }
  return _scheduleIndex;
}

function getStopsGeo(): StopsGeo {
  if (!_stopsGeo) {
    _stopsGeo = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, 'stops_geo.json'), 'utf8'),
    ) as StopsGeo;
  }
  return _stopsGeo;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Distancia en km entre dos coordenadas (Haversine simplificado) */
function distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Convierte "HH:MM:SS" a minutos desde medianoche */
function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Día de la semana → tipo de horario */
function getDayType(date: Date): 'habiles' | 'sabados' | 'domingos' {
  const dow = date.getDay(); // 0=dom, 6=sab
  if (dow === 0) return 'domingos';
  if (dow === 6) return 'sabados';
  return 'habiles';
}

// ── API pública ────────────────────────────────────────────────────────────

/** Devuelve todas las líneas y viajes disponibles para una empresa */
export function getRoutesForAgency(agencyId: string): Record<string, RouteSchedule> | null {
  const idx = getScheduleIndex();
  return idx[agencyId]?.routes ?? null;
}

/** Lista de empresas disponibles en el GTFS */
export function getAvailableAgencies(): Array<{ id: string; name: string; routes: string[] }> {
  const idx = getScheduleIndex();
  return Object.entries(idx).map(([id, ag]) => ({
    id,
    name: ag.agency_name,
    routes: Object.keys(ag.routes),
  }));
}

/** Viajes activos ahora mismo para una línea + empresa + día */
export function getActiveTripsNow(agencyId: string, routeShort: string, now = new Date()): ScheduledTrip[] {
  const idx = getScheduleIndex();
  const route = idx[agencyId]?.routes[routeShort];
  if (!route) return [];
  const dayType = getDayType(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return route[dayType].filter(t => {
    if (!t.departure || !t.arrival) return false;
    const dep = toMin(t.departure);
    const arr = toMin(t.arrival);
    return nowMin >= dep && nowMin <= arr;
  });
}

export interface BusComplianceResult {
  idBus: string;
  linea: string;
  empresa: string;
  agencyId: string;
  lat: number;
  lon: number;
  velocidad: number;
  timestampGPS: string;
  // Cumplimiento
  tripActivo: ScheduledTrip | null;
  proximaParadaControl: ControlStop | null;
  minutosParaProximaParada: number | null;
  desviacionMin: number | null; // + adelantado, - atrasado
  estadoCumplimiento: 'EN_TIEMPO' | 'ADELANTADO' | 'ATRASADO' | 'SIN_HORARIO' | 'FUERA_DE_SERVICIO';
  distanciaParadaKm: number | null;
}

/**
 * Analiza cumplimiento de todos los buses de una empresa en tiempo real.
 * Descarga GPS del STM y cruza contra la malla GTFS.
 */
export async function analyzeComplianceForAgency(agencyId: string): Promise<BusComplianceResult[]> {
  const now = new Date();
  const idx = getScheduleIndex();
  const agData = idx[agencyId];
  if (!agData) {
    logger.warn(`[ComplianceEngine] Agency ${agencyId} no encontrada en GTFS`);
    return [];
  }
  const dayType = getDayType(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Mapear agencyId a código STM
  const codeMap: Record<string, string> = {
    '10': EMPRESA_CODES.COETC,
    '20': EMPRESA_CODES.COME,
    '50': EMPRESA_CODES.CUTCSA,
    '70': EMPRESA_CODES.UCOT,
  };
  const stmCode = codeMap[agencyId] ?? agencyId;

  // Obtener posiciones GPS en vivo
  let features: BusFeature[];
  try {
    const geoJson = await fetchBusesLive(stmCode);
    features = geoJson.features ?? [];
  } catch (err) {
    logger.error('[ComplianceEngine] Error obteniendo GPS:', err);
    return [];
  }

  const results: BusComplianceResult[] = [];

  for (const feat of features) {
    const p = feat.properties;
    const [lon, lat] = feat.geometry.coordinates;
    const routeShort = p.linea;
    const route = agData.routes[routeShort];

    if (!route) {
      results.push({
        idBus: String(p.codigoBus),
        linea: routeShort,
        empresa: agData.agency_name,
        agencyId,
        lat,
        lon,
        velocidad: p.velocidad ?? 0,
        timestampGPS: now.toISOString(),
        tripActivo: null,
        proximaParadaControl: null,
        minutosParaProximaParada: null,
        desviacionMin: null,
        estadoCumplimiento: 'SIN_HORARIO',
        distanciaParadaKm: null,
      });
      continue;
    }

    // Encontrar viaje activo (el que debería estar corriendo ahora)
    const activeTrips = route[dayType].filter(t => {
      if (!t.departure || !t.arrival) return false;
      const dep = toMin(t.departure);
      const arr = toMin(t.arrival);
      return nowMin >= dep - 5 && nowMin <= arr + 5; // margen 5 min
    });

    const tripActivo = activeTrips.length > 0 ? activeTrips[0] : null;

    if (!tripActivo) {
      results.push({
        idBus: String(bus.codigoBus ?? '?'),
        linea: routeShort,
        empresa: agData.agency_name,
        agencyId,
        lat: bus.lat,
        lon: bus.lng ?? bus.lon,
        velocidad: bus.velocidad ?? 0,
        timestampGPS: now.toISOString(),
        tripActivo: null,
        proximaParadaControl: null,
        minutosParaProximaParada: null,
        desviacionMin: null,
        estadoCumplimiento: 'FUERA_DE_SERVICIO',
        distanciaParadaKm: null,
      });
      continue;
    }

    // Encontrar próxima parada de control
    let proximaParada: ControlStop | null = null;
    let minDistKm = Infinity;
    let desviacion: number | null = null;

    for (const stop of tripActivo.control_stops) {
      if (!stop.lat || !stop.lon) continue;
      const stopMin = toMin(stop.arrival);
      if (stopMin < nowMin - 10) continue; // ya pasada hace más de 10 min
      const dist = distKm(busLat, busLon, stop.lat, stop.lon);
      if (dist < minDistKm) {
        minDistKm = dist;
        proximaParada = stop;
      }
    }

    let estadoCumplimiento: BusComplianceResult['estadoCumplimiento'] = 'EN_TIEMPO';
    let minutosParaProxima: number | null = null;

    if (proximaParada) {
      const stopMin = toMin(proximaParada.arrival);
      minutosParaProxima = stopMin - nowMin;
      // Velocidad actual en km/min
      const velKmMin = (p.velocidad ?? 20) / 60;
      // Tiempo estimado para llegar a la parada (si velocidad > 0)
      const tiempoEstimado = velKmMin > 0 ? minDistKm / velKmMin : null;
      if (tiempoEstimado !== null) {
        desviacion = Math.round(minutosParaProxima - tiempoEstimado);
        if (desviacion > 3) estadoCumplimiento = 'ATRASADO';
        else if (desviacion < -3) estadoCumplimiento = 'ADELANTADO';
        else estadoCumplimiento = 'EN_TIEMPO';
      }
    }

    results.push({
      idBus: String(p.codigoBus),
      linea: routeShort,
      empresa: agData.agency_name,
      agencyId,
      lat: busLat,
      lon: busLon,
      velocidad: bus.velocidad ?? 0,
      timestampGPS: now.toISOString(),
      tripActivo,
      proximaParadaControl: proximaParada,
      minutosParaProximaParada: minutosParaProxima,
      desviacionMin: desviacion,
      estadoCumplimiento,
      distanciaParadaKm: minDistKm === Infinity ? null : Math.round(minDistKm * 100) / 100,
    });
  }

  return results;
}

/** Resumen por línea: cantidad de buses activos, % cumplimiento, alertas */
export function summarizeByRoute(results: BusComplianceResult[]): Record<string, {
  linea: string;
  busesActivos: number;
  enTiempo: number;
  atrasados: number;
  adelantados: number;
  sinHorario: number;
  pctCumplimiento: number;
}> {
  const byRoute: Record<string, ReturnType<typeof summarizeByRoute>[string]> = {};
  for (const r of results) {
    if (!byRoute[r.linea]) {
      byRoute[r.linea] = {
        linea: r.linea, busesActivos: 0,
        enTiempo: 0, atrasados: 0, adelantados: 0, sinHorario: 0, pctCumplimiento: 0,
      };
    }
    const s = byRoute[r.linea];
    s.busesActivos++;
    if (r.estadoCumplimiento === 'EN_TIEMPO') s.enTiempo++;
    else if (r.estadoCumplimiento === 'ATRASADO') s.atrasados++;
    else if (r.estadoCumplimiento === 'ADELANTADO') s.adelantados++;
    else s.sinHorario++;
  }
  Object.values(byRoute).forEach(s => {
    const withSchedule = s.enTiempo + s.atrasados + s.adelantados;
    s.pctCumplimiento = withSchedule > 0 ? Math.round((s.enTiempo / withSchedule) * 100) : 0;
  });
  return byRoute;
}
