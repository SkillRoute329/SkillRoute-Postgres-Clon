#!/bin/bash
# refresh_verify_stm_doc.sh (FASE 5.24 — 2026-05-18)
#
# Estrategia proceso→documento: refresca los AGREGADOS que sirve el informe
# (mv_stm_linea_mes / _hora) desde el crudo, deja stats frescas (ANALYZE) y
# CONFRONTA el documento contra el crudo oficial — TODO OFFLINE, con
# statement_timeout=0. Graba un sello (SHA) y el resultado en
# mv_stm_verificacion. El request NO vuelve a tocar el crudo de 66M filas:
# sólo lee el agregado + el sello ya verificado.
#
# Se corre tras cada ingesta STM (lo invoca ingest_stm_fast.sh) o manual.
set -uo pipefail
PSQL='/c/Program Files/PostgreSQL/15/bin/psql.exe'
export PGPASSWORD='I0SAv9zhoQDUfTPc7L+KmkAw'
PG=(-U postgres -d skillroute_master -h 127.0.0.1 -v ON_ERROR_STOP=1)

"$PSQL" "${PG[@]}" <<'SQL'
SET statement_timeout=0;

-- Tabla de sellos de verificación (auditoría a nivel documento).
CREATE TABLE IF NOT EXISTS mv_stm_verificacion (
  id            BIGSERIAL PRIMARY KEY,
  verificado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  filas_mv      BIGINT,
  filas_raw     BIGINT,
  discrepancias BIGINT,
  ok            BOOLEAN,
  sello         TEXT,
  metodo        TEXT
);

-- 1. Refrescar el documento desde el crudo (CONCURRENTLY: no bloquea lecturas).
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_stm_linea_mes;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_stm_linea_mes_hora;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_stm_parada_mes;

-- 2. Stats frescas: el planner debe usar los índices.
ANALYZE stm_validaciones_mensual;
ANALYZE mv_stm_linea_mes;
ANALYZE mv_stm_linea_mes_hora;
ANALYZE mv_stm_parada_mes;

-- 3. CONFRONTAR documento vs crudo oficial (independiente, offline).
--    Re-agrega el crudo por un camino propio y compara fila a fila.
WITH raw AS (
  SELECT cod_empresa, dsc_linea, mes,
         SUM(validaciones) FILTER (WHERE dow BETWEEN 1 AND 5) AS habil,
         SUM(validaciones)                                    AS total
    FROM stm_validaciones_mensual
   GROUP BY cod_empresa, dsc_linea, mes
), d AS (
  SELECT COALESCE(r.cod_empresa,m.cod_empresa) ce,
         COALESCE(r.dsc_linea,m.dsc_linea)     ln,
         COALESCE(r.mes,m.mes)                 me
    FROM raw r
    FULL JOIN mv_stm_linea_mes m
      ON m.cod_empresa=r.cod_empresa AND m.dsc_linea=r.dsc_linea AND m.mes=r.mes
   WHERE r.habil IS DISTINCT FROM m.habil
      OR r.total IS DISTINCT FROM m.total
), seal AS (
  SELECT count(*)::bigint disc,
         md5(COALESCE(string_agg(ce||'|'||ln||'|'||me::text,','
              ORDER BY ce,ln,me),'OK')) sello
    FROM d
)
INSERT INTO mv_stm_verificacion
  (filas_mv, filas_raw, discrepancias, ok, sello, metodo)
SELECT
  (SELECT count(*) FROM mv_stm_linea_mes),
  (SELECT count(DISTINCT (cod_empresa,dsc_linea,mes)) FROM stm_validaciones_mensual),
  s.disc,
  (s.disc = 0),
  left(md5((SELECT count(*)||'-'||COALESCE(sum(habil),0)||'-'||COALESCE(sum(total),0)
              FROM mv_stm_linea_mes) || '|' || s.sello),16),
  'FULL JOIN mv_stm_linea_mes vs re-agregado de stm_validaciones_mensual (crudo oficial), offline statement_timeout=0'
FROM seal s;
SQL

echo "[refresh_verify] resultado:"
"$PSQL" "${PG[@]}" -c "SELECT verificado_en, filas_mv, filas_raw, discrepancias, ok, sello FROM mv_stm_verificacion ORDER BY id DESC LIMIT 1;"
