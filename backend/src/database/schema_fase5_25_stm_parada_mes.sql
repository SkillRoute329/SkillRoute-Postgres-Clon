-- schema_fase5_25_stm_parada_mes.sql (FASE 5.25 — 2026-05-18)
-- Agregado por PARADA para el análisis primario de fuga (sin cartón):
-- (operador, línea, codigo_parada, mes) → validaciones día hábil / total.
-- Permite, a nivel parada e INTERANUAL, ver dónde UCOT perdió y qué línea
-- de otro operador creció en la MISMA parada. Documento compacto (no se
-- escanea el crudo de 66M en el request). Se refresca+verifica offline.
SET statement_timeout = 0;

DROP MATERIALIZED VIEW IF EXISTS mv_stm_parada_mes;
CREATE MATERIALIZED VIEW mv_stm_parada_mes AS
SELECT cod_empresa,
       dsc_linea,
       codigo_parada,
       mes,
       SUM(validaciones) FILTER (WHERE dow BETWEEN 1 AND 5) AS habil,
       SUM(validaciones)                                    AS total
  FROM stm_validaciones_mensual
 WHERE codigo_parada IS NOT NULL AND codigo_parada <> ''
 GROUP BY cod_empresa, dsc_linea, codigo_parada, mes;

CREATE UNIQUE INDEX idx_mv_spm_pk
  ON mv_stm_parada_mes (cod_empresa, dsc_linea, codigo_parada, mes);
-- Para el cruce "misma parada, otro operador" y "mis paradas":
CREATE INDEX idx_mv_spm_parada ON mv_stm_parada_mes (codigo_parada, mes);
CREATE INDEX idx_mv_spm_op_lin ON mv_stm_parada_mes (cod_empresa, dsc_linea, mes);
