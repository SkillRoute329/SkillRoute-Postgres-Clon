import axios from 'axios';
import { auth } from '../config/firebase';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3002/api';

async function authHeaders() {
  const token = await auth.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface AgencyInfo { id: string; name: string; routes: string[] }
export interface RouteMetaInfo {
  route: string; longName: string;
  totalHabiles: number; totalSabados: number; totalDomingos: number;
}
export interface BusComplianceResult {
  idBus: string; linea: string; empresa: string; agencyId: string;
  lat: number; lon: number; velocidad: number; timestampGPS: string;
  estadoCumplimiento: 'EN_TIEMPO' | 'ADELANTADO' | 'ATRASADO' | 'SIN_HORARIO' | 'FUERA_DE_SERVICIO';
  desviacionMin: number | null;
  proximaParadaControl: { name: string; desc: string; lat: number; lon: number; arrival: string } | null;
  distanciaParadaKm: number | null;
}
export interface RouteSummary {
  linea: string; busesActivos: number;
  enTiempo: number; atrasados: number; adelantados: number; sinHorario: number;
  pctCumplimiento: number;
}
export interface ComplianceResponse {
  ok: boolean; agencyId: string; timestamp: string;
  totalBuses: number;
  summary: Record<string, RouteSummary>;
  buses: BusComplianceResult[];
  gpsSource?: 'live' | 'historical';
  dataTimestamp?: string | null;
  hoursBack?: number;
  gpsError?: string;
}

export interface LineSummary {
  linea: string;
  totalEventos: number;
  busesUnicos: number;
  pctEnTiempo: number;
  pctAtrasado: number;
  pctAdelantado: number;
  pctSinHorario: number;
  desviacionMediaMin: number | null;
  velocidadMedia: number;
  ultimaActividad: string | null;
}
export interface HistorySummaryResponse {
  ok: boolean; agencyId: string; days: number; lines: LineSummary[];
}

export interface EndpointHealth {
  status: 'UP' | 'DOWN' | 'UNKNOWN';
  lastCheck: string | null;
  downSince: string | null;
  upSince: string | null;
  consecutiveFailures: number;
  lastSuccessfulCollection: string | null;
}
export interface VehicleSummary {
  idBus: string; empresa: string; lineasOperadas: string[];
  totalEventos: number; velocidadMedia: number;
  pctEnTiempo: number; pctAtrasado: number; pctAdelantado: number; pctSinHorario: number;
  ultimaActividad: string | null; primeraActividad: string | null;
  desviacionMediaMin: number | null;
}
export interface VehicleHistoryResponse {
  ok: boolean; idBus: string; days: number;
  summary: VehicleSummary | null;
  history: Array<{
    idBus: string; linea: string; empresa: string; velocidad: number;
    estadoCumplimiento: string; desviacionMin: number | null;
    proximaParada: string | null; timestampGPS: string;
  }>;
}

export async function fetchAgencies(): Promise<AgencyInfo[]> {
  const h = await authHeaders();
  const { data } = await axios.get(`${BASE}/autostats/agencies`, { headers: h });
  return data.agencies ?? [];
}

export async function fetchComplianceRealtime(agencyId: string): Promise<ComplianceResponse> {
  const h = await authHeaders();
  const { data } = await axios.get(`${BASE}/autostats/compliance/${agencyId}`, { headers: h });
  return data;
}

export async function fetchAgencyRoutes(agencyId: string): Promise<RouteMetaInfo[]> {
  const h = await authHeaders();
  const { data } = await axios.get(`${BASE}/autostats/routes/${agencyId}`, { headers: h });
  return data.routes ?? [];
}

export async function fetchVehicleHistory(idBus: string, days = 7): Promise<VehicleHistoryResponse> {
  const h = await authHeaders();
  const { data } = await axios.get(`${BASE}/autostats/vehicle/${idBus}?days=${days}`, { headers: h });
  return data;
}

export async function fetchHistorySummary(agencyId: string, days = 7): Promise<HistorySummaryResponse> {
  const h = await authHeaders();
  const { data } = await axios.get(`${BASE}/autostats/history/${agencyId}?days=${days}`, { headers: h });
  return data;
}

export async function fetchEndpointHealth(): Promise<EndpointHealth> {
  const h = await authHeaders();
  const { data } = await axios.get(`${BASE}/autostats/health`, { headers: h });
  return data.health ?? { status: 'UNKNOWN', lastCheck: null, downSince: null, upSince: null, consecutiveFailures: 0, lastSuccessfulCollection: null };
}

export interface UcotGpsBus {
  idBus: string; lat: number; lon: number; velocidad: number;
  servicio: string | null; cartel: string; parado: boolean; rumbo: number;
}
export interface UcotGpsResponse {
  ok: boolean; buses: UcotGpsBus[]; total: number; timestamp: string;
}
export interface UcotServicioAsignado { fecha: string; servicio: string; }
export interface UcotRotacionResponse {
  ok: boolean; coche: string; servicios: UcotServicioAsignado[];
}

export async function fetchUcotGps(coche = '0'): Promise<UcotGpsResponse> {
  const h = await authHeaders();
  const { data } = await axios.get(`${BASE}/ucot/gps?coche=${coche}`, { headers: h });
  return data;
}

export async function fetchUcotRotacion(coche: string): Promise<UcotRotacionResponse> {
  const h = await authHeaders();
  const { data } = await axios.get(`${BASE}/ucot/rotacion/${coche}`, { headers: h });
  return data;
}

export function getUcotCartonUrl(servicio: string, minuta = 'HABILES'): string {
  return `${BASE}/ucot/carton/${servicio}?minuta=${minuta}`;
}

export interface ConductorDiaStats {
  fecha: string;
  coche: string;
  turno: string | null;
  servicio: number | null;
  totalEventos: number;
  pctEnTiempo: number;
  pctAtrasado: number;
  pctAdelantado: number;
  velocidadMedia: number;
  desviacionMediaMin: number | null;
  lineas: string[];
}
export interface ConductorSummary {
  interno: number;
  nombre: string;
  diasActivos: number;
  totalEventos: number;
  pctEnTiempo: number;
  pctAtrasado: number;
  pctAdelantado: number;
  pctSinHorario: number;
  velocidadMedia: number;
  desviacionMediaMin: number | null;
  cochesOperados: string[];
  lineasOperadas: string[];
  ultimaActividad: string | null;
  historial: ConductorDiaStats[];
}
export interface ConductorRankingResponse {
  ok: boolean;
  agencyId: string;
  totalConductores: number;
  conductores: ConductorSummary[];
}

export async function fetchConductorRanking(agencyId: string): Promise<ConductorRankingResponse> {
  const h = await authHeaders();
  const { data } = await axios.get(`${BASE}/autostats/conductor-ranking/${agencyId}`, { headers: h });
  return data;
}

// ── vehicle_stats — perfil de coches para las 4 empresas (con conductor opcional) ──

export interface VehicleDiaStats {
  fecha: string;
  totalEventos: number;
  pctEnTiempo: number;
  pctAtrasado: number;
  pctAdelantado: number;
  velocidadMedia: number;
  desviacionMediaMin: number | null;
  lineas: string[];
  // Conductor (solo UCOT cuando hay distribuciones)
  interno: number | null;
  nombre: string | null;
  turno: string | null;
  servicio: number | null;
}
export interface VehicleStats {
  idBus: string;
  empresa: string;
  diasActivos: number;
  totalEventos: number;
  pctEnTiempo: number;
  pctAtrasado: number;
  pctAdelantado: number;
  pctSinHorario: number;
  velocidadMedia: number;
  desviacionMediaMin: number | null;
  lineasOperadas: string[];
  ultimaActividad: string | null;
  // Conductor (null para empresas sin distribuciones)
  ultimoInterno: number | null;
  ultimoNombre: string | null;
  conductoresConocidos: number[];
  historial: VehicleDiaStats[];
}
export interface VehicleStatsResponse {
  ok: boolean;
  agencyId: string;
  totalBuses: number;
  buses: VehicleStats[];
}

export async function fetchVehicleStats(
  agencyId: string,
  sortBy: 'otp' | 'actividad' = 'otp',
): Promise<VehicleStatsResponse> {
  const h = await authHeaders();
  const { data } = await axios.get(
    `${BASE}/autostats/vehicle-stats/${agencyId}?sortBy=${sortBy}`,
    { headers: h },
  );
  return data;
}

export const AGENCY_LABELS: Record<string, string> = {
  '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT',
};
export const AGENCY_COLORS: Record<string, string> = {
  '10': 'indigo', '20': 'sky', '50': 'amber', '70': 'emerald',
};

export interface ArchiveFileInfo {
  file: string;
  week: string;
  sizeKb: number;
}

export interface ArchiveWeekData {
  ok: boolean;
  week: string;
  agencyId: string;
  totalRecords: number;
  lines: LineSummary[];
}

export interface FleetRankingResponse {
  ok: boolean;
  agencyId: string;
  days: number;
  totalVehiculos: number;
  vehicles: VehicleSummary[];
}

export async function fetchFleetRanking(agencyId: string, days = 7, offset = 0): Promise<FleetRankingResponse> {
  const h = await authHeaders();
  const qs = offset > 0 ? `?days=${days}&offset=${offset}` : `?days=${days}`;
  const { data } = await axios.get(`${BASE}/autostats/fleet-ranking/${agencyId}${qs}`, { headers: h });
  return data;
}

export async function fetchArchiveList(): Promise<ArchiveFileInfo[]> {
  const h = await authHeaders();
  const { data } = await axios.get(`${BASE}/autostats/archives`, { headers: h });
  return data.archives ?? [];
}

export async function fetchArchiveData(week: string, agencyId?: string): Promise<ArchiveWeekData | null> {
  const h = await authHeaders();
  const qs = agencyId ? `?agencyId=${agencyId}` : '';
  const { data } = await axios.get(`${BASE}/autostats/archive/${week}${qs}`, { headers: h });
  return data.ok ? data : null;
}
