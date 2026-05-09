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
const RESAMPLE_INTERVAL_M = 200; // 50→200: inner loop O(n²) con 290 shapes → timeout 540s; 200m = 5-10x menos ops, preciso para threshold 35m
const MAX_LATERAL_M = 35;
const MAX_BEARING_DIFF_DEG = 60;
const MIN_OVERLAP_PCT = 5;
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
/** Distancia perpendicular punto→segmento en metros (equirectangular local).
 *  Toma lat/lon como scalars para evitar alocación de objeto en el inner loop. */
function perpDistM(pLat, pLon, a, b) {
    const latRef = ((a.lat + b.lat + pLat) / 3) * (Math.PI / 180);
    const sx = 111320 * Math.cos(latRef);
    const sy = 111320;
    const ax = a.lon * sx, ay = a.lat * sy;
    const bx = b.lon * sx, by = b.lat * sy;
    const px = pLon * sx, py = pLat * sy;
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0)
        return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    const cx = ax + t * dx, cy = ay + t * dy;
    return Math.hypot(px - cx, py - cy);
}
/** Convierte puntos de B en segmentos con bearing precomputado (una vez por shape, no por par). */
function makeSegsB(pts) {
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
        segs.push({ a: pts[i], b: pts[i + 1], bearing: bearingDeg(pts[i], pts[i + 1]) });
    }
    return segs;
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
/** Acepta SegB[] (con bearing precomputado) para eliminar trig del inner loop. */
function countCoveredSamples(samplesA, segsB) {
    if (samplesA.length === 0 || segsB.length === 0)
        return 0;
    let covered = 0;
    for (const sa of samplesA) {
        let bestDist = Infinity;
        let bestBearing = 0;
        for (const seg of segsB) {
            const d = perpDistM(sa.lat, sa.lon, seg.a, seg.b); // sin alocación de objeto
            if (d < bestDist) {
                bestDist = d;
                bestBearing = seg.bearing; // precomputado: sin trig en inner loop
                if (bestDist < 1)
                    break;
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
    var _a, _b, _c, _d;
    const t0 = Date.now();
    // Filtrar en Firestore — solo agencias conocidas. Evita leer los ~1400 docs agencyId=0
    // de gtfsImporter que no aportan al DRO cross-operador (usa códigos GTFS distintos).
    // Requiere índice en agencyId (campo simple — no necesita compuesto).
    const KNOWN_AGENCIES = ['10', '20', '50', '70'];
    const snap = await db.collection(SHAPES_COLLECTION)
        .where('agencyId', 'in', KNOWN_AGENCIES)
        .get();
    const shapes = [];
    for (const doc of snap.docs) {
        const d = doc.data();
        if (!Array.isArray(d.points) || d.points.length < 2)
            continue;
        if (!d.sentido || !d.linea)
            continue;
        // Normalizar: shapeReconstruction guarda {lat, lon}; shapeBuilder y gtfsImporter usan {lat, lng}
        const pts = d.points.map(p => { var _a, _b; return ({ lat: p.lat, lon: (_b = (_a = p.lon) !== null && _a !== void 0 ? _a : p.lng) !== null && _b !== void 0 ? _b : 0 }); });
        // Usar campo key explícito si existe (shapeReconstruction); sino doc.id (shapeBuilder/gtfsImporter)
        const shapeKey = (typeof d.key === 'string') ? d.key : doc.id;
        shapes.push({
            key: shapeKey,
            agencyId: d.agencyId,
            empresa: (_a = d.empresa) !== null && _a !== void 0 ? _a : '',
            linea: d.linea,
            sentido: d.sentido,
            points: pts,
            lengthMeters: (_b = d.lengthMeters) !== null && _b !== void 0 ? _b : 0,
        });
    }
    console.log(`[droMatrix] shapes pre-dedup: ${shapes.length}`);
    // Dedup de shapes: mantener UNA por (agencyId, linea, sentido) — la de mayor lengthMeters
    // (mejor cobertura de recorrido). Sin esto, múltiples variantes y fuentes generan
    // N² pares por par lógico y el cálculo supera el timeout 540s.
    const shapeDedup = new Map();
    for (const s of shapes) {
        const logKey = `${s.agencyId}|${s.linea}|${s.sentido}`;
        const existing = shapeDedup.get(logKey);
        if (!existing || s.lengthMeters > existing.lengthMeters) {
            shapeDedup.set(logKey, s);
        }
    }
    const dedupedShapes = Array.from(shapeDedup.values());
    console.log(`[droMatrix] shapes post-dedup (una por linea-sentido): ${dedupedShapes.length}`);
    // Pre-resamplear todas las shapes deduplicadas una vez (evita recalcular n veces).
    const resampled = new Map();
    for (const s of dedupedShapes) {
        resampled.set(s.key, resamplePolyline(s.points, RESAMPLE_INTERVAL_M));
    }
    // Pre-calcular versión Point[] de cada shape resampleada, usada como B en el inner loop.
    // CRÍTICO: usar raw b.points (500-1000 pts) causaba 6B ops y timeout 540s.
    // Con resampled B (~40 pts a 200m interval): 30x speedup por par.
    const resampledPts = new Map();
    for (const [key, samples] of resampled.entries()) {
        resampledPts.set(key, samples.map(s => ({ lat: s.lat, lon: s.lon })));
    }
    // Precomputar segmentos con bearing para cada shape B (una vez, no por par).
    // Elimina trig (sin/cos/atan2) del inner loop — queda solo perpDistM (operaciones lineales).
    const segsMap = new Map();
    for (const s of dedupedShapes) {
        segsMap.set(s.key, makeSegsB((_c = resampledPts.get(s.key)) !== null && _c !== void 0 ? _c : []));
    }
    // Pre-calcular bounding boxes para pre-filtro O(1) por par.
    // Margen 0.02° ≈ 2.2km (antes 0.1°=11km que no eliminaba nada en Montevideo).
    const BBOX_MARGIN = 0.02; // grados
    const bboxes = new Map();
    for (const s of dedupedShapes) {
        const lats = s.points.map(p => p.lat);
        const lons = s.points.map(p => p.lon);
        bboxes.set(s.key, {
            minLat: Math.min(...lats) - BBOX_MARGIN,
            maxLat: Math.max(...lats) + BBOX_MARGIN,
            minLon: Math.min(...lons) - BBOX_MARGIN,
            maxLon: Math.max(...lons) + BBOX_MARGIN,
        });
    }
    const overlaps = [];
    let pairsEvaluated = 0;
    let pairsSkippedBbox = 0;
    for (const a of dedupedShapes) {
        const samplesA = resampled.get(a.key);
        if (samplesA.length === 0)
            continue;
        const bboxA = bboxes.get(a.key);
        for (const b of dedupedShapes) {
            if (a.key === b.key)
                continue;
            // DIRECTRIZ: nunca comparar IDA vs VUELTA — no son competencia aunque compartan calle
            if (a.sentido !== b.sentido)
                continue;
            // Pre-filtro bounding box: si no hay solapamiento geográfico posible, skip O(1)
            const bboxB = bboxes.get(b.key);
            if (bboxA.maxLat < bboxB.minLat || bboxA.minLat > bboxB.maxLat ||
                bboxA.maxLon < bboxB.minLon || bboxA.minLon > bboxB.maxLon) {
                pairsSkippedBbox++;
                continue;
            }
            pairsEvaluated++;
            const covered = countCoveredSamples(samplesA, (_d = segsMap.get(b.key)) !== null && _d !== void 0 ? _d : []);
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
        return { shapesRead: dedupedShapes.length, pairsEvaluated, pairsWritten: 0, durationMs: Date.now() - t0, topOverlaps: [] };
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
    console.log(`[droMatrix] written=${dedupedOverlaps.length} evaluated=${pairsEvaluated} bbox_skipped=${pairsSkippedBbox} durationMs=${durationMs}`);
    return {
        shapesRead: dedupedShapes.length,
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
