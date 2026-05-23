/**
 * stmDemandaService — cliente del API /api/stm-demanda.
 *
 * FASE 5.15 (2026-05-14): expone el dataset oficial IMM
 * (catalogodatos.gub.uy / validaciones STM mensuales) al frontend.
 * Granularidad: viajes agregados por (mes, operador, línea, parada, hora,
 * día de semana, tipo de usuario, tramo, con_tarjeta).
 *
 * Fuente única: tabla `stm_validaciones_mensual` ingestada vía
 * `ingest_stm_fast.sh`. NO se mezcla con vehicle_events salvo en el
 * endpoint /load-factor que cruza ambos lados.
 */
import axios from 'axios';

import { authHeader } from '../utils/tokenStore';

const BASE = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001') + '/api/stm-demanda';

// FASE 5.16: usa el tokenStore único en vez de leer localStorage directo.
async function authHeaders(): Promise<Record<string, string>> {
  return authHeader();
}

export interface MesIngestado {
  mes: string;            // ISO timestamp del primer día del mes
  archivo: string;
  filas_origen: string | number;
  filas_agregadas: number;
  ingested_at: string;
}

export interface DemandaOperadorMes {
  mes: string;
  codEmpresa: number;
  operador: string;
  validaciones: number;
}

export interface DemandaLineaMes {
  linea: string;
  validaciones: number;
}

export interface DemandaLineaEvolucion {
  evolucionMensual: Array<{ mes: string; validaciones: number }>;
  horaDow: Array<{ hora: number; dow: number; validaciones: number }>;
}

export interface DemandaParadaMes {
  mes: string;
  codEmpresa: number;
  operador: string;
  validaciones: number;
}

export interface DemandaHoraDow {
  hora: number;
  dow: number;
  validaciones: number;
}

export interface DemandaCompetidor {
  operador: string;
  linea: string;
  ultimoMes: number;
  delta: number;
  pctCambio: number;
  series: Array<{ mes: string; total: number }>;
}

export interface DemandaForecast {
  hora: number;
  dow: number;
  ultimoMes: string | null;
  promUltimos3: number;
  tendencia: 'subiendo' | 'bajando' | 'estable';
  esperado: number;
}

export interface DemandaParadaLinea {
  codigoParada: string;
  nombre: string | null;
  lat: number | null;
  lon: number | null;
  actual: number;
  previo: number;
  delta: number;
  pctCambio: number;
}

/** Lista de meses ingestados con metadata. */
export async function fetchMesesIngestados(): Promise<MesIngestado[]> {
  const h = await authHeaders();
  const { data } = await axios.get(BASE + '/meses', { headers: h });
  return data?.meses ?? [];
}

/** Cuota de mercado por operador en un mes. */
export async function fetchOperadores(mes?: string): Promise<DemandaOperadorMes[]> {
  const h = await authHeaders();
  const qs = mes ? `?mes=${encodeURIComponent(mes)}` : '';
  const { data } = await axios.get(`${BASE}/operadores${qs}`, { headers: h });
  return data?.items ?? [];
}

/** Top N líneas de un operador. */
export async function fetchTopLineas(op: string, mes?: string, limit = 20): Promise<DemandaLineaMes[]> {
  const h = await authHeaders();
  const qs = new URLSearchParams({ limit: String(limit) });
  if (mes) qs.set('mes', mes);
  const { data } = await axios.get(`${BASE}/lineas/${op}?${qs}`, { headers: h });
  return data?.items ?? [];
}

/** Evolución mensual + perfil hora×dow de una línea concreta. */
export async function fetchLineaEvolucion(op: string, linea: string): Promise<DemandaLineaEvolucion | null> {
  const h = await authHeaders();
  const { data } = await axios.get(`${BASE}/linea/${op}/${encodeURIComponent(linea)}`, { headers: h });
  return data?.ok ? { evolucionMensual: data.evolucionMensual, horaDow: data.horaDow } : null;
}

/** Operadores que validan en una parada (= competidores). */
export async function fetchParadaDemanda(codParada: string): Promise<DemandaParadaMes[]> {
  const h = await authHeaders();
  const { data } = await axios.get(`${BASE}/parada/${encodeURIComponent(codParada)}`, { headers: h });
  return data?.items ?? [];
}

/** Heatmap hora × día de semana para un operador. */
export async function fetchHoraDow(op: string, mes?: string): Promise<DemandaHoraDow[]> {
  const h = await authHeaders();
  const qs = mes ? `?mes=${encodeURIComponent(mes)}` : '';
  const { data } = await axios.get(`${BASE}/hora-dow/${op}${qs}`, { headers: h });
  return data?.items ?? [];
}

/** Líneas competidoras concretas que pasan por una parada. */
export async function fetchCompetidoresParada(codParada: string): Promise<DemandaCompetidor[]> {
  const h = await authHeaders();
  const { data } = await axios.get(`${BASE}/competidores/${encodeURIComponent(codParada)}`, { headers: h });
  return data?.items ?? [];
}

export interface DemandaMapaGlobalItem {
  codigoParada: string;
  nombre: string | null;
  lat: number | null;
  lon: number | null;
  ucot: number;
  cutcsa: number;
  coetc: number;
  come: number;
  total: number;
  dominante: 'UCOT' | 'CUTCSA' | 'COETC' | 'COME';
  cuotaDominante: number;
  /** HHI normalizado: 1=monopolio · 0.25=4 operadores iguales. */
  hhi: number;
  nOperadores: number;
}

export interface DemandaMapaGlobalOpts {
  mes?: string;
  top?: number;
  minViajes?: number;
  conUcot?: boolean;
}

/** Top paradas globales con desglose por operador. */
export async function fetchMapaGlobal(opts: DemandaMapaGlobalOpts = {}): Promise<{
  mes: string | null;
  totalParadas: number;
  items: DemandaMapaGlobalItem[];
}> {
  const h = await authHeaders();
  const qs = new URLSearchParams();
  if (opts.mes) qs.set('mes', opts.mes);
  if (opts.top) qs.set('top', String(opts.top));
  if (opts.minViajes != null) qs.set('minViajes', String(opts.minViajes));
  if (opts.conUcot) qs.set('conUcot', 'true');
  const { data } = await axios.get(`${BASE}/mapa-global?${qs}`, { headers: h });
  return {
    mes: data?.mes ?? null,
    totalParadas: data?.totalParadas ?? 0,
    items: data?.items ?? [],
  };
}

/** Paradas de una línea con coordenadas (para mapa). */
export async function fetchParadasLinea(op: string, linea: string, mes?: string): Promise<DemandaParadaLinea[]> {
  const h = await authHeaders();
  const qs = mes ? `?mes=${encodeURIComponent(mes)}` : '';
  const { data } = await axios.get(
    `${BASE}/paradas-linea/${op}/${encodeURIComponent(linea)}${qs}`,
    { headers: h },
  );
  return data?.items ?? [];
}

/** Forecast de demanda para una línea (todas las horas×dow). */
export async function fetchForecast(op: string, linea: string, dow?: number, hora?: number): Promise<DemandaForecast[]> {
  const h = await authHeaders();
  const qs = new URLSearchParams();
  if (dow != null) qs.set('dow', String(dow));
  if (hora != null) qs.set('hora', String(hora));
  const { data } = await axios.get(`${BASE}/forecast/${op}/${encodeURIComponent(linea)}${qs.toString() ? '?' + qs : ''}`, { headers: h });
  return data?.forecast ?? [];
}
