-- schema_fase5_21_cumplimiento_linea.sql (FASE 5.21 — 2026-05-17)
-- MV diaria de cumplimiento POR LÍNEA. Reemplaza el scan en vivo de
-- vehicle_events (32M filas → timeout 30s) del endpoint
-- /api/compliance/operador. Mismo dato real (estado_cumplimiento del
-- motor IMM ±4 min), pre-agregado. La refresca el scheduler
-- (fleetRankingMvRefresh) CONCURRENTLY, sin statement_timeout.
SET statement_timeout = 0;

DROP MATERIALIZED VIEW IF EXISTS mv_cumplimiento_linea_diario;
CREATE MATERIALIZED VIEW mv_cumplimiento_linea_diario AS
SELECT agency_id,
       linea,
       created_at::date AS fecha,
       COUNT(*)                                                                       AS total,
       COUNT(*) FILTER (WHERE estado_cumplimiento = 'EN_TIEMPO')                       AS en_tiempo,
       COUNT(*) FILTER (WHERE estado_cumplimiento = 'ATRASADO')                        AS atrasado,
       COUNT(*) FILTER (WHERE estado_cumplimiento = 'ADELANTADO')                      AS adelantado,
       COUNT(*) FILTER (WHERE estado_cumplimiento IN ('EN_TIEMPO','ATRASADO','ADELANTADO')) AS con_horario,
       COUNT(DISTINCT id_bus)                                                          AS coches
  FROM vehicle_events
 WHERE linea IS NOT NULL
 GROUP BY agency_id, linea, created_at::date;

CREATE UNIQUE INDEX idx_mv_cld_pk ON mv_cumplimiento_linea_diario (agency_id, linea, fecha);
CREATE INDEX idx_mv_cld_af ON mv_cumplimiento_linea_diario (agency_id, fecha);
