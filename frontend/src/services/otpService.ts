/**
 * otpService — consulta el estado OTP (puntualidad) de una línea desde Firestore.
 * Datos escritos por otpEngine cada 10 minutos.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

const OTP_SUMMARY_COL = 'otp_summary';
const BUS_DELAYS_COL = 'bus_delays';

export interface OtpSummary {
  agencyId: string;
  linea: string;
  svcType: string;
  busesActivos: number;
  aTiempo: number;
  retrasado: number;
  adelantado: number;
  sinDatos: number;
  pctOnTime: number;
  retrasoPromedioMin: number;
}

export interface BusDelay {
  busId: string;
  agencyId: string;
  linea: string;
  nearestStopId: string;
  nearestStopDistM: number;
  scheduledMin: number;
  currentMin: number;
  delayMin: number;
  estado: 'A_TIEMPO' | 'RETRASADO' | 'ADELANTADO' | 'SIN_DATOS';
}

const summaryCache = new Map<string, { data: OtpSummary | null; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos (dato se actualiza cada 10)

export async function getOtpSummary(agencyId: number, linea: string): Promise<OtpSummary | null> {
  const docId = `${agencyId}_${linea}`;
  const cached = summaryCache.get(docId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;
  try {
    const snap = await getDoc(doc(db, OTP_SUMMARY_COL, docId));
    const result = snap.exists() ? (snap.data() as OtpSummary) : null;
    summaryCache.set(docId, { data: result, ts: Date.now() });
    return result;
  } catch {
    return null;
  }
}

export async function getBusDelayAtStop(agencyId: number, busId: string): Promise<BusDelay | null> {
  try {
    const snap = await getDoc(doc(db, BUS_DELAYS_COL, `${agencyId}_${busId}`));
    return snap.exists() ? (snap.data() as BusDelay) : null;
  } catch {
    return null;
  }
}
