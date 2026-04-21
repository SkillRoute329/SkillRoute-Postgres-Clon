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

export const AGENCY_LABELS: Record<string, string> = {
  '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT',
};
export const AGENCY_COLORS: Record<string, string> = {
  '10': 'indigo', '20': 'sky', '50': 'amber', '70': 'emerald',
};
