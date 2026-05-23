import axios from 'axios';
import { auth } from '../config/firebase';
import { authHeader } from '../utils/tokenStore';

// FASE 5.13 (2026-05-13): VITE_API_URL en el clon es la base SIN /api
// (ej. http://localhost:3001). Hay que concatenar /api porque las rutas del
// backend están bajo /api/autostats/*. Bug histórico: causaba 404 masivo en
// OTPDashboard, AutoStatsModule, RendimientoConductores, CumplimientoHub.
function buildBase(): string {
  const env = import.meta.env.VITE_API_URL?.replace(/\/+$/, '');
  if (env) {
    return env.endsWith('/api') ? env : `${env}/api`;
  }
  return 'http://localhost:3001/api';
}
const BASE = buildBase();

async function authHeaders() {
  // FASE 5.16: tokenStore único (con migración legacy). Fallback a Firebase
  // Auth sólo si no hay JWT propio (en el clon Firebase está stubbed igual).
  const h = authHeader();
  if (h.Authorization) return h;
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

/**
 * FASE 5.14 (2026-05-13): agencyId pasa a ser parte de la request para evitar
 * que el backend mezcle historial entre operadores con el mismo codigoBus.
 * Es opcional para preservar compatibilidad con llamadores antiguos, pero
 * todo caller nuevo DEBE pasarlo si conoce la agencia.
 */
export async function fetchVehicleHistory(idBus: string, days = 7, agencyId?: string): Promise<VehicleHistoryResponse> {
  const h = await authHeaders();
  const qs = new URLSearchParams({ days: String(days) });
  if (agencyId) qs.set('agency_id', agencyId);
  const { data } = await axios.get(`${BASE}/autostats/vehicle/${idBus}?${qs.toString()}`, { headers: h });
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

// ── Configuración Salarial ─────────────────────────────────────────────────

export interface CategoriaSalarial {
  label: string;
  jornal: number;
  recargo: number;
  descripcion: string;
}

export interface TurnosVigentes {
  vigenciaDesde: string;
  moneda: string;
  nota: string;
  categorias: Record<string, CategoriaSalarial>;
  updatedAt?: unknown;
}

export interface FranjaIRPF {
  limiteSuperior?: number;
  tasa: number;
  descripcion: string;
}

export interface DescuentoItem {
  id: string;
  nombre: string;
  tipo: 'porcentaje' | 'monto_fijo' | 'progresivo';
  valor?: number;
  franjas?: FranjaIRPF[];
  activo: boolean;
  orden: number;
  descripcion: string;
}

export interface DescuentosConfig {
  vigenciaDesde: string;
  nota: string;
  items: DescuentoItem[];
  updatedAt?: unknown;
}

export interface ConfigSalarial {
  turnos: TurnosVigentes | null;
  descuentos: DescuentosConfig | null;
}

export async function fetchConfigSalarial(): Promise<ConfigSalarial> {
  const h = await authHeaders();
  const { data } = await axios.get(`${BASE}/admin/config-salarial`, { headers: h });
  return { turnos: data.turnos ?? null, descuentos: data.descuentos ?? null };
}

export async function updateTurnosSalariales(
  categorias: Record<string, Partial<CategoriaSalarial>>,
  vigenciaDesde?: string,
): Promise<void> {
  const h = await authHeaders();
  await axios.put(`${BASE}/admin/config-salarial/turnos`, { categorias, vigenciaDesde }, { headers: h });
}

export async function updateDescuentos(
  items: DescuentoItem[],
  vigenciaDesde?: string,
): Promise<void> {
  const h = await authHeaders();
  await axios.put(`${BASE}/admin/config-salarial/descuentos`, { items, vigenciaDesde }, { headers: h });
}

/** Calcula descuentos y neto para un jornal bruto dado + config de descuentos */
export function calcularJornalNeto(
  bruto: number,
  descuentos: DescuentosConfig | null,
  ingresoMensualEstimado?: number,
): {
  bruto: number;
  descuentosDetalle: { nombre: string; monto: number }[];
  totalDescuentos: number;
  neto: number;
} {
  if (!descuentos) return { bruto, descuentosDetalle: [], totalDescuentos: 0, neto: bruto };

  const base = ingresoMensualEstimado ?? bruto * 25; // ~25 jornales/mes
  const detalle: { nombre: string; monto: number }[] = [];

  for (const item of descuentos.items.filter(i => i.activo).sort((a, b) => a.orden - b.orden)) {
    if (item.tipo === 'porcentaje' && item.valor != null) {
      detalle.push({ nombre: item.nombre, monto: Math.round(bruto * item.valor / 100) });
    } else if (item.tipo === 'monto_fijo' && item.valor != null && item.valor > 0) {
      const porJornal = Math.round(item.valor / 25);
      detalle.push({ nombre: item.nombre, monto: porJornal });
    } else if (item.tipo === 'progresivo' && item.franjas) {
      // IRPF: calcular sobre ingreso mensual estimado, prorratear al jornal
      let irpfMensual = 0;
      let resto = base;
      let prevLimite = 0;
      for (const franja of item.franjas) {
        const limite = franja.limiteSuperior ?? Infinity;
        const tramo = Math.min(Math.max(resto, 0), limite - prevLimite);
        irpfMensual += tramo * franja.tasa / 100;
        resto -= tramo;
        prevLimite = limite;
        if (resto <= 0) break;
      }
      const irpfJornal = Math.round(irpfMensual / 25);
      if (irpfJornal > 0) detalle.push({ nombre: item.nombre, monto: irpfJornal });
    }
  }

  const totalDescuentos = detalle.reduce((s, d) => s + d.monto, 0);
  return { bruto, descuentosDetalle: detalle, totalDescuentos, neto: bruto - totalDescuentos };
}
