-- ════════════════════════════════════════════════════════════════════════════
-- FASE 5.9 (2026-05-13) — Vistas para colecciones legacy del frontend
--
-- Varias pantallas del frontend consultan colecciones que existían en el
-- modelo Firestore original (eventos_desvio, compliance_log, fleet_positions,
-- licencias_personal, service_matrices) pero en el clon Postgres tienen
-- otro nombre o son agregaciones derivadas. Estas VIEWs hacen el mapeo
-- transparente — el frontend no se toca, pero recibe datos reales.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── eventos_desvio ────────────────────────────────────────────────────────
-- Lo que las pantallas (PanelFinanciero, GestionDesvios, PanelRendicion,
-- CentroTurno, CEODashboardV7) esperan: registros de eventos de desvío con
-- coche, línea, tipo, severidad, timestamp.
--
-- Origen real: alertas_regulacion (958K rows) tiene exactamente esa info.
-- Filtramos las que son de tipo "desvío operativo" (DESVIO, PELIGRO_BUNCHING,
-- EVENTO_DESVIO, RETRASO, ADELANTO).

DROP VIEW IF EXISTS eventos_desvio CASCADE;
CREATE VIEW eventos_desvio AS
SELECT
  id,
  agency_id,
  timestamp,
  timestamp AS "createdAt",
  tipo,
  severidad,
  coche_id,
  coche_id AS "cocheId",
  linea_id,
  linea_id AS "lineaId",
  linea_id AS linea,
  conductor_id,
  conductor_id AS "conductorId",
  lat,
  lon,
  lon AS lng,
  atendida,
  atendida AS leido,
  accion_tomada,
  accion_tomada AS "accionTomada",
  data_jsonb,
  CASE
    WHEN tipo IN ('PELIGRO_BUNCHING','BUNCHING') THEN 'bunching'
    WHEN tipo IN ('DESVIO','EVENTO_DESVIO','DESVIO_RUTA') THEN 'desvio_ruta'
    WHEN tipo IN ('ATRASO','RETRASO') THEN 'atraso'
    WHEN tipo IN ('ADELANTO') THEN 'adelanto'
    ELSE 'operativo'
  END AS categoria
FROM alertas_regulacion
WHERE tipo IS NOT NULL;

COMMENT ON VIEW eventos_desvio IS
  'FASE 5.9: alias de alertas_regulacion con campos compatibles con el shape '
  'Firestore que esperaban las pantallas legacy.';

-- ─── compliance_log ────────────────────────────────────────────────────────
-- Pantallas (ComplianceHub) esperan log de eventos fuera de tolerancia:
-- coche que pasó atrasado o adelantado en una parada/línea.
--
-- Origen: vehicle_events con desviacion_min > 4 (atraso) o < -4 (adelanto).
-- Limitamos a últimos 7 días para que la VIEW sea consultable rápido.

DROP VIEW IF EXISTS compliance_log CASCADE;
CREATE VIEW compliance_log AS
SELECT
  id::text AS id,
  agency_id,
  id_bus,
  id_bus AS "cocheId",
  linea,
  linea AS "lineaId",
  lat,
  lon,
  lon AS lng,
  velocidad,
  estado_cumplimiento,
  estado_cumplimiento AS estado,
  desviacion_min,
  desviacion_min AS "desviacionMin",
  trip_id,
  trip_id AS "tripId",
  proxima_parada,
  proxima_parada AS "proximaParada",
  timestamp_gps,
  timestamp_gps AS "createdAt",
  timestamp_gps AS timestamp,
  CASE
    WHEN desviacion_min > 4 THEN 'ATRASO_EXCESIVO'
    WHEN desviacion_min < -4 THEN 'ADELANTO_EXCESIVO'
    ELSE 'EN_TOLERANCIA'
  END AS tipo_evento
FROM vehicle_events
WHERE estado_cumplimiento IN ('ATRASADO','ADELANTADO')
  AND timestamp_gps > NOW() - INTERVAL '7 days';

COMMENT ON VIEW compliance_log IS
  'FASE 5.9: subset de vehicle_events con desviación >±4 min (fuera de tolerancia OTP). '
  'Ventana 7 días para consulta rápida.';

-- ─── fleet_positions ───────────────────────────────────────────────────────
-- Pantallas (AdminStressTest) esperan posiciones actuales. Es bus_last_pos
-- con campo lastUpdate. Igual datos, otro nombre.

DROP VIEW IF EXISTS fleet_positions CASCADE;
CREATE VIEW fleet_positions AS
SELECT
  id_bus AS id,
  id_bus,
  id_bus AS "cocheId",
  agency_id,
  linea,
  linea AS "codigoLinea",
  lat,
  lon,
  lon AS lng,
  velocidad,
  estado_cumplimiento,
  timestamp_gps,
  timestamp_gps AS "lastUpdate",
  timestamp_gps AS "updatedAt",
  EXTRACT(EPOCH FROM (NOW() - timestamp_gps))::int AS seconds_ago
FROM bus_last_pos;

COMMENT ON VIEW fleet_positions IS
  'FASE 5.9: alias de bus_last_pos con campo lastUpdate (lo que esperan algunas pantallas).';

-- ─── service_matrices (alias con S) ─────────────────────────────────────────
DROP VIEW IF EXISTS service_matrices CASCADE;
CREATE VIEW service_matrices AS SELECT * FROM service_matrix;

COMMENT ON VIEW service_matrices IS 'FASE 5.9: alias plural de service_matrix.';

-- ─── licencias_personal ────────────────────────────────────────────────────
-- MotorConsecuencias escribe a 'licencias_personal'; el frontend de RRHH
-- podría leerlo. Mapeo a tabla licencias (vacía, será populated por sistema).
DROP VIEW IF EXISTS licencias_personal CASCADE;
CREATE VIEW licencias_personal AS SELECT * FROM licencias;

COMMENT ON VIEW licencias_personal IS 'FASE 5.9: alias de licencias.';

-- ─── daily_shifts (mapeo desde turnos_dia) ─────────────────────────────────
-- Pantallas (VistaDia, ContingencyManagement, MotorConsecuencias) esperan
-- daily_shifts. Mapeamos a turnos_dia (vacía, listo para cuando se popular).
DROP VIEW IF EXISTS daily_shifts CASCADE;
CREATE VIEW daily_shifts AS
SELECT
  id,
  agency_id,
  fecha AS date,
  fecha,
  conductor_id,
  conductor_id AS "conductorId",
  conductor_nombre,
  conductor_interno,
  vehiculo_id,
  vehiculo_id AS "vehiculoId",
  vehiculo_interno,
  linea_id,
  linea_id AS "lineaId",
  linea_id AS linea,
  variante_key,
  turno,
  hora_salida,
  hora_salida AS "horaSalida",
  hora_llegada_estimada,
  terminal,
  estado,
  reserva_activada,
  conductor_reserva_id
FROM turnos_dia;

COMMENT ON VIEW daily_shifts IS 'FASE 5.9: alias de turnos_dia con campos camelCase.';

-- ─── hrr_live (tabla, no view) ─────────────────────────────────────────────
-- HrrDashboard consume hrr_live. Si la tabla existe ya, la dejamos.
-- Si no existe, la creamos vacía con columnas estándar para evitar error 404.
CREATE TABLE IF NOT EXISTS hrr_live (
  id            VARCHAR(128) PRIMARY KEY,
  agency_id     VARCHAR(50),
  linea         VARCHAR(50),
  sentido       VARCHAR(20),
  hrr           NUMERIC,
  estado        VARCHAR(50),
  computed_at   TIMESTAMPTZ DEFAULT NOW(),
  data_jsonb    JSONB DEFAULT '{}'::jsonb
);

COMMENT ON TABLE hrr_live IS 'FASE 5.9: Headway-to-Rival-Ratio en vivo. Se popula con cron hrrEngine cuando se active.';

-- ─── Verificación ──────────────────────────────────────────────────────────
SELECT 'eventos_desvio' AS view_o_tabla, COUNT(*) AS rows FROM eventos_desvio
UNION ALL SELECT 'compliance_log', COUNT(*) FROM compliance_log
UNION ALL SELECT 'fleet_positions', COUNT(*) FROM fleet_positions
UNION ALL SELECT 'service_matrices', COUNT(*) FROM service_matrices
UNION ALL SELECT 'licencias_personal', COUNT(*) FROM licencias_personal
UNION ALL SELECT 'daily_shifts', COUNT(*) FROM daily_shifts
UNION ALL SELECT 'hrr_live', COUNT(*) FROM hrr_live;
