"use strict";
/**
 * droMatrix.ts — Matriz Directional Route Overlap cross-operador
 * ===============================================================
 * MVP paso 2 (DIRECTRIZ 2026-04-24).
 *
 * Lee `shapes_cross_operator` (producido por shapeReconstruction) y para cada
 * par ordenado de shapes (A, B) calcula qué porcentaje del trazo de A está
 * cubierto por B circulando en el mismo sentido. El resultado se guarda en
 * `corridor_overlap` y es lo que consume ShadowRadar para reemplazar la
 * heurística de destino/heading.
 *
 * Método (no es Fréchet puro — es el "overlap ratio" usado por TfL/DTPM,
 * más interpretable y O(n·m) sin recursión):
 *   1. Resamplear cada shape a un punto cada RESAMPLE_INTERVAL_M metros,
 *      guardando lat/lon + bearing local del segmento.
 *   2. Para cada muestra de A buscar el segmento de B más cercano.
 *   3. Considerar "cubierto" si la distancia lateral ≤ MAX_LATERAL_M
 *      Y la diferencia de bearing ≤ MAX_BEARING_DIFF_DEG (=mismo sentido).
 *   4. pctAInB = cubiertos / total_muestras_A × 100.
 *   5. sharedKm = cubiertos × RESAMPLE_INTERVAL_M / 1000.
 *   6. Se guardan sólo los pares con pctAInB ≥ MIN_OVERLAP_PCT.
 *
 * Complejidad: O(n²·k) donde n=shapes (≈240), k=promedio de samples (~100).
 * Con 239 shapes y ~100 samples/shape: ~6M operaciones. Ejecuta en <10s.
 *
 * Cron: lunes 04:00 Mvd (después de reconstructShapesTick). HTTP manual:
 * `recomputeDroMatrixNow` con `?minOverlapPct=10` opcional.
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
exports.recomputeDroMatrixNow = exports.droMatrixTick = void 0;
exports.computeDroMatrix = computeDroMatrix;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
// ─── Constantes ────────────────────────────────────────────────────────────
const SHAPES_COLLECTION = 'shapes_cross_operator';
const OVERLAP_COLLECTION = 'corridor_overlap';
const RESAMPLE_INTERVAL_M = 50;
const MAX_LATERAL_M = 35;
const MAX_BEARING_DIFF_DEG = 60;
const MIN_OVERLAP_PCT = 10;
const BATCH_SIZE = 400;
// ─── Helpers geométricos ───────────────────────────────────────────────────
function haversineM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
/** Bearing inicial de A hacia B en grados [0,360). */
function bearingDeg(a, b) {
    const φ1 = (a.lat * Math.PI) / 180;
    const φ2 = (b.lat * Math.PI) / 180;
    const dλ = ((b.lon - a.lon) * Math.PI) / 180;
    const y = Math.sin(dλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
/** Diferencia angular mínima en grados [0,180]. */
function bearingDiff(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
}
/** Distancia perpendicular punto→segmento en metros (equirectangular local). */
function perpDistM(p, a, b) {
    const latRef = ((a.lat + b.lat + p.lat) / 3) * (Math.PI / 180);
    const sx = 111320 * Math.cos(latRef);
    const sy = 111320;
    const ax = a.lon * sx, ay = a.lat * sy;
    const bx = b.lon * sx, by = b.lat * sy;
    const px = p.lon * sx, py = p.lat * sy;
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0)
        return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    const cx = ax + t * dx, cy = ay + t * dy;
    return Math.hypot(px - cx, py - cy);
}
// ─── Resampleo ─────────────────────────────────────────────────────────────
/**
 * Convierte una polilínea en una secuencia de muestras equiespaciadas por
 * distancia. Cada muestra lleva el bearing local (dirección del segmento
 * que la contiene), condición necesaria para el filtro de sentido.
 */
function resamplePolyline(points, intervalM) {
    if (points.length < 2)
        return [];
    const out = [];
    let distSinceLast = 0;
    let cur = Object.assign({}, points[0]);
    let nextBearing = bearingDeg(points[0], points[1]);
    out.push({ lat: cur.lat, lon: cur.lon, bearing: nextBearing });
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const segLen = haversineM(a.lat, a.lon, b.lat, b.lon);
        if (segLen === 0)
            continue;
        const segBearing = bearingDeg(a, b);
        let remaining = segLen;
        let fromLat = a.lat, fromLon = a.lon;
        // Si después de agregar este segmento el acumulador pasa intervalM,
        // emitimos muestras intermedias hasta consumir el segmento.
        while (distSinceLast + remaining >= intervalM) {
            const step = intervalM - distSinceLast;
            const frac = step / remaining;
            const newLat = fromLat + (b.lat - fromLat) * frac;
            const newLon = fromLon + (b.lon - fromLon) * frac;
            out.push({ lat: newLat, lon: newLon, bearing: segBearing });
            fromLat = newLat;
            fromLon = newLon;
            remaining -= step;
            distSinceLast = 0;
        }
        distSinceLast += remaining;
    }
    return out;
}
// ─── Cálculo de overlap A-en-B ─────────────────────────────────────────────
/**
 * Por cada muestra de A, busca el segmento de B más cercano y verifica:
 *   (a) distancia lateral ≤ MAX_LATERAL_M
 *   (b) |bearingA − bearingB| ≤ MAX_BEARING_DIFF_DEG (mismo sentido)
 * Retorna cuántas muestras de A pasaron ambos filtros.
 */
function countCoveredSamples(samplesA, pointsB) {
    if (samplesA.length === 0 || pointsB.length < 2)
        return 0;
    let covered = 0;
    for (const sa of samplesA) {
        let bestDist = Infinity;
        let bestBearing = 0;
        for (let i = 0; i < pointsB.length - 1; i++) {
            const segA = pointsB[i];
            const segB = pointsB[i + 1];
            const d = perpDistM({ lat: sa.lat, lon: sa.lon }, segA, segB);
            if (d < bestDist) {
                bestDist = d;
                bestBearing = bearingDeg(segA, segB);
                if (bestDist < 1)
                    break; // ya es casi coincidente
            }
        }
        if (bestDist > MAX_LATERAL_M)
            continue;
        if (bearingDiff(sa.bearing, bestBearing) > MAX_BEARING_DIFF_DEG)
            continue;
        covered++;
    }
    return covered;
}
// ─── Orquestación ──────────────────────────────────────────────────────────
async function computeDroMatrix(minOverlapPct = MIN_OVERLAP_PCT) {
    var _a, _b;
    const t0 = Date.now();
    const snap = await db.collection(SHAPES_COLLECTION).get();
    const shapes = [];
    for (const doc of snap.docs) {
        const d = doc.data();
        if (!Array.isArray(d.points) || d.points.length < 2)
            continue;
        // Normalizar: gtfsImporter guarda {lat, lng} pero Point usa {lat, lon}
        const pts = d.points.map(p => { var _a, _b; return ({ lat: p.lat, lon: (_b = (_a = p.lon) !== null && _a !== void 0 ? _a : p.lng) !== null && _b !== void 0 ? _b : 0 }); });
        // gtfsImporter no persiste campo 'key' en docData — usar doc.id como fuente canónica
        const shapeKey = (_a = d.key) !== null && _a !== void 0 ? _a : doc.id;
        shapes.push({
            key: shapeKey,
            agencyId: d.agencyId,
            empresa: d.empresa,
            linea: d.linea,
            sentido: d.sentido,
            points: pts,
            lengthMeters: (_b = d.lengthMeters) !== null && _b !== void 0 ? _b : 0,
        });
    }
    console.log(`[droMatrix] shapes read: ${shapes.length}`);
    // Pre-resamplear todas las shapes una vez (evita recalcular n veces).
    const resampled = new Map();
    for (const s of shapes) {
        resampled.set(s.key, resamplePolyline(s.points, RESAMPLE_INTERVAL_M));
    }
    const overlaps = [];
    let pairsEvaluated = 0;
    for (const a of shapes) {
        const samplesA = resampled.get(a.key);
        if (samplesA.length === 0)
            continue;
        for (const b of shapes) {
            if (a.key === b.key)
                continue;
            pairsEvaluated++;
            const covered = countCoveredSamples(samplesA, b.points);
            if (covered === 0)
                continue;
            const pctAInB = (covered / samplesA.length) * 100;
            if (pctAInB < minOverlapPct)
                continue;
            const sharedKm = (covered * RESAMPLE_INTERVAL_M) / 1000;
            overlaps.push({
                key: `${a.key}__${b.key}`,
                shapeAKey: a.key,
                shapeBKey: b.key,
                agencyA: a.agencyId,
                empresaA: a.empresa,
                lineaA: a.linea,
                sentidoA: a.sentido,
                agencyB: b.agencyId,
                empresaB: b.empresa,
                lineaB: b.linea,
                sentidoB: b.sentido,
                pctAInB: Math.round(pctAInB * 10) / 10,
                sharedKm: Math.round(sharedKm * 100) / 100,
                sameEmpresa: a.agencyId === b.agencyId,
                sampleCount: samplesA.length,
                computedAt: admin.firestore.Timestamp.now(),
            });
        }
    }
    // Deduplicar: múltiples variantes de la misma línea generan N pares para el
    // mismo par lógico (lineaA-sentidoA vs lineaB-sentidoB). Nos quedamos con el
    // que tiene mayor pctAInB y usamos una clave sin variante como doc ID.
    const dedupedMap = new Map();
    for (const o of overlaps) {
        const logicalKey = `${o.agencyA}-${o.lineaA}-${o.sentidoA}__${o.agencyB}-${o.lineaB}-${o.sentidoB}`;
        const existing = dedupedMap.get(logicalKey);
        if (!existing || o.pctAInB > existing.pctAInB) {
            dedupedMap.set(logicalKey, Object.assign(Object.assign({}, o), { key: logicalKey }));
        }
    }
    const dedupedOverlaps = Array.from(dedupedMap.values());
    console.log(`[droMatrix] raw overlaps=${overlaps.length} deduped=${dedupedOverlaps.length}`);
    // Guard: si el cálculo producjo 0 pares, algo salió mal — no borrar colección
    if (dedupedOverlaps.length === 0) {
        console.warn('[droMatrix] 0 pares deduplicados — abortando para no borrar colección existente');
        return { shapesRead: shapes.length, pairsEvaluated, pairsWritten: 0, durationMs: Date.now() - t0, topOverlaps: [] };
    }
    // Limpiar docs previos (claves con variante del build anterior)
    const existingSnap = await db.collection(OVERLAP_COLLECTION).get();
    const existingKeys = new Set(dedupedMap.keys());
    let delBatch = db.batch();
    let delOps = 0;
    for (const doc of existingSnap.docs) {
        if (!existingKeys.has(doc.id)) {
            delBatch.delete(doc.ref);
            delOps++;
            if (delOps >= BATCH_SIZE) {
                await delBatch.commit();
                delBatch = db.batch();
                delOps = 0;
            }
        }
    }
    if (delOps > 0)
        await delBatch.commit();
    console.log(`[droMatrix] deleted stale docs=${existingSnap.size - existingKeys.size}`);
    // Persistencia en batches
    let batch = db.batch();
    let ops = 0;
    for (const o of dedupedOverlaps) {
        batch.set(db.collection(OVERLAP_COLLECTION).doc(o.key), o);
        ops++;
        if (ops >= BATCH_SIZE) {
            await batch.commit();
            batch = db.batch();
            ops = 0;
        }
    }
    if (ops > 0)
        await batch.commit();
    const top = [...dedupedOverlaps]
        .sort((x, y) => y.pctAInB - x.pctAInB)
        .slice(0, 10)
        .map(o => ({ keyA: o.shapeAKey, keyB: o.shapeBKey, pctAInB: o.pctAInB, sharedKm: o.sharedKm }));
    const durationMs = Date.now() - t0;
    console.log(`[droMatrix] written=${dedupedOverlaps.length} evaluated=${pairsEvaluated} durationMs=${durationMs}`);
    return {
        shapesRead: shapes.length,
        pairsEvaluated,
        pairsWritten: dedupedOverlaps.length,
        durationMs,
        topOverlaps: top,
    };
}
// ─── Cloud Functions ───────────────────────────────────────────────────────
/** Cron: lunes 04:00 Mvd (tras reconstructShapesTick a las 03:00). */
exports.droMatrixTick = functions
    .runWith({ timeoutSeconds: 540, memory: '1GB' })
    .pubsub.schedule('every monday 04:00')
    .timeZone('America/Montevideo')
    .onRun(async () => {
    try {
        await computeDroMatrix();
    }
    catch (err) {
        console.error('[droMatrixTick] Error:', (err === null || err === void 0 ? void 0 : err.message) || err);
    }
    return null;
});
/** HTTP manual para testing. `?minOverlapPct=N` opcional. */
exports.recomputeDroMatrixNow = functions
    .runWith({ timeoutSeconds: 540, memory: '1GB' })
    .https.onRequest(async (req, res) => {
    var _a;
    try {
        const minPct = Number((_a = req.query.minOverlapPct) !== null && _a !== void 0 ? _a : MIN_OVERLAP_PCT);
        const result = await computeDroMatrix(Number.isFinite(minPct) ? minPct : MIN_OVERLAP_PCT);
        res.json(Object.assign({ ok: true }, result));
    }
    catch (err) {
        console.error('[recomputeDroMatrixNow] Error:', (err === null || err === void 0 ? void 0 : err.message) || err);
        res.status(502).json({ ok: false, error: (err === null || err === void 0 ? void 0 : err.message) || String(err) });
    }
});
