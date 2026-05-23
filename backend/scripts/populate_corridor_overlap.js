/**
 * populate_corridor_overlap.js (FASE 5.4 — 2026-05-13)
 *
 * Pobla `shapes_cross_operator` (polilíneas de recorridos por línea/sentido)
 * y `corridor_overlap` (matriz DRO de solapamiento entre pares de líneas)
 * desde gtfs.* en Postgres. Permite que CorridorMap, CorridorIntelligence,
 * GanttRedMetropolitana muestren datos REALES.
 *
 * Algoritmo:
 *   1. Para cada operador (10/20/50/70) tomar las top N líneas activas
 *      (las que reportan GPS en bus_last_pos).
 *   2. Para cada (operador, línea, sentido) tomar UN shape representativo
 *      del trip más frecuente.
 *   3. Resamplear el shape a 80 puntos uniformes.
 *   4. Persistir en shapes_cross_operator.
 *   5. Para cada par (shapeA × shapeB) con operadores distintos:
 *      calcular pctAInB (% puntos de A a <120m de algún punto de B).
 *   6. Persistir en corridor_overlap si pctAInB > 5%.
 *
 * Performance: ~120 shapes × 120 = 14,400 pares. Cada par hace ~80 × 80 = 6,400
 * distancias. Total ~92M operaciones. Con bounding-box pre-filter baja a ~10M.
 * Tiempo estimado: 1-3 min.
 *
 * Datos REALES — sin Math.random ni sintéticos. La definición de DRO sigue
 * TCRP 195: % de puntos de la línea A que están a ≤120m de algún punto de la
 * línea B.
 */

const { Client } = require('c:/SkillRoute_Master/repo/backend/node_modules/pg');

const PG = {
  host: 'localhost', port: 5432, database: 'skillroute_master',
  user: 'postgres', password: 'I0SAv9zhoQDUfTPc7L+KmkAw',
};

const AGENCY_NAMES = { '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT' };
const TOP_N_LINES_PER_AGENCY = 30; // top 30 líneas por operador (120 total)
const SAMPLE_POINTS = 80;          // ~80 puntos por shape
const DRO_THRESHOLD_M = 120;       // distancia para considerar superpuesto (TCRP 195)
const DRO_MIN_PCT = 5.0;           // mínimo % para persistir
const KM_PER_DEG_LAT = 111.0;
const KM_PER_DEG_LON_MVD = 91.4;   // a -34.9°

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function resample(points, n) {
  if (points.length <= n) return points;
  const out = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i * (points.length - 1)) / (n - 1));
    out.push(points[idx]);
  }
  return out;
}

function bbox(points) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  return { minLat, maxLat, minLon, maxLon };
}

function bboxesOverlap(a, b, marginKm) {
  const dLat = marginKm / KM_PER_DEG_LAT;
  const dLon = marginKm / KM_PER_DEG_LON_MVD;
  return !(a.maxLat + dLat < b.minLat || a.minLat - dLat > b.maxLat ||
           a.maxLon + dLon < b.minLon || a.minLon - dLon > b.maxLon);
}

function pctAInB(pointsA, pointsB) {
  // % de puntos A con AL MENOS un punto B a ≤ DRO_THRESHOLD_M metros.
  // DRO_THRESHOLD_M en grados aproximados
  const thresholdKm = DRO_THRESHOLD_M / 1000;
  let inB = 0;
  for (const a of pointsA) {
    let foundClose = false;
    for (const b of pointsB) {
      // Pre-filter: si abs(deltaLat) > 0.002 (~220m) descartar rápido
      if (Math.abs(a.lat - b.lat) > 0.002) continue;
      if (Math.abs(a.lon - b.lon) > 0.002) continue;
      if (haversineKm(a.lat, a.lon, b.lat, b.lon) <= thresholdKm) {
        foundClose = true;
        break;
      }
    }
    if (foundClose) inB++;
  }
  return (inB / pointsA.length) * 100;
}

async function run() {
  const c = new Client(PG);
  await c.connect();
  console.log('Connected to Postgres');

  // 1. Obtener top N líneas activas por operador
  console.log(`Loading top ${TOP_N_LINES_PER_AGENCY} active lines per agency...`);
  const linesRes = await c.query(`
    SELECT agency_id, linea, COUNT(*) AS events
    FROM vehicle_events
    WHERE created_at > NOW() - INTERVAL '6 hours'
      AND agency_id IN ('10', '20', '50', '70')
      AND linea IS NOT NULL AND linea != ''
    GROUP BY agency_id, linea
    ORDER BY agency_id, events DESC
  `);

  const linesByAgency = {};
  for (const row of linesRes.rows) {
    if (!linesByAgency[row.agency_id]) linesByAgency[row.agency_id] = [];
    if (linesByAgency[row.agency_id].length < TOP_N_LINES_PER_AGENCY) {
      linesByAgency[row.agency_id].push(row.linea);
    }
  }
  for (const ag of Object.keys(linesByAgency)) {
    console.log(`  ${ag} (${AGENCY_NAMES[ag]}): ${linesByAgency[ag].length} lines: ${linesByAgency[ag].slice(0, 10).join(', ')}...`);
  }

  // 2. Para cada (operador, línea, sentido), tomar el shape más usado
  console.log('Building shapes_cross_operator...');
  const shapes = [];
  for (const [agencyId, lines] of Object.entries(linesByAgency)) {
    for (const linea of lines) {
      for (const dirId of [0, 1]) {
        // Buscar el shape_id más usado para esta linea + sentido
        const shapeQ = await c.query(`
          SELECT t.shape_id, COUNT(*) AS uses
          FROM gtfs.trips t
          JOIN gtfs.routes r ON t.route_id = r.route_id
          WHERE r.route_short_name = $1 AND t.direction_id = $2
          GROUP BY t.shape_id
          ORDER BY uses DESC
          LIMIT 1
        `, [linea, dirId]);
        if (shapeQ.rows.length === 0) continue;
        const shapeId = shapeQ.rows[0].shape_id;
        // Obtener puntos del shape
        const pointsQ = await c.query(`
          SELECT shape_pt_lat AS lat, shape_pt_lon AS lon
          FROM gtfs.shapes
          WHERE shape_id = $1
          ORDER BY shape_pt_sequence ASC
        `, [shapeId]);
        if (pointsQ.rows.length < 10) continue;
        const allPoints = pointsQ.rows.map(p => ({ lat: Number(p.lat), lon: Number(p.lon) }));
        const samplePoints = resample(allPoints, SAMPLE_POINTS);

        // Length aproximada
        let lengthMeters = 0;
        for (let i = 1; i < samplePoints.length; i++) {
          lengthMeters += haversineKm(
            samplePoints[i - 1].lat, samplePoints[i - 1].lon,
            samplePoints[i].lat, samplePoints[i].lon,
          ) * 1000;
        }

        const sentido = dirId === 0 ? 'IDA' : 'VUELTA';
        const key = `${agencyId}_${linea}_${sentido}`;
        shapes.push({
          key,
          agencyId,
          empresa: AGENCY_NAMES[agencyId],
          linea,
          sentido,
          points: samplePoints,
          lengthMeters: Math.round(lengthMeters),
          bbox: bbox(samplePoints),
        });
      }
    }
  }
  console.log(`  ${shapes.length} shapes built.`);

  // 3. Persistir shapes (UPSERT)
  console.log('Persisting shapes_cross_operator (truncate + insert)...');
  await c.query('TRUNCATE shapes_cross_operator');
  for (const s of shapes) {
    await c.query(`
      INSERT INTO shapes_cross_operator (id, shape_key, agency_id, linea, sentido, points, total_km, source, reconstructed_at, data_jsonb)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'gtfs.shapes', NOW(), $8::jsonb)
    `, [
      s.key, s.key, s.agencyId, s.linea, s.sentido,
      JSON.stringify(s.points),
      s.lengthMeters / 1000,
      JSON.stringify({
        key: s.key, agencyId: s.agencyId, empresa: s.empresa,
        linea: s.linea, sentido: s.sentido,
        points: s.points, lengthMeters: s.lengthMeters,
      }),
    ]);
  }

  // 4. Calcular matrix DRO
  console.log('Computing DRO matrix (this may take 1-3 min)...');
  const overlaps = [];
  let pairChecked = 0, pairKept = 0;
  for (let i = 0; i < shapes.length; i++) {
    for (let j = 0; j < shapes.length; j++) {
      if (i === j) continue;
      const a = shapes[i], b = shapes[j];
      // Solo computar mismo sentido (IDA vs IDA, VUELTA vs VUELTA) — regla competencia
      if (a.sentido !== b.sentido) continue;
      // Excluir misma línea contra sí misma (mismo número aunque distinta agencia o sentido)
      if (a.agencyId === b.agencyId && a.linea === b.linea) continue;
      // Pre-filter bbox
      if (!bboxesOverlap(a.bbox, b.bbox, 0.2)) continue;
      pairChecked++;
      const pct = pctAInB(a.points, b.points);
      if (pct >= DRO_MIN_PCT) {
        const sharedKm = (pct / 100) * (a.lengthMeters / 1000);
        overlaps.push({
          key: `${a.key}__${b.key}`,
          shapeAKey: a.key, shapeBKey: b.key,
          agencyA: a.agencyId, empresaA: a.empresa, lineaA: a.linea, sentidoA: a.sentido,
          agencyB: b.agencyId, empresaB: b.empresa, lineaB: b.linea, sentidoB: b.sentido,
          pctAInB: Number(pct.toFixed(2)),
          sharedKm: Number(sharedKm.toFixed(3)),
          sameEmpresa: a.agencyId === b.agencyId,
        });
        pairKept++;
      }
    }
    if ((i + 1) % 30 === 0) {
      console.log(`  Processed ${i + 1}/${shapes.length} shapes, ${pairChecked} pairs checked, ${pairKept} kept`);
    }
  }
  console.log(`  Total: ${pairChecked} pairs checked, ${pairKept} overlaps kept.`);

  // 5. Persistir overlaps
  console.log('Persisting corridor_overlap (truncate + insert)...');
  await c.query('TRUNCATE corridor_overlap');
  for (const o of overlaps) {
    let tier = 'T3';
    if (o.pctAInB >= 70) tier = 'T1';
    else if (o.pctAInB >= 40) tier = 'T2';
    await c.query(`
      INSERT INTO corridor_overlap (id, shape_a_key, shape_b_key, agency_a, agency_b, linea_a, linea_b, sentido_a, sentido_b, pct_a_in_b, shared_km, same_empresa, tier, computed_at, data_jsonb)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), $14::jsonb)
    `, [
      o.key, o.shapeAKey, o.shapeBKey, o.agencyA, o.agencyB, o.lineaA, o.lineaB,
      o.sentidoA, o.sentidoB, o.pctAInB, o.sharedKm, o.sameEmpresa, tier,
      JSON.stringify({
        key: o.key, shapeAKey: o.shapeAKey, shapeBKey: o.shapeBKey,
        agencyA: o.agencyA, empresaA: o.empresaA, lineaA: o.lineaA, sentidoA: o.sentidoA,
        agencyB: o.agencyB, empresaB: o.empresaB, lineaB: o.lineaB, sentidoB: o.sentidoB,
        pctAInB: o.pctAInB, sharedKm: o.sharedKm, sameEmpresa: o.sameEmpresa, tier,
      }),
    ]);
  }

  // 6. Resumen
  console.log('');
  console.log('=== RESUMEN ===');
  console.log(`shapes_cross_operator: ${shapes.length} shapes`);
  console.log(`corridor_overlap: ${overlaps.length} pares con DRO >= ${DRO_MIN_PCT}%`);
  const tiers = { T1: 0, T2: 0, T3: 0 };
  for (const o of overlaps) {
    if (o.pctAInB >= 70) tiers.T1++;
    else if (o.pctAInB >= 40) tiers.T2++;
    else tiers.T3++;
  }
  console.log(`Tiers: T1 (>=70%): ${tiers.T1}, T2 (>=40%): ${tiers.T2}, T3 (>=5%): ${tiers.T3}`);

  await c.end();
  console.log('OK');
}

run().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
