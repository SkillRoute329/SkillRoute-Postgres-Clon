"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.conductorStatsTick = void 0;
/**
 * conductorStatsTick — Cruza vehicle_events del día con distribuciones_diarias
 * para atribuir estadísticas de OTP a cada conductor.
 *
 * Cron: diario 23:30 hora Montevideo.
 * Colección destino: conductor_stats/{agencyId}_{interno}
 * Merge incremental: acumula historial por día, recalcula agregados.
 */
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const AGENCY_ID = '70';
const MIN_EVENTOS = 5; // mínimo de pings GPS para considerar un turno válido
function pct(num, total) {
    return total > 0 ? Math.round(num / total * 1000) / 10 : 0;
}
function avg(arr) {
    return arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null;
}
async function processConductorStats(db) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    // Ventana: desde las 00:00 de hoy (UTC)
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
    if (evSnap.empty)
        return;
    // Agrupar por idBus
    const byBus = {};
    evSnap.docs.forEach(d => {
        var _a, _b;
        const e = d.data();
        const id = String((_a = e.idBus) !== null && _a !== void 0 ? _a : '');
        if (!id)
            return;
        (byBus[id] = (_b = byBus[id]) !== null && _b !== void 0 ? _b : []).push(e);
    });
    // ── 2. Distribuciones del día ────────────────────────────────────────────
    const distribSnap = await db.collection('distribuciones_diarias')
        .doc(today)
        .collection('registros')
        .get();
    const distribByCoche = {};
    distribSnap.docs.forEach(d => {
        const reg = d.data();
        if (reg.coche)
            distribByCoche[String(reg.coche)] = reg;
    });
    console.log(`[conductorStats] Distribuciones/${today}: ${distribSnap.size} coches`);
    // ── 3. Cruzar bus → conductor, calcular métricas del día ─────────────────
    const conductores = {};
    for (const [idBus, evs] of Object.entries(byBus)) {
        const reg = distribByCoche[idBus];
        if (!reg)
            continue;
        const interno = reg.interno;
        if (!interno)
            continue;
        let dTotal = 0, dEnTiempo = 0, dAtrasado = 0, dAdelantado = 0;
        const dDesv = [], dVels = [];
        const dLineas = new Set();
        for (const ev of evs) {
            dTotal++;
            if (ev.estadoCumplimiento === 'EN_TIEMPO')
                dEnTiempo++;
            else if (ev.estadoCumplimiento === 'ATRASADO')
                dAtrasado++;
            else if (ev.estadoCumplimiento === 'ADELANTADO')
                dAdelantado++;
            if (typeof ev.desviacionMin === 'number')
                dDesv.push(ev.desviacionMin);
            if (typeof ev.velocidad === 'number' && ev.velocidad > 0)
                dVels.push(ev.velocidad);
            if (ev.linea)
                dLineas.add(String(ev.linea));
        }
        if (dTotal < MIN_EVENTOS)
            continue;
        const dCon = dEnTiempo + dAtrasado + dAdelantado;
        const diaStats = {
            fecha: today, coche: idBus,
            turno: (_a = reg.turno) !== null && _a !== void 0 ? _a : null, servicio: (_b = reg.servicio) !== null && _b !== void 0 ? _b : null,
            totalEventos: dTotal,
            pctEnTiempo: pct(dEnTiempo, dCon),
            pctAtrasado: pct(dAtrasado, dCon),
            pctAdelantado: pct(dAdelantado, dCon),
            velocidadMedia: (_c = avg(dVels)) !== null && _c !== void 0 ? _c : 0,
            desviacionMediaMin: avg(dDesv),
            lineas: [...dLineas].sort(),
        };
        const key = `${AGENCY_ID}_${interno}`;
        if (!conductores[key]) {
            conductores[key] = {
                agencyId: AGENCY_ID, interno, nombre: (_d = reg.nombre) !== null && _d !== void 0 ? _d : '',
                total: 0, enTiempo: 0, atrasado: 0, adelantado: 0,
                desviaciones: [], velocidades: [],
                coches: new Set(), lineas: new Set(),
                ultimaActividad: today, historial: [],
            };
        }
        const acc = conductores[key];
        acc.total += dTotal;
        acc.enTiempo += dEnTiempo;
        acc.atrasado += dAtrasado;
        acc.adelantado += dAdelantado;
        acc.desviaciones.push(...dDesv);
        acc.velocidades.push(...dVels);
        acc.coches.add(idBus);
        dLineas.forEach(l => acc.lineas.add(l));
        acc.historial.push(diaStats);
    }
    console.log(`[conductorStats] Conductores con datos hoy: ${Object.keys(conductores).length}`);
    // ── 4. Merge a conductor_stats (acumulación incremental) ──────────────────
    const coll = db.collection('conductor_stats');
    for (const [key, acc] of Object.entries(conductores)) {
        const existing = await coll.doc(key).get();
        let mergedHistorial = acc.historial;
        if (existing.exists) {
            const prev = existing.data();
            // Mantener historial anterior, reemplazando el día de hoy si ya existe
            const prevHistorial = ((_e = prev.historial) !== null && _e !== void 0 ? _e : []).filter((h) => h.fecha !== today);
            mergedHistorial = [...prevHistorial, ...acc.historial]
                .sort((a, b) => a.fecha.localeCompare(b.fecha));
            // Re-acumular sobre historial completo para consistencia
            acc.total += (_f = prev.totalEventos) !== null && _f !== void 0 ? _f : 0;
            acc.enTiempo += Math.round((((_g = prev.pctEnTiempo) !== null && _g !== void 0 ? _g : 0) / 100) * ((_h = prev.totalEventos) !== null && _h !== void 0 ? _h : 0));
            acc.atrasado += Math.round((((_j = prev.pctAtrasado) !== null && _j !== void 0 ? _j : 0) / 100) * ((_k = prev.totalEventos) !== null && _k !== void 0 ? _k : 0));
            acc.adelantado += Math.round((((_l = prev.pctAdelantado) !== null && _l !== void 0 ? _l : 0) / 100) * ((_m = prev.totalEventos) !== null && _m !== void 0 ? _m : 0));
            ((_o = prev.cochesOperados) !== null && _o !== void 0 ? _o : []).forEach((c) => acc.coches.add(c));
            ((_p = prev.lineasOperadas) !== null && _p !== void 0 ? _p : []).forEach((l) => acc.lineas.add(l));
        }
        const con = acc.enTiempo + acc.atrasado + acc.adelantado;
        await coll.doc(key).set({
            agencyId: acc.agencyId,
            interno: acc.interno,
            nombre: acc.nombre,
            diasActivos: mergedHistorial.length,
            totalEventos: acc.total,
            pctEnTiempo: pct(acc.enTiempo, con),
            pctAtrasado: pct(acc.atrasado, con),
            pctAdelantado: pct(acc.adelantado, con),
            pctSinHorario: pct(acc.total - con, acc.total),
            velocidadMedia: (_q = avg(acc.velocidades)) !== null && _q !== void 0 ? _q : 0,
            desviacionMediaMin: avg(acc.desviaciones),
            cochesOperados: [...acc.coches].sort(),
            lineasOperadas: [...acc.lineas].sort(),
            ultimaActividad: today,
            historial: mergedHistorial,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: false });
    }
    console.log(`[conductorStats] Completado: ${Object.keys(conductores).length} conductores actualizados.`);
}
// ── Export: cron diario 23:30 Montevideo ─────────────────────────────────────
exports.conductorStatsTick = functions.pubsub
    .schedule('30 23 * * *')
    .timeZone('America/Montevideo')
    .onRun(async () => {
    const db = admin.firestore();
    await processConductorStats(db);
    return null;
});
