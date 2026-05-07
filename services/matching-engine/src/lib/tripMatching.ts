// Algoritmo §6 SPEC_CUMPLIMIENTO_V2_BACKEND_2026_05.md
// Matching pasada GPS ↔ viaje programado GTFS
import { db } from './firestore';
import { GpsEvent, Trip, TripMatch, Timepoint, Sentido } from '../types';
import { diffMin, haversineM } from './turfHelpers';

const GTFS_TIMETABLE_COL = 'gtfs_timetable';
const TRIP_WINDOW_MIN = 20;   // ventana temporal para filtrar trips candidatos
const TIMEPOINT_RADIO_M = 80; // radio máximo para asociar un ping a un timepoint
const TIMEPOINT_WINDOW_MIN = 10; // ventana temporal del timepoint
const MIN_SCORE = 0.4;         // umbral mínimo para aceptar un match
const MIN_MATCHED_TIMEPOINTS = 2;

// ── Carga de trips GTFS desde Firestore ─────────────────────────────────────

function todayServiceType(): 'HABIL' | 'SABADO' | 'DOMINGO' {
  const day = new Date().getDay(); // 0=Dom, 1=Lun..., 6=Sab
  if (day === 0) return 'DOMINGO';
  if (day === 6) return 'SABADO';
  return 'HABIL';
}

// Lee trips del timetable GTFS para la línea+sentido+día
async function cargarTrips(
  agencyId: string,
  linea: string,
  sentido: Sentido,
  serviceType?: 'HABIL' | 'SABADO' | 'DOMINGO'
): Promise<Trip[]> {
  const directionId = sentido === 'IDA' ? 0 : 1;
  const svc = serviceType ?? todayServiceType();
  const docId = `${agencyId}_${linea}_${directionId}_${svc}`;

  const snap = await db.collection(GTFS_TIMETABLE_COL).doc(docId).get();
  if (!snap.exists) return [];

  const data = snap.data()!;
  // El documento puede tener 'viajes' o 'trips' o 'paradas' (ver gtfsImporter)
  // Construimos la lista de trips desde el campo canónico
  const rawTrips: any[] = Array.isArray(data.viajes) ? data.viajes
    : Array.isArray(data.trips) ? data.trips
    : [];

  if (rawTrips.length === 0) {
    // Formato alternativo: doc es un único viaje con paradas
    const paradas: Timepoint[] = (data.paradas ?? []).map((p: any) => ({
      lat: typeof p.lat === 'number' ? p.lat : 0,
      lng: typeof p.lon === 'number' ? p.lon : (typeof p.lng === 'number' ? p.lng : 0),
      scheduled: p.hora ?? p.scheduled ?? '00:00:00',
      stopName: p.nombre ?? p.stop_name ?? '',
    }));
    return [{
      trip_id: docId,
      route_id: linea,
      direction_id: directionId,
      start_time: paradas[0]?.scheduled ?? '00:00:00',
      service_id: svc,
      timepoints: paradas,
    }];
  }

  return rawTrips.map((t: any) => ({
    trip_id: t.trip_id ?? t.id ?? docId,
    route_id: t.route_id ?? linea,
    direction_id: directionId,
    start_time: t.start_time ?? t.hora_salida ?? '00:00:00',
    service_id: svc,
    timepoints: (t.paradas ?? t.timepoints ?? []).map((p: any): Timepoint => ({
      lat: p.lat ?? 0,
      lng: p.lon ?? p.lng ?? 0,
      scheduled: p.hora ?? p.scheduled ?? '00:00:00',
      stopName: p.nombre ?? p.stop_name ?? '',
    })),
  }));
}

// ── Paso 1: filtrar por ventana temporal ─────────────────────────────────────

function primerPingEnTerminal(
  eventos: GpsEvent[],
  terminalName: string | null,
  radioM = 200
): string | null {
  if (!terminalName || eventos.length === 0) {
    // Sin terminal conocido, usar el primer ping como proxy
    return eventos[0]?.timestampGPS ?? null;
  }
  // Si tenemos coordenadas del terminal las usaríamos, pero solo tenemos nombre.
  // Fallback: primer ping del batch
  return eventos[0]?.timestampGPS ?? null;
}

function filtrarPorVentana(trips: Trip[], tInicioBus: string | null): Trip[] {
  if (!tInicioBus) return trips;
  const horaStr = tInicioBus.substring(11, 19); // HH:MM:SS de ISO 8601
  return trips.filter(t => Math.abs(diffMin(t.start_time, horaStr)) <= TRIP_WINDOW_MIN);
}

// ── Paso 2: score de matching por timepoints ─────────────────────────────────

function encontrarPingMasCercano(
  eventos: GpsEvent[],
  tpLat: number,
  tpLng: number,
  tpScheduled: string,
  radioM: number,
  windowMin: number
): GpsEvent | null {
  let mejor: GpsEvent | null = null;
  let mejorScore = Infinity;

  for (const e of eventos) {
    const distM = haversineM({ lat: e.lat, lng: e.lng }, { lat: tpLat, lng: tpLng });
    if (distM > radioM) continue;

    const horaEvento = e.timestampGPS.substring(11, 19); // HH:MM:SS
    const tiempoErrorMin = Math.abs(diffMin(horaEvento, tpScheduled));
    if (tiempoErrorMin > windowMin) continue;

    const score = distM + tiempoErrorMin * 10; // combinar distancia y tiempo
    if (score < mejorScore) {
      mejorScore = score;
      mejor = e;
    }
  }
  return mejor;
}

function scorearTrip(trip: Trip, eventosBus: GpsEvent[]): { score: number; matched: number } {
  const timepoints = trip.timepoints;
  if (timepoints.length === 0) return { score: 0, matched: 0 };

  let scoreTotal = 0;
  let matched = 0;

  for (const tp of timepoints) {
    const ping = encontrarPingMasCercano(
      eventosBus, tp.lat, tp.lng, tp.scheduled,
      TIMEPOINT_RADIO_M, TIMEPOINT_WINDOW_MIN
    );
    if (ping) {
      const distError = haversineM({ lat: ping.lat, lng: ping.lng }, { lat: tp.lat, lng: tp.lng });
      const horaEvento = ping.timestampGPS.substring(11, 19);
      const tiempoErrorMin = Math.abs(diffMin(horaEvento, tp.scheduled));
      scoreTotal += (1 - distError / TIMEPOINT_RADIO_M) * (1 - tiempoErrorMin / TIMEPOINT_WINDOW_MIN);
      matched++;
    }
  }

  return { score: matched > 0 ? scoreTotal / timepoints.length : 0, matched };
}

// ── API pública ──────────────────────────────────────────────────────────────

export async function matchPasadaToTrip(
  eventosBus: GpsEvent[],
  agencyId: string,
  linea: string,
  sentido: Sentido,
  terminalInicio: string | null
): Promise<TripMatch | null> {
  if (eventosBus.length === 0) return null;

  const trips = await cargarTrips(agencyId, linea, sentido);
  if (trips.length === 0) return null;

  const tInicioBus = primerPingEnTerminal(eventosBus, terminalInicio);
  const candidatosTemporal = filtrarPorVentana(trips, tInicioBus);

  if (candidatosTemporal.length === 0) {
    // Viaje fantasma — no programado o salida >20 min fuera de ventana
    return null;
  }

  const matches = candidatosTemporal
    .map(trip => ({ trip, ...scorearTrip(trip, eventosBus) }))
    .sort((a, b) => b.score - a.score);

  const mejor = matches[0];
  if (mejor.score < MIN_SCORE || mejor.matched < MIN_MATCHED_TIMEPOINTS) {
    return null; // matching incierto — pasada-sin-trip
  }

  return {
    tripId: mejor.trip.trip_id,
    score: mejor.score,
    matchedTimepoints: mejor.matched,
    totalTimepoints: mejor.trip.timepoints.length,
  };
}
