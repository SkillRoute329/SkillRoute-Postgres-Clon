-- ════════════════════════════════════════════════════════════════════════════
-- FASE 5 (2026-05-13) — Views para compatibilidad de frontend
--
-- El frontend del clon (heredado del clon online) consulta colecciones
-- `viajes_activos`, `competidores`, `corridor_overlap`, `shapes_cross_operator`
-- que en Firebase existían como colecciones independientes. En Postgres, los
-- datos GPS REALES están en `bus_last_pos` (alimentado por el poller IMM cada
-- 10 s, cobertura confirmada de los 4 operadores).
--
-- Esta migración crea VIEWS y tablas mínimas para que el dbBridge pueda
-- responder a las pantallas (FleetMonitor, ShadowRadar, CMU, Diagnóstico
-- Ejecutivo) sin generar errores ni datos sintéticos.
--
-- ANTI-SIMULACION: cada VIEW expone datos REALES del poller. Si una tabla
-- está vacía, devolvemos array vacío honesto (no inventamos).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── viajes_activos ─────────────────────────────────────────────────────────
-- Lo que el frontend espera: una colección con docs por bus con
-- {empresa, cocheId, codigoLinea, lat, lng, velocidad, heading, updatedAt}.
--
-- Origen real: bus_last_pos (escrito por poller IMM cada ~10s).
-- Filtro: solo buses con ping en los últimos 20 minutos (activos en vivo).

DROP VIEW IF EXISTS viajes_activos CASCADE;
CREATE VIEW viajes_activos AS
SELECT
  id_bus AS id,
  id_bus AS "cocheId",
  CASE agency_id
    WHEN '70' THEN 'UCOT'
    WHEN '50' THEN 'CUTCSA'
    WHEN '20' THEN 'COME'
    WHEN '10' THEN 'COETC'
    ELSE 'EMP_' || agency_id
  END AS empresa,
  agency_id,
  linea,
  linea AS "codigoLinea",
  lat,
  lon AS lng,
  velocidad,
  estado_cumplimiento,
  timestamp_gps,
  timestamp_gps AS "updatedAt",
  EXTRACT(EPOCH FROM (NOW() - timestamp_gps))::int AS seconds_ago
FROM bus_last_pos
WHERE timestamp_gps > NOW() - INTERVAL '20 minutes';

COMMENT ON VIEW viajes_activos IS
  'FASE 5: bus_last_pos con aliases compatibles con frontend Firebase shim. '
  'Solo buses activos en los últimos 20 min. Datos reales del poller IMM.';

-- ─── competidores ───────────────────────────────────────────────────────────
-- Lo que el frontend espera: docs `emp-10`, `emp-20`, `emp-50`, `emp-70`
-- cada uno con campo `buses` (array de buses) y `actualizadoEn`.
--
-- Origen real: agregación de bus_last_pos por agency_id.

DROP VIEW IF EXISTS competidores CASCADE;
CREATE VIEW competidores AS
SELECT
  'emp-' || agency_id AS id,
  agency_id,
  CASE agency_id
    WHEN '70' THEN 'UCOT'
    WHEN '50' THEN 'CUTCSA'
    WHEN '20' THEN 'COME'
    WHEN '10' THEN 'COETC'
    ELSE 'EMP_' || agency_id
  END AS nombre,
  CASE agency_id
    WHEN '70' THEN 'UCOT'
    WHEN '50' THEN 'CUTCSA'
    WHEN '20' THEN 'COME'
    WHEN '10' THEN 'COETC'
    ELSE 'EMP_' || agency_id
  END AS empresa,
  COUNT(*) AS "totalBuses",
  COUNT(*) AS cantidad,
  jsonb_agg(jsonb_build_object(
    'cocheId', id_bus,
    'codigoBus', id_bus,
    'linea', linea,
    'codigoLinea', linea,
    'lat', lat,
    'lng', lon,
    'velocidad', velocidad,
    'destino', NULL,
    'sublinea', NULL
  ) ORDER BY id_bus) AS buses,
  MAX(timestamp_gps) AS "actualizadoEn",
  MAX(timestamp_gps) AS "updatedAt",
  MAX(timestamp_gps) AS "lastUpdate"
FROM bus_last_pos
WHERE timestamp_gps > NOW() - INTERVAL '20 minutes'
GROUP BY agency_id;

COMMENT ON VIEW competidores IS
  'FASE 5: agregación de bus_last_pos por agencia. Estructura compatible con '
  'la colección Firestore `competidores` que usaba el cron refreshCompetidoresTick.';

-- ─── competencia_monitoreo ─────────────────────────────────────────────────
-- Igual que competidores pero excluye UCOT (la "competencia" desde la
-- perspectiva del operador UCOT). Mantener para compatibilidad si alguna
-- pantalla específica lo pide.

DROP VIEW IF EXISTS competencia_monitoreo CASCADE;
CREATE VIEW competencia_monitoreo AS
SELECT * FROM competidores WHERE agency_id <> '70';

COMMENT ON VIEW competencia_monitoreo IS
  'FASE 5: subset de competidores excluyendo UCOT.';

-- ─── corridor_overlap ───────────────────────────────────────────────────────
-- Tabla para futuro: matriz DRO cross-operador. Por ahora vacía con la
-- estructura mínima que el frontend espera (consulta vía /api/db/corridor_overlap
-- con where=sameEmpresa:false, etc.).
--
-- Esta tabla NO se rellena en esta sesión — el cómputo DRO real requiere
-- shapes_cross_operator pobladas + algoritmo Douglas-Peucker. Se documenta
-- como pendiente.

CREATE TABLE IF NOT EXISTS corridor_overlap (
  id              TEXT PRIMARY KEY,
  shape_a_key     TEXT,
  shape_b_key     TEXT,
  agency_a        TEXT,
  agency_b        TEXT,
  linea_a         TEXT,
  linea_b         TEXT,
  sentido_a       TEXT,
  sentido_b       TEXT,
  pct_a_in_b      NUMERIC,
  pct_b_in_a      NUMERIC,
  shared_km       NUMERIC,
  same_empresa    BOOLEAN,
  tier            TEXT,
  computed_at     TIMESTAMPTZ DEFAULT NOW(),
  data_jsonb      JSONB
);

COMMENT ON TABLE corridor_overlap IS
  'FASE 5: matriz DRO cross-operador. Vacía por defecto. El cómputo real '
  'requiere shapes_cross_operator y algoritmo DRO (pendiente fase futura).';

-- ─── shapes_cross_operator ─────────────────────────────────────────────────
-- Tabla equivalente: polilíneas de recorridos cross-operador. Por ahora vacía.
-- Datos reales viven en frontend/src/data/shapesAllOperators.json y en
-- gtfs.shapes Postgres.

CREATE TABLE IF NOT EXISTS shapes_cross_operator (
  id              TEXT PRIMARY KEY,
  shape_key       TEXT,
  agency_id       TEXT,
  linea           TEXT,
  sentido         TEXT,
  points          JSONB,
  total_km        NUMERIC,
  source          TEXT,
  reconstructed_at TIMESTAMPTZ DEFAULT NOW(),
  data_jsonb      JSONB
);

COMMENT ON TABLE shapes_cross_operator IS
  'FASE 5: polilíneas de recorridos cross-operador. Vacía por defecto. '
  'Datos canónicos en gtfs.shapes (Postgres) y shapesAllOperators.json (frontend).';

-- ─── cambios_historicos ─────────────────────────────────────────────────────
-- Para competitionService.generarReporteCompetencia que consulta esta colección.

CREATE TABLE IF NOT EXISTS cambios_historicos (
  id              TEXT PRIMARY KEY,
  fecha           TIMESTAMPTZ,
  tipo            TEXT,
  agency_id       TEXT,
  linea           TEXT,
  descripcion     TEXT,
  data_jsonb      JSONB
);

COMMENT ON TABLE cambios_historicos IS
  'FASE 5: historial de cambios de horario/recorrido. Vacía por defecto.';

-- ─── boletaje ───────────────────────────────────────────────────────────────
-- Para forecastService.obtenerHistoricoBoletaje que consulta esta colección.
-- Vacía por defecto — el forecastService ya tiene graceful fallback que
-- devuelve estructura vacía si no hay datos.

CREATE TABLE IF NOT EXISTS boletaje (
  id              TEXT PRIMARY KEY,
  linea_id        TEXT,
  fecha           TIMESTAMPTZ,
  boletos_vendidos INTEGER DEFAULT 0,
  hora_inicio     TEXT,
  agency_id       TEXT,
  data_jsonb      JSONB
);

COMMENT ON TABLE boletaje IS
  'FASE 5: registros diarios de boletaje por línea. Vacía por defecto. '
  'Pendiente integración con sistema de venta de pasajes / SUM Card.';

-- ─── lineas ────────────────────────────────────────────────────────────────
-- Para competitionService y forecastService que consultan `lineas` con
-- {numero, operador, recorrido, horarios}. La fuente real es gtfs.routes
-- + gtfs.trips. Creamos VIEW que expone gtfs.routes en el formato esperado.

DROP VIEW IF EXISTS lineas CASCADE;
CREATE VIEW lineas AS
SELECT
  route_id AS id,
  route_short_name AS numero,
  route_long_name AS nombre,
  route_desc AS descripcion,
  agency_id AS operador,
  agency_id,
  route_type AS tipo
FROM gtfs.routes;

COMMENT ON VIEW lineas IS
  'FASE 5: alias de gtfs.routes con campos compatibles con frontend Firebase shim.';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ════════════════════════════════════════════════════════════════════════════
-- Después de aplicar, correr para confirmar:
--   SELECT count(*) FROM viajes_activos;       -- esperado: ~700-2800 dep. hora
--   SELECT count(*) FROM competidores;         -- esperado: 4 docs (uno por op)
--   SELECT count(*) FROM lineas;               -- esperado: ~141 (depende GTFS)
--   SELECT count(*) FROM corridor_overlap;     -- esperado: 0 (vacía)
--   SELECT count(*) FROM shapes_cross_operator;-- esperado: 0 (vacía)
