#!/bin/bash
# build_sensor_linea.sh (FASE 5.20) — mapa geo sensor de velocidad ↔ línea.
# Activa el dato de velocidad comercial (ingerido pero sin usar): asocia
# cada sensor IMM a las líneas cuyo recorrido GTFS REAL pasa a ≤150 m.
# One-time / re-ejecutable si cambia GTFS. PostGIS, sin statement_timeout.
set -euo pipefail
PSQL='/c/Program Files/PostgreSQL/15/bin/psql.exe'
export PGPASSWORD='I0SAv9zhoQDUfTPc7L+KmkAw'
PG=(-U postgres -d skillroute_master -h 127.0.0.1 -v ON_ERROR_STOP=1)

"$PSQL" "${PG[@]}" <<'SQL'
SET statement_timeout=0;

-- 1. Línea (route_short_name) → su shape representativo como LINESTRING geo.
DROP TABLE IF EXISTS _linea_geom;
CREATE TABLE _linea_geom AS
WITH shp AS (
  SELECT t.shape_id, r.route_short_name AS linea,
         COUNT(*) OVER (PARTITION BY t.shape_id) AS pts
  FROM gtfs.trips t JOIN gtfs.routes r ON r.route_id=t.route_id
  WHERE t.shape_id IS NOT NULL
), best AS (
  SELECT DISTINCT ON (linea) linea, shape_id
  FROM (SELECT linea, shape_id, MAX(pts) pts FROM shp GROUP BY 1,2) z
  ORDER BY linea, pts DESC
)
SELECT b.linea,
       ST_MakeLine(
         ST_SetSRID(ST_MakePoint(s.shape_pt_lon, s.shape_pt_lat),4326)
         ORDER BY s.shape_pt_sequence
       )::geography AS geog
FROM best b
JOIN gtfs.shapes s ON s.shape_id = b.shape_id
GROUP BY b.linea;
CREATE INDEX _lg_gix ON _linea_geom USING GIST (geog);

-- 2. Sensores de velocidad distintos (geo).
DROP TABLE IF EXISTS _sensor_geo;
CREATE TABLE _sensor_geo AS
SELECT DISTINCT cod_detector,
       ST_SetSRID(ST_MakePoint(longitud, latitud),4326)::geography AS geog,
       max(dsc_avenida) AS avenida
FROM velocidad_vehicular
WHERE latitud IS NOT NULL AND longitud IS NOT NULL
GROUP BY cod_detector, longitud, latitud;

-- 3. Mapa final: sensor ↔ línea a ≤150 m del recorrido real.
DROP TABLE IF EXISTS sensor_linea_prox;
CREATE TABLE sensor_linea_prox AS
SELECT s.cod_detector, l.linea, s.avenida,
       round(ST_Distance(s.geog, l.geog)::numeric,0) AS dist_m
FROM _sensor_geo s
JOIN _linea_geom l ON ST_DWithin(s.geog, l.geog, 150);
CREATE INDEX idx_slp_linea ON sensor_linea_prox (linea);
CREATE INDEX idx_slp_det   ON sensor_linea_prox (cod_detector);

DROP TABLE _linea_geom; DROP TABLE _sensor_geo;
SQL

"$PSQL" "${PG[@]}" -c "SELECT count(*) pares, count(DISTINCT linea) lineas, count(DISTINCT cod_detector) sensores FROM sensor_linea_prox;"
echo "[sensor_linea] OK"
