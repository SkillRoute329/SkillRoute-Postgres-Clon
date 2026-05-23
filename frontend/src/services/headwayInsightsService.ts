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
import { apiClient } from '../clients/apiClient';
import { distanciaKm } from '../utils/geomath';

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

// FASE 5.16: delega en utils/geomath (fuente única). API local intacta.
function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  return distanciaKm(a, b);
}

function distanciaAHeadway(distanciaKm: number): number {
  return (distanciaKm / VEL_PROMEDIO_KMH) * 60;
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
  const queryParams: Record<string, any> = { limit: 5000 };
  if (empresa) queryParams.where = `empresa:${empresa}`;
  const raw = (await apiClient.get('/api/db/viajes_activos', { query: queryParams })) as unknown as any[];
  const arr = Array.isArray(raw) ? raw : [];
  const result: BusActivo[] = [];
  arr.forEach((data: any) => {
    const pos = data.posicion as { latitude: number; longitude: number } | undefined;
    const posPrev = data.posicion_anterior as
      | { latitude: number; longitude: number }
      | undefined;
    if (!pos || typeof pos.latitude !== 'number') return;
    result.push({
      interno: data.id,
      empresa: String(data.empresa || '') as EmpresaName,
      linea: String(data.linea || ''),
      variante: Number(data.variante || 0),
      posicion: { lat: pos.latitude, lon: pos.longitude },
      posicionAnterior: posPrev
        ? { lat: posPrev.latitude, lon: posPrev.longitude }
        : undefined,
      updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
    });
  });
  return result;
}

/**
 * FASE 5.21 (2026-05-17): `horarios_stm` NO existe (ni en whitelist ni tabla)
 * → toda línea daba NO_MEDIBLE y el módulo no servía. Ahora la frecuencia
 * PROGRAMADA se deriva del GTFS oficial IMM vía /api/comando/frecuencias-gtfs
 * (mapa línea→headway min, cacheado en backend). Se memoiza una vez por sesión.
 */
let _frecMapPromise: Promise<Record<string, number>> | null = null;
function cargarFrecuencias(): Promise<Record<string, number>> {
  if (!_frecMapPromise) {
    _frecMapPromise = apiClient
      .get('/api/comando/frecuencias-gtfs')
      .then((r: any) => (r && r.frecuencias) || {})
      .catch((err) => {
        console.warn('[headwayInsightsService] frecuencias-gtfs', err);
        _frecMapPromise = null; // permitir reintento
        return {};
      });
  }
  return _frecMapPromise;
}

export async function getFrecuenciaEsperada(
  linea: string,
  _variante?: number,
): Promise<number | null> {
  const mapa = await cargarFrecuencias();
  const f = Number(mapa[String(linea)] ?? 0);
  return f > 0 ? f : null;
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
