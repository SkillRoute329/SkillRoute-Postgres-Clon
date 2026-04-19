/**
 * operationsIntelligenceService.ts
 * ─────────────────────────────────
 * Datos para el hub de inteligencia de operaciones.
 *
 * Fuente ÚNICA de verdad: `/api/ucot/fleet-intel` (cloud function intelligenceApi)
 * que consulta STM en tiempo real y calcula buses activos, frecuencia,
 * bunching y competencia directa para las 29 líneas UCOT autoritativas.
 *
 * Master JSON solo se usa como último recurso OFFLINE (sin conectividad).
 */

import { getMasterLineas, getMasterServicios, type MasterLinea, type MasterServicio } from '../data/ucotMaster';
import { LINE_INSPECTOR_CONFIGS, type LineInspectorConfig } from './LineInspectorAgent';

// ─── Tipos públicos ──────────────────────────────────────────────────────────

export type DataSource = 'LIVE' | 'OFFLINE';

export interface LineFleetStatus {
  lineId: string;
  nombreComercial: string;
  categoria: 'urbana' | 'local' | 'diferencial' | 'metropolitana';
  busesActivos: number;
  pctFlotaEnDisputa: number;
  nivelAlerta: 'ALTA' | 'MEDIA' | 'BAJA' | 'SIN_SERVICIO';
  rivalCount: number;
  topRival?: string;
  empresasDetectadas: string[];
  source: DataSource;
}

export interface GlobalFleetSummary {
  totalLineas: number;
  totalBusesActivos: number;
  lineasEnServicio: number;
  lineasSinServicio: number;
  lineasConAlertaAlta: number;
  lineasConAlertaMedia: number;
  lineasOk: number;
  source: DataSource;
  timestamp: Date;
}

export interface AgentStatus {
  lineId: string;
  nombreComercial: string;
  categoria: 'urbana' | 'local' | 'diferencial' | 'metropolitana';
  status: 'OPERATIVO' | 'ALERTA' | 'SIN_SERVICIO';
  posicionCompetitiva:
    | 'SIN_RIVALES_VISIBLES'
    | 'CON_RIVALES'
    | 'DISPUTADA'
    | 'CRITICA'
    | 'SIN_SERVICIO';
  busesActivos: number;
  frecuenciaActual?: number | null;
  frecuenciaProgramadaMin?: number | null;
  brechaPct?: number | null;
  horaInicioProgramada?: string | null;
  horaFinProgramada?: string | null;
  totalSalidasProgramadas?: number;
  tieneHorariosOficiales?: boolean;
  cicloMin: number;
  bunchingPares: number;
  rivalesDetectados: number;
  empresasDetectadas: string[];
  lastUpdate: Date;
  source: DataSource;
}

// ─── URL base ────────────────────────────────────────────────────────────────

const BRIDGE_BASE = (() => {
  const env = (typeof import.meta !== 'undefined' ? (import.meta as { env?: { PROD?: boolean; VITE_BRIDGE_URL?: string } }).env : undefined) || {};
  if (env.VITE_BRIDGE_URL) return env.VITE_BRIDGE_URL;
  if (env.PROD) return '';
  return 'http://localhost:3099';
})();

// ─── Shape del endpoint consolidado ──────────────────────────────────────────

interface FleetIntelLinea {
  lineId: string;
  nombreComercial: string;
  categoria: 'urbana' | 'local' | 'diferencial' | 'metropolitana';
  busesActivos: number;
  frecuenciaRealMin: number | null;
  frecuenciaProgramadaMin: number | null;
  brechaPct: number | null;
  horaInicioProgramada: string | null;
  horaFinProgramada: string | null;
  totalSalidasProgramadas: number;
  tieneHorariosOficiales: boolean;
  cicloMin: number;
  bunchingPares: number;
  pctFlotaEnDisputa: number;
  busesConCompetenciaDirecta: number;
  empresasDetectadas: string[];
  rivalCount: number;
  nivelAlerta: 'ALTA' | 'MEDIA' | 'BAJA' | 'SIN_SERVICIO';
  estadoOperativo: 'OPERATIVO' | 'SIN_SERVICIO' | 'ALERTA';
  posicionCompetitiva:
    | 'SIN_RIVALES_VISIBLES'
    | 'CON_RIVALES'
    | 'DISPUTADA'
    | 'CRITICA'
    | 'SIN_SERVICIO';
}

interface FleetIntelResponse {
  ok: boolean;
  timestamp: string;
  tipoDia?: string;
  horaMontevideo?: string;
  totalLineas: number;
  lineasEnServicio: number;
  lineasSinServicio: number;
  lineasConHorariosOficiales?: number;
  totalBusesUcot: number;
  lineas: FleetIntelLinea[];
}

// ─── Cache local (evita 3 fetches simultáneos en el mismo render) ────────────

let _cache: FleetIntelResponse | null = null;
let _cacheTs = 0;
const CACHE_MS = 12_000;

async function fetchFleetIntel(): Promise<FleetIntelResponse | null> {
  const now = Date.now();
  if (_cache && now - _cacheTs < CACHE_MS) return _cache;
  try {
    const res = await fetch(`${BRIDGE_BASE}/api/ucot/fleet-intel`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as FleetIntelResponse;
    if (!data.ok) return null;
    _cache = data;
    _cacheTs = now;
    return data;
  } catch {
    return null;
  }
}

// ─── Lista autoritativa de líneas UCOT (espejo del backend) ──────────────────

export const UCOT_LINEAS_REALES: string[] = [
  '17', '71', '79', '300', '306', '316', '328', '329', '330', '370', '396',
  'L12', 'L13', 'L31', 'L32', 'L33',
  'CE1', 'PB',
  '11A', '221', '8SR', 'DM1', 'LM12', 'LM13',
  'U11C', 'U11S', 'U11T', 'XA1', 'XA2',
];

// ─── Builders ────────────────────────────────────────────────────────────────

function lineToStatus(l: FleetIntelLinea, source: DataSource): LineFleetStatus {
  return {
    lineId: l.lineId,
    nombreComercial: l.nombreComercial,
    categoria: l.categoria,
    busesActivos: l.busesActivos,
    pctFlotaEnDisputa: l.pctFlotaEnDisputa,
    nivelAlerta: l.nivelAlerta,
    rivalCount: l.rivalCount,
    topRival: l.empresasDetectadas[0],
    empresasDetectadas: l.empresasDetectadas,
    source,
  };
}

function lineToAgent(l: FleetIntelLinea, source: DataSource): AgentStatus {
  let status: AgentStatus['status'] = 'OPERATIVO';
  if (l.busesActivos === 0) status = 'SIN_SERVICIO';
  else if (l.nivelAlerta === 'ALTA') status = 'ALERTA';

  return {
    lineId: l.lineId,
    nombreComercial: l.nombreComercial,
    categoria: l.categoria,
    status,
    posicionCompetitiva: l.posicionCompetitiva,
    busesActivos: l.busesActivos,
    frecuenciaActual: l.frecuenciaRealMin,
    frecuenciaProgramadaMin: l.frecuenciaProgramadaMin,
    brechaPct: l.brechaPct,
    horaInicioProgramada: l.horaInicioProgramada,
    horaFinProgramada: l.horaFinProgramada,
    totalSalidasProgramadas: l.totalSalidasProgramadas,
    tieneHorariosOficiales: l.tieneHorariosOficiales,
    cicloMin: l.cicloMin,
    bunchingPares: l.bunchingPares,
    rivalesDetectados: l.rivalCount,
    empresasDetectadas: l.empresasDetectadas,
    lastUpdate: new Date(),
    source,
  };
}

// ─── Fallback OFFLINE (último recurso, no debería activarse en producción) ────

function offlineLine(lineId: string): LineFleetStatus {
  const master = getMasterLineas().find((l) => l.id === lineId);
  const cfg = LINE_INSPECTOR_CONFIGS[lineId] ?? null;
  return {
    lineId,
    nombreComercial: cfg?.nombreComercial ?? master?.nombre ?? `Línea ${lineId}`,
    categoria: 'urbana',
    busesActivos: 0,
    pctFlotaEnDisputa: 0,
    nivelAlerta: 'SIN_SERVICIO',
    rivalCount: 0,
    empresasDetectadas: [],
    source: 'OFFLINE',
  };
}

function offlineAgent(lineId: string): AgentStatus {
  const master = getMasterLineas().find((l) => l.id === lineId);
  const cfg = LINE_INSPECTOR_CONFIGS[lineId] ?? null;
  return {
    lineId,
    nombreComercial: cfg?.nombreComercial ?? master?.nombre ?? `Línea ${lineId}`,
    categoria: 'urbana',
    status: 'SIN_SERVICIO',
    posicionCompetitiva: 'SIN_SERVICIO',
    busesActivos: 0,
    frecuenciaActual: null,
    cicloMin: 0,
    bunchingPares: 0,
    rivalesDetectados: 0,
    empresasDetectadas: [],
    lastUpdate: new Date(),
    source: 'OFFLINE',
  };
}

// ─── API Pública ──────────────────────────────────────────────────────────────

export async function fetchAllLineStatuses(): Promise<{
  lines: LineFleetStatus[];
  source: DataSource;
}> {
  const data = await fetchFleetIntel();
  if (!data) {
    const lines = UCOT_LINEAS_REALES.map(offlineLine);
    return { lines, source: 'OFFLINE' };
  }
  const lines = data.lineas.map((l) => lineToStatus(l, 'LIVE'));
  return { lines, source: 'LIVE' };
}

export async function fetchAllAgentStatuses(): Promise<{
  agents: AgentStatus[];
  source: DataSource;
}> {
  const data = await fetchFleetIntel();
  if (!data) {
    const agents = UCOT_LINEAS_REALES.map(offlineAgent);
    return { agents, source: 'OFFLINE' };
  }
  const agents = data.lineas.map((l) => lineToAgent(l, 'LIVE'));
  return { agents, source: 'LIVE' };
}

export async function fetchGlobalSummary(): Promise<GlobalFleetSummary> {
  const data = await fetchFleetIntel();
  if (!data) {
    return {
      totalLineas: UCOT_LINEAS_REALES.length,
      totalBusesActivos: 0,
      lineasEnServicio: 0,
      lineasSinServicio: UCOT_LINEAS_REALES.length,
      lineasConAlertaAlta: 0,
      lineasConAlertaMedia: 0,
      lineasOk: 0,
      source: 'OFFLINE',
      timestamp: new Date(),
    };
  }
  return {
    totalLineas: data.totalLineas,
    totalBusesActivos: data.totalBusesUcot,
    lineasEnServicio: data.lineasEnServicio,
    lineasSinServicio: data.lineasSinServicio,
    lineasConAlertaAlta: data.lineas.filter((l) => l.nivelAlerta === 'ALTA').length,
    lineasConAlertaMedia: data.lineas.filter((l) => l.nivelAlerta === 'MEDIA').length,
    lineasOk: data.lineas.filter((l) => l.nivelAlerta === 'BAJA').length,
    source: 'LIVE',
    timestamp: new Date(data.timestamp),
  };
}

// ─── Detalle de horarios oficiales por línea ─────────────────────────────────

export interface VarianteHorario {
  origen: string;
  destino: string;
  frecuenciaMin: number | null;
  horaInicio: string | null;
  horaFin: string | null;
  totalSalidas: number;
}

export interface SalidaDominante {
  desde: string;
  hacia: string;
}

export interface DiaHorario {
  variantes: VarianteHorario[];
  salidasDominante?: SalidaDominante[];
  totalSalidas: number;
  frecuenciaDominanteMin: number | null;
  scrapedAt?: string;
}

export interface LineScheduleResponse {
  ok: boolean;
  linea: string;
  nombreComercial: string;
  categoria: 'urbana' | 'local' | 'diferencial' | 'metropolitana';
  cicloMin?: number;
  tieneHorariosOficiales: boolean;
  dias: Record<string, DiaHorario> | null;
  ultimaActualizacion?: { _seconds: number; _nanoseconds: number } | null;
  fuente?: string;
  tipoDiaHoy?: 'Hábiles' | 'Sábados' | 'Domingos';
  horaMontevideo?: string;
}

export async function fetchLineSchedule(lineaId: string): Promise<LineScheduleResponse | null> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/api/ucot/schedule/${encodeURIComponent(lineaId)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as LineScheduleResponse;
    if (!data.ok) return null;
    return data;
  } catch {
    return null;
  }
}

export function getMasterDataForLine(lineId: string): {
  linea: MasterLinea | undefined;
  servicios: MasterServicio[];
  config: LineInspectorConfig | null;
} {
  return {
    linea: getMasterLineas().find((l) => l.id === lineId),
    servicios: getMasterServicios(lineId),
    config: LINE_INSPECTOR_CONFIGS[lineId] ?? null,
  };
}
