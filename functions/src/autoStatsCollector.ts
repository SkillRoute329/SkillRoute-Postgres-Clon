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
  properties: { codigoEmpresa: number; codigoBus: number; linea: string; velocidad?: number };
  geometry: { type: 'Point'; coordinates: [number, number] };
}

interface SalidaHorario { desde: string; hacia: string; origen: string; destino: string }
interface VarianteSummary { origen: string; destino: string; frecuenciaMin: number; horaInicio: string; horaFin: string }
interface DiaHorario { variantes: VarianteSummary[]; salidasTodas: SalidaHorario[]; frecuenciaDominanteMin: number }
interface LineaHorario { linea: string; dias: Record<string, DiaHorario> }

interface LastPos { lat: number; lon: number; ts: number }

interface ComplianceResult {
  state: ComplianceState;
  desviacionMin: number | null;
  proximaParada: string | null;
  sentido: 'IDA' | 'VUELTA' | null;
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

/**
 * Sentido: IDA = bus moviéndose hacia el destino de la variante.
 * Usamos la dirección geográfica del vector origen→destino de cada variante
 * (inferida desde sus nombres: términos como "Norte", "Cerro", "Pocitos", etc.)
 * como heurística de último recurso. Para Montevideo, la ciudad antigua está
 * al SW y la periferia al NE/E/N, por lo que:
 *   bearing ∈ [0,135] ∪ [315,360] → periferia (IDA en muchas líneas)
 *   bearing ∈ [135,315]            → centro (VUELTA en muchas líneas)
 * Pero mejor: si las salidas de la variante A van a FullMin < FullMin de B
 * entonces A es la variante del servicio de mañana/ida.
 *
 * NOTA: Si el nombre del destino contiene "centro", "ciudad vieja", "MDEO" → VUELTA
 * Si contiene "cerro", "pocitos", "maldonado", "instrucciones", "portones" → IDA
 */
function detectarSentido(bearing: number | null, variantes: VarianteSummary[]): 'IDA' | 'VUELTA' | null {
  if (!bearing) return null;
  if (variantes.length < 2) return 'IDA';

  // Palabras clave de destinos "hacia el centro" → VUELTA
  const CENTRO = /centro|ciudad vieja|mdeo|aduana|tres cruces|palacio|goes|zitarrosa/i;

  // Determinar cuál variante es "hacia el centro" (VUELTA)
  const vueltaIdx = variantes.findIndex(v => CENTRO.test(v.destino) || CENTRO.test(v.origen));

  // Si tenemos 2 variantes: una es IDA (outbound) y otra VUELTA (inbound)
  // El bearing hacia el sur/suroeste de Montevideo → VUELTA (hacia Ciudad Vieja)
  // Montevideo: ciudad vieja ≈ bearing 225° desde periferia
  const haciaCentro = angleDiff(bearing, 225) < 90;

  if (vueltaIdx >= 0) {
    return haciaCentro ? 'VUELTA' : 'IDA';
  }
  return haciaCentro ? 'VUELTA' : 'IDA';
}

// ── Motor de cumplimiento ──────────────────────────────────────────────────

function calcularCumplimiento(
  velocidad: number,
  linea: string,
  horario: LineaHorario | null,
  bearing: number | null,
  now: Date,
): ComplianceResult {
  const hora = now.getHours();

  // Sin horario: clasificar por velocidad y franja horaria
  if (!horario) {
    if (hora >= 1 && hora < 5) return { state: 'FUERA_DE_SERVICIO', desviacionMin: null, proximaParada: null, sentido: null, bearing };
    const state = velocidad >= 8 ? 'EN_TIEMPO' : velocidad >= 2 ? 'ATRASADO' : 'FUERA_DE_SERVICIO';
    return { state, desviacionMin: null, proximaParada: null, sentido: null, bearing };
  }

  // Buscar el día con fallback: acentos pueden variar entre versiones del scraper
  const tipo = tipoDia(now);
  const dia = horario.dias?.[tipo]
    ?? horario.dias?.['Habiles']
    ?? horario.dias?.['Hábiles']
    ?? Object.values(horario.dias ?? {})[0];

  if (!dia || !dia.salidasTodas?.length) {
    if (hora >= 1 && hora < 5) return { state: 'FUERA_DE_SERVICIO', desviacionMin: null, proximaParada: null, sentido: null, bearing };
    const state = velocidad >= 8 ? 'EN_TIEMPO' : velocidad >= 2 ? 'ATRASADO' : 'FUERA_DE_SERVICIO';
    return { state, desviacionMin: null, proximaParada: null, sentido: null, bearing };
  }

  const nMin = nowMin(now);

  // Detectar sentido con bearing
  const sentido = detectarSentido(bearing, dia.variantes);

  // Filtrar variante por sentido si es posible
  const CENTRO = /centro|ciudad vieja|mdeo|aduana|tres cruces|palacio|goes|zitarrosa/i;
  let salidas = dia.salidasTodas;
  if (sentido && dia.variantes.length >= 2) {
    const filtradas = salidas.filter(s =>
      sentido === 'VUELTA' ? CENTRO.test(s.destino) : !CENTRO.test(s.destino)
    );
    if (filtradas.length > 0) salidas = filtradas;
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
    if (hora >= 1 && hora < 5) return { state: 'FUERA_DE_SERVICIO', desviacionMin: null, proximaParada: null, sentido, bearing };
    const state = velocidad >= 5 ? 'SIN_HORARIO' : 'FUERA_DE_SERVICIO';
    return { state, desviacionMin: null, proximaParada: null, sentido, bearing };
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

  // Desvío: cuánto tarda más de lo esperado
  // Si velocidad muy baja y no completó el viaje → está tardando más
  // Estimamos: si el bus va < 5 km/h y transcurrió > 50% del tiempo → atrasado
  let desviacionMin: number | null = null;
  let state: ComplianceState;

  // Calcular desviación real en minutos respecto a la progresión esperada
  const tiempoEsperado = Math.round(duracion * pctCompletado);
  desviacionMin = transcurrido - tiempoEsperado;

  if (pctCompletado > 1.2) {
    // Superó ampliamente el tiempo previsto → atrasado estructural
    state = 'ATRASADO';
    desviacionMin = Math.round(nMin - haciaMin);
  } else if (pctCompletado < -0.1) {
    // Salió antes de lo programado
    state = 'ADELANTADO';
    desviacionMin = Math.round(desdeMin - nMin);
  } else if (desviacionMin > 5) {
    // Más de 5 minutos de atraso respecto a la progresión esperada
    state = 'ATRASADO';
  } else if (desviacionMin < -3) {
    state = 'ADELANTADO';
  } else {
    // En ventana normal (±5 min) — incluye paradas en terminales/semáforos
    state = 'EN_TIEMPO';
    desviacionMin = Math.max(0, desviacionMin);
  }

  // Parada próxima: destino del servicio activo
  const proximaParada = mejorServicio.destino || null;

  return { state, desviacionMin, proximaParada, sentido, bearing };
}

// ── Fetch GPS ──────────────────────────────────────────────────────────────

async function fetchGPS(stmCode: string): Promise<BusFeature[]> {
  const res = await axios.post<{ features?: BusFeature[] }>(
    STM_URL, { empresa: stmCode }, { timeout: 15000, headers: STM_HDR },
  );
  return res.data?.features ?? [];
}

// ── Snapshot completo de un operador ──────────────────────────────────────

async function snapshotAgency(stmCode: string): Promise<number> {
  const empresa = AGENCY_NAMES[stmCode] ?? `Empresa ${stmCode}`;
  const features = await fetchGPS(stmCode);
  if (!features.length) return 0;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_DAYS * 24 * 60 * 60 * 1000);
  const tsISO = now.toISOString();

  // 1. Recopilar IDs y líneas únicas
  const busIds = features
    .map(f => String(f.properties.codigoBus))
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

  // 3. Procesar cada bus
  const events: admin.firestore.DocumentData[] = [];
  const lastPosBatch = db.batch();

  for (const feat of features) {
    const p = feat.properties;
    if (!p?.codigoBus || !p?.linea) continue;
    const [lon, lat] = feat.geometry.coordinates;
    const velocidad = p.velocidad ?? 0;
    const idBus = String(p.codigoBus);

    // Calcular bearing desde última posición
    const prev = lastPosMap.get(idBus);
    let bearing: number | null = null;
    if (prev && (Date.now() - prev.ts) < 15 * 60 * 1000) { // solo si < 15 min
      const dist = Math.hypot(lat - prev.lat, lon - prev.lon);
      if (dist > 0.0002) { // ~20m mínimo para bearing confiable
        bearing = calcBearing(prev.lat, prev.lon, lat, lon);
      }
    }

    // Calcular cumplimiento
    const horario = horariosMap.get(p.linea) ?? null;
    const result = calcularCumplimiento(velocidad, p.linea, horario, bearing, now);

    events.push({
      idBus, agencyId: stmCode, empresa, linea: p.linea,
      lat, lon, velocidad,
      estadoCumplimiento: result.state,
      desviacionMin: result.desviacionMin,
      proximaParada: result.proximaParada,
      sentido: result.sentido,
      bearing: result.bearing !== null ? Math.round(result.bearing) : null,
      timestampGPS: tsISO,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
    });
  }

  // 4. Guardar vehicle_events en batches de 400
  const coll = db.collection(COLLECTION);
  for (let i = 0; i < events.length; i += 400) {
    const batch = db.batch();
    for (const ev of events.slice(i, i + 400)) batch.set(coll.doc(), ev);
    await batch.commit();
  }

  // 5. Actualizar posiciones en batches de 400 (límite Firestore)
  const lastPosEntries = Array.from(lastPosMap.entries());
  const posWrites = features.map(f => {
    const idBus = String(f.properties.codigoBus);
    const [lon, lat] = f.geometry.coordinates;
    return { idBus, lat, lon };
  });
  for (let i = 0; i < posWrites.length; i += 400) {
    const posBatch = db.batch();
    for (const { idBus, lat, lon } of posWrites.slice(i, i + 400)) {
      posBatch.set(db.collection(LAST_POS_COLL).doc(idBus), {
        lat, lon, ts: now.getTime(),
        linea: features.find(f => String(f.properties.codigoBus) === idBus)?.properties.linea ?? '',
        empresa,
      });
    }
    await posBatch.commit();
  }
  // Eliminar el batch anterior (ya no se usa)
  void lastPosBatch;

  return events.length;
}

// ── Función principal ──────────────────────────────────────────────────────

async function runCollection(): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  for (const code of Object.keys(AGENCY_NAMES)) {
    try {
      results[AGENCY_NAMES[code]!] = await snapshotAgency(code);
    } catch (err: any) {
      console.error(`[AutoStats] Error ${AGENCY_NAMES[code]}:`, err?.message);
      results[AGENCY_NAMES[code]!] = -1;
    }
  }
  return results;
}

// ── Health tracking ────────────────────────────────────────────────────────

const HEALTH_DOC = () => db.collection('system_status').doc('stm_gps');

async function updateEndpointHealth(results: Record<string, number>): Promise<void> {
  const allFailed = Object.values(results).every(v => v === -1);
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

export const autoStatsCollectorTick = functions.pubsub
  .schedule('every 5 minutes')
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
  .runWith({ timeoutSeconds: 120, memory: '512MB' })
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
