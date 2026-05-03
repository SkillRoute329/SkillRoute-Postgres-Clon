/**
 * vehicleStatsTick — Estadísticas diarias por coche para las 4 empresas.
 *
 * Fuente: vehicle_events (GPS real IMM, todas las empresas).
 * Enriquecimiento: distribuciones_diarias/{fecha}/registros (solo UCOT cuando existen).
 * Colección destino: vehicle_stats/{agencyId}_{idBus}
 *
 * Cron: diario 23:45 Montevideo (después de conductorStatsTick 23:30).
 * Merge incremental: agrega el día sin borrar historial anterior.
 */
import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const AGENCIES: Record<string, string> = {
  '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT',
};
const UCOT_AGENCY = '70';
const MIN_EVENTOS = 3;

interface DiaVehicle {
  fecha: string;
  totalEventos: number;
  pctEnTiempo: number;
  pctAtrasado: number;
  pctAdelantado: number;
  velocidadMedia: number;
  desviacionMediaMin: number | null;
  lineas: string[];
  // Enriquecimiento conductor (solo UCOT cuando hay distribuciones)
  interno: number | null;
  nombre: string | null;
  turno: string | null;
  servicio: number | null;
}

interface VehicleAcc {
  agencyId: string;
  empresa: string;
  idBus: string;
  total: number;
  enTiempo: number;
  atrasado: number;
  adelantado: number;
  desviaciones: number[];
  velocidades: number[];
  lineasSet: Set<string>;
  ultimaActividad: string;
  ultimoInterno: number | null;
  ultimoNombre: string | null;
  conductoresKnown: Set<number>;
  historial: DiaVehicle[];
}

function pct(num: number, total: number): number {
  return total > 0 ? Math.round(num / total * 1000) / 10 : 0;
}
function avg(arr: number[]): number | null {
  return arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null;
}

async function processAgency(
  db: admin.firestore.Firestore,
  agencyId: string,
  today: string,
  sinceISO: string,
  distribByCoche: Record<string, admin.firestore.DocumentData>,
): Promise<Record<string, VehicleAcc>> {
  const empresa = AGENCIES[agencyId] ?? agencyId;

  const snap = await db.collection('vehicle_events')
    .where('agencyId', '==', agencyId)
    .where('timestampGPS', '>=', sinceISO)
    .orderBy('timestampGPS', 'desc')
    .limit(8000)
    .get();

  if (snap.empty) return {};

  // Agrupar por idBus
  const byBus: Record<string, admin.firestore.DocumentData[]> = {};
  snap.docs.forEach(d => {
    const e = d.data();
    const id = String(e.idBus ?? '');
    if (!id) return;
    (byBus[id] = byBus[id] ?? []).push(e);
  });

  const accMap: Record<string, VehicleAcc> = {};

  for (const [idBus, evs] of Object.entries(byBus)) {
    let dTotal = 0, dEnTiempo = 0, dAtrasado = 0, dAdelantado = 0;
    const dDesv: number[] = [], dVels: number[] = [];
    const dLineas = new Set<string>();

    for (const ev of evs) {
      dTotal++;
      if      (ev.estadoCumplimiento === 'EN_TIEMPO')    dEnTiempo++;
      else if (ev.estadoCumplimiento === 'ATRASADO')     dAtrasado++;
      else if (ev.estadoCumplimiento === 'ADELANTADO')   dAdelantado++;
      if (typeof ev.desviacionMin === 'number') dDesv.push(ev.desviacionMin);
      if (typeof ev.velocidad === 'number' && ev.velocidad > 0) dVels.push(ev.velocidad);
      if (ev.linea) dLineas.add(String(ev.linea));
    }

    if (dTotal < MIN_EVENTOS) continue;

    const dCon = dEnTiempo + dAtrasado + dAdelantado;

    // Enriquecimiento conductor (solo UCOT)
    const reg = agencyId === UCOT_AGENCY ? distribByCoche[idBus] : undefined;
    const interno: number | null  = reg?.interno  ?? null;
    const nombre: string | null   = reg?.nombre   ?? null;
    const turno: string | null    = reg?.turno    ?? null;
    const servicio: number | null = reg?.servicio ?? null;

    const diaStats: DiaVehicle = {
      fecha: today, totalEventos: dTotal,
      pctEnTiempo:   pct(dEnTiempo,  dCon),
      pctAtrasado:   pct(dAtrasado,  dCon),
      pctAdelantado: pct(dAdelantado, dCon),
      velocidadMedia: avg(dVels) ?? 0,
      desviacionMediaMin: avg(dDesv),
      lineas: [...dLineas].sort(),
      interno, nombre, turno, servicio,
    };

    const key = `${agencyId}_${idBus}`;
    if (!accMap[key]) {
      accMap[key] = {
        agencyId, empresa, idBus,
        total: 0, enTiempo: 0, atrasado: 0, adelantado: 0,
        desviaciones: [], velocidades: [],
        lineasSet: new Set(), ultimaActividad: today,
        ultimoInterno: null, ultimoNombre: null,
        conductoresKnown: new Set(), historial: [],
      };
    }
    const acc = accMap[key];
    acc.total       += dTotal;
    acc.enTiempo    += dEnTiempo;
    acc.atrasado    += dAtrasado;
    acc.adelantado  += dAdelantado;
    acc.desviaciones.push(...dDesv);
    acc.velocidades.push(...dVels);
    dLineas.forEach(l => acc.lineasSet.add(l));
    if (interno) {
      acc.conductoresKnown.add(interno);
      acc.ultimoInterno = interno;
      acc.ultimoNombre  = nombre;
    }
    acc.historial.push(diaStats);
  }

  console.log(`[vehicleStats] ${empresa}: ${Object.keys(accMap).length} buses con datos hoy`);
  return accMap;
}

async function runVehicleStatsTick(db: admin.firestore.Firestore): Promise<void> {
  const now   = new Date();
  const today = now.toISOString().slice(0, 10);
  const since = new Date(now);
  since.setUTCHours(0, 0, 0, 0);
  const sinceISO = since.toISOString();

  console.log(`[vehicleStats] Procesando ${today}`);

  // Cargar distribuciones UCOT del día (enriquecimiento)
  const distribSnap = await db.collection('distribuciones_diarias')
    .doc(today).collection('registros').get();
  const distribByCoche: Record<string, admin.firestore.DocumentData> = {};
  distribSnap.docs.forEach(d => {
    const reg = d.data();
    if (reg.coche) distribByCoche[String(reg.coche)] = reg;
  });
  console.log(`[vehicleStats] Distribuciones UCOT hoy: ${distribSnap.size} coches`);

  // Procesar todas las empresas en paralelo
  const results = await Promise.all(
    Object.keys(AGENCIES).map(agencyId =>
      processAgency(db, agencyId, today, sinceISO, distribByCoche)
    )
  );

  const allAccMap: Record<string, VehicleAcc> = Object.assign({}, ...results);
  const coll = db.collection('vehicle_stats');

  for (const [key, acc] of Object.entries(allAccMap)) {
    const existing = await coll.doc(key).get();
    let mergedHistorial: DiaVehicle[] = acc.historial;

    if (existing.exists) {
      const prev = existing.data()!;
      const prevHistorial: DiaVehicle[] = (prev.historial ?? []).filter(
        (h: DiaVehicle) => h.fecha !== today
      );
      mergedHistorial = [...prevHistorial, ...acc.historial]
        .sort((a, b) => a.fecha.localeCompare(b.fecha));

      // Acumular sobre totales históricos
      acc.total      += prev.totalEventos ?? 0;
      acc.enTiempo   += Math.round(((prev.pctEnTiempo  ?? 0) / 100) * (prev.totalEventos ?? 0));
      acc.atrasado   += Math.round(((prev.pctAtrasado  ?? 0) / 100) * (prev.totalEventos ?? 0));
      acc.adelantado += Math.round(((prev.pctAdelantado ?? 0) / 100) * (prev.totalEventos ?? 0));
      (prev.lineasOperadas ?? []).forEach((l: string) => acc.lineasSet.add(l));
      (prev.conductoresConocidos ?? []).forEach((i: number) => acc.conductoresKnown.add(i));

      // Mantener último conductor conocido si hoy no tenemos
      if (!acc.ultimoInterno && prev.ultimoInterno) {
        acc.ultimoInterno = prev.ultimoInterno;
        acc.ultimoNombre  = prev.ultimoNombre;
      }
    }

    const con = acc.enTiempo + acc.atrasado + acc.adelantado;
    await coll.doc(key).set({
      agencyId:             acc.agencyId,
      empresa:              acc.empresa,
      idBus:                acc.idBus,
      diasActivos:          mergedHistorial.length,
      totalEventos:         acc.total,
      pctEnTiempo:          pct(acc.enTiempo,  con),
      pctAtrasado:          pct(acc.atrasado,  con),
      pctAdelantado:        pct(acc.adelantado, con),
      pctSinHorario:        pct(acc.total - con, acc.total),
      velocidadMedia:       avg(acc.velocidades) ?? 0,
      desviacionMediaMin:   avg(acc.desviaciones),
      lineasOperadas:       [...acc.lineasSet].sort(),
      ultimaActividad:      today,
      ultimoInterno:        acc.ultimoInterno,
      ultimoNombre:         acc.ultimoNombre,
      conductoresConocidos: [...acc.conductoresKnown].sort(),
      historial:            mergedHistorial,
      updatedAt:            admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: false });
  }

  console.log(`[vehicleStats] Completado: ${Object.keys(allAccMap).length} buses actualizados.`);
}

export const vehicleStatsTick = functions.pubsub
  .schedule('45 23 * * *')
  .timeZone('America/Montevideo')
  .onRun(async () => {
    const db = admin.firestore();
    await runVehicleStatsTick(db);
    return null;
  });
