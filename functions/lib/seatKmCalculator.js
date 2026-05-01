"use strict";
/**
 * seatKmCalculator — Market Share por oferta (seat-km) cross-operador.
 *
 * Metodología:
 *   seat_km = viajes_GTFS × longitud_shape_km × capacidad_empresa
 *
 * Cron:  6:00 AM UTC diario (03:00 AM Montevideo).
 * HTTP:  GET /seatKmCalculatorNow?date=YYYY-MM-DD — recálculo manual.
 * HTTP:  GET /seatKmSnapshotQuery?date=YYYY-MM-DD — consulta snapshot guardado.
 *
 * Colecciones leídas:  gtfs_timetable, shapes_cross_operator
 * Colecciones escritas: seat_km_snapshot/{YYYY-MM-DD}
 *
 * Asunciones documentadas:
 *  1. Cada viaje programado en el GTFS se ejecuta completamente.
 *  2. Capacidad de asientos por empresa es un promedio fijo (configurable).
 *  3. Fuente de viajes = gtfs_timetable.viajes.length para el tipo de día.
 *  4. Fuente de km = shapes_cross_operator.lengthMeters.
 *  5. Este indicador mide OFERTA (seat-km disponibles), no demanda real.
 */
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
exports.seatKmSnapshotQuery = exports.seatKmCalculatorNow = exports.seatKmCalculatorCron = void 0;
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const db = admin.firestore();
// ─── Constantes ────────────────────────────────────────────────────────────────
const AGENCY_NAMES = {
    '10': 'COETC',
    '20': 'COME',
    '50': 'CUTCSA',
    '70': 'UCOT',
};
// Capacidad promedio de asientos por empresa.
// CUTCSA tiene mezcla de articulados (~120) y estándar (~80) → promedio 95.
// UCOT, COME, COETC operan flota estándar → 80/60/60.
// Fuente: estimación basada en parque vehicular STM (pendiente calibración oficial).
const CAPACITY_BY_AGENCY = {
    '10': 60, // COETC
    '20': 60, // COME
    '50': 95, // CUTCSA (mix articulado/estándar)
    '70': 80, // UCOT
};
const DEFAULT_CAPACITY = 70;
const VERSION_ASUNCIONES = 1;
// ─── Helpers ──────────────────────────────────────────────────────────────────
function getCurrentServiceType(date) {
    const day = date.getDay();
    if (day === 0)
        return 'DOMINGO';
    if (day === 6)
        return 'SABADO';
    return 'HABIL';
}
function toDateString(d) {
    return d.toISOString().split('T')[0];
}
// Convierte sentido GTFS a sentido shape.
// shapes_cross_operator usa 'IDA' y 'VUELTA'; gtfs_timetable usa directionId 0/1.
function dirToSentido(directionId) {
    return directionId === 0 ? 'IDA' : 'VUELTA';
}
// ─── Lógica principal ─────────────────────────────────────────────────────────
async function computeSeatKm(date) {
    var _a, _b, _c, _d;
    const t0 = Date.now();
    const svcType = getCurrentServiceType(date);
    const dateStr = toDateString(date);
    logger.info('[SeatKm] Calculando para fecha:', dateStr, '| svcType:', svcType);
    // 1. Cargar shapes (todas) — 1167 docs ligeros (sin points[])
    const shapesSnap = await db.collection('shapes_cross_operator').get();
    const shapesMap = new Map(); // agencyId|linea|directionId → lengthMeters
    for (const doc of shapesSnap.docs) {
        const d = doc.data();
        if (!d.lengthMeters || d.lengthMeters <= 0)
            continue;
        const dir = d.sentido === 'IDA' ? 0 : 1;
        const key = `${d.agencyId}|${d.linea}|${dir}`;
        // Si hay duplicados (IDA y VUELTA pueden repetirse), quedarse con el mayor
        if (!shapesMap.has(key) || shapesMap.get(key) < d.lengthMeters) {
            shapesMap.set(key, d.lengthMeters);
        }
    }
    logger.info('[SeatKm] Shapes cargados:', shapesMap.size);
    // 2. Cargar timetables del tipo de servicio correspondiente
    const ttSnap = await db.collection('gtfs_timetable')
        .where('serviceType', '==', svcType)
        .get();
    logger.info('[SeatKm] Timetables cargados:', ttSnap.docs.length);
    // 3. Calcular seat-km por corredor
    const corredores = [];
    for (const doc of ttSnap.docs) {
        const d = doc.data();
        if (!d.agencyId || !d.linea || !Array.isArray(d.viajes))
            continue;
        const shapeKey = `${d.agencyId}|${d.linea}|${d.directionId}`;
        const lengthM = (_a = shapesMap.get(shapeKey)) !== null && _a !== void 0 ? _a : 0;
        if (lengthM === 0)
            continue; // sin shape disponible → excluir
        const longKm = lengthM / 1000;
        const viajesEstimados = d.viajes.length;
        if (viajesEstimados === 0)
            continue;
        const capacity = (_b = CAPACITY_BY_AGENCY[d.agencyId]) !== null && _b !== void 0 ? _b : DEFAULT_CAPACITY;
        const seatKm = Math.round(viajesEstimados * longKm * capacity);
        corredores.push({
            shapeKey,
            linea: d.linea,
            agencyId: d.agencyId,
            empresa: (_c = AGENCY_NAMES[d.agencyId]) !== null && _c !== void 0 ? _c : d.agencyId,
            longKm: Math.round(longKm * 10) / 10,
            viajesEstimados,
            capacidadPromedio: capacity,
            seatKm,
            pct: 0, // rellenar tras agregación
        });
    }
    // 4. Total y pct por corredor
    const totalSeatKm = corredores.reduce((s, r) => s + r.seatKm, 0);
    for (const r of corredores) {
        r.pct = totalSeatKm > 0 ? Math.round((r.seatKm / totalSeatKm) * 10000) / 100 : 0;
    }
    // 5. Ordenar por seat-km descendente
    corredores.sort((a, b) => b.seatKm - a.seatKm);
    // 6. Agregar por empresa
    const empresaMap = new Map();
    for (const r of corredores) {
        if (!empresaMap.has(r.agencyId)) {
            empresaMap.set(r.agencyId, { seatKm: 0, viajes: 0, lineas: new Set() });
        }
        const e = empresaMap.get(r.agencyId);
        e.seatKm += r.seatKm;
        e.viajes += r.viajesEstimados;
        e.lineas.add(r.linea);
    }
    const empresas = {};
    for (const [aid, e] of empresaMap) {
        empresas[aid] = {
            seatKm: e.seatKm,
            pct: totalSeatKm > 0 ? Math.round((e.seatKm / totalSeatKm) * 10000) / 100 : 0,
            lineasActivas: e.lineas.size,
            viajesEstimados: e.viajes,
            capacidadPromedio: (_d = CAPACITY_BY_AGENCY[aid]) !== null && _d !== void 0 ? _d : DEFAULT_CAPACITY,
        };
    }
    const snapshot = {
        date: dateStr,
        svcType,
        empresas,
        total: totalSeatKm,
        lineasConDatos: corredores.length,
        corredores: corredores.slice(0, 500), // cap para no exceder límite doc Firestore
        metodologia: {
            versionAsunciones: VERSION_ASUNCIONES,
            fuenteViajes: 'gtfs_timetable.viajes.length',
            fuenteKm: 'shapes_cross_operator.lengthMeters',
            capacidadesPorEmpresa: CAPACITY_BY_AGENCY,
        },
        generadoEn: admin.firestore.FieldValue.serverTimestamp(),
    };
    logger.info('[SeatKm] Corredores calculados:', corredores.length, '| Total seat-km:', totalSeatKm.toLocaleString(), '| ms:', Date.now() - t0);
    return snapshot;
}
// ─── Exports ───────────────────────────────────────────────────────────────────
exports.seatKmCalculatorCron = (0, scheduler_1.onSchedule)({ schedule: '0 6 * * *', timeZone: 'America/Montevideo', region: 'us-central1', timeoutSeconds: 300, memory: '512MiB' }, async () => {
    try {
        const snapshot = await computeSeatKm(new Date());
        await db.collection('seat_km_snapshot').doc(snapshot.date).set(snapshot);
        logger.info('[SeatKm] Snapshot guardado:', snapshot.date);
    }
    catch (err) {
        logger.error('[SeatKm] Cron falló:', err instanceof Error ? err.message : String(err));
    }
});
exports.seatKmCalculatorNow = (0, https_1.onRequest)({ region: 'us-central1', cors: true, timeoutSeconds: 300, memory: '512MiB' }, async (req, res) => {
    try {
        const dateParam = req.query.date;
        const date = dateParam ? new Date(dateParam + 'T12:00:00Z') : new Date();
        const snapshot = await computeSeatKm(date);
        await db.collection('seat_km_snapshot').doc(snapshot.date).set(snapshot);
        res.json({
            ok: true,
            date: snapshot.date,
            svcType: snapshot.svcType,
            total: snapshot.total,
            lineasConDatos: snapshot.lineasConDatos,
            empresas: snapshot.empresas,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('[SeatKm] HTTP falló:', msg);
        res.status(500).json({ ok: false, error: msg });
    }
});
exports.seatKmSnapshotQuery = (0, https_1.onRequest)({ region: 'us-central1', cors: true, timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
    try {
        const dateParam = req.query.date;
        const dateStr = dateParam !== null && dateParam !== void 0 ? dateParam : toDateString(new Date());
        const snap = await db.collection('seat_km_snapshot').doc(dateStr).get();
        if (!snap.exists) {
            res.status(404).json({ ok: false, error: `No hay snapshot para ${dateStr}` });
            return;
        }
        res.json(Object.assign({ ok: true }, snap.data()));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ ok: false, error: msg });
    }
});
