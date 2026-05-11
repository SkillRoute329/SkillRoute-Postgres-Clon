-- ═══════════════════════════════════════════════════════════════════════════
-- SCHEMA FASE 3.5 — Poller backend autónomo IMM → Postgres
-- ═══════════════════════════════════════════════════════════════════════════
-- Fecha: 2026-05-10
-- Aplicar con:
--   psql -U postgres -d skillroute_master -f schema_fase3_5.sql
--
-- Crea la tabla `poller_health` que persiste el resultado de CADA ciclo del
-- poller. Sirve como audit trail para demostrar a IMM la continuidad de la
-- captura de datos sin huecos.
--
-- Cumplimiento:
--   - REGLA -3 estándares: auditable, ISO 27001 A.12.1 logging.
--   - REGLA -2 datos reales: registra qué pasó cada ciclo, no inventa.
--   - REGLA -1 no regresión: tabla nueva, no toca nada existente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────
-- 1. POLLER_HEALTH (audit trail del poller)
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poller_health (
    id              BIGSERIAL PRIMARY KEY,
    agency_id       VARCHAR(50) NOT NULL,
    cycle_start     TIMESTAMPTZ NOT NULL,
    cycle_end       TIMESTAMPTZ NOT NULL,
    duration_ms     INT NOT NULL,
    buses_received  INT NOT NULL DEFAULT 0,    -- cuántos buses devolvió IMM
    events_persisted INT NOT NULL DEFAULT 0,   -- cuántos vehicle_events nuevos se grabaron
    last_pos_updated INT NOT NULL DEFAULT 0,   -- cuántos bus_last_pos actualizados
    eta_predictions  INT NOT NULL DEFAULT 0,   -- cuántos ETAs calculados
    errors           INT NOT NULL DEFAULT 0,   -- conteo de errores en el ciclo
    error_message    TEXT,                     -- último error si hubo
    source           VARCHAR(50) DEFAULT 'IMM_API',
    poller_version   VARCHAR(20) DEFAULT '1.0',
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para queries de auditoría
CREATE INDEX IF NOT EXISTS idx_ph_agency_start ON poller_health(agency_id, cycle_start DESC);
CREATE INDEX IF NOT EXISTS idx_ph_cycle_start  ON poller_health(cycle_start DESC);
CREATE INDEX IF NOT EXISTS idx_ph_errors       ON poller_health(errors) WHERE errors > 0;

-- ───────────────────────────────────────────────────────────────────────
-- 2. BUS_ETA_PREDICTIONS (ETAs por parada calculadas por el poller)
-- ───────────────────────────────────────────────────────────────────────
-- Almacena para cada bus activo, las ETAs a las próximas N paradas de su trip.
-- Se reemplaza completo cada ciclo del poller (UPSERT por id_bus + stop_id).
CREATE TABLE IF NOT EXISTS bus_eta_predictions (
    id_bus              VARCHAR(50) NOT NULL,
    stop_id             VARCHAR(100) NOT NULL,
    agency_id           VARCHAR(50) NOT NULL,
    linea               VARCHAR(50),
    trip_id             VARCHAR(100),
    stop_sequence       INT,
    eta_seconds         INT,                   -- segundos hasta llegada estimada
    eta_timestamp       TIMESTAMPTZ,           -- timestamp ISO del ETA
    distance_meters     INT,                   -- metros al destino (vía shape)
    speed_kmh           DOUBLE PRECISION,      -- velocidad usada en el cálculo
    computed_at         TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id_bus, stop_id)
);

CREATE INDEX IF NOT EXISTS idx_eta_stop_id     ON bus_eta_predictions(stop_id, eta_timestamp);
CREATE INDEX IF NOT EXISTS idx_eta_agency      ON bus_eta_predictions(agency_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_eta_linea       ON bus_eta_predictions(linea);

-- ───────────────────────────────────────────────────────────────────────
-- 3. VISTA UTIL: cobertura diaria por agencia (para /api/audit/coverage)
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_poller_coverage_diario AS
SELECT
    agency_id,
    DATE(cycle_start AT TIME ZONE 'America/Montevideo') AS fecha,
    COUNT(*)                                                          AS ciclos_total,
    COUNT(*) FILTER (WHERE errors = 0)                                AS ciclos_ok,
    COUNT(*) FILTER (WHERE errors > 0)                                AS ciclos_con_error,
    MIN(cycle_start)                                                  AS primer_ciclo,
    MAX(cycle_end)                                                    AS ultimo_ciclo,
    SUM(events_persisted)                                             AS eventos_guardados,
    AVG(duration_ms)::INT                                             AS duracion_promedio_ms,
    -- % cobertura aprox: ciclos OK / ciclos esperados en horario operativo (5am-12am = 19h = 6840 ciclos cada 10s)
    ROUND(100.0 * COUNT(*) FILTER (WHERE errors = 0) / GREATEST(6840, 1), 2) AS pct_cobertura_estimado
FROM poller_health
GROUP BY agency_id, DATE(cycle_start AT TIME ZONE 'America/Montevideo')
ORDER BY fecha DESC, agency_id;

COMMENT ON VIEW v_poller_coverage_diario IS
  'Cobertura del poller por agencia y día. Usado por /api/audit/coverage para reporte IMM.';

-- ═══════════════════════════════════════════════════════════════════════════
-- FIN schema_fase3_5.sql
-- ═══════════════════════════════════════════════════════════════════════════
