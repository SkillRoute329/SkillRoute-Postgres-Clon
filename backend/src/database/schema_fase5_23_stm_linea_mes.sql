-- schema_fase5_23_stm_linea_mes.sql (FASE 5.23 — 2026-05-18)
-- Estrategia proceso→documento: el informe NO debe escanear
-- stm_validaciones_mensual (66M filas → timeout 30s con 12 meses). Se
-- pre-agrega EXACTAMENTE lo que el informe/auditoría necesitan, por
-- (operador, línea, mes): validaciones de DÍA HÁBIL (dow 1–5) y total; y
-- aparte el pico horario en día hábil. Resultado: ~miles de filas → consulta
-- instantánea. Es "el documento"; el crudo puede podarse luego.
SET statement_timeout = 0;

DROP MATERIALIZED VIEW IF EXISTS mv_stm_linea_mes;
CREATE MATERIALIZED VIEW mv_stm_linea_mes AS
SELECT cod_empresa,
       dsc_linea,
       mes,
       SUM(validaciones) FILTER (WHERE dow BETWEEN 1 AND 5) AS habil,
       SUM(validaciones)                                    AS total
  FROM stm_validaciones_mensual
 GROUP BY cod_empresa, dsc_linea, mes;
CREATE UNIQUE INDEX idx_mv_slm_pk
  ON mv_stm_linea_mes (cod_empresa, dsc_linea, mes);

DROP MATERIALIZED VIEW IF EXISTS mv_stm_linea_mes_hora;
CREATE MATERIALIZED VIEW mv_stm_linea_mes_hora AS
SELECT cod_empresa,
       dsc_linea,
       mes,
       hora,
       SUM(validaciones) AS val_habil
  FROM stm_validaciones_mensual
 WHERE dow BETWEEN 1 AND 5
 GROUP BY cod_empresa, dsc_linea, mes, hora;
CREATE UNIQUE INDEX idx_mv_slmh_pk
  ON mv_stm_linea_mes_hora (cod_empresa, dsc_linea, mes, hora);
