/**
 * headwayInsightsService.ts — Bunching/Gapping single-op + HRR cross-op
 * =======================================================================
 * Sprint 2 entrega 2.1 del roadmap international-grade.
 *
 * Diferenciador comercial: combina paridad con Swiftly Headway Insights
 * (single-op) + nuestro HRR cross-op único en el mercado mundial.
 *
 * Schema verificado bajo §12 (2026-04-25):
 *
 *   viajes_activos/{interno}:
 *     - empresa: "UCOT"|"CUTCSA"|"COME"|"COETC"
 *     - linea: string ("300", "396", "CE2"...)
 *     - variante: integer
 *     - posicion: GeoPoint {latitude, longitude}
 *     - posicion_anterior: GeoPoint
 *     - updatedAt: Timestamp
 *
 *   horarios_stm/{linea}:
 *     - dias.{Hábiles|Sábados|Domingos}.variantes[]
 *       - frecuenciaMin: integer (0 = no medible)
 *       - origen, destino, horaInicio, horaFin
 *
 * Algoritmo de cálculo:
 *  1) Agrupar viajes_activos por (linea, variante).
 *  2) Para cada par consecutivo (orden por posición sobre el corredor),
 *     calcular distancia haversine.
 *  3) Convertir distancia → headway en minutos usando velocidad media
 *     de la línea (asumido ~25 km/h promedio — refinable con
 *     vehicle_events en versión 2).
 *  4) Comparar headway_actual vs frecuenciaMin de horarios_stm.
 *     - ratio < 0.5 → BUNCHING
 *     - ratio 0.5-1.5 → NORMAL
 *     - ratio > 1.5 → GAPPING
 *  5) Si frecuenciaMin === 0 o no hay horarios_stm → NO_MEDIBLE
 *     (transparencia §12 — gap conocido del scraper STM).
 */
import { db } from '../config/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from 'firebase/firestore';

// ─── Tipos ──────────────────────────────────────────────────────────

export type EmpresaName = 'UCOT' | 'CUTCSA' | 'COME' | 'COETC';
export type EstadoHeadway = 'BUNCHING' | 'NORMAL' | 'GAPPING' | 'NO_MEDIBLE';

export interface BusActivo {
  interno: string;
  empresa: EmpresaName;
  linea: string;
  variante: number;
  posicion: { lat: number; lon: number };
  posicionAnterior?: { lat: number; lon: number };
  updatedAt: Date;
}

export interface HeadwayPair {
  linea: string;
  variante: number;
  busA: { interno: string; empresa: EmpresaName };
  busB: { interno: string; empresa: EmpresaName };
  distanciaKm: number;
  headwayMin: number;
  frecuenciaEsperadaMin: number | null;
  ratio: number | null;
  estado: EstadoHeadway;
  notaMedicion?: string;
}

export interface HeadwayLineaResumen {
  linea: string;
  busesActivos: number;
  paresAnalizados: number;
  pctBunching: number;
  pctNormal: number;
  pctGapping: number;
  pctNoMedible: number;
  headwayPromedioMin: number | null;
  frecuenciaEsperadaMin: number | null;
  pares: HeadwayPair[];
}

export interface HRRCrossOp {
  linea: string;
  variante: number;
  busPropio: { interno: string; empresa: EmpresaName };
  busRivalProximo: { interno: string; empresa: EmpresaName };
  distanciaMetros: number;
  headwayPropioMin: number | null;
  tiempoARivalMin: number;
  hrr: number | null;
  estado: 'CRITICO' | 'PRECAUCION' | 'OK' | 'NO_MEDIBLE';
}

// ─── Helpers ────────────────────────────────────────────────────────

const VEL_PROMEDIO_KMH = 25; // refinable a futuro con vehicle_events

function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function distanciaAHeadway(distanciaKm: number): number {
  return (distanciaKm / VEL_PROMEDIO_KMH) * 60;
}

function tipoDiaHoy(): 'Hábiles' | 'Sábados' | 'Domingos' {
  const dow = new Date().getDay();
  if (dow === 0) return 'Domingos';
  if (dow === 6) return 'Sábados';
  return 'Hábiles';
}

function clasificarRatio(ratio: number): EstadoHeadway {
  if (ratio < 0.5) return 'BUNCHING';
  if (ratio > 1.5) return 'GAPPING';
  return 'NORMAL';
}

// ─── Carga de datos ─────────────────────────────────────────────────

/**
 * Lee viajes_activos filtrado por empresa (opcional). Devuelve la
 * lista de buses activos transformada al shape interno.
 */
export async function getViajesActivos(empresa?: EmpresaName): Promise<BusActivo[]> {
  const col = collection(db, 'viajes_activos');
  const q = empresa
    ? query(col, where('empresa', '==', empresa))
    : query(col);
  const snap = await getDocs(q);
  const result: BusActivo[] = [];
  snap.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    const pos = data.posicion as { latitude: number; longitude: number } | undefined;
    const posPrev = data.posicion_anterior as
      | { latitude: number; longitude: number }
      | undefined;
    if (!pos || typeof pos.latitude !== 'number') return;
    const updatedAt = data.updatedAt as { toDate?: () => Date } | undefined;
    result.push({
      interno: d.id,
      empresa: String(data.empresa || '') as EmpresaName,
      linea: String(data.linea || ''),
      variante: Number(data.variante || 0),
      posicion: { lat: pos.latitude, lon: pos.longitude },
      posicionAnterior: posPrev
        ? { lat: posPrev.latitude, lon: posPrev.longitude }
        : undefined,
      updatedAt: updatedAt?.toDate ? updatedAt.toDate() : new Date(),
    });
  });
  return result;
}

/**
 * Lee horarios_stm/{linea} y devuelve la frecuencia esperada para hoy.
 * null si la línea no tiene horarios cargados o no aplica para hoy.
 */
export async function getFrecuenciaEsperada(
  linea: string,
  variante?: number,
): Promise<number | null> {
  try {
    const ref = doc(db, 'horarios_stm', linea);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    const dias = data.dias as Record<string, { variantes?: Array<Record<string, unknown>> }>;
    const tipo = tipoDiaHoy();
    const dia = dias?.[tipo];
    if (!dia?.variantes || dia.variantes.length === 0) return null;
    // Si se pidió variante específica, intentar matchearla.
    let v = dia.variantes[0];
    if (variante !== undefined) {
      const match = dia.variantes.find(
        (x) => Number(x.variante ?? 0) === variante,
      );
      if (match) v = match;
    }
    const freq = Number(v.frecuenciaMin ?? 0);
    return freq > 0 ? freq : null;
  } catch (err) {
    console.warn('[headwayInsightsService.getFrecuenciaEsperada]', linea, err);
    return null;
  }
}

// ─── Single-op headway analytics ────────────────────────────────────

export async function calcularHeadwaySingleOp(
  empresa: EmpresaName,
): Promise<HeadwayLineaResumen[]> {
  const buses = await getViajesActivos(empresa);
  const porLinea = new Map<string, BusActivo[]>();
  for (const b of buses) {
    if (!b.linea) continue;
    const key = `${b.linea}::${b.variante}`;
    if (!porLinea.has(key)) porLinea.set(key, []);
    porLinea.get(key)!.push(b);
  }

  const result: HeadwayLineaResumen[] = [];
  for (const [key, busesLinea] of porLinea) {
    const [linea, varStr] = key.split('::');
    const variante = Number(varStr);
    if (busesLinea.length < 2) continue;

    const freqEsperada = await getFrecuenciaEsperada(linea, variante);
    const pares: HeadwayPair[] = [];
    for (let i = 0; i < busesLinea.length - 1; i++) {
      const a = busesLinea[i];
      const b = busesLinea[i + 1];
      const distKm = haversineKm(a.posicion, b.posicion);
      const headwayMin = distanciaAHeadway(distKm);
      let ratio: number | null = null;
      let estado: EstadoHeadway = 'NO_MEDIBLE';
      let nota: string | undefined;
      if (freqEsperada && freqEsperada > 0) {
        ratio = headwayMin / freqEsperada;
        estado = clasificarRatio(ratio);
      } else {
        nota = 'Sin frecuencia esperada (línea sin horarios_stm o variante no encontrada).';
      }
      pares.push({
        linea,
        variante,
        busA: { interno: a.interno, empresa: a.empresa },
        busB: { interno: b.interno, empresa: b.empresa },
        distanciaKm: Math.round(distKm * 100) / 100,
        headwayMin: Math.round(headwayMin * 10) / 10,
        frecuenciaEsperadaMin: freqEsperada,
        ratio: ratio !== null ? Math.round(ratio * 100) / 100 : null,
        estado,
        notaMedicion: nota,
      });
    }

    const totalPares = pares.length;
    const cnt = (e: EstadoHeadway) => pares.filter((p) => p.estado === e).length;
    const headwaysMedibles = pares
      .filter((p) => p.ratio !== null)
      .map((p) => p.headwayMin);
    const headwayPromedio =
      headwaysMedibles.length > 0
        ? Math.round(
            (headwaysMedibles.reduce((s, h) => s + h, 0) / headwaysMedibles.length) * 10,
          ) / 10
        : null;

    result.push({
      linea,
      busesActivos: busesLinea.length,
      paresAnalizados: totalPares,
      pctBunching: totalPares > 0 ? Math.round((cnt('BUNCHING') / totalPares) * 100) : 0,
      pctNormal: totalPares > 0 ? Math.round((cnt('NORMAL') / totalPares) * 100) : 0,
      pctGapping: totalPares > 0 ? Math.round((cnt('GAPPING') / totalPares) * 100) : 0,
      pctNoMedible:
        totalPares > 0 ? Math.round((cnt('NO_MEDIBLE') / totalPares) * 100) : 0,
      headwayPromedioMin: headwayPromedio,
      frecuenciaEsperadaMin: freqEsperada,
      pares,
    });
  }
  return result.sort((a, b) => a.linea.localeCompare(b.linea, 'es', { numeric: true }));
}

// ─── Cross-op HRR (Headway-to-Rival Ratio) ──────────────────────────

/**
 * Por cada bus de mi operador, encuentra el bus rival más próximo en
 * la misma línea. Calcula HRR = headway_propio / tiempo_a_rival.
 *
 * HRR < 0.3  → CRITICO (rival pegado al mío, ineficiencia cross-op)
 * HRR 0.3-1  → PRECAUCION
 * HRR > 1    → OK (estoy más adelante del rival)
 */
export async function calcularHRRCrossOp(
  empresaPropia: EmpresaName,
): Promise<HRRCrossOp[]> {
  const todos = await getViajesActivos(); // sin filtro = todos los operadores
  const propios = todos.filter((b) => b.empresa === empresaPropia);

  const result: HRRCrossOp[] = [];
  for (const propio of propios) {
    if (!propio.linea) continue;
    // Rivales = misma línea, distinta empresa (operadores comparten corredores)
    const rivales = todos.filter(
      (b) => b.linea === propio.linea && b.empresa !== empresaPropia,
    );
    if (rivales.length === 0) continue;

    // Encontrar rival más próximo
    let mejor: { rival: BusActivo; distM: number } | null = null;
    for (const rival of rivales) {
      const distKm = haversineKm(propio.posicion, rival.posicion);
      if (!mejor || distKm * 1000 < mejor.distM) {
        mejor = { rival, distM: distKm * 1000 };
      }
    }
    if (!mejor) continue;

    const tiempoARivalMin = (mejor.distM / 1000 / VEL_PROMEDIO_KMH) * 60;
    const headwayPropioMin = await getFrecuenciaEsperada(propio.linea, propio.variante);
    let hrr: number | null = null;
    let estado: HRRCrossOp['estado'] = 'NO_MEDIBLE';
    if (headwayPropioMin && headwayPropioMin > 0 && tiempoARivalMin > 0) {
      hrr = tiempoARivalMin / headwayPropioMin;
      if (hrr < 0.3) estado = 'CRITICO';
      else if (hrr < 1) estado = 'PRECAUCION';
      else estado = 'OK';
    }

    result.push({
      linea: propio.linea,
      variante: propio.variante,
      busPropio: { interno: propio.interno, empresa: propio.empresa },
      busRivalProximo: {
        interno: mejor.rival.interno,
        empresa: mejor.rival.empresa,
      },
      distanciaMetros: Math.round(mejor.distM),
      headwayPropioMin,
      tiempoARivalMin: Math.round(tiempoARivalMin * 10) / 10,
      hrr: hrr !== null ? Math.round(hrr * 100) / 100 : null,
      estado,
    });
  }

  return result.sort(
    (a, b) => (a.hrr ?? Infinity) - (b.hrr ?? Infinity),
  );
}
