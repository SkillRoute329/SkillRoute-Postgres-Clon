/**
 * auditoriaService.ts — Auditoría de cumplimiento por línea (estilo IMM)
 * =======================================================================
 *
 * Carga el horario GTFS oficial (gtfs_timetable + gtfs_stops) y lo cruza
 * con las pasadas GPS reales (vehicle_events) para construir, por cada
 * línea + sentido + día:
 *
 *   1. Lista de SALIDAS programadas (Desde / Salida / Llegada / Destino).
 *   2. Para cada salida: timeline de PUNTOS DE CONTROL (paradas con tiempo
 *      asignado en el GTFS) con la hora programada.
 *   3. Para cada control point: matching con eventos GPS reales (qué coche
 *      pasó, cuándo, con qué desviación).
 *
 * Cero datos simulados — solo lee lo que ya está en el backend.
 */
import { apiClient } from '../clients/apiClient';
import { distanciaMetros } from '../utils/geomath';

/* ─── Tipos públicos ──────────────────────────────────── */

export type EstadoCumplimiento =
  | 'EN_TIEMPO' | 'ADELANTADO' | 'ATRASADO' | 'SIN_HORARIO' | 'FUERA_DE_SERVICIO';

export interface ControlPoint {
  stopId: string;
  paradaIdx: number;
  nombre: string;
  lat: number;
  lng: number;
  /** Minutos desde medianoche (UY) según GTFS para este viaje. */
  tProgramado: number;
}

export interface PasadaGPS {
  idBus: string;
  /** Minuto del día (UY) cuando se registró el GPS cerca del control point. */
  tReal: number;
  /** Diferencia tReal - tProgramado, redondeada. + = atrasado, − = adelantado. */
  desv: number;
  estado: EstadoCumplimiento;
  timestampGPS: string;
  proximaParada: string | null;
}

export interface ControlPointConPasadas extends ControlPoint {
  pasadas: PasadaGPS[];
  pctEnTiempo: number; // 0-100 sobre las pasadas detectadas
}

export interface Salida {
  /** Hora de salida del primer control point (HH:MM en hora UY). */
  horaSalida: string;
  /** Hora estimada de llegada al último control point (HH:MM). */
  horaLlegada: string;
  origenNombre: string;
  destinoNombre: string;
  controlPoints: ControlPointConPasadas[];
  /** Coches detectados en la ventana de este viaje (heurística). */
  cochesDetectados: string[];
  totalPasadas: number;
  pctEnTiempo: number;
}

export interface AuditoriaLineaSentido {
  agencyId: string;
  linea: string;
  directionId: 0 | 1;
  serviceType: 'HABIL' | 'SABADO' | 'DOMINGO';
  fecha: string; // YYYY-MM-DD
  /** Lista canónica de paradas del recorrido (incluye intermedias sin t). */
  stopsCount: number;
  /** Total de control points (paradas con tiempo asignado en GTFS). */
  controlPointsCount: number;
  salidas: Salida[];
  /** Eventos que NO se pudieron asociar a ningún viaje del horario. */
  pasadasHuerfanas: PasadaGPS[];
  pctEnTiempoSentido: number;
  totalPasadasSentido: number;
  /**
   * % EN_TIEMPO calculado sobre TODOS los eventos GPS de la línea+sentido del
   * día (igual que la fila resumen del listado). Sirve como referencia de la
   * realidad operativa global y evita inconsistencias entre la lista y la
   * vista detallada.
   */
  pctEnTiempoLineaCompleta: number;
  totalEventosLineaCompleta: number;
  /** % de eventos con sentido IDA o VUELTA detectado por el backend. */
  sentidoCobertura: number;
}

/* ─── Constantes ──────────────────────────────────────── */

/** Tolerancia (min) para asociar un GPS a un control point específico. */
const VENTANA_MATCH_MIN = 12;
/** Tolerancia (min) considerada EN_TIEMPO para cumplimiento (estándar IMM). */
const TOL_EN_TIEMPO_MIN = 4;

/* ─── Helpers de fecha (zona Montevideo) ──────────────── */

export function ymdMvd(d: Date): string {
  const local = new Date(d.getTime() - 3 * 3600_000);
  return local.toISOString().slice(0, 10);
}
export function startOfDayMvdISO(ymd: string): string {
  return new Date(`${ymd}T00:00:00-03:00`).toISOString();
}
export function endOfDayMvdISO(ymd: string): string {
  return new Date(`${ymd}T23:59:59.999-03:00`).toISOString();
}
export function svcTypeForYmd(ymd: string): 'HABIL' | 'SABADO' | 'DOMINGO' {
  // Forzar interpretación local UY
  const d = new Date(`${ymd}T12:00:00-03:00`);
  const local = new Date(d.getTime() - 3 * 3600_000);
  const dowUY = local.getUTCDay();
  if (dowUY === 0) return 'DOMINGO';
  if (dowUY === 6) return 'SABADO';
  return 'HABIL';
}

function minToHHMM(min: number): string {
  if (!isFinite(min) || min < 0) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isoToMinUY(iso: string): number {
  const d = new Date(iso);
  const local = new Date(d.getTime() - 3 * 3600_000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

function normLineaCode(l: string): string {
  return String(l ?? '').trim().replace(/^0+/, '') || '0';
}

/* ─── Schemas locales ──────────────────────────────────── */

interface GtfsTimetableDoc {
  linea: string;
  directionId: number | string;
  serviceType: string;
  stops: string[];
  viajes: Array<{ s: string; t: number[] }>;
  primeraS?: string;
  ultimaS?: string;
}

interface GtfsStopDoc {
  codigo?: string;
  stopId?: string;
  nombre?: string;
  stop_name?: string;
  lat?: number;
  lng?: number;
  stop_lat?: string | number;
  stop_lon?: string | number;
}

interface VehicleEventDoc {
  idBus: string;
  empresa?: string;
  linea: string;
  agencyId?: string;
  sentido: 'IDA' | 'VUELTA' | null;
  estadoCumplimiento: EstadoCumplimiento;
  desviacionMin: number | null;
  proximaParada: string | null;
  timestampGPS: string;
  // FASE 5.14 (2026-05-13): lat/lon para match espacial al control point.
  lat?: number;
  lon?: number;
}

/* ─── Carga del horario GTFS ──────────────────────────── */

async function loadTimetable(
  agencyId: string,
  linea: string,
  directionId: 0 | 1,
  svcType: 'HABIL' | 'SABADO' | 'DOMINGO',
): Promise<GtfsTimetableDoc | null> {
  const id = `${agencyId}_${linea}_${directionId}_${svcType}`;
  // FASE 5.14 (2026-05-13): apiClient devuelve `{ ok, data, ... }` envelope.
  // El código original casteaba directo a `GtfsTimetableDoc`, leyendo siempre
  // stops/viajes = undefined → "Sin horario GTFS" aunque el backend respondiera
  // OK. Ahora extraemos `.data` explícitamente.
  const resp = await apiClient.get<GtfsTimetableDoc>('/api/db/gtfs_timetable/' + encodeURIComponent(id));
  return resp?.data ?? null;
}

async function loadStops(stopIds: string[]): Promise<Map<string, GtfsStopDoc>> {
  const out = new Map<string, GtfsStopDoc>();
  const seen = new Set<string>();
  const unique = stopIds.filter(s => { if (seen.has(s)) return false; seen.add(s); return true; });
  const results = await Promise.all(
    unique.map(s =>
      apiClient.get<GtfsStopDoc>('/api/db/gtfs_stops/' + encodeURIComponent(s)).catch(() => null),
    ),
  );
  results.forEach((resp, i) => {
    if (resp?.data) out.set(unique[i], resp.data);
  });
  return out;
}

function stopName(s: GtfsStopDoc | undefined, fallback: string): string {
  return (s?.nombre ?? s?.stop_name ?? fallback).toString();
}

/* ─── Carga de eventos GPS del día ────────────────────── */

async function loadEvents(
  agencyId: string,
  linea: string,
  fecha: string,
): Promise<VehicleEventDoc[]> {
  const since = startOfDayMvdISO(fecha);
  const until = endOfDayMvdISO(fecha);
  // FASE 5.14: apiClient devuelve envelope; antes castea a `as any[]` y
  // Array.isArray() era siempre false → 0 eventos cargados → la auditoría
  // mostraba sólo "huerfanas" o vacía. Extraemos `.data` explícitamente.
  const resp = await apiClient.get<VehicleEventDoc[]>('/api/db/vehicle_events', {
    query: {
      where: `agencyId:${agencyId},timestampGPS>=${since},timestampGPS<=${until}`,
      orderBy: 'timestampGPS:desc',
      limit: 8000,
    },
  });
  const arr = Array.isArray(resp?.data) ? resp.data : [];
  const out: VehicleEventDoc[] = [];
  for (const d of arr) {
    const ev = d as VehicleEventDoc;
    if (ev.estadoCumplimiento === 'FUERA_DE_SERVICIO') continue;
    if (normLineaCode(ev.linea) !== normLineaCode(linea)) continue;
    out.push(ev);
  }
  return out;
}

/* ─── Algoritmo de matching GPS ↔ control point ───────── */

/**
 * FASE 5.14 (2026-05-13) — matching espacio-temporal.
 *
 * Antes: solo match temporal (|t_real - t_programado| < 12 min). Un bus
 * con 15 min de atraso NUNCA matcheaba su control point real → columnas
 * COCHES / PASADAS quedaban en "—" para muchas salidas.
 *
 * Ahora: combinamos dos señales:
 *   - Espacial (Haversine): el GPS del evento está a <400 m del control
 *     point. Si pasa el filtro espacial, el match es confiable aunque el
 *     tiempo difiera 30 min.
 *   - Temporal: ventana amplia (30 min) para no perder atrasos grandes.
 *
 * Score = distancia_metros + |delta_minutos| * 100 (1 min = 100 m de
 * penalty equivalente). El menor score gana.
 */
const VENTANA_MATCH_MIN_AMPLIA = 30;
const DIST_MATCH_METROS = 400;

// FASE 5.16: delega en utils/geomath (fuente única). API local intacta.
function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  return distanciaMetros(a, b);
}

function asociarPasadas(
  controlPoints: ControlPoint[],
  eventosSentido: VehicleEventDoc[],
): { conPasadas: ControlPointConPasadas[]; consumidos: Set<string> } {
  const eventosEnriquecidos = eventosSentido.map((ev, i) => ({
    ...ev,
    tReal: isoToMinUY(ev.timestampGPS),
    key: `${ev.idBus}__${ev.timestampGPS}__${i}`,
  }));

  const consumidos = new Set<string>();
  const conPasadas: ControlPointConPasadas[] = [];

  for (const cp of controlPoints) {
    const cpHasGeo = isFinite(cp.lat) && isFinite(cp.lng) && cp.lat !== 0 && cp.lng !== 0;

    // 1) Candidatos: espacio O tiempo. Cualquiera califica.
    const candidatos = eventosEnriquecidos
      .filter((e) => !consumidos.has(e.key))
      .map((e) => {
        const dt = Math.abs(e.tReal - cp.tProgramado);
        let distMetros = Infinity;
        if (cpHasGeo && typeof e.lat === 'number' && typeof e.lon === 'number' && e.lat !== 0 && e.lon !== 0) {
          distMetros = haversineM({ lat: e.lat, lon: e.lon }, { lat: cp.lat, lon: cp.lng });
        }
        // Calificar: cerca espacialmente Y dentro de ventana grande, O cerca temporalmente
        const okEspacial = distMetros <= DIST_MATCH_METROS && dt <= VENTANA_MATCH_MIN_AMPLIA;
        const okTemporal = dt <= VENTANA_MATCH_MIN;
        return { ev: e, dt, distMetros, ok: okEspacial || okTemporal };
      })
      .filter((c) => c.ok)
      // Score combinado: 1 min = 100 m de penalty equivalente
      .sort((a, b) => {
        const sa = (isFinite(a.distMetros) ? a.distMetros : 1500) + a.dt * 100;
        const sb = (isFinite(b.distMetros) ? b.distMetros : 1500) + b.dt * 100;
        return sa - sb;
      });

    const pasadas: PasadaGPS[] = [];
    const busesYaContados = new Set<string>();
    for (const c of candidatos) {
      if (busesYaContados.has(c.ev.idBus)) continue;
      // Desviación: si el backend ya la computó, usar esa. Si no, derivar de tiempo.
      const desvBackend = (c.ev as VehicleEventDoc).desviacionMin;
      const desv =
        typeof desvBackend === 'number' && isFinite(desvBackend)
          ? desvBackend
          : c.ev.tReal - cp.tProgramado;
      pasadas.push({
        idBus: c.ev.idBus,
        tReal: c.ev.tReal,
        desv,
        estado: c.ev.estadoCumplimiento,
        timestampGPS: c.ev.timestampGPS,
        proximaParada: c.ev.proximaParada,
      });
      busesYaContados.add(c.ev.idBus);
      consumidos.add(c.ev.key);
      if (pasadas.length >= 8) break;
    }

    const enT = pasadas.filter(
      (p) => p.estado === 'EN_TIEMPO' || Math.abs(p.desv) <= TOL_EN_TIEMPO_MIN,
    ).length;
    conPasadas.push({
      ...cp,
      pasadas,
      pctEnTiempo: pasadas.length > 0 ? Math.round((enT / pasadas.length) * 100) : 0,
    });
  }

  return { conPasadas, consumidos };
}

/* ─── Función principal: armar la auditoría ───────────── */

export async function fetchAuditoriaLineaSentido(
  agencyId: string,
  linea: string,
  directionId: 0 | 1,
  fecha: string,
): Promise<AuditoriaLineaSentido | null> {
  const svcType = svcTypeForYmd(fecha);
  const tt = await loadTimetable(agencyId, linea, directionId, svcType);
  if (!tt || !tt.stops?.length || !tt.viajes?.length) return null;

  const stopMap = await loadStops(tt.stops);
  const eventos = await loadEvents(agencyId, linea, fecha);

  const sentidoEsperado: 'IDA' | 'VUELTA' = directionId === 0 ? 'IDA' : 'VUELTA';
  // FASE 5.14 (2026-05-13): vehicle_events no persiste todavia el campo
  // `sentido` (queda undefined). Antes el filtro descartaba todo el que no
  // fuera 'IDA' o null estricto → grid de auditoria con coches/pasadas
  // en "—". Aceptamos null y undefined (== null) y todo aquel cuyo sentido
  // sea el esperado. Cuando se persista `sentido` en vehicle_events, los
  // eventos VUELTA quedaran fuera del grid IDA automaticamente.
  const eventosSentido = eventos.filter(e =>
    e.sentido === sentidoEsperado || e.sentido == null,
  );

  const salidas: Salida[] = [];
  const eventosDisponibles = [...eventosSentido];

  for (const viaje of tt.viajes) {
    const tArr = (viaje.t ?? []).map(n => Number(n));
    const controlPoints: ControlPoint[] = [];
    for (let i = 0; i < tArr.length; i++) {
      const t = tArr[i];
      if (t === -1 || !isFinite(t)) continue;
      const stopId = tt.stops[i];
      const sd = stopMap.get(stopId);
      const lat = typeof sd?.lat === 'number' ? sd.lat : parseFloat(String(sd?.stop_lat ?? '0'));
      const lng = typeof sd?.lng === 'number' ? sd.lng : parseFloat(String(sd?.stop_lon ?? '0'));
      controlPoints.push({
        stopId,
        paradaIdx: i,
        nombre: stopName(sd, stopId),
        lat: isFinite(lat) ? lat : 0,
        lng: isFinite(lng) ? lng : 0,
        tProgramado: t,
      });
    }
    if (controlPoints.length === 0) continue;

    const tInicio = controlPoints[0].tProgramado;
    const tFin = controlPoints[controlPoints.length - 1].tProgramado;

    const { conPasadas, consumidos } = asociarPasadas(controlPoints, eventosDisponibles);
    for (let i = eventosDisponibles.length - 1; i >= 0; i--) {
      const ev = eventosDisponibles[i];
      if (ev.timestampGPS) {
        const tReal = isoToMinUY(ev.timestampGPS);
        if (tReal >= tInicio - VENTANA_MATCH_MIN && tReal <= tFin + VENTANA_MATCH_MIN) {
          const fueUsado = conPasadas.some(cp => cp.pasadas.some(p =>
            p.idBus === ev.idBus && p.timestampGPS === ev.timestampGPS));
          if (fueUsado) eventosDisponibles.splice(i, 1);
        }
      }
      void consumidos;
    }

    const cochesSet = new Set<string>();
    let totalPas = 0;
    let enT = 0;
    for (const cp of conPasadas) {
      for (const p of cp.pasadas) {
        cochesSet.add(p.idBus);
        totalPas += 1;
        if (Math.abs(p.desv) <= TOL_EN_TIEMPO_MIN) enT += 1;
      }
    }

    salidas.push({
      horaSalida: minToHHMM(tInicio),
      horaLlegada: minToHHMM(tFin),
      origenNombre: controlPoints[0].nombre,
      destinoNombre: controlPoints[controlPoints.length - 1].nombre,
      controlPoints: conPasadas,
      cochesDetectados: [...cochesSet].sort(),
      totalPasadas: totalPas,
      pctEnTiempo: totalPas > 0 ? Math.round((enT / totalPas) * 100) : 0,
    });
  }

  const pasadasHuerfanas: PasadaGPS[] = eventosDisponibles.map(ev => ({
    idBus: ev.idBus,
    tReal: isoToMinUY(ev.timestampGPS),
    desv: ev.desviacionMin ?? 0,
    estado: ev.estadoCumplimiento,
    timestampGPS: ev.timestampGPS,
    proximaParada: ev.proximaParada,
  }));

  let totalSent = 0, enTSent = 0;
  for (const s of salidas) {
    totalSent += s.totalPasadas;
    enTSent += Math.round(s.totalPasadas * s.pctEnTiempo / 100);
  }
  const pctEnTiempoSentido = totalSent > 0 ? Math.round((enTSent / totalSent) * 100) : 0;

  const conHorario = eventosSentido.filter(e => e.estadoCumplimiento !== 'SIN_HORARIO');
  const enTLinea = conHorario.filter(e => e.estadoCumplimiento === 'EN_TIEMPO').length;
  const baseLinea = conHorario.length;
  const pctEnTiempoLineaCompleta = baseLinea > 0 ? Math.round((enTLinea / baseLinea) * 100) : 0;

  const conSentidoDetectado = eventosSentido.filter(e =>
    e.sentido === 'IDA' || e.sentido === 'VUELTA',
  ).length;
  const sentidoCobertura = eventosSentido.length > 0
    ? Math.round((conSentidoDetectado / eventosSentido.length) * 100)
    : 100;

  return {
    agencyId, linea, directionId, serviceType: svcType, fecha,
    stopsCount: tt.stops.length,
    controlPointsCount: salidas[0]?.controlPoints.length ?? 0,
    salidas,
    pasadasHuerfanas,
    pctEnTiempoSentido,
    totalPasadasSentido: totalSent,
    pctEnTiempoLineaCompleta,
    totalEventosLineaCompleta: eventosSentido.length,
    sentidoCobertura,
  };
}

/* ─── Helper público: minutos → HH:MM ─────────────────── */
export const minToHora = minToHHMM;
