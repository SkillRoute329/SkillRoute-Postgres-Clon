/**
 * gtfsTimetableService — consultas sobre gtfs_timetable en Firestore.
 *
 * Formato de doc: { stops: string[], viajes: [{s: "HH:MM", t: number[]}], ... }
 * t[i] = minutos desde medianoche para la parada stops[i].
 * -1 indica que ese viaje no sirve esa parada.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

const TIMETABLE_COL = 'gtfs_timetable';

export type ServiceType = 'HABIL' | 'SABADO' | 'DOMINGO';

export interface TimetableDoc {
  agencyId: string;
  empresa: string;
  linea: string;
  directionId: number;
  serviceType: ServiceType;
  stops: string[];
  viajes: Array<{ s: string; t: number[] }>;
  totalViajes: number;
  primeraS: string;
  ultimaS: string;
}

// Cache in-memory para la sesión (los docs son estables — se actualizan semanalmente)
const cache = new Map<string, TimetableDoc | null>();

export function getCurrentServiceType(): ServiceType {
  const day = new Date().getDay(); // 0=domingo, 6=sábado
  if (day === 0) return 'DOMINGO';
  if (day === 6) return 'SABADO';
  return 'HABIL';
}

export async function getTimetable(
  agencyId: string,
  linea: string,
  directionId: number,
  serviceType: ServiceType = getCurrentServiceType()
): Promise<TimetableDoc | null> {
  const docId = `${agencyId}_${linea}_${directionId}_${serviceType}`;
  if (cache.has(docId)) return cache.get(docId)!;
  try {
    const snap = await getDoc(doc(db, TIMETABLE_COL, docId));
    const result = snap.exists() ? (snap.data() as TimetableDoc) : null;
    cache.set(docId, result);
    return result;
  } catch {
    return null;
  }
}

export interface ProximaSalida {
  hora: string;       // "HH:MM"
  minutosRestantes: number;
}

/**
 * Retorna las próximas N salidas desde una parada dada.
 * timeNow en minutos desde medianoche (ej: 14*60+35 = 875).
 */
export function getProximasSalidasEnParada(
  timetable: TimetableDoc,
  stopId: string,
  timeNowMin: number,
  cuantas = 5
): ProximaSalida[] {
  const stopIdx = timetable.stops.indexOf(stopId);
  if (stopIdx === -1) return [];

  const candidatos: ProximaSalida[] = [];
  for (const viaje of timetable.viajes) {
    const depMin = viaje.t[stopIdx];
    if (depMin < 0) continue;
    const diff = depMin - timeNowMin;
    if (diff >= -1) { // tolerancia de 1 minuto para buses que salen "ahora"
      const hh = String(Math.floor(depMin / 60)).padStart(2, '0');
      const mm = String(depMin % 60).padStart(2, '0');
      candidatos.push({ hora: `${hh}:${mm}`, minutosRestantes: Math.max(0, diff) });
    }
  }
  // Si quedan menos de `cuantas` resultados hoy, agregar del día siguiente
  if (candidatos.length < cuantas) {
    for (const viaje of timetable.viajes) {
      const depMin = viaje.t[stopIdx];
      if (depMin < 0) continue;
      const diff = depMin - timeNowMin;
      if (diff < -1) {
        const hh = String(Math.floor(depMin / 60)).padStart(2, '0');
        const mm = String(depMin % 60).padStart(2, '0');
        candidatos.push({ hora: `${hh}:${mm}`, minutosRestantes: depMin + 1440 - timeNowMin });
      }
    }
  }
  candidatos.sort((a, b) => a.minutosRestantes - b.minutosRestantes);
  return candidatos.slice(0, cuantas);
}

export function nowToMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}
