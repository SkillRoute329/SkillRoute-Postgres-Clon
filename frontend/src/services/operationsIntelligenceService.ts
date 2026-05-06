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
import { fetchSTMPosiciones } from './stmLiveService';

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
  saludServicio?: number;
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
  saludServicio?: number;
  lastUpdate: Date;
  source: DataSource;
}

// ─── URL base ────────────────────────────────────────────────────────────────

const BRIDGE_BASE = import.meta.env?.PROD ? '' : 'http://localhost:3099';

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
  saludServicio: number; // 0-100 score ejecutivo
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

// ─── Tipos para selección multi-empresa ──────────────────────────────────────

export interface AgencyLine {
  lineId: string;
  nombre: string;
  categoria: string;
  busesActivos?: number;
}

export const AGENCY_OPTIONS = [
  { id: '70', label: 'UCOT',   color: 'emerald' },
  { id: '50', label: 'CUTCSA', color: 'blue' },
  { id: '20', label: 'COME',   color: 'sky' },
  { id: '10', label: 'COETC',  color: 'indigo' },
] as const;

export async function fetchAgencyLines(agencyId: string): Promise<AgencyLine[]> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/api/agency-lines/${agencyId}`, {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.lines ?? [];
  } catch {
    return agencyId === '70' ? UCOT_LINEAS_REALES.map((id) => ({ lineId: id, nombre: `Línea ${id}`, categoria: 'urbana' })) : [];
  }
}

// ─── Cache local — clave incluye agencyId + lineIds ───────────────────────────

let _cacheKey = '';
let _cache: FleetIntelResponse | null = null;
let _cacheTs = 0;
const CACHE_MS = 12_000;

async function fetchFleetIntel(agencyId = '70', lineIds?: string[]): Promise<FleetIntelResponse | null> {
  const key = `${agencyId}:${(lineIds ?? []).join(',')}`;
  const now = Date.now();
  if (_cache && _cacheKey === key && now - _cacheTs < CACHE_MS) return _cache;
  try {
    const qs = new URLSearchParams({ agencyId });
    if (lineIds && lineIds.length > 0) qs.set('lineIds', lineIds.join(','));
    const res = await fetch(`${BRIDGE_BASE}/api/ucot/fleet-intel?${qs}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as FleetIntelResponse;
    if (!data.ok) return null;
    _cache = data;
    _cacheTs = now;
    _cacheKey = key;
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
    saludServicio: l.saludServicio,
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
    saludServicio: l.saludServicio,
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

// ─── Fallback GPS directo (cuando fleet-intel no está disponible en prod) ──────

function gpsLine(lineId: string, busesActivos: number): LineFleetStatus {
  const master = getMasterLineas().find((l) => l.id === lineId);
  const cfg = LINE_INSPECTOR_CONFIGS[lineId] ?? null;
  return {
    lineId,
    nombreComercial: cfg?.nombreComercial ?? master?.nombre ?? `Línea ${lineId}`,
    categoria: 'urbana',
    busesActivos,
    pctFlotaEnDisputa: 0,
    nivelAlerta: busesActivos === 0 ? 'SIN_SERVICIO' : 'BAJA',
    rivalCount: 0,
    empresasDetectadas: [],
    source: 'LIVE',
  };
}

function gpsAgent(lineId: string, busesActivos: number): AgentStatus {
  const master = getMasterLineas().find((l) => l.id === lineId);
  const cfg = LINE_INSPECTOR_CONFIGS[lineId] ?? null;
  return {
    lineId,
    nombreComercial: cfg?.nombreComercial ?? master?.nombre ?? `Línea ${lineId}`,
    categoria: 'urbana',
    status: busesActivos === 0 ? 'SIN_SERVICIO' : 'OPERATIVO',
    posicionCompetitiva: busesActivos === 0 ? 'SIN_SERVICIO' : 'SIN_RIVALES_VISIBLES',
    busesActivos,
    frecuenciaActual: null,
    cicloMin: 0,
    bunchingPares: 0,
    rivalesDetectados: 0,
    empresasDetectadas: [],
    lastUpdate: new Date(),
    source: 'LIVE',
  };
}

async function fetchFromGPS(empresa: number = 70): Promise<{ byLine: Map<string, number> } | null> {
  try {
    const buses = await fetchSTMPosiciones({ empresa });
    if (buses.length === 0) return null;
    const byLine = new Map<string, number>();
    buses.forEach((b) => byLine.set(b.linea, (byLine.get(b.linea) ?? 0) + 1));
    return { byLine };
  } catch {
    return null;
  }
}

// ─── API Pública ──────────────────────────────────────────────────────────────

export async function fetchAllLineStatuses(agencyId = '70', lineIds?: string[]): Promise<{
  lines: LineFleetStatus[];
  source: DataSource;
}> {
  const data = await fetchFleetIntel(agencyId, lineIds);
  if (data) {
    const lines = data.lineas.map((l) => lineToStatus(l, 'LIVE'));
    return { lines, source: 'LIVE' };
  }
  const fallbackIds = lineIds ?? UCOT_LINEAS_REALES;
  const gps = await fetchFromGPS(Number(agencyId));
  if (gps) {
    const lines = fallbackIds.map((id) => gpsLine(id, gps.byLine.get(id) ?? 0));
    return { lines, source: 'LIVE' };
  }
  const lines = fallbackIds.map(offlineLine);
  return { lines, source: 'OFFLINE' };
}

export async function fetchAllAgentStatuses(agencyId = '70', lineIds?: string[]): Promise<{
  agents: AgentStatus[];
  source: DataSource;
}> {
  const data = await fetchFleetIntel(agencyId, lineIds);
  if (data) {
    const agents = data.lineas.map((l) => lineToAgent(l, 'LIVE'));
    return { agents, source: 'LIVE' };
  }
  const fallbackIds = lineIds ?? UCOT_LINEAS_REALES;
  const gps = await fetchFromGPS(Number(agencyId));
  if (gps) {
    const agents = fallbackIds.map((id) => gpsAgent(id, gps.byLine.get(id) ?? 0));
    return { agents, source: 'LIVE' };
  }
  const agents = fallbackIds.map(offlineAgent);
  return { agents, source: 'OFFLINE' };
}

export async function fetchGlobalSummary(agencyId = '70', lineIds?: string[]): Promise<GlobalFleetSummary> {
  const data = await fetchFleetIntel(agencyId, lineIds);
  const fallbackLen = lineIds?.length ?? UCOT_LINEAS_REALES.length;
  if (!data) {
    return {
      totalLineas: fallbackLen,
      totalBusesActivos: 0,
      lineasEnServicio: 0,
      lineasSinServicio: fallbackLen,
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
  origen?: string;
  destino?: string;
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
