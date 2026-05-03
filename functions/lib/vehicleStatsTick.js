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
async function processAgency(db, agencyId, today, sinceISO, distribByCoche, marcaMap) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
    const empresa = (_a = AGENCIES[agencyId]) !== null && _a !== void 0 ? _a : agencyId;
    const snap = await db.collection('vehicle_events')
        .where('agencyId', '==', agencyId)
        .where('timestampGPS', '>=', sinceISO)
        .orderBy('timestampGPS', 'desc')
        .limit(8000)
        .get();
    if (snap.empty)
        return {};
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
        // Enriquecimiento conductores UCOT (1-3 por coche)
        const regs = agencyId === UCOT_AGENCY ? ((_b = distribByCoche[idBus]) !== null && _b !== void 0 ? _b : []) : [];
        const conductoresDia = regs.map(r => {
            var _a, _b, _c, _d;
            return ({
                interno: (_a = r.interno) !== null && _a !== void 0 ? _a : null,
                nombre: (_b = r.nombre) !== null && _b !== void 0 ? _b : null,
                turno: (_c = r.turno) !== null && _c !== void 0 ? _c : null,
                servicio: (_d = r.servicio) !== null && _d !== void 0 ? _d : null,
            });
        });
        const jornalesDia = conductoresDia.length;
        // Enriquecimiento modelo — clave agencyId_idBus, fallback solo idBus (UCOT legacy)
        const vehicleInfo = (_d = (_c = marcaMap[`${agencyId}_${idBus}`]) !== null && _c !== void 0 ? _c : marcaMap[idBus]) !== null && _d !== void 0 ? _d : null;
        const diaStats = {
            fecha: today, totalEventos: dTotal,
            pctEnTiempo: pct(dEnTiempo, dCon),
            pctAtrasado: pct(dAtrasado, dCon),
            pctAdelantado: pct(dAdelantado, dCon),
            velocidadMedia: (_e = avg(dVels)) !== null && _e !== void 0 ? _e : 0,
            desviacionMediaMin: avg(dDesv),
            lineas: [...dLineas].sort(),
            conductoresDia,
            jornalesDia,
            interno: (_g = (_f = conductoresDia[0]) === null || _f === void 0 ? void 0 : _f.interno) !== null && _g !== void 0 ? _g : null,
            nombre: (_j = (_h = conductoresDia[0]) === null || _h === void 0 ? void 0 : _h.nombre) !== null && _j !== void 0 ? _j : null,
            turno: (_l = (_k = conductoresDia[0]) === null || _k === void 0 ? void 0 : _k.turno) !== null && _l !== void 0 ? _l : null,
            servicio: (_o = (_m = conductoresDia[0]) === null || _m === void 0 ? void 0 : _m.servicio) !== null && _o !== void 0 ? _o : null,
        };
        const key = `${agencyId}_${idBus}`;
        if (!accMap[key]) {
            accMap[key] = {
                agencyId, empresa, idBus,
                marca: (_p = vehicleInfo === null || vehicleInfo === void 0 ? void 0 : vehicleInfo.marca) !== null && _p !== void 0 ? _p : null,
                tipo: (_q = vehicleInfo === null || vehicleInfo === void 0 ? void 0 : vehicleInfo.tipo) !== null && _q !== void 0 ? _q : null,
                total: 0, enTiempo: 0, atrasado: 0, adelantado: 0,
                desviaciones: [], velocidades: [],
                lineasSet: new Set(), ultimaActividad: today,
                ultimoInterno: null, ultimoNombre: null,
                conductoresKnown: new Set(), totalJornales: 0,
                historial: [],
            };
        }
        const acc = accMap[key];
        acc.total += dTotal;
        acc.enTiempo += dEnTiempo;
        acc.atrasado += dAtrasado;
        acc.adelantado += dAdelantado;
        acc.totalJornales += jornalesDia;
        acc.desviaciones.push(...dDesv);
        acc.velocidades.push(...dVels);
        dLineas.forEach(l => acc.lineasSet.add(l));
        conductoresDia.forEach(c => {
            if (c.interno) {
                acc.conductoresKnown.add(c.interno);
                acc.ultimoInterno = c.interno;
                acc.ultimoNombre = c.nombre;
            }
        });
        acc.historial.push(diaStats);
    }
    console.log(`[vehicleStats] ${empresa}: ${Object.keys(accMap).length} buses con datos hoy`);
    return accMap;
}
async function autoRegistrarNuevos(db, allAccMap, marcaMap, today) {
    const vehiclesColl = db.collection('vehicles');
    const nuevos = [];
    for (const [key, acc] of Object.entries(allAccMap)) {
        const mapKey1 = `${acc.agencyId}_${acc.idBus}`;
        const mapKey2 = acc.idBus;
        if (!marcaMap[mapKey1] && !marcaMap[mapKey2]) {
            nuevos.push({ key, acc });
        }
    }
    if (nuevos.length === 0)
        return;
    console.log(`[vehicleStats] Auto-registrando ${nuevos.length} coches nuevos detectados por GPS`);
    // Escribir en lotes de 400
    for (let i = 0; i < nuevos.length; i += 400) {
        const batch = db.batch();
        for (const { acc } of nuevos.slice(i, i + 400)) {
            const docId = `AUTO_${acc.agencyId}_${acc.idBus}`;
            batch.set(vehiclesColl.doc(docId), {
                agencyId: acc.agencyId,
                empresa: acc.empresa,
                coche: acc.idBus,
                interno: acc.idBus,
                marca: null,
                tipo: null,
                lineas: [...acc.lineasSet].sort(),
                estado_operativo: 'ACTIVO',
                activo: true,
                auto_detected: true,
                primera_deteccion: today,
                ultima_actividad: today,
                pendiente_confirmacion: true,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
        await batch.commit();
    }
    console.log(`[vehicleStats] ${nuevos.length} coches nuevos registrados en vehicles (pendientes de confirmación).`);
}
async function runVehicleStatsTick(db) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const since = new Date(now);
    since.setUTCHours(0, 0, 0, 0);
    const sinceISO = since.toISOString();
    console.log(`[vehicleStats] Procesando ${today}`);
    // ── Cargar mapa de marcas/tipos desde vehicles collection ─────────────────
    const vehiclesSnap = await db.collection('vehicles').get();
    const marcaMap = {};
    vehiclesSnap.docs.forEach(d => {
        var _a, _b, _c, _d, _e;
        const v = d.data();
        const coche = String((_b = (_a = v.coche) !== null && _a !== void 0 ? _a : v.interno) !== null && _b !== void 0 ? _b : '');
        if (!coche)
            return;
        const agencyId = String((_c = v.agencyId) !== null && _c !== void 0 ? _c : '70');
        const info = { marca: (_d = v.marca) !== null && _d !== void 0 ? _d : null, tipo: (_e = v.tipo) !== null && _e !== void 0 ? _e : null };
        marcaMap[`${agencyId}_${coche}`] = info;
        marcaMap[coche] = info; // fallback sin agencyId para UCOT legacy
    });
    console.log(`[vehicleStats] Mapa de marcas cargado: ${Object.keys(marcaMap).length / 2} vehículos`);
    // ── Distribuciones UCOT del día (múltiples conductores por coche) ─────────
    const distribSnap = await db.collection('distribuciones_diarias')
        .doc(today).collection('registros').get();
    const distribByCoche = {};
    distribSnap.docs.forEach(d => {
        var _a;
        const reg = d.data();
        if (!reg.coche)
            return;
        const key = String(reg.coche);
        (distribByCoche[key] = (_a = distribByCoche[key]) !== null && _a !== void 0 ? _a : []).push(reg);
    });
    console.log(`[vehicleStats] Distribuciones UCOT hoy: ${distribSnap.size} registros, ${Object.keys(distribByCoche).length} coches únicos`);
    // ── Procesar todas las empresas en paralelo ───────────────────────────────
    const results = await Promise.all(Object.keys(AGENCIES).map(agencyId => processAgency(db, agencyId, today, sinceISO, distribByCoche, marcaMap)));
    const allAccMap = Object.assign({}, ...results);
    const coll = db.collection('vehicle_stats');
    // ── Auto-registrar coches nuevos detectados por GPS ───────────────────────
    await autoRegistrarNuevos(db, allAccMap, marcaMap, today);
    // ── Merge a vehicle_stats ─────────────────────────────────────────────────
    for (const [key, acc] of Object.entries(allAccMap)) {
        const existing = await coll.doc(key).get();
        let mergedHistorial = acc.historial;
        if (existing.exists) {
            const prev = existing.data();
            const prevHistorial = ((_a = prev.historial) !== null && _a !== void 0 ? _a : []).filter((h) => h.fecha !== today);
            mergedHistorial = [...prevHistorial, ...acc.historial]
                .sort((a, b) => a.fecha.localeCompare(b.fecha));
            acc.total += (_b = prev.totalEventos) !== null && _b !== void 0 ? _b : 0;
            acc.enTiempo += Math.round((((_c = prev.pctEnTiempo) !== null && _c !== void 0 ? _c : 0) / 100) * ((_d = prev.totalEventos) !== null && _d !== void 0 ? _d : 0));
            acc.atrasado += Math.round((((_e = prev.pctAtrasado) !== null && _e !== void 0 ? _e : 0) / 100) * ((_f = prev.totalEventos) !== null && _f !== void 0 ? _f : 0));
            acc.adelantado += Math.round((((_g = prev.pctAdelantado) !== null && _g !== void 0 ? _g : 0) / 100) * ((_h = prev.totalEventos) !== null && _h !== void 0 ? _h : 0));
            acc.totalJornales += (_j = prev.totalJornales) !== null && _j !== void 0 ? _j : 0;
            ((_k = prev.lineasOperadas) !== null && _k !== void 0 ? _k : []).forEach((l) => acc.lineasSet.add(l));
            ((_l = prev.conductoresConocidos) !== null && _l !== void 0 ? _l : []).forEach((i) => acc.conductoresKnown.add(i));
            if (!acc.ultimoInterno && prev.ultimoInterno) {
                acc.ultimoInterno = prev.ultimoInterno;
                acc.ultimoNombre = prev.ultimoNombre;
            }
            // Preservar marca si ya estaba y ahora no la tenemos en marcaMap
            if (!acc.marca && prev.marca)
                acc.marca = prev.marca;
            if (!acc.tipo && prev.tipo)
                acc.tipo = prev.tipo;
        }
        const con = acc.enTiempo + acc.atrasado + acc.adelantado;
        await coll.doc(key).set({
            agencyId: acc.agencyId,
            empresa: acc.empresa,
            idBus: acc.idBus,
            marca: acc.marca,
            tipo: acc.tipo,
            diasActivos: mergedHistorial.length,
            totalEventos: acc.total,
            totalJornales: acc.totalJornales,
            pctEnTiempo: pct(acc.enTiempo, con),
            pctAtrasado: pct(acc.atrasado, con),
            pctAdelantado: pct(acc.adelantado, con),
            pctSinHorario: pct(acc.total - con, acc.total),
            velocidadMedia: (_m = avg(acc.velocidades)) !== null && _m !== void 0 ? _m : 0,
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
