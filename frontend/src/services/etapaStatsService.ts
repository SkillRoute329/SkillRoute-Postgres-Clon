/**
 * etapaStatsService — datos para Análisis por Etapa
 *
 * FASE 5.14 (2026-05-13): antes era un stub que devolvía []/null y
 * mostraba "Sin datos aún" para siempre. Ahora consume los endpoints
 * /api/etapa-stats que agregan vehicle_events por proxima_parada.
 */

import axios from 'axios';
import { authHeader } from '../utils/tokenStore';

const BASE = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001') + '/api';

// FASE 5.16: tokenStore único.
async function authHeaders(): Promise<Record<string, string>> {
  return authHeader();
}

export interface ParadaStat {
  paradaIdx: number;
  stopId: string;
  nombre: string;
  total: number;
  atrasados: number;
  pctEnTiempo: number;
  pctAtrasado: number;
  desviacionMediaMin: number;
  byHour: Record<string, { pctAtrasado: number; desviacionMedia: number }>;
}

export interface EtapaStatsDoc {
  updatedAt: Date;
  paradas: ParadaStat[];
  totalEventos: number;
}

export async function fetchEtapaLineas(agencyId: string): Promise<string[]> {
  try {
    const h = await authHeaders();
    const { data } = await axios.get(`${BASE}/etapa-stats/lineas/${agencyId}`, { headers: h });
    return Array.isArray(data?.lineas) ? data.lineas : [];
  } catch {
    return [];
  }
}

export async function fetchEtapaStats(
  agencyId: string,
  lineaSeleccionada: string,
  sentido: number,
): Promise<EtapaStatsDoc | null> {
  if (!lineaSeleccionada) return null;
  try {
    const h = await authHeaders();
    // FASE 5.14 (2026-05-13): mandar sentido al backend. 0=IDA, 1=VUELTA,
    // otro=TODOS. El backend filtra vehicle_events.sentido para evitar
    // mezclar dos sentidos opuestos en la misma estadística.
    const sentidoParam = sentido === 0 ? 'IDA' : sentido === 1 ? 'VUELTA' : '';
    const qs = sentidoParam ? `?sentido=${sentidoParam}` : '';
    const { data } = await axios.get(
      `${BASE}/etapa-stats/${agencyId}/${encodeURIComponent(lineaSeleccionada)}${qs}`,
      { headers: h },
    );
    if (!data?.ok) return null;
    return {
      updatedAt: new Date(data.updatedAt ?? Date.now()),
      paradas: Array.isArray(data.paradas) ? data.paradas : [],
      totalEventos: data.totalEventos ?? 0,
    };
  } catch {
    return null;
  }
}
