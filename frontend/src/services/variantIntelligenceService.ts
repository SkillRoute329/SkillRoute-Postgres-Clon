/**
 * Variant Intelligence Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Inteligencia operativa por VARIANTE (par origen→destino) para las 9 líneas
 * UCOT. Consume:
 *   - ucotVariantsMaster.json (horarios reales scrapeados del STM IMM)
 *   - LINE_INSPECTOR_CONFIGS (rivales verificados + corridorBbox + frecuencias)
 *   - Buses GPS en vivo (/api/positions → intelligenceApi)
 *
 * Provee:
 *   - Variantes reales por línea, ordenadas por volumen (primary/secondary)
 *   - Tactical context por variante (rivales, puntos de carga, estrategia)
 *   - KPIs live: OTP aproximado, Headway adherence, Semáforo, SRI
 *   - Alert feed "próximos 15 min" por variante (huecos, bunching, presión rival)
 */

import masterJson from '../data/ucotVariantsMaster.json';
import { LINE_INSPECTOR_CONFIGS, type LineInspectorConfig } from './LineInspectorAgent';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type TipoDiaScrape = 'Hábiles' | 'Sábados' | 'Domingos';

export interface VarianteHorarioSlot {
  salidas: string[]; // ["HH:MM", ...] ordenadas
  frecuenciaPromedioMin: number;
}

export interface VarianteMaster {
  origen: string;
  destino: string;
  key: string; // "Origen → Destino"
  horarios: Partial<Record<TipoDiaScrape, VarianteHorarioSlot>>;
}

export interface LineaMaster {
  lineId: string;
  scrapedAt: string;
  variantes: VarianteMaster[];
}

export interface VariantTactical {
  origen: string;
  destino: string;
  key: string;
  principal: boolean; // true = ida/vuelta completa; false = ramal/servicio parcial
  totalSalidasHabiles: number;
  rivales: string[]; // ["185 (Cutcsa)", ...]
  puntosCarga: string[];
  estrategia: string;
}

export interface BusPositionLite {
  lineId: string;
  lat: number;
  lng: number;
  velocidadKmh?: number;
  rumboGrados?: number;
  timestamp?: number; // epoch ms
}

export type Semaforo = 'VERDE' | 'AMARILLO' | 'ROJO' | 'GRIS'; // gris = fuera de horario

export interface VariantKPIs {
  variantKey: string;
  semaforo: Semaforo;
  frecuenciaTeoricaMin: number; // teórica actual según horario STM
  proximaSalida: string | null; // "HH:MM" o null si ya terminó
  minutosParaProxima: number | null;
  salidasUltimaHora: number; // esperadas según horario
  busesEnCorridor: number; // buses UCOT de ESTA línea con GPS dentro del bbox
  otpAprox: number | null; // % — null si no se puede calcular
  headwayAdherencePct: number | null;
  sri: number | null; // 0-100 — Service Reliability Index
  rivalPresionHeadwayMin: number; // freq del rival dominante en esta variante
}

export type AlertaSeveridad = 'INFO' | 'AVISO' | 'CRITICO';

export interface VariantAlert {
  id: string;
  severidad: AlertaSeveridad;
  titulo: string;
  detalle: string;
  etaMin?: number; // minutos hasta el evento (si aplica)
  origen: 'HORARIO' | 'GPS' | 'RIVAL' | 'BUNCHING' | 'HUECO';
}

// ─── Data load ──────────────────────────────────────────────────────────────

const MASTER_DATA = masterJson as Record<string, LineaMaster>;

// ─── Utilidades de tiempo ───────────────────────────────────────────────────

function nowHHMM(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function diffMin(a: string, b: string): number {
  // b - a en minutos (puede ser negativo)
  return hhmmToMin(b) - hhmmToMin(a);
}

function tipoDiaHoy(d: Date = new Date()): TipoDiaScrape {
  const day = d.getDay(); // 0 dom, 6 sab
  if (day === 0) return 'Domingos';
  if (day === 6) return 'Sábados';
  return 'Hábiles';
}

// ─── Public: listar variantes ───────────────────────────────────────────────

export function getVariantsForLine(lineId: string): VariantTactical[] {
  const line = MASTER_DATA[lineId];
  if (!line) return [];

  // Ordenar por volumen de salidas en hábiles (primary = top 2)
  const enriched = line.variantes.map((v) => {
    const totHab = v.horarios['Hábiles']?.salidas?.length ?? 0;
    return { v, totHab };
  });
  enriched.sort((a, b) => b.totHab - a.totHab);

  const top2Keys = new Set(enriched.slice(0, 2).map((x) => x.v.key));

  return enriched.map(({ v, totHab }) => {
    const tactical = buildTacticalForVariant(lineId, v);
    return {
      origen: v.origen,
      destino: v.destino,
      key: v.key,
      principal: top2Keys.has(v.key),
      totalSalidasHabiles: totHab,
      ...tactical,
    };
  });
}

export function getLineIdsWithVariants(): string[] {
  return Object.keys(MASTER_DATA);
}

export function getVariantMaster(lineId: string, variantKey: string): VarianteMaster | null {
  return MASTER_DATA[lineId]?.variantes.find((v) => v.key === variantKey) ?? null;
}

// ─── Tactical derivation por variante ───────────────────────────────────────

/**
 * Deriva estrategia táctica por variante a partir de:
 *   - LINE_INSPECTOR_CONFIGS (rivales, tramos demanda)
 *   - orientación de la variante (si el destino coincide con terminalB → sentido "ida";
 *     si coincide con terminalA → "vuelta"; si no coincide → servicio parcial)
 *
 * No inventa: solo combina datos verificados.
 */
function buildTacticalForVariant(
  lineId: string,
  v: VarianteMaster
): { rivales: string[]; puntosCarga: string[]; estrategia: string } {
  const cfg = LINE_INSPECTOR_CONFIGS[lineId];
  if (!cfg) {
    return {
      rivales: [],
      puntosCarga: [],
      estrategia: 'Configuración no cargada. Seguir frecuencia reglamentaria.',
    };
  }

  const puntosCarga = cfg.tramosAlaDemanda ?? [];

  const sentidoIda = matchTerminal(v.destino, cfg.terminalB) && matchTerminal(v.origen, cfg.terminalA);
  const sentidoVuelta = matchTerminal(v.destino, cfg.terminalA) && matchTerminal(v.origen, cfg.terminalB);
  const esServicioParcial = !sentidoIda && !sentidoVuelta;

  // Para IDA: mostrar rivales ordenados por solapamiento descendente (los que más presión hacen en ese sentido)
  // Para VUELTA: ídem, pero priorizando los que tienen tramo compartido en vuelta
  const rivalesOrdenados = sentidoVuelta
    ? [...cfg.rivalesVerificados].sort((a, b) => (b.solapamientoPct ?? 0) - (a.solapamientoPct ?? 0))
    : cfg.rivalesVerificados;

  const rivales = rivalesOrdenados.map(
    (r) => `${r.lineId} (${r.empresa})`
  );

  const rivalDominante = rivalesOrdenados[0];
  const rivalTxt = rivalDominante
    ? `${rivalDominante.lineId} ${rivalDominante.empresa} (solapamiento ${rivalDominante.solapamientoPct}%, freq ${rivalDominante.frecuenciaRivalMin} min)`
    : 'sin rival dominante detectado';

  let estrategia: string;
  if (sentidoIda) {
    estrategia = `Sentido IDA (${cfg.terminalA} → ${cfg.terminalB}). Rival clave: ${rivalTxt}. Limpieza de paradas en ${(puntosCarga[0] ?? 'tramo principal')}, margen 2-3 min con el coche anterior de la misma empresa. No perseguir al rival fuera del corredor de solapamiento.`;
  } else if (sentidoVuelta) {
    estrategia = `Sentido VUELTA (${cfg.terminalB} → ${cfg.terminalA}). Rival clave: ${rivalTxt}. Aprovechar captación en ${(puntosCarga[puntosCarga.length - 1] ?? 'tramo final')}; mantener frecuencia reglamentaria y no pisar al compañero anterior.`;
  } else if (esServicioParcial) {
    estrategia = `Ramal (${v.origen} → ${v.destino}). Baja frecuencia esperada — prioridad: puntualidad estricta. ${rivales.length > 0 ? `Rivales en zona: ${rivales.join(', ')}.` : 'Sin rivales directos detectados en este ramal.'}`;
  } else {
    estrategia = `Sentido mixto. Rival clave: ${rivalTxt}. Seguir frecuencia reglamentaria.`;
  }

  return { rivales, puntosCarga, estrategia };
}

/** Matching por intersección de palabras significativas (>2 chars) para tolerar
 *  diferencias entre nombres STM (ej. "Instrucciones Y José Belloni") y
 *  configs internas (ej. "Instrucciones y Belloni"). */
function matchTerminal(text: string, terminal: string): boolean {
  const textNorm = normalizar(text);
  const termNorm = normalizar(terminal);
  if (textNorm === termNorm || textNorm.includes(termNorm) || termNorm.includes(textNorm)) return true;
  const termWords = termNorm.split(' ').filter((w) => w.length > 2);
  return termWords.length > 0 && termWords.every((w) => textNorm.includes(w));
}

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── KPIs en vivo ───────────────────────────────────────────────────────────

export interface KPIInput {
  lineId: string;
  variantKey: string;
  busPositions: BusPositionLite[]; // de la línea
  now?: Date;
}

export function computeVariantKPIs(input: KPIInput): VariantKPIs {
  const now = input.now ?? new Date();
  const tipo = tipoDiaHoy(now);
  const variant = getVariantMaster(input.lineId, input.variantKey);
  const cfg = LINE_INSPECTOR_CONFIGS[input.lineId];

  const horario = variant?.horarios[tipo];
  const salidas = horario?.salidas ?? [];
  const freqTeorica = horario?.frecuenciaPromedioMin ?? 0;

  // Próxima salida desde ahora
  const hhmm = nowHHMM(now);
  const futuras = salidas.filter((s) => hhmmToMin(s) >= hhmmToMin(hhmm));
  const proxima = futuras[0] ?? null;
  const minutosParaProxima = proxima ? diffMin(hhmm, proxima) : null;

  // Salidas en la última hora (esperadas)
  const horaPrevia = hhmmToMin(hhmm) - 60;
  const salidasUltimaHora = salidas.filter((s) => {
    const t = hhmmToMin(s);
    return t >= horaPrevia && t <= hhmmToMin(hhmm);
  }).length;

  // Buses en corridor (bbox de la LÍNEA, no de la variante — el STM no da geometría por variante)
  const busesEnCorridor = cfg?.corridorBbox
    ? input.busPositions.filter((b) => isInBbox(b, cfg.corridorBbox)).length
    : input.busPositions.length;

  // OTP aproximado: si esperábamos N salidas en la última hora y vemos M buses activos
  //   OTP ≈ min(100, M/N * 100). Si N=0 → null (fuera de horario).
  const otpAprox =
    salidasUltimaHora > 0
      ? Math.min(100, Math.round((busesEnCorridor / salidasUltimaHora) * 100))
      : null;

  // Headway adherence: si freq teórica > 0 y tenemos ≥2 buses → estimar
  const headwayAdherencePct = estimateHeadwayAdherence(input.busPositions, freqTeorica);

  // Rival presión
  const rivalPresionHeadwayMin = cfg?.rivalesVerificados[0]?.frecuenciaRivalMin ?? 0;

  // Semáforo
  const semaforo = computeSemaforo({
    otp: otpAprox,
    headwayAdherencePct,
    busesEnCorridor,
    salidasUltimaHora,
    freqTeorica,
    rivalHeadway: rivalPresionHeadwayMin,
  });

  // SRI (Service Reliability Index) 0-100 compuesto
  const sri = computeSRI({
    otp: otpAprox,
    headwayAdherencePct,
    cobertura: salidasUltimaHora > 0 ? 100 : 0,
    competitividad:
      rivalPresionHeadwayMin && freqTeorica
        ? Math.max(0, Math.min(100, (rivalPresionHeadwayMin / freqTeorica) * 50))
        : 50,
  });

  return {
    variantKey: input.variantKey,
    semaforo,
    frecuenciaTeoricaMin: freqTeorica,
    proximaSalida: proxima,
    minutosParaProxima,
    salidasUltimaHora,
    busesEnCorridor,
    otpAprox,
    headwayAdherencePct,
    sri,
    rivalPresionHeadwayMin,
  };
}

function isInBbox(
  b: BusPositionLite,
  bbox: LineInspectorConfig['corridorBbox']
): boolean {
  const [minLat, minLng, maxLat, maxLng] = bbox;
  return b.lat >= minLat && b.lat <= maxLat && b.lng >= minLng && b.lng <= maxLng;
}

function estimateHeadwayAdherence(
  buses: BusPositionLite[],
  freqTeoricaMin: number
): number | null {
  if (freqTeoricaMin <= 0 || buses.length < 2) return null;
  // Sin timestamps individuales confiables el mejor proxy es:
  //   si hay más buses que el ratio esperado → 100%; si hay menos → proporcional.
  // Placeholder honesto: devolvemos null hasta tener timestamps reales de paso por parada.
  // Por ahora usamos presencia > 0 como proxy binario.
  return null;
}

interface SemaforoInput {
  otp: number | null;
  headwayAdherencePct: number | null;
  busesEnCorridor: number;
  salidasUltimaHora: number;
  freqTeorica: number;
  rivalHeadway: number;
}

function computeSemaforo(s: SemaforoInput): Semaforo {
  if (s.freqTeorica === 0) return 'GRIS'; // fuera de horario
  if (s.salidasUltimaHora === 0 && s.busesEnCorridor === 0) return 'GRIS';
  if (s.otp !== null && s.otp < 60) return 'ROJO';
  if (s.busesEnCorridor === 0 && s.salidasUltimaHora > 0) return 'ROJO';
  if (s.rivalHeadway > 0 && s.freqTeorica > 0 && s.freqTeorica > s.rivalHeadway * 2) return 'ROJO';
  if (s.otp !== null && s.otp < 80) return 'AMARILLO';
  if (s.rivalHeadway > 0 && s.freqTeorica > s.rivalHeadway * 1.4) return 'AMARILLO';
  return 'VERDE';
}

interface SRIInput {
  otp: number | null;
  headwayAdherencePct: number | null;
  cobertura: number;
  competitividad: number;
}

function computeSRI(s: SRIInput): number | null {
  // Pesos: OTP 40% · Headway 25% · Cobertura 20% · Competitividad 15%
  const otp = s.otp ?? 0;
  const hw = s.headwayAdherencePct ?? otp; // si no hay headway, usamos OTP como proxy
  if (s.otp === null && s.headwayAdherencePct === null && s.cobertura === 0) return null;
  return Math.round(otp * 0.4 + hw * 0.25 + s.cobertura * 0.2 + s.competitividad * 0.15);
}

// ─── Alert feed "próximos 15 min" ───────────────────────────────────────────

export function computeVariantAlerts(input: KPIInput): VariantAlert[] {
  const now = input.now ?? new Date();
  const tipo = tipoDiaHoy(now);
  const variant = getVariantMaster(input.lineId, input.variantKey);
  const cfg = LINE_INSPECTOR_CONFIGS[input.lineId];
  const alerts: VariantAlert[] = [];

  if (!variant || !cfg) return alerts;

  const horario = variant.horarios[tipo];
  const salidas = horario?.salidas ?? [];
  const freqTeorica = horario?.frecuenciaPromedioMin ?? 0;
  const hhmm = nowHHMM(now);

  // Próximas salidas UCOT dentro de 15 min
  const ventana15 = salidas.filter((s) => {
    const d = diffMin(hhmm, s);
    return d >= 0 && d <= 15;
  });

  ventana15.forEach((s, i) => {
    const d = diffMin(hhmm, s);
    alerts.push({
      id: `ucot-${variant.key}-${s}`,
      severidad: 'INFO',
      titulo: `Salida UCOT ${input.lineId} en ${d} min`,
      detalle: `${variant.origen} → ${variant.destino} · ${s} hs`,
      etaMin: d,
      origen: 'HORARIO',
    });
    if (i > 2) return; // cap
  });

  // Presión rival: si el rival dominante tiene headway < nuestra frecuencia → aviso
  const rivalTop = cfg.rivalesVerificados[0];
  if (rivalTop && rivalTop.frecuenciaRivalMin > 0 && freqTeorica > 0) {
    const ratio = freqTeorica / rivalTop.frecuenciaRivalMin;
    if (ratio >= 1.4) {
      alerts.push({
        id: `rival-${variant.key}`,
        severidad: ratio >= 2 ? 'CRITICO' : 'AVISO',
        titulo: `Presión ${rivalTop.lineId} ${rivalTop.empresa}`,
        detalle: `Rival freq ${rivalTop.frecuenciaRivalMin} min vs nuestros ${freqTeorica} min en ${rivalTop.tramoCompartido}. Solapamiento ${rivalTop.solapamientoPct}%.`,
        origen: 'RIVAL',
      });
    }
  }

  // Hueco si no hay salidas próximas en 15 min pero es horario teórico
  if (ventana15.length === 0 && freqTeorica > 0) {
    const ultimaPasada = [...salidas].reverse().find((s) => diffMin(hhmm, s) <= 0 && diffMin(hhmm, s) >= -30);
    if (!ultimaPasada || Math.abs(diffMin(hhmm, ultimaPasada)) > freqTeorica * 1.3) {
      alerts.push({
        id: `hueco-${variant.key}`,
        severidad: 'AVISO',
        titulo: 'Posible hueco de servicio',
        detalle: `Sin salidas esperadas en los próximos 15 min (frec teórica ${freqTeorica} min).`,
        origen: 'HUECO',
      });
    }
  }

  // Bunching aproximado: si hay ≥2 buses UCOT pegados (< freqTeorica × 0.4 apart)
  if (input.busPositions.length >= 2 && freqTeorica > 0) {
    const pares = countCloseBusPairs(input.busPositions, 0.3); // 300m
    if (pares > 0) {
      alerts.push({
        id: `bunching-${variant.key}`,
        severidad: 'AVISO',
        titulo: `${pares} par(es) de buses pegados`,
        detalle: `Detectado bunching en el corredor. Considerar ajustar ritmo o pausar cabecera.`,
        origen: 'BUNCHING',
      });
    }
  }

  return alerts;
}

function countCloseBusPairs(buses: BusPositionLite[], maxKm: number): number {
  let pares = 0;
  for (let i = 0; i < buses.length; i++) {
    for (let j = i + 1; j < buses.length; j++) {
      if (haversineKm(buses[i], buses[j]) <= maxKm) pares++;
    }
  }
  return pares;
}

function haversineKm(a: BusPositionLite, b: BusPositionLite): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
