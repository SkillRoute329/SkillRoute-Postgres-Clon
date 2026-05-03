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
exports.vehicleStatsTick = void 0;
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
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const AGENCIES = {
    '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT',
};
const UCOT_AGENCY = '70';
const MIN_EVENTOS = 3;
function pct(num, total) {
    return total > 0 ? Math.round(num / total * 1000) / 10 : 0;
}
function avg(arr) {
    return arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null;
}
async function processAgency(db, agencyId, today, sinceISO, distribByCoche) {
    var _a, _b, _c, _d, _e, _f;
    const empresa = (_a = AGENCIES[agencyId]) !== null && _a !== void 0 ? _a : agencyId;
    const snap = await db.collection('vehicle_events')
        .where('agencyId', '==', agencyId)
        .where('timestampGPS', '>=', sinceISO)
        .orderBy('timestampGPS', 'desc')
        .limit(8000)
        .get();
    if (snap.empty)
        return {};
    // Agrupar por idBus
    const byBus = {};
    snap.docs.forEach(d => {
        var _a, _b;
        const e = d.data();
        const id = String((_a = e.idBus) !== null && _a !== void 0 ? _a : '');
        if (!id)
            return;
        (byBus[id] = (_b = byBus[id]) !== null && _b !== void 0 ? _b : []).push(e);
    });
    const accMap = {};
    for (const [idBus, evs] of Object.entries(byBus)) {
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
        // Enriquecimiento conductor (solo UCOT)
        const reg = agencyId === UCOT_AGENCY ? distribByCoche[idBus] : undefined;
        const interno = (_b = reg === null || reg === void 0 ? void 0 : reg.interno) !== null && _b !== void 0 ? _b : null;
        const nombre = (_c = reg === null || reg === void 0 ? void 0 : reg.nombre) !== null && _c !== void 0 ? _c : null;
        const turno = (_d = reg === null || reg === void 0 ? void 0 : reg.turno) !== null && _d !== void 0 ? _d : null;
        const servicio = (_e = reg === null || reg === void 0 ? void 0 : reg.servicio) !== null && _e !== void 0 ? _e : null;
        const diaStats = {
            fecha: today, totalEventos: dTotal,
            pctEnTiempo: pct(dEnTiempo, dCon),
            pctAtrasado: pct(dAtrasado, dCon),
            pctAdelantado: pct(dAdelantado, dCon),
            velocidadMedia: (_f = avg(dVels)) !== null && _f !== void 0 ? _f : 0,
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
        acc.total += dTotal;
        acc.enTiempo += dEnTiempo;
        acc.atrasado += dAtrasado;
        acc.adelantado += dAdelantado;
        acc.desviaciones.push(...dDesv);
        acc.velocidades.push(...dVels);
        dLineas.forEach(l => acc.lineasSet.add(l));
        if (interno) {
            acc.conductoresKnown.add(interno);
            acc.ultimoInterno = interno;
            acc.ultimoNombre = nombre;
        }
        acc.historial.push(diaStats);
    }
    console.log(`[vehicleStats] ${empresa}: ${Object.keys(accMap).length} buses con datos hoy`);
    return accMap;
}
async function runVehicleStatsTick(db) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const since = new Date(now);
    since.setUTCHours(0, 0, 0, 0);
    const sinceISO = since.toISOString();
    console.log(`[vehicleStats] Procesando ${today}`);
    // Cargar distribuciones UCOT del día (enriquecimiento)
    const distribSnap = await db.collection('distribuciones_diarias')
        .doc(today).collection('registros').get();
    const distribByCoche = {};
    distribSnap.docs.forEach(d => {
        const reg = d.data();
        if (reg.coche)
            distribByCoche[String(reg.coche)] = reg;
    });
    console.log(`[vehicleStats] Distribuciones UCOT hoy: ${distribSnap.size} coches`);
    // Procesar todas las empresas en paralelo
    const results = await Promise.all(Object.keys(AGENCIES).map(agencyId => processAgency(db, agencyId, today, sinceISO, distribByCoche)));
    const allAccMap = Object.assign({}, ...results);
    const coll = db.collection('vehicle_stats');
    for (const [key, acc] of Object.entries(allAccMap)) {
        const existing = await coll.doc(key).get();
        let mergedHistorial = acc.historial;
        if (existing.exists) {
            const prev = existing.data();
            const prevHistorial = ((_a = prev.historial) !== null && _a !== void 0 ? _a : []).filter((h) => h.fecha !== today);
            mergedHistorial = [...prevHistorial, ...acc.historial]
                .sort((a, b) => a.fecha.localeCompare(b.fecha));
            // Acumular sobre totales históricos
            acc.total += (_b = prev.totalEventos) !== null && _b !== void 0 ? _b : 0;
            acc.enTiempo += Math.round((((_c = prev.pctEnTiempo) !== null && _c !== void 0 ? _c : 0) / 100) * ((_d = prev.totalEventos) !== null && _d !== void 0 ? _d : 0));
            acc.atrasado += Math.round((((_e = prev.pctAtrasado) !== null && _e !== void 0 ? _e : 0) / 100) * ((_f = prev.totalEventos) !== null && _f !== void 0 ? _f : 0));
            acc.adelantado += Math.round((((_g = prev.pctAdelantado) !== null && _g !== void 0 ? _g : 0) / 100) * ((_h = prev.totalEventos) !== null && _h !== void 0 ? _h : 0));
            ((_j = prev.lineasOperadas) !== null && _j !== void 0 ? _j : []).forEach((l) => acc.lineasSet.add(l));
            ((_k = prev.conductoresConocidos) !== null && _k !== void 0 ? _k : []).forEach((i) => acc.conductoresKnown.add(i));
            // Mantener último conductor conocido si hoy no tenemos
            if (!acc.ultimoInterno && prev.ultimoInterno) {
                acc.ultimoInterno = prev.ultimoInterno;
                acc.ultimoNombre = prev.ultimoNombre;
            }
        }
        const con = acc.enTiempo + acc.atrasado + acc.adelantado;
        await coll.doc(key).set({
            agencyId: acc.agencyId,
            empresa: acc.empresa,
            idBus: acc.idBus,
            diasActivos: mergedHistorial.length,
            totalEventos: acc.total,
            pctEnTiempo: pct(acc.enTiempo, con),
            pctAtrasado: pct(acc.atrasado, con),
            pctAdelantado: pct(acc.adelantado, con),
            pctSinHorario: pct(acc.total - con, acc.total),
            velocidadMedia: (_l = avg(acc.velocidades)) !== null && _l !== void 0 ? _l : 0,
            desviacionMediaMin: avg(acc.desviaciones),
            lineasOperadas: [...acc.lineasSet].sort(),
            ultimaActividad: today,
            ultimoInterno: acc.ultimoInterno,
            ultimoNombre: acc.ultimoNombre,
            conductoresConocidos: [...acc.conductoresKnown].sort(),
            historial: mergedHistorial,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: false });
    }
    console.log(`[vehicleStats] Completado: ${Object.keys(allAccMap).length} buses actualizados.`);
}
exports.vehicleStatsTick = functions.pubsub
    .schedule('45 23 * * *')
    .timeZone('America/Montevideo')
    .onRun(async () => {
    const db = admin.firestore();
    await runVehicleStatsTick(db);
    return null;
});
