/**
 * comparacionServicioService — cliente de /api/cartones/comparacion.
 *
 * FASE 5.17 (2026-05-16): comparación de 3 columnas POR TRAMO para un coche
 * UCOT: IMM oficial · servicio UCOT (cartón estructurado) · GPS real.
 * El backend resuelve coche → nº de servicio (rotación scrapeada) →
 * horarios del documento, y los cruza con las pasadas GPS.
 */
import axios from 'axios';
import { authHeader } from '../utils/tokenStore';

const BASE = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001') + '/api/cartones';

export type EstadoTramo = 'EN_TIEMPO' | 'ATRASADO' | 'ADELANTADO' | 'SIN_GPS' | 'SIN_CARTON';

export interface FilaTramo {
  vuelta: number;
  tramoEnVuelta: number;
  origen: string;
  destino: string;
  immSalida: string | null;
  cartonSalida: string | null;
  cartonLlegada: string | null;
  esperaProgMin: number | null;
  desvioInicioVsImmMin: number | null;
  estadoMotorPredominante: string | null;
  desvioMedioVsImmMin: number | null;
  desvioMaxVsImmMin: number | null;
  puntosGps: number;
  difCartonVsImmMin: number | null;
  difGpsVsCartonMin: number | null;
  estado: EstadoTramo;
  correccion: string | null;
}

export interface ComparacionResultado {
  ok: boolean;
  meta: {
    coche: string;
    agencyId: string;
    fecha: string;
    tipoDia: 'habil' | 'sabado' | 'festivo';
    serviceNumber: string | null;
    linea: string | null;
    instruccionSalida: string | null;
    rotacionActualizada: string | null;
    generadoEn: string;
  };
  capas: {
    immDisponible: boolean;
    cartonDisponible: boolean;
    gpsDisponible: boolean;
    notas: string[];
  };
  resumen: {
    tramos: number;
    enTiempo: number;
    atrasado: number;
    adelantado: number;
    sinGps: number;
    sinCarton: number;
    cumplimientoSalidaPct: number | null;
  };
  filas: FilaTramo[];
}

export async function getComparacionCoche(
  coche: string,
  fecha: string,
  agencyId = '70',
): Promise<ComparacionResultado> {
  const headers = await authHeader();
  const { data } = await axios.get<ComparacionResultado>(
    `${BASE}/comparacion/${encodeURIComponent(coche)}`,
    { params: { fecha, agency_id: agencyId }, headers },
  );
  return data;
}

export interface ServicioDistribucion {
  servicio: string;
  linea: string | null;
  tipo_dia: string | null;
  veces: string | number;
  primera_fecha: string;
  ultima_fecha: string;
  desvio_medio_vs_imm_min: string | number | null;
}
export interface DistribucionResultado {
  ok: boolean;
  coche: string;
  serviciosDistintos: number;
  servicios: ServicioDistribucion[];
}
export async function getDistribucionCoche(
  coche: string,
  agencyId = '70',
): Promise<DistribucionResultado> {
  const headers = await authHeader();
  const { data } = await axios.get<DistribucionResultado>(
    `${BASE}/distribucion/${encodeURIComponent(coche)}`,
    { params: { agency_id: agencyId }, headers },
  );
  return data;
}

export interface SustitucionFila {
  coche: string;
  servicioAsignado: string | null;
  linea: string | null;
  ptsGps: number;
  posiblesSustitutos: string[];
}
export interface SustitucionesResultado {
  ok: boolean;
  fecha: string;
  esperados: number;
  noSalieron: number;
  detalle: SustitucionFila[];
}
export async function getSustituciones(
  fecha: string,
  agencyId = '70',
): Promise<SustitucionesResultado> {
  const headers = await authHeader();
  const { data } = await axios.get<SustitucionesResultado>(`${BASE}/sustituciones`, {
    params: { fecha, agency_id: agencyId },
    headers,
  });
  return data;
}

export type EstadoPanel =
  | 'NO_SALIO'
  | 'SIN_CARTON'
  | 'ATRASADO'
  | 'ADELANTADO'
  | 'BAJA_COBERTURA'
  | 'OK';
export interface PanelFila {
  coche: string;
  servicioAsignado: string | null;
  lineaAsignada: string | null;
  lineasObservadas: string[];
  lineas: string[];
  estado: EstadoPanel;
  desvioMedioVsImmMin: number | null;
  pctEnTiempo: number | null;
  coberturaPct: number;
  eventosGps: number;
  ultimaActividad: string | null;
  severidad: number;
}
export interface PanelCumplimiento {
  ok: boolean;
  fecha: string;
  politicaOtp: string;
  resumen: {
    flotaConDatos: number;
    conProblemas: number;
    noSalieron: number;
    atrasados: number;
    adelantados: number;
    sinCarton: number;
    bajaCobertura: number;
  };
  problemas: PanelFila[];
}
export async function getPanelCumplimiento(
  fecha: string,
  agencyId = '70',
): Promise<PanelCumplimiento> {
  const headers = await authHeader();
  const { data } = await axios.get<PanelCumplimiento>(`${BASE}/panel-cumplimiento`, {
    params: { fecha, agency_id: agencyId },
    headers,
  });
  return data;
}
