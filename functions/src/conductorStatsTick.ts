/**
 * conductorStatsTick — Cruza vehicle_events del día con distribuciones_diarias
 * para atribuir estadísticas de OTP a cada conductor.
 *
 * Regla de negocio: un coche puede tener 1, 2 o 3 conductores por día (turnos).
 * Cada conductor en distribuciones_diarias recibe su propia entrada en conductor_stats.
 * Todos los conductores que manejaron el mismo coche ese día comparten los stats GPS
 * del coche (no podemos dividir por turno sin horarios exactos de cada turno).
 *
 * Cron: diario 23:30 hora Montevideo.
 * Colección destino: conductor_stats/{agencyId}_{interno}
 * Merge incremental: acumula historial por día, recalcula agregados.
 */
import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const AGENCY_ID     = '70';
const MIN_EVENTOS   = 5;

interface DiaStats {
  fecha: string;
  coche: string;
  turno: string | null;
  servicio: number | null;
  totalEventos: number;
  pctEnTiempo: number;
  pctAtrasado: number;
  pctAdelantado: number;
  velocidadMedia: number;
  desviacionMediaMin: number | null;
  lineas: string[];
}

interface ConductorAcc {
  agencyId: string;
  interno: number;
  nombre: string;
  total: number;
  enTiempo: number;
  atrasado: number;
  adelantado: number;
  desviaciones: number[];
  velocidades: number[];
  coches: Set<string>;
  lineas: Set<string>;
  ultimaActividad: string;
  historial: DiaStats[];
}

function pct(num: number, total: number): number {
  return total > 0 ? Math.round(num / total * 1000) / 10 : 0;
}
function avg(arr: number[]): number | null {
  return arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null;
}

async function processConductorStats(db: admin.firestore.Firestore): Promise<void> {
  const now   = new Date();
  const today = now.toISOString().slice(0, 10);

  const since = new Date(now);
  since.setUTCHours(0, 0, 0, 0);
  const sinceISO = since.toISOString();

  console.log(`[conductorStats] Procesando ${today}, desde ${sinceISO}`);

  // ── 1. vehicle_events de hoy para UCOT ──────────────────────────────────
  const evSnap = await db.collection('vehicle_events')
    .where('agencyId', '==', AGENCY_ID)
    .where('timestampGPS', '>=', sinceISO)
    .orderBy('timestampGPS', 'desc')
    .limit(5000)
    .get();

  console.log(`[conductorStats] vehicle_events hoy: ${evSnap.size}`);
  if (evSnap.empty) return;

  // Agrupar GPS por idBus
  const byBus: Record<string, admin.firestore.DocumentData[]> = {};
  evSnap.docs.forEach(d => {
    const e = d.data();
    const id = String(e.idBus ?? '');
    if (!id) return;
    (byBus[id] = byBus[id] ?? []).push(e);
  });

  // ── 2. Distribuciones del día — múltiples conductores por coche ──────────
  const distribSnap = await db.collection('distribuciones_diarias')
    .doc(today)
    .collection('registros')
    .get();

  // Lista de registros por coche (1, 2 o 3 conductores posibles)
  const distribByCoche: Record<string, admin.firestore.DocumentData[]> = {};
  distribSnap.docs.forEach(d => {
    const reg = d.data();
    if (!reg.coche) return;
    const key = String(reg.coche);
    (distribByCoche[key] = distribByCoche[key] ?? []).push(reg);
  });

  console.log(`[conductorStats] Distribuciones/${today}: ${distribSnap.size} registros, ${Object.keys(distribByCoche).length} coches únicos`);

  // ── 3. Cruzar bus → conductores, calcular métricas del día ───────────────
  const conductores: Record<string, ConductorAcc> = {};

  for (const [idBus, evs] of Object.entries(byBus)) {
    const regs = distribByCoche[idBus];
    if (!regs || regs.length === 0) continue;

    // Calcular stats GPS del coche para este día (compartidas entre todos sus conductores)
    let dTotal = 0, dEnTiempo = 0, dAtrasado = 0, dAdelantado = 0;
    const dDesv: number[] = [], dVels: number[] = [];
    const dLineas = new Set<string>();

    for (const ev of evs) {
      // FUERA_DE_SERVICIO excluido del denominador (política OTP unificada,
      // docs/POLITICA_OTP_UNIFICADA.md).
      if (ev.estadoCumplimiento === 'FUERA_DE_SERVICIO') continue;
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

    // Cada conductor que manejó este coche hoy recibe su jornal con los stats del coche
    for (const reg of regs) {
      const interno: number = reg.interno;
      if (!interno) continue;

      const diaStats: DiaStats = {
        fecha: today, coche: idBus,
        turno: reg.turno ?? null, servicio: reg.servicio ?? null,
        totalEventos:    dTotal,
        pctEnTiempo:     pct(dEnTiempo,  dCon),
        pctAtrasado:     pct(dAtrasado,  dCon),
        pctAdelantado:   pct(dAdelantado, dCon),
        velocidadMedia:  avg(dVels) ?? 0,
        desviacionMediaMin: avg(dDesv),
        lineas: [...dLineas].sort(),
      };

      const key = `${AGENCY_ID}_${interno}`;
      if (!conductores[key]) {
        conductores[key] = {
          agencyId: AGENCY_ID, interno, nombre: reg.nombre ?? '',
          total: 0, enTiempo: 0, atrasado: 0, adelantado: 0,
          desviaciones: [], velocidades: [],
          coches: new Set(), lineas: new Set(),
          ultimaActividad: today, historial: [],
        };
      }
      const acc = conductores[key];
      acc.total       += dTotal;
      acc.enTiempo    += dEnTiempo;
      acc.atrasado    += dAtrasado;
      acc.adelantado  += dAdelantado;
      acc.desviaciones.push(...dDesv);
      acc.velocidades.push(...dVels);
      acc.coches.add(idBus);
      dLineas.forEach(l => acc.lineas.add(l));
      acc.historial.push(diaStats);
    }
  }

  console.log(`[conductorStats] Conductores con datos hoy: ${Object.keys(conductores).length}`);

  // ── 4. Merge a conductor_stats (acumulación incremental) ──────────────────
  const coll = db.collection('conductor_stats');

  for (const [key, acc] of Object.entries(conductores)) {
    const existing = await coll.doc(key).get();
    let mergedHistorial: DiaStats[] = acc.historial;

    if (existing.exists) {
      const prev = existing.data()!;
      const prevHistorial: DiaStats[] = (prev.historial ?? []).filter(
        (h: DiaStats) => h.fecha !== today
      );
      mergedHistorial = [...prevHistorial, ...acc.historial]
        .sort((a, b) => a.fecha.localeCompare(b.fecha));

      acc.total      += prev.totalEventos ?? 0;
      acc.enTiempo   += Math.round(((prev.pctEnTiempo  ?? 0) / 100) * (prev.totalEventos ?? 0));
      acc.atrasado   += Math.round(((prev.pctAtrasado  ?? 0) / 100) * (prev.totalEventos ?? 0));
      acc.adelantado += Math.round(((prev.pctAdelantado ?? 0) / 100) * (prev.totalEventos ?? 0));
      (prev.cochesOperados ?? []).forEach((c: string) => acc.coches.add(c));
      (prev.lineasOperadas ?? []).forEach((l: string) => acc.lineas.add(l));
    }

    const con = acc.enTiempo + acc.atrasado + acc.adelantado;
    await coll.doc(key).set({
      agencyId:           acc.agencyId,
      interno:            acc.interno,
      nombre:             acc.nombre,
      diasActivos:        mergedHistorial.length,   // = total jornales trabajados
      totalEventos:       acc.total,
      pctEnTiempo:        pct(acc.enTiempo,  con),
      pctAtrasado:        pct(acc.atrasado,  con),
      pctAdelantado:      pct(acc.adelantado, con),
      pctSinHorario:      pct(acc.total - con, acc.total),
      velocidadMedia:     avg(acc.velocidades) ?? 0,
      desviacionMediaMin: avg(acc.desviaciones),
      cochesOperados:     [...acc.coches].sort(),
      lineasOperadas:     [...acc.lineas].sort(),
      ultimaActividad:    today,
      historial:          mergedHistorial,
      updatedAt:          admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: false });
  }

  console.log(`[conductorStats] Completado: ${Object.keys(conductores).length} conductores actualizados.`);
}

export const conductorStatsTick = functions.pubsub
  .schedule('30 23 * * *')
  .timeZone('America/Montevideo')
  .onRun(async () => {
    const db = admin.firestore();
    await processConductorStats(db);
    return null;
  });
