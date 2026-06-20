import axios from 'axios';
import { authHeader } from '../utils/tokenStore';

const BASE = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001') + '/api/analytics';

async function authHeaders(): Promise<Record<string, string>> {
  return authHeader();
}

export interface RunTimeSegment {
  fromStop: string;
  toStop: string;
  avgScheduledMinutes: number;
  avgRealMinutes: number;
  avgDelayMinutes: number;
  isBottleneck: boolean;
  sampleCount: number;
}

export interface RunTimesDoc {
  ok: boolean;
  agencyId: string;
  linea: string;
  sentido: string;
  days: number;
  segments: RunTimeSegment[];
  bottlenecks: RunTimeSegment[];
}

export interface StopDwellTime {
  stopName: string;
  avgDwellSeconds: number;
  maxDwellSeconds: number;
  sampleCount: number;
  congestionLevel: 'BAJO' | 'MEDIO' | 'ALTO';
}

export interface StopDwellsDoc {
  ok: boolean;
  agencyId: string;
  linea: string;
  days: number;
  dwellTimes: StopDwellTime[];
}

export async function fetchRunTimes(
  agencyId: string,
  linea: string,
  days = 3,
  sentido = 'IDA'
): Promise<RunTimesDoc | null> {
  if (!linea || linea === 'todas') return null;
  try {
    const h = await authHeaders();
    const { data } = await axios.get(
      `${BASE}/run-times/${agencyId}/${encodeURIComponent(linea)}?days=${days}&sentido=${sentido}`,
      { headers: h }
    );
    return data;
  } catch (error) {
    console.error('[analyticsService] fetchRunTimes error:', error);
    return null;
  }
}

export async function fetchStopDwellTimes(
  agencyId: string,
  linea: string,
  days = 3
): Promise<StopDwellsDoc | null> {
  if (!linea || linea === 'todas') return null;
  try {
    const h = await authHeaders();
    const { data } = await axios.get(
      `${BASE}/stop-dwell/${agencyId}/${encodeURIComponent(linea)}?days=${days}`,
      { headers: h }
    );
    return data;
  } catch (error) {
    console.error('[analyticsService] fetchStopDwellTimes error:', error);
    return null;
  }
}
