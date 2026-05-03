/**
 * vehicleStatsTick — Estadísticas diarias por coche para las 4 empresas.
 *
 * Fuente GPS: vehicle_events (IMM STM, todas las empresas).
 * Enriquecimiento UCOT: distribuciones_diarias (conductores por coche).
 * Enriquecimiento modelo: colección vehicles (marca/tipo por idBus).
 * Colección destino: vehicle_stats/{agencyId}_{idBus}
 *
 * Auto-registro: coches detectados en GPS que no están en vehicles
 * se guardan automáticamente con auto_detected=true para revisión.
 *
 * Regla de negocio: cada coche puede tener 1, 2 o 3 conductores por día (turnos).
 * Cada asignación conductor-coche = 1 jornal. totalJornales refleja la carga laboral real.
 *
 * Cron: diario 23:45 Montevideo (después de conductorStatsTick 23:30).
 */
import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const AGENCIES: Record<string, string> = {
  '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT',
};
const UCOT_AGENCY = '70';
const MIN_EVENTOS = 3;

interface ConductorDia {
  interno: number | null;
  nombre: string | null;
  turno: string | null;
  servicio: number | null;
}

interface DiaVehicle {
  fecha: string;
  totalEventos: number;
  pctEnTiempo: number;
  pctAtrasado: number;
  pctAdelantado: number;
  velocidadMedia: number;
  desviacionMediaMin: number | null;
  lineas: string[];
  conductoresDia: ConductorDia[];
  jornalesDia: number;
  // Backward compat: primer conductor del día
  interno: number | null;
  nombre: string | null;
  turno: string | null;
  servicio: number | null;
}

interface VehicleAcc {
  agencyId: string;
  empresa: string;
  idBus: string;
  marca: string | null;
  tipo: string | null;
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
  totalJornales: number;
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
  distribByCoche: Record<string, admin.firestore.DocumentData[]>,
  marcaMap: Record<string, { marca: string | null; tipo: string | null }>,
): Promise<Record<string, VehicleAcc>> {
  const empresa = AGENCIES[agencyId] ?? agencyId;

  const snap = await db.collection('vehicle_events')
    .where('agencyId', '==', agencyId)
    .where('timestampGPS', '>=', sinceISO)
    .orderBy('timestampGPS', 'desc')
    .limit(8000)
    .get();

  if (snap.empty) return {};

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

    // Enriquecimiento conductores UCOT (1-3 por coche)
    const regs = agencyId === UCOT_AGENCY ? (distribByCoche[idBus] ?? []) : [];
    const conductoresDia: ConductorDia[] = regs.map(r => ({
      interno:  r.interno  ?? null,
      nombre:   r.nombre   ?? null,
      turno:    r.turno    ?? null,
      servicio: r.servicio ?? null,
    }));
    const jornalesDia = conductoresDia.length;

    // Enriquecimiento modelo — clave agencyId_idBus, fallback solo idBus (UCOT legacy)
    const vehicleInfo = marcaMap[`${agencyId}_${idBus}`] ?? marcaMap[idBus] ?? null;

    const diaStats: DiaVehicle = {
      fecha: today, totalEventos: dTotal,
      pctEnTiempo:   pct(dEnTiempo,  dCon),
      pctAtrasado:   pct(dAtrasado,  dCon),
      pctAdelantado: pct(dAdelantado, dCon),
      velocidadMedia: avg(dVels) ?? 0,
      desviacionMediaMin: avg(dDesv),
      lineas: [...dLineas].sort(),
      conductoresDia,
      jornalesDia,
      interno:  conductoresDia[0]?.interno  ?? null,
      nombre:   conductoresDia[0]?.nombre   ?? null,
      turno:    conductoresDia[0]?.turno    ?? null,
      servicio: conductoresDia[0]?.servicio ?? null,
    };

    const key = `${agencyId}_${idBus}`;
    if (!accMap[key]) {
      accMap[key] = {
        agencyId, empresa, idBus,
        marca: vehicleInfo?.marca ?? null,
        tipo:  vehicleInfo?.tipo  ?? null,
        total: 0, enTiempo: 0, atrasado: 0, adelantado: 0,
        desviaciones: [], velocidades: [],
        lineasSet: new Set(), ultimaActividad: today,
        ultimoInterno: null, ultimoNombre: null,
        conductoresKnown: new Set(), totalJornales: 0,
        historial: [],
      };
    }
    const acc = accMap[key];
    acc.total          += dTotal;
    acc.enTiempo       += dEnTiempo;
    acc.atrasado       += dAtrasado;
    acc.adelantado     += dAdelantado;
    acc.totalJornales  += jornalesDia;
    acc.desviaciones.push(...dDesv);
    acc.velocidades.push(...dVels);
    dLineas.forEach(l => acc.lineasSet.add(l));
    conductoresDia.forEach(c => {
      if (c.interno) {
        acc.conductoresKnown.add(c.interno);
        acc.ultimoInterno = c.interno;
        acc.ultimoNombre  = c.nombre;
      }
    });
    acc.historial.push(diaStats);
  }

  console.log(`[vehicleStats] ${empresa}: ${Object.keys(accMap).length} buses con datos hoy`);
  return accMap;
}

async function autoRegistrarNuevos(
  db: admin.firestore.Firestore,
  allAccMap: Record<string, VehicleAcc>,
  marcaMap: Record<string, { marca: string | null; tipo: string | null }>,
  today: string,
): Promise<void> {
  const vehiclesColl = db.collection('vehicles');
  const nuevos: Array<{ key: string; acc: VehicleAcc }> = [];

  for (const [key, acc] of Object.entries(allAccMap)) {
    const mapKey1 = `${acc.agencyId}_${acc.idBus}`;
    const mapKey2 = acc.idBus;
    if (!marcaMap[mapKey1] && !marcaMap[mapKey2]) {
      nuevos.push({ key, acc });
    }
  }

  if (nuevos.length === 0) return;

  console.log(`[vehicleStats] Auto-registrando ${nuevos.length} coches nuevos detectados por GPS`);

  // Escribir en lotes de 400
  for (let i = 0; i < nuevos.length; i += 400) {
    const batch = db.batch();
    for (const { acc } of nuevos.slice(i, i + 400)) {
      const docId = `AUTO_${acc.agencyId}_${acc.idBus}`;
      batch.set(vehiclesColl.doc(docId), {
        agencyId:        acc.agencyId,
        empresa:         acc.empresa,
        coche:           acc.idBus,
        interno:         acc.idBus,
        marca:           null,
        tipo:            null,
        lineas:          [...acc.lineasSet].sort(),
        estado_operativo:'ACTIVO',
        activo:          true,
        auto_detected:   true,
        primera_deteccion: today,
        ultima_actividad:  today,
        pendiente_confirmacion: true,
        createdAt:       admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
  }
  console.log(`[vehicleStats] ${nuevos.length} coches nuevos registrados en vehicles (pendientes de confirmación).`);
}

async function runVehicleStatsTick(db: admin.firestore.Firestore): Promise<void> {
  const now   = new Date();
  const today = now.toISOString().slice(0, 10);
  const since = new Date(now);
  since.setUTCHours(0, 0, 0, 0);
  const sinceISO = since.toISOString();

  console.log(`[vehicleStats] Procesando ${today}`);

  // ── Cargar mapa de marcas/tipos desde vehicles collection ─────────────────
  const vehiclesSnap = await db.collection('vehicles').get();
  const marcaMap: Record<string, { marca: string | null; tipo: string | null }> = {};
  vehiclesSnap.docs.forEach(d => {
    const v = d.data();
    const coche = String(v.coche ?? v.interno ?? '');
    if (!coche) return;
    const agencyId = String(v.agencyId ?? '70');
    const info = { marca: v.marca ?? null, tipo: v.tipo ?? null };
    marcaMap[`${agencyId}_${coche}`] = info;
    marcaMap[coche] = info; // fallback sin agencyId para UCOT legacy
  });
  console.log(`[vehicleStats] Mapa de marcas cargado: ${Object.keys(marcaMap).length / 2} vehículos`);

  // ── Distribuciones UCOT del día (múltiples conductores por coche) ─────────
  const distribSnap = await db.collection('distribuciones_diarias')
    .doc(today).collection('registros').get();
  const distribByCoche: Record<string, admin.firestore.DocumentData[]> = {};
  distribSnap.docs.forEach(d => {
    const reg = d.data();
    if (!reg.coche) return;
    const key = String(reg.coche);
    (distribByCoche[key] = distribByCoche[key] ?? []).push(reg);
  });
  console.log(`[vehicleStats] Distribuciones UCOT hoy: ${distribSnap.size} registros, ${Object.keys(distribByCoche).length} coches únicos`);

  // ── Procesar todas las empresas en paralelo ───────────────────────────────
  const results = await Promise.all(
    Object.keys(AGENCIES).map(agencyId =>
      processAgency(db, agencyId, today, sinceISO, distribByCoche, marcaMap)
    )
  );

  const allAccMap: Record<string, VehicleAcc> = Object.assign({}, ...results);
  const coll = db.collection('vehicle_stats');

  // ── Auto-registrar coches nuevos detectados por GPS ───────────────────────
  await autoRegistrarNuevos(db, allAccMap, marcaMap, today);

  // ── Merge a vehicle_stats ─────────────────────────────────────────────────
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

      acc.total      += prev.totalEventos ?? 0;
      acc.enTiempo   += Math.round(((prev.pctEnTiempo  ?? 0) / 100) * (prev.totalEventos ?? 0));
      acc.atrasado   += Math.round(((prev.pctAtrasado  ?? 0) / 100) * (prev.totalEventos ?? 0));
      acc.adelantado += Math.round(((prev.pctAdelantado ?? 0) / 100) * (prev.totalEventos ?? 0));
      acc.totalJornales += prev.totalJornales ?? 0;
      (prev.lineasOperadas ?? []).forEach((l: string) => acc.lineasSet.add(l));
      (prev.conductoresConocidos ?? []).forEach((i: number) => acc.conductoresKnown.add(i));

      if (!acc.ultimoInterno && prev.ultimoInterno) {
        acc.ultimoInterno = prev.ultimoInterno;
        acc.ultimoNombre  = prev.ultimoNombre;
      }
      // Preservar marca si ya estaba y ahora no la tenemos en marcaMap
      if (!acc.marca && prev.marca) acc.marca = prev.marca;
      if (!acc.tipo  && prev.tipo)  acc.tipo  = prev.tipo;
    }

    const con = acc.enTiempo + acc.atrasado + acc.adelantado;
    await coll.doc(key).set({
      agencyId:             acc.agencyId,
      empresa:              acc.empresa,
      idBus:                acc.idBus,
      marca:                acc.marca,
      tipo:                 acc.tipo,
      diasActivos:          mergedHistorial.length,
      totalEventos:         acc.total,
      totalJornales:        acc.totalJornales,
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
