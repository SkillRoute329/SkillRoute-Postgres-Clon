/**
 * vehicleHistoryService.ts
 * Almacena y consulta el historial de coches por ID de bus.
 *
 * Colección Firestore: vehicle_events
 * Documento: { idBus, agencyId, empresa, linea, lat, lon, velocidad,
 *              estadoCumplimiento, desviacionMin, timestampGPS, createdAt }
 *
 * TTL automático: 30 días (configurable vía campo ttl en Firestore rules/indexes).
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from '../config/logger';
import type { BusComplianceResult } from './scheduleComplianceEngine';

const COLLECTION = 'vehicle_events';
const TTL_DAYS = 30;

export interface VehicleEvent {
  idBus: string;
  agencyId: string;
  empresa: string;
  linea: string;
  lat: number;
  lon: number;
  velocidad: number;
  estadoCumplimiento: string;
  desviacionMin: number | null;
  tripId: string | null;
  proximaParada: string | null;
  timestampGPS: string;
  createdAt: FirebaseFirestore.FieldValue;
  expiresAt: Date;
}

export interface VehicleHistorySummary {
  idBus: string;
  empresa: string;
  lineasOperadas: string[];
  totalEventos: number;
  velocidadMedia: number;
  pctEnTiempo: number;
  pctAtrasado: number;
  pctAdelantado: number;
  pctSinHorario: number;
  ultimaActividad: string | null;
  primeraActividad: string | null;
  desviacionMediaMin: number | null;
}

/** Guarda un batch de eventos de cumplimiento en Firestore */
export async function saveComplianceSnapshot(results: BusComplianceResult[]): Promise<void> {
  if (results.length === 0) return;
  const db = getFirestore();
  const col = db.collection(COLLECTION);
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);

  const BATCH_SIZE = 400;
  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const batch = db.batch();
    results.slice(i, i + BATCH_SIZE).forEach(r => {
      const doc = col.doc();
      const event: VehicleEvent = {
        idBus: r.idBus,
        agencyId: r.agencyId,
        empresa: r.empresa,
        linea: r.linea,
        lat: r.lat,
        lon: r.lon,
        velocidad: r.velocidad,
        estadoCumplimiento: r.estadoCumplimiento,
        desviacionMin: r.desviacionMin,
        tripId: r.tripActivo?.trip_id ?? null,
        proximaParada: r.proximaParadaControl?.name ?? null,
        timestampGPS: r.timestampGPS,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt,
      };
      batch.set(doc, event);
    });
    await batch.commit();
  }
  logger.info(`[VehicleHistory] Guardados ${results.length} eventos`);
}

/** Historial de un coche específico (últimos N días) */
export async function getVehicleHistory(
  idBus: string,
  days = 7,
): Promise<VehicleEvent[]> {
  const db = getFirestore();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const snap = await db
    .collection(COLLECTION)
    .where('idBus', '==', idBus)
    .where('createdAt', '>=', Timestamp.fromDate(since))
    .orderBy('createdAt', 'desc')
    .limit(500)
    .get();
  return snap.docs.map(d => d.data() as VehicleEvent);
}

/** Resumen estadístico de un coche */
export async function getVehicleSummary(idBus: string, days = 30): Promise<VehicleHistorySummary | null> {
  const events = await getVehicleHistory(idBus, days);
  if (events.length === 0) return null;

  const empresa = events[0].empresa;
  const lineas = [...new Set(events.map(e => e.linea))];
  const velocidades = events.map(e => e.velocidad).filter(v => v > 0);
  const velMedia = velocidades.length > 0
    ? Math.round(velocidades.reduce((a, b) => a + b, 0) / velocidades.length)
    : 0;

  const enTiempo = events.filter(e => e.estadoCumplimiento === 'EN_TIEMPO').length;
  const atrasado = events.filter(e => e.estadoCumplimiento === 'ATRASADO').length;
  const adelantado = events.filter(e => e.estadoCumplimiento === 'ADELANTADO').length;
  const sinHorario = events.filter(e => e.estadoCumplimiento === 'SIN_HORARIO' || e.estadoCumplimiento === 'FUERA_DE_SERVICIO').length;

  const conSchedule = enTiempo + atrasado + adelantado;
  const desviaciones = events.map(e => e.desviacionMin).filter((d): d is number => d !== null);
  const desvMedia = desviaciones.length > 0
    ? Math.round(desviaciones.reduce((a, b) => a + b, 0) / desviaciones.length)
    : null;

  const timestamps = events.map(e => e.timestampGPS).sort();

  return {
    idBus,
    empresa,
    lineasOperadas: lineas,
    totalEventos: events.length,
    velocidadMedia: velMedia,
    pctEnTiempo: conSchedule > 0 ? Math.round((enTiempo / conSchedule) * 100) : 0,
    pctAtrasado: conSchedule > 0 ? Math.round((atrasado / conSchedule) * 100) : 0,
    pctAdelantado: conSchedule > 0 ? Math.round((adelantado / conSchedule) * 100) : 0,
    pctSinHorario: events.length > 0 ? Math.round((sinHorario / events.length) * 100) : 0,
    ultimaActividad: timestamps[timestamps.length - 1] ?? null,
    primeraActividad: timestamps[0] ?? null,
    desviacionMediaMin: desvMedia,
  };
}

/** Buses activos en tiempo real agrupados por línea (desde últimos 3 min) */
export async function getActiveBusesSnapshot(agencyId: string): Promise<
  Array<{ idBus: string; linea: string; velocidad: number; estadoCumplimiento: string; lat: number; lon: number }>
> {
  const db = getFirestore();
  const since = new Date(Date.now() - 3 * 60 * 1000);
  const snap = await db
    .collection(COLLECTION)
    .where('agencyId', '==', agencyId)
    .where('createdAt', '>=', Timestamp.fromDate(since))
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get();

  const seen = new Set<string>();
  const buses: ReturnType<typeof getActiveBusesSnapshot> extends Promise<infer T> ? T : never = [];
  snap.docs.forEach(d => {
    const e = d.data() as VehicleEvent;
    if (!seen.has(e.idBus)) {
      seen.add(e.idBus);
      (buses as any[]).push({ idBus: e.idBus, linea: e.linea, velocidad: e.velocidad, estadoCumplimiento: e.estadoCumplimiento, lat: e.lat, lon: e.lon });
    }
  });
  return buses as any;
}
