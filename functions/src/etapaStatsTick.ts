/**
 * etapaStatsTick — OTP por etapa (parada a parada)
 *
 * Cada 30 min lee vehicle_events de los últimos 30 min, hace snap de cada
 * posición GPS a la parada más cercana del recorrido GTFS (colección
 * `gtfs_timetable` + `gtfs_stops`) y agrega la desviación acumulada por parada
 * en `etapa_stats/{agencyId}_{linea}_{directionId}`.
 *
 * Schema del documento destino:
 *   agencyId, empresa, linea, directionId, updatedAt, totalEventos
 *   p{N}.stopId, p{N}.lat, p{N}.lon, p{N}.nombre, p{N}.paradaIdx
 *   p{N}.total, p{N}.enTiempo, p{N}.atrasados, p{N}.adelantados, p{N}.sumDesvAtrasado
 *   p{N}.h{H}.total, p{N}.h{H}.sumDesv, p{N}.h{H}.atrasados  (H = 0-23)
 *
 * Se usa FieldValue.increment() para que escrituras concurrentes sean atómicas.
 * Caching en memoria de timetables y coordenadas de paradas por run.
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const AGENCY_NAMES: Record<string, string> = {
  '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT',
};
// Política unificada (docs/POLITICA_OTP_UNIFICADA.md)
// Tolerancia ±4 min IMM/TCRP 165, alineada con autoStatsCollector.SNAP_TOL_MIN.
const EN_TIEMPO_TOL = 4;
const MAX_DIST_KM   = 0.4; // descartar si el bus está a >400m de la parada más cercana
const MAX_TRIP_DIFF = 60;  // descarttar si ningún viaje cae dentro de ±60 min

interface TimetableDoc {
  stops: string[];
  viajes: Array<{ s: string; t: number[] }>;
}
interface StopCoords { lat: number; lon: number; nombre: string }

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/** Convierte un ISO timestamp a minuto del día en hora de Uruguay (UTC-3) */
function minuteOfDayUYT(isoStr: string): { min: number; hour: number } {
  const d = new Date(isoStr);
  const uyt = new Date(d.getTime() - 3 * 3600_000);
  return { min: uyt.getHours() * 60 + uyt.getMinutes(), hour: uyt.getHours() };
}

/** Retorna el tipo de servicio GTFS para un timestamp ISO en hora UYT */
function svcType(isoStr: string): 'HABIL' | 'SABADO' | 'DOMINGO' {
  const d = new Date(new Date(isoStr).getTime() - 3 * 3600_000);
  const dow = d.getDay();
  return dow === 0 ? 'DOMINGO' : dow === 6 ? 'SABADO' : 'HABIL';
}

export const etapaStatsTick = functions.pubsub
  .schedule('every 30 minutes')
  .timeZone('America/Montevideo')
  .onRun(async () => {
    const db    = admin.firestore();
    const Inc   = admin.firestore.FieldValue.increment;
    const now   = admin.firestore.Timestamp.now();
    const since = admin.firestore.Timestamp.fromMillis(now.toMillis() - 30 * 60_000);

    // 1. Leer vehicle_events de los últimos 30 min
    const evSnap = await db.collection('vehicle_events')
      .where('createdAt', '>=', since)
      .get();

    if (evSnap.empty) {
      functions.logger.info('etapaStatsTick: sin eventos nuevos.');
      return;
    }

    // 2. Pre-cargar timetables necesarios
    const timetableCache = new Map<string, TimetableDoc | null>();
    const stopCache      = new Map<string, StopCoords>();

    const neededTT = new Set<string>();
    for (const d of evSnap.docs) {
      const ev = d.data();
      if (!ev.lat || !ev.lon || !ev.linea || !ev.agencyId) continue;
      if (ev.estadoCumplimiento === 'FUERA_DE_SERVICIO') continue;
      const ts  = ev.timestampGPS ?? now.toDate().toISOString();
      const svc = svcType(ts);
      const dirs = ev.sentido === 'IDA' ? [0] : ev.sentido === 'VUELTA' ? [1] : [0, 1];
      for (const dir of dirs) neededTT.add(`${ev.agencyId}_${ev.linea}_${dir}_${svc}`);
    }

    await Promise.all([...neededTT].map(async ttId => {
      try {
        const snap = await db.collection('gtfs_timetable').doc(ttId).get();
        timetableCache.set(ttId, snap.exists ? (snap.data() as TimetableDoc) : null);
      } catch {
        timetableCache.set(ttId, null);
      }
    }));

    // Recolectar todos los stopIds necesarios
    const neededStops = new Set<string>();
    for (const tt of timetableCache.values()) {
      if (tt?.stops) tt.stops.forEach(s => neededStops.add(s));
    }

    // Cargar coordenadas de paradas en batches de 30 (límite Firestore `in`)
    const stopIdsArr = [...neededStops];
    for (let i = 0; i < stopIdsArr.length; i += 30) {
      const chunk = stopIdsArr.slice(i, i + 30);
      const snaps = await Promise.all(chunk.map(id => db.collection('gtfs_stops').doc(id).get()));
      for (const snap of snaps) {
        if (!snap.exists) continue;
        const s = snap.data()!;
        stopCache.set(snap.id, {
          lat:    parseFloat(s.stop_lat ?? s.lat ?? '0'),
          lon:    parseFloat(s.stop_lon ?? s.lon ?? '0'),
          nombre: String(s.stop_name ?? s.nombre ?? snap.id),
        });
      }
    }

    // 3. Procesar eventos → agregación en memoria
    type GroupKey = string; // `${agencyId}_${linea}_${directionId}`
    interface ParadaAgg {
      stopId: string; paradaIdx: number; lat: number; lon: number; nombre: string;
      total: number; enTiempo: number; atrasados: number; adelantados: number; sumDesvAtrasado: number;
      byHour: Record<number, { total: number; sumDesv: number; atrasados: number }>;
    }
    const aggMap  = new Map<GroupKey, Map<number, ParadaAgg>>();
    const metaMap = new Map<GroupKey, { agencyId: string; empresa: string; linea: string; directionId: number }>();

    for (const doc of evSnap.docs) {
      const ev = doc.data();
      if (!ev.lat || !ev.lon || !ev.linea || !ev.agencyId) continue;
      if (ev.estadoCumplimiento === 'FUERA_DE_SERVICIO') continue;

      const lat = ev.lat as number;
      const lon = ev.lon as number;
      const ts  = ev.timestampGPS ?? now.toDate().toISOString();
      const { min: evMin, hour: evHour } = minuteOfDayUYT(ts);
      const svc = svcType(ts);
      const dirs = ev.sentido === 'IDA' ? [0] : ev.sentido === 'VUELTA' ? [1] : [0, 1];

      let bestDir = -1, bestStopIdx = -1, bestDeviation = 0, bestDist = Infinity;

      for (const dir of dirs) {
        const ttKey = `${ev.agencyId}_${ev.linea}_${dir}_${svc}`;
        const tt = timetableCache.get(ttKey);
        if (!tt?.stops?.length) continue;

        // Parada más cercana del recorrido
        let nearestIdx = -1, nearestDist = Infinity;
        for (let si = 0; si < tt.stops.length; si++) {
          const sc = stopCache.get(tt.stops[si]);
          if (!sc) continue;
          const dist = haversineKm(lat, lon, sc.lat, sc.lon);
          if (dist < nearestDist) { nearestDist = dist; nearestIdx = si; }
        }
        if (nearestIdx === -1 || nearestDist > MAX_DIST_KM) continue;

        // Viaje más cercano en tiempo a esa parada
        let bestTripDiff = Infinity, bestTripDev = 0;
        for (const viaje of tt.viajes) {
          const scheduled = viaje.t[nearestIdx];
          if (scheduled === -1 || scheduled === undefined) continue;
          const diff = Math.abs(evMin - scheduled);
          if (diff < bestTripDiff) { bestTripDiff = diff; bestTripDev = evMin - scheduled; }
        }
        if (bestTripDiff > MAX_TRIP_DIFF) continue;

        if (nearestDist < bestDist) {
          bestDist = nearestDist;
          bestDir  = dir;
          bestStopIdx  = nearestIdx;
          bestDeviation = bestTripDev;
        }
      }

      if (bestStopIdx === -1) continue;

      const groupKey = `${ev.agencyId}_${ev.linea}_${bestDir}`;
      if (!metaMap.has(groupKey)) {
        metaMap.set(groupKey, {
          agencyId: String(ev.agencyId),
          empresa:  AGENCY_NAMES[ev.agencyId] ?? String(ev.agencyId),
          linea:    String(ev.linea),
          directionId: bestDir,
        });
      }
      if (!aggMap.has(groupKey)) aggMap.set(groupKey, new Map());

      const ttKey  = `${ev.agencyId}_${ev.linea}_${bestDir}_${svc}`;
      const tt     = timetableCache.get(ttKey)!;
      const stopId = tt.stops[bestStopIdx];
      const sc     = stopCache.get(stopId)!;

      const stopMap = aggMap.get(groupKey)!;
      if (!stopMap.has(bestStopIdx)) {
        stopMap.set(bestStopIdx, {
          stopId, paradaIdx: bestStopIdx, lat: sc.lat, lon: sc.lon, nombre: sc.nombre,
          total: 0, enTiempo: 0, atrasados: 0, adelantados: 0, sumDesvAtrasado: 0, byHour: {},
        });
      }

      const agg = stopMap.get(bestStopIdx)!;
      agg.total++;
      if      (Math.abs(bestDeviation) <= EN_TIEMPO_TOL) agg.enTiempo++;
      else if (bestDeviation > 0) { agg.atrasados++; agg.sumDesvAtrasado += bestDeviation; }
      else    agg.adelantados++;

      if (!agg.byHour[evHour]) agg.byHour[evHour] = { total: 0, sumDesv: 0, atrasados: 0 };
      agg.byHour[evHour].total++;
      agg.byHour[evHour].sumDesv += bestDeviation;
      if (bestDeviation > EN_TIEMPO_TOL) agg.byHour[evHour].atrasados++;
    }

    // 4. Escribir a Firestore con FieldValue.increment (atómico, merge)
    const ETAPA_COLL = 'etapa_stats';
    const batch = db.batch();

    for (const [groupKey, stopMap] of aggMap) {
      const meta = metaMap.get(groupKey)!;
      const ref  = db.collection(ETAPA_COLL).doc(groupKey);
      let docTotal = 0;
      const update: Record<string, unknown> = {
        agencyId:    meta.agencyId,
        empresa:     meta.empresa,
        linea:       meta.linea,
        directionId: meta.directionId,
        updatedAt:   now,
      };

      for (const [si, agg] of stopMap) {
        const p = `p${si}`;
        update[`${p}.stopId`]        = agg.stopId;
        update[`${p}.lat`]           = agg.lat;
        update[`${p}.lon`]           = agg.lon;
        update[`${p}.nombre`]        = agg.nombre;
        update[`${p}.paradaIdx`]     = si;
        update[`${p}.total`]         = Inc(agg.total);
        update[`${p}.enTiempo`]      = Inc(agg.enTiempo);
        update[`${p}.atrasados`]     = Inc(agg.atrasados);
        update[`${p}.adelantados`]   = Inc(agg.adelantados);
        update[`${p}.sumDesvAtrasado`] = Inc(agg.sumDesvAtrasado);
        for (const [h, hd] of Object.entries(agg.byHour)) {
          update[`${p}.h${h}.total`]    = Inc(hd.total);
          update[`${p}.h${h}.sumDesv`]  = Inc(hd.sumDesv);
          update[`${p}.h${h}.atrasados`] = Inc(hd.atrasados);
        }
        docTotal += agg.total;
      }

      update['totalEventos'] = Inc(docTotal);
      batch.set(ref, update, { merge: true });
    }

    await batch.commit();

    functions.logger.info(
      `etapaStatsTick: ${evSnap.size} eventos procesados, ${aggMap.size} líneas actualizadas`,
    );
  });
