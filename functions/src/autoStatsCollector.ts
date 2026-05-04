/**
 * autoStatsCollector.ts — GPS + STM Horarios (sin GTFS departamental)
 * =====================================================================
 * Cron cada 5 minutos:
 *  1. Obtiene posición GPS de los 4 operadores desde STM en vivo
 *  2. Lee la posición anterior del bus (Firestore bus_last_pos) → calcula bearing
 *  3. Lee horarios STM scrapeados (horarios_stm/{linea}) → detecta servicio activo
 *  4. Determina sentido IDA/VUELTA por bearing + dirección de la variante
 *  5. Calcula desvío en minutos respecto al servicio programado
 *  6. Guarda vehicle_events (TTL 7 días) + actualiza bus_last_pos
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import axios from 'axios';

const db = admin.firestore();

// ── Tipos ──────────────────────────────────────────────────────────────────

type ComplianceState = 'EN_TIEMPO' | 'ADELANTADO' | 'ATRASADO' | 'SIN_HORARIO' | 'FUERA_DE_SERVICIO';

interface BusFeature {
  type: 'Feature';
  properties: {
    codigoEmpresa: number;
    codigoBus: number;
    linea: string;
    velocidad?: number;
    /** Destino que el conductor seleccionó en el cartelito frontal del bus.
     *  Disponible en feed STM (ej: "TRES CRUCES", "LA PAZ"). Útil para
     *  detección de sentido cuando bearing no está disponible. */
    destinoDesc?: string;
    /** Variante del recorrido (ej: "300A", "300B"). */
    variante?: string;
  };
  geometry: { type: 'Point'; coordinates: [number, number] };
}

interface SalidaHorario { desde: string; hacia: string; origen: string; destino: string }
interface VarianteSummary { origen: string; destino: string; frecuenciaMin: number; horaInicio: string; horaFin: string }
interface DiaHorario { variantes: VarianteSummary[]; salidasTodas: SalidaHorario[]; frecuenciaDominanteMin: number }
interface LineaHorario { linea: string; dias: Record<string, DiaHorario> }

interface LastPos { lat: number; lon: number; ts: number }

interface GtfsTimetableDoc {
  linea: string;
  directionId: number | string;
  serviceType: string;
  stops: string[];
  viajes: Array<{ s: string; t: number[] }>;
  primeraS: string;
  ultimaS: string;
}

interface StopCoords { lat: number; lon: number; nombre: string }

type ConfianzaSentido = 'HIGH' | 'MEDIUM' | 'LOW' | 'ZERO';

interface SentidoResult {
  sentido: 'IDA' | 'VUELTA' | null;
  confianza: ConfianzaSentido;
}

interface ComplianceResult {
  state: ComplianceState;
  desviacionMin: number | null;
  proximaParada: string | null;
  sentido: 'IDA' | 'VUELTA' | null;
  confianzaSentido: ConfianzaSentido;
  bearing: number | null;
}

// ── Constantes ─────────────────────────────────────────────────────────────

const STM_URL = 'https://www.montevideo.gub.uy/buses/rest/stm-online';
const STM_HDR = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Content-Type': 'application/json',
  'Referer': 'https://www.montevideo.gub.uy/buses/',
  'Origin': 'https://www.montevideo.gub.uy',
};

const AGENCY_NAMES: Record<string, string> = { '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT' };
const COLLECTION = 'vehicle_events';
const LAST_POS_COLL = 'bus_last_pos';
const TTL_DAYS = 7;

// ── Helpers matemáticos ────────────────────────────────────────────────────

function toMin(t: string): number | null {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  return m ? +m[1]! * 60 + +m[2]! : null;
}

function nowMin(d: Date): number { return d.getHours() * 60 + d.getMinutes(); }

function tipoDia(d: Date): string {
  const dow = d.getDay();
  if (dow === 0) return 'Domingos';
  if (dow === 6) return 'Sábados';
  return 'Hábiles';
}

/** Bearing en grados (0=N, 90=E, 180=S, 270=W) entre dos puntos GPS */
function calcBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => d * Math.PI / 180;
  const dLon = toRad(lon2 - lon1);
  const φ1 = toRad(lat1); const φ2 = toRad(lat2);
  const y = Math.sin(dLon) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** Diferencia angular mínima entre dos bearings (0-180) */
function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Distancia en km al punto del trazado GTFS más cercano para el tipo de servicio dado. */
function calcBestDistKm(
  lat: number, lon: number,
  gtfsDocs: GtfsTimetableDoc[],
  svc: string,
  stopCache: Map<string, StopCoords>,
): number {
  const activeDocs = gtfsDocs.filter(d => d.serviceType === svc);
  let bestDist = Infinity;
  for (const tt of activeDocs) {
    for (const sid of tt.stops) {
      const sc = stopCache.get(sid);
      if (!sc) continue;
      const d = haversineKm(lat, lon, sc.lat, sc.lon);
      if (d < bestDist) bestDist = d;
    }
  }
  return bestDist;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function svcTypeNow(d: Date): 'HABIL' | 'SABADO' | 'DOMINGO' {
  const uyt = new Date(d.getTime() - 3 * 3600_000); // UTC → UYT (UTC-3)
  const dow = uyt.getDay();
  return dow === 0 ? 'DOMINGO' : dow === 6 ? 'SABADO' : 'HABIL';
}

/** Minutos desde medianoche en hora de Uruguay (UTC-3) */
function evMinUYT(d: Date): number {
  const uyt = new Date(d.getTime() - 3 * 3600_000);
  return uyt.getHours() * 60 + uyt.getMinutes();
}

// ── Detección de sentido — cascada determinística ──────────────────────────
// Niveles de confianza:
//   HIGH    → match textual contra horario_stm o GTFS terminals (cartel del bus).
//   MEDIUM  → match parcial Jaccard ≥0.3 contra terminales GTFS.
//   LOW     → bearing geométrico (fallback).
//   ZERO    → no se pudo determinar; sentido=null.
//
// Política Anti-Simulación: NUNCA inventar — si nada matchea, sentido=null.

/** Normaliza string para comparación: lowercase, sin acentos, sin puntuación, espacios colapsados. */
function normStr(s: string | null | undefined): string {
  return String(s ?? '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Coeficiente de Jaccard sobre tokens de ≥3 chars. 0=disjuntos, 1=idénticos. */
function jaccardTokens(a: string, b: string): number {
  const setA = new Set(normStr(a).split(' ').filter(t => t.length >= 3));
  const setB = new Set(normStr(b).split(' ').filter(t => t.length >= 3));
  if (setA.size === 0 || setB.size === 0) return 0;
  const inter = [...setA].filter(t => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : inter / union;
}

/** Bearing geométrico de Montevideo (centro ≈ SW=225°). LOW confidence. */
function detectarSentidoPorBearing(bearing: number | null): SentidoResult {
  if (bearing === null) return { sentido: null, confianza: 'ZERO' };
  if (angleDiff(bearing, 225) < 70) return { sentido: 'VUELTA', confianza: 'LOW' };
  if (angleDiff(bearing, 45) < 70)  return { sentido: 'IDA', confianza: 'LOW' };
  return { sentido: null, confianza: 'ZERO' };
}

/**
 * Detección de sentido en cascada (síncrona, con contexto pre-cargado).
 *
 * @param destinoDesc  Cartelito frontal del bus (raw STM).
 * @param variante     String de variante del bus (ej "300A"), o null.
 * @param bearing      Bearing geográfico (0=N,90=E,180=S,270=W) o null.
 * @param horario      Doc horarios_stm/{linea} cargado, o null.
 * @param tipoDiaKey   Día actual ('Hábiles' | 'Sábados' | 'Domingos').
 * @param gtfsDocs     Array de gtfs_timetable de la línea (puede contener dir 0 y 1).
 * @param stopCache    Map stopId → {lat,lon,nombre} para resolver terminales.
 */
function detectarSentido(
  destinoDesc: string | null,
  variante: string | null,
  bearing: number | null,
  horario: LineaHorario | null,
  tipoDiaKey: string,
  gtfsDocs: GtfsTimetableDoc[],
  stopCache: Map<string, StopCoords>,
): SentidoResult {
  const ddNorm = normStr(destinoDesc);

  // ── Nivel 1 — Match destinoDesc contra variantes del horario_stm ───────────
  if (ddNorm && horario?.dias) {
    const dia = horario.dias[tipoDiaKey]
      ?? horario.dias['Hábiles']
      ?? horario.dias['Habiles']
      ?? Object.values(horario.dias)[0];
    const variantes = dia?.variantes ?? [];
    if (variantes.length >= 1) {
      // Para cada variante, calcular Jaccard de destinoDesc vs destino-de-variante.
      const scored = variantes.map((v, idx) => ({
        idx,
        v,
        score: jaccardTokens(ddNorm, v.destino),
      }));
      const best = scored.reduce((a, b) => (b.score > a.score ? b : a), scored[0]!);
      if (best.score >= 0.5) {
        if (variantes.length >= 2) {
          // La variante con horaInicio más temprana del día = IDA, la otra = VUELTA.
          const sortedByStart = [...variantes]
            .map((v, idx) => ({ idx, v, h: toMin(v.horaInicio ?? '') ?? Number.POSITIVE_INFINITY }))
            .sort((a, b) => a.h - b.h);
          const idaIdx = sortedByStart[0]!.idx;
          return {
            sentido: best.idx === idaIdx ? 'IDA' : 'VUELTA',
            confianza: 'HIGH',
          };
        }
        // Solo 1 variante registrada → no hay forma de saber IDA vs VUELTA solo por match;
        // caemos a otros niveles.
      }
    }
  }

  // ── Nivel 2 — Match por variante string contra gtfs_timetable ──────────────
  if (variante && gtfsDocs.length >= 2) {
    // Variantes "A" → directionId=0 (IDA), "B" → directionId=1 (VUELTA). Heurística
    // simple basada en convención IMM. Si la variante termina en letra,
    // mapeamos A/C/E impares→0, B/D/F pares→1.
    const last = variante.trim().slice(-1).toUpperCase();
    if (/^[A-Z]$/.test(last)) {
      const code = last.charCodeAt(0) - 'A'.charCodeAt(0); // A=0, B=1, C=2...
      const dir = code % 2 === 0 ? 0 : 1;
      return { sentido: dir === 0 ? 'IDA' : 'VUELTA', confianza: 'HIGH' };
    }
  }

  // ── Nivel 3 — Match destinoDesc contra último stop del shape GTFS ──────────
  if (ddNorm && gtfsDocs.length > 0 && stopCache.size > 0) {
    // Buscar terminales para directionId 0 y 1 (último stop de cada).
    const terminalDir0 = pickTerminalName(gtfsDocs, 0, stopCache);
    const terminalDir1 = pickTerminalName(gtfsDocs, 1, stopCache);
    const j0 = terminalDir0 ? jaccardTokens(ddNorm, terminalDir0) : 0;
    const j1 = terminalDir1 ? jaccardTokens(ddNorm, terminalDir1) : 0;
    if (j0 > 0.5 && j0 > j1 * 1.5) return { sentido: 'IDA', confianza: 'HIGH' };
    if (j1 > 0.5 && j1 > j0 * 1.5) return { sentido: 'VUELTA', confianza: 'HIGH' };
    if (j0 > 0.3 && j0 > j1) return { sentido: 'IDA', confianza: 'MEDIUM' };
    if (j1 > 0.3 && j1 > j0) return { sentido: 'VUELTA', confianza: 'MEDIUM' };
  }

  // ── Nivel 4 — Bearing geométrico (fallback LOW) ────────────────────────────
  return detectarSentidoPorBearing(bearing);
}

/** Devuelve el nombre del último stop para `directionId` dado, vía stopCache. */
function pickTerminalName(
  gtfsDocs: GtfsTimetableDoc[],
  directionId: number,
  stopCache: Map<string, StopCoords>,
): string | null {
  const doc = gtfsDocs.find(d => Number(d.directionId) === directionId);
  if (!doc) return null;
  const lastStopId = doc.stops[doc.stops.length - 1];
  if (!lastStopId) return null;
  const sc = stopCache.get(lastStopId);
  return sc?.nombre ?? null;
}

/** Contexto pre-cargado por línea, reutilizable entre múltiples eventos. */
export interface SentidoContext {
  horario: LineaHorario | null;
  gtfsDocs: GtfsTimetableDoc[];
  stopCache: Map<string, StopCoords>;
  tipoDiaKey: string;
}

/** Carga el contexto desde Firestore para una `linea` y `agencyId` dados. */
export async function loadSentidoContext(
  agencyId: string,
  linea: string,
  fsdb: admin.firestore.Firestore,
  ahora: Date = new Date(),
): Promise<SentidoContext> {
  const tipoDiaKey = tipoDia(ahora);
  const svc = svcTypeNow(ahora);

  // horario_stm + gtfs_timetable (dir 0 y 1) en paralelo
  const horId = linea;
  const gtfsIds = [0, 1].map(dir => `${agencyId}_${linea}_${dir}_${svc}`);

  let horario: LineaHorario | null = null;
  const gtfsDocs: GtfsTimetableDoc[] = [];
  try {
    const refs: admin.firestore.DocumentReference[] = [
      fsdb.collection('horarios_stm').doc(horId),
      ...gtfsIds.map(id => fsdb.collection('gtfs_timetable').doc(id)),
    ];
    const snaps = await fsdb.getAll(...refs);
    if (snaps[0]?.exists) horario = snaps[0].data() as LineaHorario;
    for (let i = 1; i < snaps.length; i++) {
      if (snaps[i]?.exists) gtfsDocs.push(snaps[i]!.data() as GtfsTimetableDoc);
    }
  } catch { /* tolerar fallo */ }

  // Stops terminales (último de cada gtfsDoc)
  const stopCache = new Map<string, StopCoords>();
  const stopIds = new Set<string>();
  for (const doc of gtfsDocs) {
    const last = doc.stops[doc.stops.length - 1];
    if (last) stopIds.add(last);
  }
  if (stopIds.size > 0) {
    try {
      const snaps = await fsdb.getAll(...[...stopIds].map(id => fsdb.collection('gtfs_stops').doc(id)));
      for (const s of snaps) {
        if (!s.exists) continue;
        const d = s.data()!;
        stopCache.set(s.id, {
          lat: parseFloat(String(d.stop_lat ?? d.lat ?? '0')),
          lon: parseFloat(String(d.stop_lon ?? d.lon ?? d.lng ?? '0')),
          nombre: String(d.stop_name ?? d.nombre ?? s.id),
        });
      }
    } catch { /* tolerar fallo */ }
  }

  return { horario, gtfsDocs, stopCache, tipoDiaKey };
}

/** Resuelve sentido usando un contexto pre-cargado (para batch / cache). */
export function detectarSentidoConContexto(
  destinoDesc: string | null,
  variante: string | null,
  bearing: number | null,
  ctx: SentidoContext,
): SentidoResult {
  return detectarSentido(destinoDesc, variante, bearing, ctx.horario, ctx.tipoDiaKey, ctx.gtfsDocs, ctx.stopCache);
}

/** Versión async one-shot: carga el contexto y resuelve. Útil para llamadas aisladas. */
export async function detectarSentidoAsync(
  destinoDesc: string | null,
  variante: string | null,
  bearing: number | null,
  agencyId: string,
  linea: string,
  fsdb: admin.firestore.Firestore,
): Promise<SentidoResult> {
  if (!linea) return detectarSentidoPorBearing(bearing);
  const ctx = await loadSentidoContext(agencyId, linea, fsdb);
  return detectarSentidoConContexto(destinoDesc, variante, bearing, ctx);
}

// ── Motor de cumplimiento ──────────────────────────────────────────────────

function calcularCumplimiento(
  velocidad: number,
  linea: string,
  horario: LineaHorario | null,
  bearing: number | null,
  now: Date,
  destinoDesc: string | null,
  variante: string | null,
  gtfsDocs: GtfsTimetableDoc[],
  stopCache: Map<string, StopCoords>,
): ComplianceResult {
  const hora = now.getHours();
  const tipo = tipoDia(now);

  // Sentido se calcula incluso si no hay horario_stm: usa GTFS terminals + bearing.
  const sentidoRes = detectarSentido(destinoDesc, variante, bearing, horario, tipo, gtfsDocs, stopCache);
  const sentido = sentidoRes.sentido;
  const confianzaSentido = sentidoRes.confianza;

  // Sin horario registrado en Firestore para esta línea: no se puede calcular cumplimiento.
  if (!horario) {
    if (hora >= 1 && hora < 5) return { state: 'FUERA_DE_SERVICIO', desviacionMin: null, proximaParada: null, sentido, confianzaSentido, bearing };
    const state: ComplianceState = velocidad >= 2 ? 'SIN_HORARIO' : 'FUERA_DE_SERVICIO';
    return { state, desviacionMin: null, proximaParada: null, sentido, confianzaSentido, bearing };
  }

  // Buscar el día con fallback: acentos pueden variar entre versiones del scraper
  const dia = horario.dias?.[tipo]
    ?? horario.dias?.['Habiles']
    ?? horario.dias?.['Hábiles']
    ?? Object.values(horario.dias ?? {})[0];

  if (!dia || !dia.salidasTodas?.length) {
    if (hora >= 1 && hora < 5) return { state: 'FUERA_DE_SERVICIO', desviacionMin: null, proximaParada: null, sentido, confianzaSentido, bearing };
    const state: ComplianceState = velocidad >= 2 ? 'SIN_HORARIO' : 'FUERA_DE_SERVICIO';
    return { state, desviacionMin: null, proximaParada: null, sentido, confianzaSentido, bearing };
  }

  const nMin = nowMin(now);

  // Filtrar variantes por sentido si es posible.
  // Heurística simple: con ≥2 variantes, la de horaInicio más temprana = IDA, la otra = VUELTA.
  let salidas = dia.salidasTodas;
  if (sentido && dia.variantes.length >= 2) {
    const sortedV = [...dia.variantes]
      .map((v, idx) => ({ idx, v, h: toMin(v.horaInicio ?? '') ?? Number.POSITIVE_INFINITY }))
      .sort((a, b) => a.h - b.h);
    const idaVar = sortedV[0]!.v;
    const vueltaVar = sortedV[sortedV.length - 1]!.v;
    const target = sentido === 'IDA' ? idaVar : vueltaVar;
    const targetDest = normStr(target.destino);
    if (targetDest) {
      const filtradas = salidas.filter(s => jaccardTokens(targetDest, s.destino) >= 0.5);
      if (filtradas.length > 0) salidas = filtradas;
    }
  }

  // Servicios activos: desde <= ahora <= hacia (ventana exacta)
  let activos = salidas.filter(s => {
    const d = toMin(s.desde); const h = toMin(s.hacia);
    return d !== null && h !== null && d <= nMin && h >= nMin;
  });

  // Ampliar ventana: si no hay activos exactos, buscar servicios que salieron hace ≤60 min
  // (cubre trips cortos donde hacia < ahora pero el bus sigue en ruta)
  if (!activos.length) {
    activos = salidas.filter(s => {
      const d = toMin(s.desde);
      return d !== null && d <= nMin && d >= nMin - 60;
    });
  }

  // Siguiente salida (para el caso en que el bus está a punto de salir)
  if (!activos.length) {
    const proxima = salidas.filter(s => {
      const d = toMin(s.desde);
      return d !== null && d > nMin && d <= nMin + 15;
    });
    if (proxima.length) activos = proxima;
  }

  if (!activos.length) {
    if (hora >= 1 && hora < 5) return { state: 'FUERA_DE_SERVICIO', desviacionMin: null, proximaParada: null, sentido, confianzaSentido, bearing };
    const state = velocidad >= 5 ? 'SIN_HORARIO' : 'FUERA_DE_SERVICIO';
    return { state, desviacionMin: null, proximaParada: null, sentido, confianzaSentido, bearing };
  }

  // Servicio más cercano a ahora (el más reciente que salió)
  const mejorServicio = activos.reduce((best, s) => {
    const d = toMin(s.desde)!;
    const bd = toMin(best.desde)!;
    return Math.abs(d - nMin) < Math.abs(bd - nMin) ? s : best;
  });

  const desdeMin = toMin(mejorServicio.desde)!;
  const haciaMin = toMin(mejorServicio.hacia)!;
  const duracion = haciaMin - desdeMin;
  const transcurrido = nMin - desdeMin;
  const pctCompletado = duracion > 0 ? transcurrido / duracion : 0;

  // Frecuencia del servicio
  const freq = dia.frecuenciaDominanteMin > 0 ? dia.frecuenciaDominanteMin : 10;

  // Cálculo honesto de OTP sin snap-to-shape.
  // pctCompletado = transcurrido/duracion → tiempoEsperado = duracion*(transcurrido/duracion) = transcurrido
  // → desviacionMin = 0 SIEMPRE: tautología matemática, no mide nada real.
  // Política Anti-Simulación (DIRECTRIZ 2026-05-02): NUNCA inventar desv=0 cuando no
  // tenemos snap-to-shape. Si solo conocemos la ventana horaria del servicio, solo
  // detectamos los casos objetivamente medibles (atraso/adelanto extremo); el resto
  // queda como SIN_HORARIO con desv=null para que la UI muestre "s/d".
  let desviacionMin: number | null = null;
  let state: ComplianceState;

  if (pctCompletado > 1.2) {
    // Bus superó el tiempo máximo del servicio → atrasado estructural confirmado
    state = 'ATRASADO';
    desviacionMin = Math.round(nMin - haciaMin);
  } else if (pctCompletado < -0.1) {
    // Bus arrancó antes de lo programado
    state = 'ADELANTADO';
    desviacionMin = Math.round(desdeMin - nMin);
  } else if (velocidad < 2 && transcurrido > duracion * 0.7) {
    // Bus detenido habiendo consumido >70% del tiempo del servicio → probable atraso
    state = 'ATRASADO';
    desviacionMin = Math.round(transcurrido - duracion * 0.7);
  } else {
    // Sin snap-to-shape no podemos medir la desviación real respecto al horario
    // por parada. Antes esto se marcaba como EN_TIEMPO con desv=0 — eso producía
    // OTP inflado artificialmente y un campo `desviacionMin = 0` exacto en miles
    // de eventos (ej: COETC L405 96 eventos seguidos con desv=0). No es real.
    // Política correcta: SIN_HORARIO + desv=null. La UI muestra "s/d" y el
    // dashboard de OTP lo excluye del cálculo.
    state = 'SIN_HORARIO';
    desviacionMin = null;
  }

  // Parada próxima: destino del servicio activo
  const proximaParada = mejorServicio.destino || null;

  return { state, desviacionMin, proximaParada, sentido, confianzaSentido, bearing };
}

// ── Snap-to-shape OTP ──────────────────────────────────────────────────────

const SNAP_TOL_MIN  = 4;   // ±4 min = EN_TIEMPO (tolerancia IMM Uruguay)
const SNAP_MAX_KM   = 0.4; // descarte si el bus está a >400m de la parada más cercana
const SNAP_MAX_DIFF = 60;  // descarte si ningún viaje cae en ±60 min
const DESVIO_UMBRAL_KM = 0.3; // 300m del trazado = fuera de ruta confirmado

/**
 * Calcula el estado de cumplimiento comparando la posición GPS del bus contra
 * el horario GTFS oficial por parada. Es el método preciso: en lugar de comparar
 * el tiempo global del servicio, compara la hora real con la hora programada
 * para la parada más cercana (≤400m). Tolerancia EN_TIEMPO = ±3 min (TCRP 165).
 *
 * Retorna null si no hay datos GTFS, ninguna parada está a ≤400m, o ningún
 * viaje cae en la ventana de ±60 min. En ese caso se usa calcularCumplimiento().
 */
function snapToGtfsCompliance(
  lat: number, lon: number,
  evMin: number,
  gtfsDocs: GtfsTimetableDoc[],
  svc: string,
  stopCache: Map<string, StopCoords>,
): { state: ComplianceState; desviacionMin: number; parada: string } | null {
  const activeDocs = gtfsDocs.filter(d => d.serviceType === svc);
  if (!activeDocs.length) return null;

  let bestDist = Infinity, bestStopIdx = -1, bestDocIdx = -1;

  for (let di = 0; di < activeDocs.length; di++) {
    const tt = activeDocs[di]!;
    for (let si = 0; si < tt.stops.length; si++) {
      const sc = stopCache.get(tt.stops[si]!);
      if (!sc) continue;
      const d = haversineKm(lat, lon, sc.lat, sc.lon);
      if (d < bestDist) { bestDist = d; bestStopIdx = si; bestDocIdx = di; }
    }
  }

  if (bestDocIdx === -1 || bestDist > SNAP_MAX_KM) return null;

  const tt = activeDocs[bestDocIdx]!;
  const N = tt.stops.length;
  let bestTripDiff = Infinity, bestDeviation = 0;

  for (const viaje of tt.viajes) {
    const tripStartMin = toMin(viaje.s);
    if (tripStartMin === null) continue;

    // Intentar etapa exacta primero (punto de control con tiempo asignado)
    const explicit = viaje.t[bestStopIdx];
    let scheduledMin: number;

    if (explicit !== -1 && explicit !== undefined) {
      scheduledMin = explicit;
    } else {
      // Bus entre etapas — interpolar entre el punto de control anterior y el siguiente.
      // El GTFS del IMM solo asigna tiempos a las etapas de control; las paradas
      // intermedias tienen t=-1. La interpolación lineal refleja cómo el conductor
      // gestiona los tiempos entre etapas.
      let ia = -1, ta = -1, ib = -1, tb = -1;
      for (let si = bestStopIdx; si >= 0; si--) {
        const t = viaje.t[si];
        if (t !== -1 && t !== undefined) { ia = si; ta = t; break; }
      }
      for (let si = bestStopIdx; si < N; si++) {
        const t = viaje.t[si];
        if (t !== -1 && t !== undefined) { ib = si; tb = t; break; }
      }
      if (ia === -1 && ib === -1) continue;
      if (ia === -1) scheduledMin = tb;
      else if (ib === -1) scheduledMin = ta;
      else scheduledMin = Math.round(ta + ((bestStopIdx - ia) / (ib - ia)) * (tb - ta));
    }

    const diff = Math.abs(evMin - scheduledMin);
    if (diff < bestTripDiff) { bestTripDiff = diff; bestDeviation = evMin - scheduledMin; }
  }

  if (bestTripDiff > SNAP_MAX_DIFF) return null;

  const sc = stopCache.get(tt.stops[bestStopIdx]!)!;
  const state: ComplianceState =
    Math.abs(bestDeviation) <= SNAP_TOL_MIN ? 'EN_TIEMPO' :
    bestDeviation > 0 ? 'ATRASADO' : 'ADELANTADO';

  return { state, desviacionMin: Math.round(bestDeviation), parada: sc.nombre };
}

/**
 * Convierte documentos de gtfs_timetable al formato LineaHorario que usa calcularCumplimiento.
 * Se usa como fuente primaria de horarios (datos oficiales IMM con tiempos por parada).
 */
function convertGtfsToLineaHorario(linea: string, docs: GtfsTimetableDoc[]): LineaHorario {
  const dias: Record<string, DiaHorario> = {};
  for (const doc of docs) {
    const diaKey = doc.serviceType === 'HABIL' ? 'Hábiles'
                 : doc.serviceType === 'SABADO' ? 'Sábados'
                 : 'Domingos';
    const salidas: SalidaHorario[] = doc.viajes
      .filter(v => v.s)
      .map(v => ({
        desde: v.s,
        hacia: doc.ultimaS ?? v.s,
        origen: doc.stops[0] ?? '',
        destino: doc.stops[doc.stops.length - 1] ?? '',
      }));
    if (!salidas.length) continue;
    const freqMin = salidas.length > 1
      ? Math.round(((toMin(salidas[salidas.length - 1]!.desde) ?? 0) - (toMin(salidas[0]!.desde) ?? 0)) / (salidas.length - 1))
      : 10;
    if (!dias[diaKey]) {
      dias[diaKey] = {
        variantes: [{ origen: doc.stops[0] ?? '', destino: doc.stops[doc.stops.length - 1] ?? '', frecuenciaMin: freqMin, horaInicio: doc.primeraS ?? salidas[0]!.desde, horaFin: doc.ultimaS ?? salidas[salidas.length - 1]!.desde }],
        salidasTodas: salidas,
        frecuenciaDominanteMin: freqMin,
      };
    } else {
      dias[diaKey]!.salidasTodas.push(...salidas);
    }
  }
  return { linea, dias };
}

// ── Fetch GPS ──────────────────────────────────────────────────────────────

async function fetchGPS(stmCode: string): Promise<BusFeature[]> {
  const res = await axios.post<{ features?: BusFeature[] }>(
    STM_URL, { empresa: stmCode }, { timeout: 15000, headers: STM_HDR },
  );
  return res.data?.features ?? [];
}

// ── Snapshot completo de un operador ──────────────────────────────────────

/** Velocidad máxima razonable en km/h para un bus urbano. Lecturas por encima de
 *  esto son típicamente glitches del GPS (multipath, salto de fix). */
const MAX_VELOCIDAD_KMH = 90;

/** Distancia máxima en metros que un bus puede recorrer en menos de 30s sin que
 *  sea un salto absurdo (≈ 60 km/h). Pings con más → descarte. */
const MAX_JUMP_METERS = 500;
const MAX_JUMP_DT_MS = 30 * 1000;

interface AgencyStats {
  events: number;
  discardedSentinel: number;
  discardedSpeed: number;
  discardedJump: number;
}

async function snapshotAgency(stmCode: string): Promise<AgencyStats> {
  const empresa = AGENCY_NAMES[stmCode] ?? `Empresa ${stmCode}`;
  const features = await fetchGPS(stmCode);
  const stats: AgencyStats = { events: 0, discardedSentinel: 0, discardedSpeed: 0, discardedJump: 0 };
  if (!features.length) return stats;

  const now = new Date();
  const svc = svcTypeNow(now);
  const expiresAt = new Date(now.getTime() + TTL_DAYS * 24 * 60 * 60 * 1000);
  const tsISO = now.toISOString();

  // 1. Recopilar IDs y líneas únicas
  // Clave compuesta empresa_coche para evitar colisión entre operadores (ej: UCOT 91 ≠ CUTCSA 91)
  const busIds = features
    .map(f => `${stmCode}_${f.properties.codigoBus}`)
    .filter(Boolean);
  const lineasUnicas = [...new Set(features.map(f => f.properties.linea).filter(Boolean))];

  // 2. Batch-leer posiciones anteriores y horarios en paralelo
  const [lastPosSnap, horariosSnap] = await Promise.all([
    db.getAll(...busIds.map(id => db.collection(LAST_POS_COLL).doc(id))),
    db.getAll(...lineasUnicas.map(l => db.collection('horarios_stm').doc(l))),
  ]);

  const lastPosMap = new Map<string, LastPos>();
  for (const doc of lastPosSnap) {
    if (doc.exists) lastPosMap.set(doc.id, doc.data() as LastPos);
  }

  const horariosMap = new Map<string, LineaHorario>();
  for (const doc of horariosSnap) {
    if (doc.exists) horariosMap.set(doc.id, doc.data() as LineaHorario);
  }

  // Cargar gtfs_timetable para TODAS las líneas activas por ID directo (sin query compuesta).
  //   Doble uso: fallback horariosMap + snap-to-shape OTP por parada.
  // IDs canónicos: `${agencyId}_${linea}_${directionId}_${serviceType}`
  const gtfsRawCache = new Map<string, GtfsTimetableDoc[]>();
  if (lineasUnicas.length > 0) {
    const docIds: string[] = [];
    for (const linea of lineasUnicas) {
      for (const svcT of ['HABIL', 'SABADO', 'DOMINGO']) {
        for (const dir of [0, 1]) {
          docIds.push(`${stmCode}_${linea}_${dir}_${svcT}`);
        }
      }
    }
    for (let i = 0; i < docIds.length; i += 30) {
      const chunk = docIds.slice(i, i + 30);
      const docs = await db.getAll(...chunk.map(id => db.collection('gtfs_timetable').doc(id)));
      for (const doc of docs) {
        if (!doc.exists) continue;
        const data = doc.data() as GtfsTimetableDoc;
        if (!gtfsRawCache.has(data.linea)) gtfsRawCache.set(data.linea, []);
        gtfsRawCache.get(data.linea)!.push(data);
      }
    }
    // Rellenar horariosMap para líneas sin horarios_stm scrapeados
    for (const [linea, docs] of gtfsRawCache) {
      if (!horariosMap.has(linea)) {
        horariosMap.set(linea, convertGtfsToLineaHorario(linea, docs));
      }
    }
  }

  // Cargar coordenadas de paradas (snap-to-shape)
  const gtfsStopCache = new Map<string, StopCoords>();
  const allStopIds = new Set<string>();
  for (const docs of gtfsRawCache.values()) {
    for (const doc of docs) doc.stops.forEach(s => allStopIds.add(s));
  }
  const stopIdsArr = [...allStopIds];
  for (let i = 0; i < stopIdsArr.length; i += 30) {
    const chunk = stopIdsArr.slice(i, i + 30);
    const snaps = await Promise.all(chunk.map(id => db.collection('gtfs_stops').doc(id).get()));
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const s = snap.data()!;
      gtfsStopCache.set(snap.id, {
        lat: parseFloat(String(s.stop_lat ?? s.lat ?? '0')),
        lon: parseFloat(String(s.stop_lon ?? s.lon ?? s.lng ?? '0')),
        nombre: String(s.stop_name ?? s.nombre ?? snap.id),
      });
    }
  }

  // 3. Procesar cada bus
  const events: admin.firestore.DocumentData[] = [];
  const desvioEvents: Array<{ docId: string; data: Record<string, unknown> }> = [];
  const lastPosBatch = db.batch();

  for (const feat of features) {
    const p = feat.properties;
    if (!p?.codigoBus || !p?.linea) continue;
    const [lon, lat] = feat.geometry.coordinates;
    // Coordenadas sentinela de STM para buses sin fix GPS (ej: -258,-258). Descartar.
    if (typeof lat !== 'number' || typeof lon !== 'number' ||
        Math.abs(lat) > 90 || Math.abs(lon) > 180 ||
        lat > -30 || lat < -36 || lon > -53 || lon < -58) {
      stats.discardedSentinel++;
      console.warn(`[AutoStats] GPS descartado (sentinela): bus ${p.codigoBus} (${lat},${lon})`);
      continue;
    }
    const velocidad = p.velocidad ?? 0;
    const idBus = String(p.codigoBus);

    // Filtros de calidad UITP-style ───────────────────────────────────────────
    // (a) Velocidad GPS > 90 km/h en bus urbano = error de fix (salto, multipath).
    if (velocidad > MAX_VELOCIDAD_KMH) {
      stats.discardedSpeed++;
      continue;
    }
    // (b) Salto espacial > 500m en < 30s respecto al ping previo: glitch GPS.
    //     Usamos el `prev` que ya cargamos para bearing.
    const prev = lastPosMap.get(`${stmCode}_${idBus}`);
    if (prev) {
      const dtMs = Date.now() - prev.ts;
      if (dtMs > 0 && dtMs < MAX_JUMP_DT_MS) {
        const jumpM = haversineKm(prev.lat, prev.lon, lat, lon) * 1000;
        if (jumpM > MAX_JUMP_METERS) {
          stats.discardedJump++;
          continue;
        }
      }
    }

    // Calcular bearing desde última posición (clave compuesta empresa_coche)
    // TTL 24h: con cron cada 15 min y operadores que paran de noche, una ventana
    // de 15 min generaba 0% de bearing detectado en producción (cold-start cada
    // mañana). 24h cubre el caso normal (recuperar el último ping del día previo)
    // sin contaminar (el dist>20m descarta saltos absurdos por relogueo).
    let bearing: number | null = null;
    if (prev && (Date.now() - prev.ts) < 24 * 60 * 60 * 1000) { // < 24h
      const dist = Math.hypot(lat - prev.lat, lon - prev.lon);
      if (dist > 0.0002) { // ~20m mínimo para bearing confiable
        bearing = calcBearing(prev.lat, prev.lon, lat, lon);
      }
    }

    // Calcular cumplimiento — snap-to-shape preferido (OTP real por parada)
    const horario = horariosMap.get(p.linea) ?? null;
    const gtfsDocs = gtfsRawCache.get(p.linea) ?? [];
    const destinoDesc = p.destinoDesc ?? null;
    const variante = p.variante ?? null;
    const snapResult = snapToGtfsCompliance(lat, lon, evMinUYT(now),
      gtfsDocs, svc, gtfsStopCache);
    const sentidoRes = detectarSentido(destinoDesc, variante, bearing, horario, tipoDia(now), gtfsDocs, gtfsStopCache);
    const result: ComplianceResult = snapResult
      ? {
          state: snapResult.state,
          desviacionMin: snapResult.desviacionMin,
          proximaParada: snapResult.parada,
          sentido: sentidoRes.sentido,
          confianzaSentido: sentidoRes.confianza,
          bearing,
        }
      : calcularCumplimiento(velocidad, p.linea, horario, bearing, now, destinoDesc, variante, gtfsDocs, gtfsStopCache);

    events.push({
      idBus, agencyId: stmCode, empresa, linea: p.linea,
      lat, lon, velocidad,
      estadoCumplimiento: result.state,
      desviacionMin: result.desviacionMin,
      proximaParada: result.proximaParada,
      sentido: result.sentido,
      confianzaSentido: result.confianzaSentido,
      destinoDesc,                       // string | null — raw del cartel frontal del bus
      variante,                          // string | null — ej "300A"
      bearing: result.bearing !== null ? Math.round(result.bearing) : null,
      timestampGPS: tsISO,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
    });

    // Detección de desvío geográfico: bus a >300m del trazado GTFS y en movimiento
    if (gtfsDocs.length > 0 && gtfsStopCache.size > 0 && velocidad > 5) {
      const distKm = calcBestDistKm(lat, lon, gtfsDocs, svc, gtfsStopCache);
      if (distKm > DESVIO_UMBRAL_KM) {
        const bucketId = Math.floor(now.getTime() / (15 * 60_000));
        desvioEvents.push({
          docId: `${stmCode}_${idBus}_${bucketId}`,
          data: {
            coche_id: idBus, linea_id: p.linea, agencyId: stmCode,
            tipo: 'FUERA_DE_RUTA', lat, lng: lon,
            metros_fuera: Math.round(distKm * 1000),
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            notificado: false, resuelto: false,
          },
        });
      }
    }
  }

  // 4. Guardar vehicle_events en batches de 400
  const coll = db.collection(COLLECTION);
  for (let i = 0; i < events.length; i += 400) {
    const batch = db.batch();
    for (const ev of events.slice(i, i + 400)) batch.set(coll.doc(), ev);
    await batch.commit();
  }

  // 4b. Guardar eventos de desvío (set con ID time-bucketed = dedup automático por 15 min)
  for (const { docId, data } of desvioEvents) {
    void db.collection('eventos_desvio').doc(docId).set(data, { merge: true });
  }

  // 5. Actualizar posiciones en batches de 400 (límite Firestore)
  // Clave compuesta empresa_coche para no mezclar buses de distintos operadores
  const posWrites = features.map(f => {
    const busNum = String(f.properties.codigoBus);
    const posKey = `${stmCode}_${busNum}`;
    const [lon, lat] = f.geometry.coordinates;
    return { posKey, busNum, lat, lon };
  });
  for (let i = 0; i < posWrites.length; i += 400) {
    const posBatch = db.batch();
    for (const { posKey, busNum, lat, lon } of posWrites.slice(i, i + 400)) {
      posBatch.set(db.collection(LAST_POS_COLL).doc(posKey), {
        lat, lon, ts: now.getTime(),
        agencyId: stmCode,
        linea: features.find(f => String(f.properties.codigoBus) === busNum)?.properties.linea ?? '',
        empresa,
      });
    }
    await posBatch.commit();
  }
  // Eliminar el batch anterior (ya no se usa)
  void lastPosBatch;

  stats.events = events.length;
  return stats;
}

// ── Función principal ──────────────────────────────────────────────────────

type CollectionResult = Record<string, AgencyStats | { error: string }>;

async function runCollection(): Promise<CollectionResult> {
  const results: CollectionResult = {};
  for (const code of Object.keys(AGENCY_NAMES)) {
    try {
      results[AGENCY_NAMES[code]!] = await snapshotAgency(code);
    } catch (err: any) {
      console.error(`[AutoStats] Error ${AGENCY_NAMES[code]}:`, err?.message);
      results[AGENCY_NAMES[code]!] = { error: err?.message ?? 'unknown' };
    }
  }
  return results;
}

/** ¿Todos los operadores fallaron? Usado por health tracking. */
function allOperatorsFailed(results: CollectionResult): boolean {
  const vals = Object.values(results);
  if (vals.length === 0) return true;
  return vals.every(v => 'error' in v);
}

// ── Health tracking ────────────────────────────────────────────────────────

const HEALTH_DOC = () => db.collection('system_status').doc('stm_gps');

async function updateEndpointHealth(results: CollectionResult): Promise<void> {
  const allFailed = allOperatorsFailed(results);
  const now = admin.firestore.Timestamp.now();
  const ref = HEALTH_DOC();
  try {
    await db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      const prev = doc.data() ?? {};
      const prevStatus: string = prev.status ?? 'UNKNOWN';
      const prevFailures: number = prev.consecutiveFailures ?? 0;
      if (allFailed) {
        const isFirstFailure = prevStatus !== 'DOWN';
        if (isFirstFailure) {
          console.warn('[AutoStats] STM endpoint WENT DOWN');
        }
        tx.set(ref, {
          status: 'DOWN',
          lastCheck: now,
          consecutiveFailures: prevFailures + 1,
          downSince: isFirstFailure ? now : (prev.downSince ?? now),
          upSince: prev.upSince ?? null,
          lastSuccessfulCollection: prev.lastSuccessfulCollection ?? null,
        });
      } else {
        const wasDown = prevStatus === 'DOWN';
        if (wasDown) {
          console.log('[AutoStats] STM endpoint RESTORED after', prevFailures, 'consecutive failures');
        }
        tx.set(ref, {
          status: 'UP',
          lastCheck: now,
          consecutiveFailures: 0,
          downSince: null,
          upSince: wasDown ? now : (prev.upSince ?? now),
          lastSuccessfulCollection: now,
        });
      }
    });
  } catch (err: any) {
    console.error('[AutoStats] Error escribiendo health:', err?.message);
  }
}

// ── Exports ────────────────────────────────────────────────────────────────

export const autoStatsCollectorTick = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .pubsub.schedule('every 15 minutes')
  .timeZone('America/Montevideo')
  .onRun(async () => {
    try {
      const r = await runCollection();
      console.log('[AutoStats]', JSON.stringify(r));
      await updateEndpointHealth(r);
    } catch (err: any) {
      console.error('[AutoStats] Error:', err?.message);
    }
    return null;
  });

export const autoStatsCollectorNow = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onRequest(async (_req, res) => {
    try {
      const started = Date.now();
      const results = await runCollection();
      await updateEndpointHealth(results);
      res.json({ ok: true, durationMs: Date.now() - started, results });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  });
