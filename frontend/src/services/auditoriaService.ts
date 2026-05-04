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
 * Cero datos simulados — solo lee lo que ya está en Firestore.
 */
import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit,
} from 'firebase/firestore';
import { db, authReady } from '../config/firebase';

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
  const dow = d.getUTCDay() === 0 ? 0 : d.getDay();
  // Mejor: determinar día de semana en zona UY robusto
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

/* ─── Firestore: schemas locales ──────────────────────── */

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
}

/* ─── Carga del horario GTFS ──────────────────────────── */

async function loadTimetable(
  agencyId: string,
  linea: string,
  directionId: 0 | 1,
  svcType: 'HABIL' | 'SABADO' | 'DOMINGO',
): Promise<GtfsTimetableDoc | null> {
  const id = `${agencyId}_${linea}_${directionId}_${svcType}`;
  const snap = await getDoc(doc(db, 'gtfs_timetable', id));
  if (!snap.exists()) return null;
  return snap.data() as GtfsTimetableDoc;
}

async function loadStops(stopIds: string[]): Promise<Map<string, GtfsStopDoc>> {
  // Firestore tiene límite de 30 por `in` pero usamos getDoc en paralelo (más simple).
  const out = new Map<string, GtfsStopDoc>();
  const batches: string[][] = [];
  const seen = new Set<string>();
  for (const s of stopIds) {
    if (seen.has(s)) continue;
    seen.add(s);
    if (batches.length === 0 || batches[batches.length - 1].length >= 50) batches.push([]);
    batches[batches.length - 1].push(s);
  }
  for (const batch of batches) {
    const snaps = await Promise.all(
      batch.map(s => getDoc(doc(db, 'gtfs_stops', s)).catch(() => null)),
    );
    snaps.forEach((s, i) => {
      if (s && s.exists()) out.set(batch[i], s.data() as GtfsStopDoc);
    });
  }
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
  const snap = await getDocs(query(
    collection(db, 'vehicle_events'),
    where('agencyId', '==', agencyId),
    where('timestampGPS', '>=', since),
    where('timestampGPS', '<=', until),
    orderBy('timestampGPS', 'desc'),
    limit(8000),
  ));
  const out: VehicleEventDoc[] = [];
  for (const d of snap.docs) {
    const ev = d.data() as VehicleEventDoc;
    if (ev.estadoCumplimiento === 'FUERA_DE_SERVICIO') continue;
    if (normLineaCode(ev.linea) !== normLineaCode(linea)) continue;
    out.push(ev);
  }
  return out;
}

/* ─── Algoritmo de matching GPS ↔ control point ───────── */

/**
 * Para cada control point del viaje, encuentra los eventos GPS
 * "candidatos": misma línea, en una ventana ±VENTANA_MATCH_MIN del
 * tiempo programado, cuya `proximaParada` coincida (fuzzy) con el
 * nombre del stop O cuyo timestamp esté en la ventana exacta.
 *
 * Para evitar contar dos veces el mismo evento, se elige el control
 * point más cercano en tiempo y el evento se "consume" para ese punto.
 */
function asociarPasadas(
  controlPoints: ControlPoint[],
  eventosSentido: VehicleEventDoc[],
): { conPasadas: ControlPointConPasadas[]; consumidos: Set<string> } {
  // Pre-cómputo: minuto UY de cada evento + key estable (ts+idBus)
  const eventosEnriquecidos = eventosSentido.map((ev, i) => ({
    ...ev,
    tReal: isoToMinUY(ev.timestampGPS),
    key: `${ev.idBus}__${ev.timestampGPS}__${i}`,
  }));

  const consumidos = new Set<string>();
  const conPasadas: ControlPointConPasadas[] = [];

  // Normalizador de nombres para comparación tolerante
  const norm = (s: string | null | undefined) =>
    String(s ?? '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

  for (const cp of controlPoints) {
    const nombreNorm = norm(cp.nombre);
    const candidatos = eventosEnriquecidos
      .filter(e => !consumidos.has(e.key))
      .filter(e => {
        const dt = Math.abs(e.tReal - cp.tProgramado);
        if (dt > VENTANA_MATCH_MIN) return false;
        // Bonus: nombre coincide (más confiable). Si no coincide, igual aceptar
        // por proximidad temporal — el detector de proximaParada del backend
        // puede no haber asignado el stop correcto.
        return true;
      })
      .sort((a, b) => Math.abs(a.tReal - cp.tProgramado) - Math.abs(b.tReal - cp.tProgramado));

    const pasadas: PasadaGPS[] = [];
    // Permitir hasta 1 pasada por bus por control point en este viaje
    const busesYaContados = new Set<string>();
    for (const c of candidatos) {
      if (busesYaContados.has(c.idBus)) continue;
      // Bonus de afinidad por nombre
      const matchNombre = nombreNorm && norm(c.proximaParada).includes(nombreNorm.split(' ')[0]);
      const desv = c.tReal - cp.tProgramado;
      pasadas.push({
        idBus: c.idBus,
        tReal: c.tReal,
        desv,
        estado: c.estadoCumplimiento,
        timestampGPS: c.timestampGPS,
        proximaParada: c.proximaParada,
      });
      busesYaContados.add(c.idBus);
      consumidos.add(c.key);
      // Limitar a 8 pasadas por punto para no saturar la UI
      if (pasadas.length >= 8) break;
      // Si hay match exacto por nombre, dar prioridad — pero ya consumimos
      void matchNombre;
    }

    const enT = pasadas.filter(p => Math.abs(p.desv) <= TOL_EN_TIEMPO_MIN).length;
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
  await authReady;
  const svcType = svcTypeForYmd(fecha);
  const tt = await loadTimetable(agencyId, linea, directionId, svcType);
  if (!tt || !tt.stops?.length || !tt.viajes?.length) return null;

  const stopMap = await loadStops(tt.stops);
  const eventos = await loadEvents(agencyId, linea, fecha);

  // Filtrar eventos cuyo sentido coincida o sea desconocido
  const sentidoEsperado: 'IDA' | 'VUELTA' = directionId === 0 ? 'IDA' : 'VUELTA';
  const eventosSentido = eventos.filter(e =>
    e.sentido === sentidoEsperado || e.sentido === null,
  );

  // Construir las salidas a partir de los viajes del horario
  const salidas: Salida[] = [];
  // Para no contar doble, vamos a llevar consumidos a nivel línea+sentido
  // (cada viaje toma sus eventos)
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

    // Matching de pasadas para este viaje
    const { conPasadas, consumidos } = asociarPasadas(controlPoints, eventosDisponibles);
    // Quitar consumidos de la pool global para que no se repitan en otros viajes
    for (let i = eventosDisponibles.length - 1; i >= 0; i--) {
      const ev = eventosDisponibles[i];
      const key = `${ev.idBus}__${ev.timestampGPS}__${i}`;
      // Heurística: si los consumidos contienen ANY key con mismo ts+idBus, marcamos consumido
      // (no podemos rehacer keys idénticos; mejor: si quedó dentro de la ventana del viaje, marcar)
      if (ev.timestampGPS) {
        const tReal = isoToMinUY(ev.timestampGPS);
        if (tReal >= tInicio - VENTANA_MATCH_MIN && tReal <= tFin + VENTANA_MATCH_MIN) {
          // Verificamos si fue consumido (forma más robusta: si alguna pasada incluye ese ts+idBus)
          const fueUsado = conPasadas.some(cp => cp.pasadas.some(p =>
            p.idBus === ev.idBus && p.timestampGPS === ev.timestampGPS));
          if (fueUsado) eventosDisponibles.splice(i, 1);
        }
      }
      void key; void consumidos;
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

  // Pasadas huérfanas: eventos que no entraron a ningún viaje
  const pasadasHuerfanas: PasadaGPS[] = eventosDisponibles.map(ev => ({
    idBus: ev.idBus,
    tReal: isoToMinUY(ev.timestampGPS),
    desv: ev.desviacionMin ?? 0,
    estado: ev.estadoCumplimiento,
    timestampGPS: ev.timestampGPS,
    proximaParada: ev.proximaParada,
  }));

  // KPI sentido
  let totalSent = 0, enTSent = 0;
  for (const s of salidas) {
    totalSent += s.totalPasadas;
    enTSent += Math.round(s.totalPasadas * s.pctEnTiempo / 100);
  }
  const pctEnTiempoSentido = totalSent > 0 ? Math.round((enTSent / totalSent) * 100) : 0;

  return {
    agencyId, linea, directionId, serviceType: svcType, fecha,
    stopsCount: tt.stops.length,
    controlPointsCount: salidas[0]?.controlPoints.length ?? 0,
    salidas,
    pasadasHuerfanas,
    pctEnTiempoSentido,
    totalPasadasSentido: totalSent,
  };
}

/* ─── Helper público: minutos → HH:MM ─────────────────── */
export const minToHora = minToHHMM;
