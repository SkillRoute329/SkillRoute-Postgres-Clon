import { TrafficService } from './trafficService';
import { ScheduleService } from './scheduleService';

export interface CompetitorThreat {
  detected: boolean;
  competitorLine?: string;
  gapMinutes?: number;
  distance?: number;
  recommendation?: 'DELAY' | 'SPEED_UP' | 'ON_TIME';
  threatLevel: 'CRITICAL' | 'WARN' | 'SAFE';
  message: string;
  /** Dirección relativa del rival respecto al bus UCOT */
  rivalDirection?: 'AHEAD' | 'BEHIND' | 'OPPOSITE' | 'UNKNOWN';
  /** Información de horarios */
  scheduleIntel?: {
    ucotNextDep: string | null;
    rivalNextDep: string | null;
    ventajaMin: number;
    descripcion: string;
  };
}

const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Calcula el bearing (rumbo) desde un punto A hacia un punto B.
 * Retorna grados 0-360 (0 = Norte, 90 = Este).
 */
const calculateBearing = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
};

// =====================================================================
// MODELO DE CORREDORES TÁCTICOS v6.0 (Geo-Validated — Rivales Verificados)
// =====================================================================
// Cada corredor está vinculado a una VARIANTE ESPECÍFICA (ej: 370a, 370b)
// con recorrido real diferente y horarios de salida.

export interface CorridorDefinition {
  lineId: string;
  destino: string;
  /** Código de variante para cargar recorrido real ('370a' = IDA, '370b' = VUELTA) */
  variantCode: string;
  /** Rango de heading del corredor (ej: 45-135 = hacia el Este) */
  headingRange: [number, number];
  /** Rivales específicos para ESTE sentido */
  rivals: string[];
  /** Descripción para la UI */
  label: string;
  /** Terminal de salida */
  terminalOrigen: string;
  /** Terminal de llegada */
  terminalDestino: string;
}

/**
 * Mapa de Corredores Tácticos v5.0 — Variant-Aware.
 * Cada corredor referencia el código de variante para cargar la ruta REAL.
export const CORRIDOR_MAP: CorridorDefinition[] = [

  // LÍNEA 300 — Rivales: Copsa 161/162/163 (Av. Italia/Belloni VERIFICADO)
  // ❌ Eliminados 103/110: no comparten Av. Italia con la 300
  { lineId: '300', destino: 'INSTRUCCIONES', variantCode: '300a', headingRange: [20, 110] as [number, number],
    rivals: ['161', '162', '163'], label: '300 → Instrucciones (IDA)',
    terminalOrigen: 'Cementerio Central', terminalDestino: 'Instrucciones y Belloni',
    corridorBbox: [-34.92, -56.20, -34.83, -56.05] as [number, number, number, number] },
  { lineId: '300', destino: 'CRIO_CENTRAL', variantCode: '300b', headingRange: [200, 290] as [number, number],
    rivals: ['161', '162', '163'], label: '300 → Crio. Central (VTA)',
    terminalOrigen: 'Instrucciones y Belloni', terminalDestino: 'Cementerio Central',
    corridorBbox: [-34.92, -56.20, -34.83, -56.05] as [number, number, number, number] },

  // LÍNEA 306 — Rivales: Cutcsa 185 + Línea G/Gómez (Cno. Ramírez → Ruta 1 → Géant)
  // ❌ Eliminado 76: no comparte el corredor Ruta 1/Casabó
  { lineId: '306', destino: 'GÉANT', variantCode: '306a', headingRange: [50, 160] as [number, number],
    rivals: ['185', 'G'], label: '306 → Géant (IDA)',
    terminalOrigen: 'Casabó', terminalDestino: 'Géant',
    corridorBbox: [-34.95, -56.30, -34.75, -56.10] as [number, number, number, number] },
  { lineId: '306', destino: 'CASABÓ', variantCode: '306b', headingRange: [230, 340] as [number, number],
    rivals: ['185', 'G'], label: '306 → Casabó (VTA)',
    terminalOrigen: 'Géant', terminalDestino: 'Casabó',
    corridorBbox: [-34.95, -56.30, -34.75, -56.10] as [number, number, number, number] },

  // LÍNEA 316 — Rivales: Cutcsa 186/187/188 (Av. Millán/Garzón/Pocitos VERIFICADO)
  // ❌ Eliminados 100/103: son corredores Ciudad Vieja/Centro
  { lineId: '316', destino: 'POCITOS', variantCode: '316a', headingRange: [160, 260] as [number, number],
    rivals: ['186', '187', '188'], label: '316 → Pocitos (IDA)',
    terminalOrigen: 'Cno. Maldonado', terminalDestino: 'Pocitos',
    corridorBbox: [-34.91, -56.18, -34.86, -56.10] as [number, number, number, number] },
  { lineId: '316', destino: 'CNO_MALDONADO', variantCode: '316b', headingRange: [340, 80] as [number, number],
    rivals: ['186', '187', '188'], label: '316 → Cno. Maldonado (VTA)',
    terminalOrigen: 'Pocitos', terminalDestino: 'Cno. Maldonado',
    corridorBbox: [-34.91, -56.18, -34.86, -56.10] as [number, number, number, number] },

  // LÍNEA 328 — Rivales: Cutcsa 125/126 + Dinata D1 (18 de Julio/Goes VERIFICADO)
  // ❌ Eliminados 102/106: son corredores distintos (Cerrito/Larrañaga)
  { lineId: '328', destino: 'MENDOZA', variantCode: '328a', headingRange: [20, 110] as [number, number],
    rivals: ['125', '126', 'D1'], label: '328 → Mendoza (IDA)',
    terminalOrigen: 'Punta Carretas', terminalDestino: 'Mendoza',
    corridorBbox: [-34.92, -56.20, -34.88, -56.13] as [number, number, number, number] },
  { lineId: '328', destino: 'PUNTA_CARRETAS', variantCode: '328b', headingRange: [200, 290] as [number, number],
    rivals: ['125', '126', 'D1'], label: '328 → Punta Carretas (VTA)',
    terminalOrigen: 'Mendoza', terminalDestino: 'Punta Carretas',
    corridorBbox: [-34.92, -56.20, -34.88, -56.13] as [number, number, number, number] },

  // LÍNEA 329 — Rivales: Cutcsa 181/182/183 (Av. Italia/Instrucciones CONFIRMADO)
  { lineId: '329', destino: 'INSTRUCCIONES', variantCode: '329a', headingRange: [20, 110] as [number, number],
    rivals: ['181', '182', '183'], label: '329 → Instrucciones (IDA)',
    terminalOrigen: 'Punta Carretas', terminalDestino: 'Instrucciones',
    corridorBbox: [-34.92, -56.18, -34.83, -56.05] as [number, number, number, number] },
  { lineId: '329', destino: 'PUNTA_CARRETAS', variantCode: '329b', headingRange: [200, 290] as [number, number],
    rivals: ['181', '182', '183'], label: '329 → Punta Carretas (VTA)',
    terminalOrigen: 'Instrucciones', terminalDestino: 'Punta Carretas',
    corridorBbox: [-34.92, -56.18, -34.83, -56.05] as [number, number, number, number] },

  // LÍNEA 330 — Rivales: Cutcsa 147/148/185 (Cno. Ramírez/Ciudad Vieja VERIFICADO)
  // ❌ Eliminados 103/109: son corredores Goes/Larrañaga
  { lineId: '330', destino: 'CIUDAD_VIEJA', variantCode: '330a', headingRange: [20, 160] as [number, number],
    rivals: ['147', '148', '185'], label: '330 → Ciudad Vieja (IDA)',
    terminalOrigen: 'Cerro (Villa del Cerro)', terminalDestino: 'Ciudad Vieja',
    corridorBbox: [-34.93, -56.30, -34.88, -56.20] as [number, number, number, number] },
  { lineId: '330', destino: 'CERRO', variantCode: '330b', headingRange: [200, 340] as [number, number],
    rivals: ['147', '148', '185'], label: '330 → Cerro (VTA)',
    terminalOrigen: 'Ciudad Vieja', terminalDestino: 'Cerro (Villa del Cerro)',
    corridorBbox: [-34.93, -56.30, -34.88, -56.20] as [number, number, number, number] },

  // LÍNEA 370 IDA — Rivales: Cutcsa 110/103/112 (Rambla/Italia/Carrasco CONFIRMADO)
  { lineId: '370', destino: 'PORTONES', variantCode: '370a', headingRange: [30, 150] as [number, number],
    rivals: ['110', '103', '112'], label: '370 → Portones (IDA)',
    terminalOrigen: 'Playa del Cerro', terminalDestino: 'Portones',
    corridorBbox: [-34.95, -56.30, -34.87, -56.00] as [number, number, number, number] },
  // LÍNEA 370 VTA — Rivales distintos en vuelta (128/137 Rambla vuelta)
  { lineId: '370', destino: 'CERRO', variantCode: '370b', headingRange: [210, 330] as [number, number],
    rivals: ['128', '137', '185'], label: '370 → Playa Cerro (VTA)',
    terminalOrigen: 'Portones', terminalDestino: 'Playa del Cerro',
    corridorBbox: [-34.95, -56.30, -34.87, -56.00] as [number, number, number, number] },

  // LÍNEA 396 — Rivales: Cutcsa 181/196/197 (Av. Italia/Schroeder/Instrucciones)
  // ❌ Eliminados 110/103: son corredores distintos
  { lineId: '396', destino: 'INSTRUCCIONES', variantCode: '396a', headingRange: [20, 110] as [number, number],
    rivals: ['181', '196', '197'], label: '396 → Instrucciones (IDA)',
    terminalOrigen: 'Punta Carretas', terminalDestino: 'Instrucciones',
    corridorBbox: [-34.92, -56.18, -34.83, -56.05] as [number, number, number, number] },
  { lineId: '396', destino: 'PUNTA_CARRETAS', variantCode: '396b', headingRange: [200, 290] as [number, number],
    rivals: ['181', '196', '197'], label: '396 → Punta Carretas (VTA)',
    terminalOrigen: 'Instrucciones', terminalDestino: 'Punta Carretas',
    corridorBbox: [-34.92, -56.18, -34.83, -56.05] as [number, number, number, number] },

  // LÍNEA 17 — Rivales: Cutcsa 148/117/185 (Cerro/Centro/Pocitos VERIFICADO)
  // ❌ Eliminado 103 puro (va por Goes, no Ramírez)
  { lineId: '17', destino: 'PUNTA_CARRETAS', variantCode: '17a', headingRange: [20, 160] as [number, number],
    rivals: ['148', '117', '185'], label: '17 → Punta Carretas (IDA)',
    terminalOrigen: 'Casabó (Bajo Valencia)', terminalDestino: 'Punta Carretas',
    corridorBbox: [-34.93, -56.30, -34.90, -56.14] as [number, number, number, number] },
  { lineId: '17', destino: 'CASABÓ', variantCode: '17b', headingRange: [200, 340] as [number, number],
    rivals: ['148', '117', '185'], label: '17 → Casabó (VTA)',
    terminalOrigen: 'Punta Carretas', terminalDestino: 'Casabó (Bajo Valencia)',
    corridorBbox: [-34.93, -56.30, -34.90, -56.14] as [number, number, number, number] },

  // LÍNEA 71 — Rivales: Cutcsa 121/122/124 (Bvar. Artigas/Av. Rivera VERIFICADO)
  { lineId: '71', destino: 'MENDOZA_INSTRUCCIONES', variantCode: '71a', headingRange: [20, 160] as [number, number],
    rivals: ['121', '122', '124'], label: '71 → Mendoza e Instrucciones (IDA)',
    terminalOrigen: 'Pocitos', terminalDestino: 'Mendoza e Instrucciones',
    corridorBbox: [-34.92, -56.17, -34.87, -56.10] as [number, number, number, number] },
  { lineId: '71', destino: 'POCITOS', variantCode: '71b', headingRange: [200, 340] as [number, number],
    rivals: ['121', '122', '124'], label: '71 → Pocitos (VTA)',
    terminalOrigen: 'Mendoza e Instrucciones', terminalDestino: 'Pocitos',
    corridorBbox: [-34.92, -56.17, -34.87, -56.10] as [number, number, number, number] },

  // LÍNEA 79 — Rivales: Cutcsa 103/155/180 (18 de Julio/Italia/Belloni VERIFICADO)
  // ✅ 103 CORRECTO en este eje (18 de Julio es compartido con la 79)
  // ❌ Eliminado 110: es corredor Rambla, no 18 de Julio
  { lineId: '79', destino: 'BELLONI', variantCode: '79a', headingRange: [20, 160] as [number, number],
    rivals: ['103', '155', '180'], label: '79 → Belloni (IDA)',
    terminalOrigen: 'Ciudad Vieja (Ciudadela)', terminalDestino: 'Intercambiador Belloni',
    corridorBbox: [-34.92, -56.20, -34.87, -56.09] as [number, number, number, number] },
  { lineId: '79', destino: 'CIUDAD_VIEJA', variantCode: '79b', headingRange: [200, 340] as [number, number],
    rivals: ['103', '155', '180'], label: '79 → Ciudad Vieja (VTA)',
    terminalOrigen: 'Intercambiador Belloni', terminalDestino: 'Ciudad Vieja (Ciudadela)',
    corridorBbox: [-34.92, -56.20, -34.87, -56.09] as [number, number, number, number] },

  // LÍNEA 11A — Rivales: Copsa C1 + Rubricay (Ruta 8/Sauce/San Ramón INTERDEPARTAMENTAL)
  // ❌ ELIMINADOS 102/106: son líneas urbanas Montevideo, NO van a Sauce/San Ramón
  { lineId: '11A', destino: 'SAUCE', variantCode: '11Aa', headingRange: [0, 180] as [number, number],
    rivals: ['C1', 'Rubricay'], label: '11A → Sauce / San Ramón (IDA)',
    terminalOrigen: 'Terminal Baltasar Brum', terminalDestino: 'Sauce / San Ramón',
    corridorBbox: [-34.70, -56.10, -34.40, -55.90] as [number, number, number, number] },
  { lineId: '11A', destino: 'BALTASAR_BRUM', variantCode: '11Ab', headingRange: [180, 360] as [number, number],
    rivals: ['C1', 'Rubricay'], label: '11A → Baltasar Brum (VTA)',
    terminalOrigen: 'Sauce / San Ramón', terminalDestino: 'Terminal Baltasar Brum',
    corridorBbox: [-34.70, -56.10, -34.40, -55.90] as [number, number, number, number] },

  // LÍNEA 221 — Rivales: Copsa 721/722/C6 (Ruta Interbalnearia/El Pinar INTERDEPARTAMENTAL)
  // ❌ ELIMINADOS 110/103: son líneas urbanas Rambla/18 de Jul, NO van a El Pinar
  { lineId: '221', destino: 'EL_PINAR', variantCode: '221a', headingRange: [0, 180] as [number, number],
    rivals: ['721', 'C6', '722'], label: '221 → El Pinar (IDA)',
    terminalOrigen: 'Terminal Baltasar Brum', terminalDestino: 'El Pinar',
    corridorBbox: [-34.90, -56.10, -34.75, -55.80] as [number, number, number, number] },
  { lineId: '221', destino: 'BALTASAR_BRUM', variantCode: '221b', headingRange: [180, 360] as [number, number],
    rivals: ['721', 'C6', '722'], label: '221 → Baltasar Brum (VTA)',
    terminalOrigen: 'El Pinar', terminalDestino: 'Terminal Baltasar Brum',
    corridorBbox: [-34.90, -56.10, -34.75, -55.80] as [number, number, number, number] },

  // LÍNEA 8SR — Rivales: Copsa C1 + Rubricay (Ruta 8/San Ramón INTERDEPARTAMENTAL)
  // ❌ ELIMINADO 103: línea urbana Montevideo, NO va a San Ramón
  { lineId: '8SR', destino: 'SAN_RAMON', variantCode: '8SRa', headingRange: [0, 180] as [number, number],
    rivals: ['C1', 'Rubricay'], label: '8SR → San Ramón (IDA)',
    terminalOrigen: 'Terminal Baltasar Brum', terminalDestino: 'San Ramón',
    corridorBbox: [-34.70, -56.10, -34.35, -55.85] as [number, number, number, number] },
  { lineId: '8SR', destino: 'BALTASAR_BRUM', variantCode: '8SRb', headingRange: [180, 360] as [number, number],
    rivals: ['C1', 'Rubricay'], label: '8SR → Baltasar Brum (VTA)',
    terminalOrigen: 'San Ramón', terminalDestino: 'Terminal Baltasar Brum',
    corridorBbox: [-34.70, -56.10, -34.35, -55.85] as [number, number, number, number] },
  // NOTA: XA1, XA2, L12, L13, CA1, CE1, LM-12, LM-13, DM1 ELIMINADOS
  // Motivo: Líneas fantasma con terminales genéricas "Terminal A/B" sin datos reales.
];,
];

// Legacy map para compatibilidad (se usa en imports existentes)
export const COMPETITOR_MAP: Record<string, string[]> = {};
CORRIDOR_MAP.forEach((c) => {
  if (!COMPETITOR_MAP[c.lineId]) {
    COMPETITOR_MAP[c.lineId] = [];
  }
  c.rivals.forEach((r) => {
    if (!COMPETITOR_MAP[c.lineId].includes(r)) {
      COMPETITOR_MAP[c.lineId].push(r);
    }
  });
});

/**
 * Determina si un heading cae dentro de un rango (maneja wrap-around 0/360).
 */
function isHeadingInRange(heading: number, range: [number, number]): boolean {
  const [min, max] = range;
  if (min <= max) {
    return heading >= min && heading <= max;
  }
  // Wrap-around (ej: 340 → 80: incluye 340-360 y 0-80)
  return heading >= min || heading <= max;
}

/**
 * Detecta automáticamente el corredor basado en el heading actual del bus UCOT.
 */
export function detectCorridor(lineId: string, heading: number): CorridorDefinition | null {
  const cleanLine = lineId.replace(/[ab]$/i, '');
  const corridors = CORRIDOR_MAP.filter((c) => c.lineId === cleanLine);

  if (corridors.length === 0) return null;
  if (corridors.length === 1) return corridors[0];

  // Buscar el corredor cuyo headingRange coincide
  for (const corridor of corridors) {
    if (isHeadingInRange(heading, corridor.headingRange)) {
      return corridor;
    }
  }

  // Fallback: retornar el primer corredor
  return corridors[0];
}

/**
 * Obtiene todos los corredores para una línea dada.
 */
export function getCorridorsForLine(lineId: string): CorridorDefinition[] {
  const cleanLine = lineId.replace(/[ab]$/i, '');
  return CORRIDOR_MAP.filter((c) => c.lineId === cleanLine);
}

/**
 * Obtiene el código de variante para cargar la ruta REAL de un corredor.
 * Ej: corridor "370 → Portones (IDA)" → '370a'
 */
export function getVariantCodeForCorridor(corridor: CorridorDefinition): string {
  return corridor.variantCode;
}

/**
 * Determina si un rival está DELANTE o DETRÁS del bus UCOT.
 */
function getRivalDirection(
  ucotLat: number,
  ucotLng: number,
  ucotHeading: number,
  rivalLat: number,
  rivalLng: number,
): 'AHEAD' | 'BEHIND' | 'OPPOSITE' | 'UNKNOWN' {
  if (ucotHeading === 0 && ucotLat === 0) return 'UNKNOWN';

  const bearingToRival = calculateBearing(ucotLat, ucotLng, rivalLat, rivalLng);
  const diff = Math.abs(ucotHeading - bearingToRival) % 360;
  const shortDiff = diff > 180 ? 360 - diff : diff;

  if (shortDiff < 60) return 'AHEAD';
  if (shortDiff > 120) return 'BEHIND';
  return 'OPPOSITE';
}

/**
 * ANÁLISIS TÁCTICO POR CORREDOR v5.0 (Variant-Aware + Schedule-Aware).
 * Incluye inteligencia de horarios para determinar ventaja temporal.
 */
export const checkCorridorThreat = async (
  lineId: string,
  lat: number,
  lng: number,
  currentHeading: number,
  externalPositions?: Array<Record<string, unknown>>,
  corridorOverride?: CorridorDefinition,
): Promise<CompetitorThreat> => {
  // 1. Detectar corredor activo
  const corridor = corridorOverride || detectCorridor(lineId, currentHeading);

  if (!corridor) {
    return {
      detected: false,
      threatLevel: 'SAFE',
      message: '✅ Sin corredor definido para esta línea.',
    };
  }

  // 2. Obtener inteligencia de horarios
  let scheduleIntel: CompetitorThreat['scheduleIntel'] | undefined;
  const primaryRival = corridor.rivals[0];
  if (primaryRival && corridor.variantCode) {
    const adv = ScheduleService.getScheduleAdvantage(corridor.variantCode, primaryRival);
    scheduleIntel = {
      ucotNextDep: adv.ucotNext,
      rivalNextDep: adv.rivalNext,
      ventajaMin: adv.ventajaMin,
      descripcion: adv.descripcion,
    };
  }

  // 3. Solo buscar RIVALES ESPECÍFICOS de este corredor
  const corridorRivals = corridor.rivals;
  if (corridorRivals.length === 0) {
    return {
      detected: false,
      threatLevel: 'SAFE',
      message: `✅ [${corridor.label}] Sin rivales definidos.`,
      scheduleIntel,
    };
  }

  try {
    const positions =
      externalPositions || (await TrafficService.fetchCompetitorPositions(corridorRivals));

    let nearestBus: Record<string, unknown> | null = null;
    let minDistance = Infinity;

    // 4. Filtrar: solo rivales CO-DIRECCIONALES (mismo sentido)
    for (const bus of positions) {
      const busLat = Number(bus.latitud ?? bus.lat ?? 0);
      const busLng = Number(bus.longitud ?? bus.lng ?? 0);
      const busHeading = Number(bus.heading ?? 0);
      const busLine = String(bus.linea ?? bus.codigoLinea ?? '');

      // Verificar que es un rival de este corredor
      if (!corridorRivals.includes(busLine.replace(/[ab]$/i, ''))) continue;


      // Filtro de BOUNDING BOX del corredor (descarta rivales geográficamente lejanos)
      if (corridor.corridorBbox) {
        const [latMin, lngMin, latMax, lngMax] = corridor.corridorBbox;
        if (busLat < latMin || busLat > latMax || busLng < lngMin || busLng > lngMax) continue;
      }

      // Filtro de CO-DIRECCIONALIDAD
      const hDiff = Math.abs(currentHeading - busHeading) % 360;
      const shortestDiff = hDiff > 180 ? 360 - hDiff : hDiff;
      const isSameDirection = shortestDiff < 60;

      if (!isSameDirection) continue;

      const dist = calculateDistance(lat, lng, busLat, busLng);
      if (dist < 1500 && dist < minDistance) {
        minDistance = dist;
        nearestBus = bus as Record<string, unknown>;
      }
    }

    if (nearestBus) {
      const distM = Math.round(minDistance);
      const gapMins = +(distM / 333).toFixed(1);
      const rivalLat = Number(nearestBus.latitud ?? nearestBus.lat ?? 0);
      const rivalLng = Number(nearestBus.longitud ?? nearestBus.lng ?? 0);

      let threatLevel: 'CRITICAL' | 'WARN' | 'SAFE' = 'SAFE';
      let rec: 'DELAY' | 'SPEED_UP' | 'ON_TIME' = 'ON_TIME';

      const rivalDir = getRivalDirection(lat, lng, currentHeading, rivalLat, rivalLng);

      if (distM < 350) {
        threatLevel = 'CRITICAL';
        rec = rivalDir === 'AHEAD' ? 'DELAY' : 'SPEED_UP';
      } else if (distM < 850) {
        threatLevel = 'WARN';
        rec = rivalDir === 'AHEAD' ? 'DELAY' : 'ON_TIME';
      }

      const rivalLine = String(nearestBus.linea ?? nearestBus.codigoLinea ?? 'DESCONOCIDO');
      const dirLabel =
        rivalDir === 'AHEAD' ? 'DELANTE' : rivalDir === 'BEHIND' ? 'DETRÁS' : 'LATERAL';

      // Enriquecer mensaje con datos de horario
      let scheduleMsg = '';
      if (scheduleIntel && scheduleIntel.ventajaMin !== 0) {
        scheduleMsg =
          scheduleIntel.ventajaMin > 0
            ? ` | 📅 Saliste ${scheduleIntel.ventajaMin}min ANTES`
            : ` | ⚠ Rival salió ${Math.abs(scheduleIntel.ventajaMin)}min ANTES`;
      }

      return {
        detected: true,
        competitorLine: rivalLine,
        distance: distM,
        gapMinutes: gapMins,
        recommendation: rec,
        threatLevel,
        rivalDirection: rivalDir,
        scheduleIntel,
        message:
          threatLevel === 'CRITICAL'
            ? `🚨 [${corridor.label}]: ${rivalLine} a ${distM}m ${dirLabel}${scheduleMsg}`
            : `⚠️ [${corridor.label}]: RIVAL ${rivalLine} a ${distM}m ${dirLabel}${scheduleMsg}`,
      };
    }

    return {
      detected: false,
      threatLevel: 'SAFE',
      scheduleIntel,
      message: `✅ [${corridor.label}] Corredor despejado. ${scheduleIntel?.descripcion || 'Vía libre.'}`,
    };
  } catch (e) {
    console.error('Corridor Intel Error:', e);
    return {
      detected: false,
      threatLevel: 'SAFE',
      message: '⚠️ Error de comunicación con STM.',
    };
  }
};

// Legacy wrapper para compatibilidad
export const checkCompetitorProximity = async (
  lineId: string,
  lat: number,
  lng: number,
  currentHeading?: number,
  externalPositions?: Array<Record<string, unknown>>,
): Promise<CompetitorThreat> => {
  return checkCorridorThreat(lineId, lat, lng, currentHeading || 0, externalPositions);
};
