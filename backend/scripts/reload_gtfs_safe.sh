#!/bin/bash
# reload_gtfs_safe.sh — Recarga GTFS oficial IMM SIN DROP destructivo.
#
# FASE 5.17 (2026-05-16): el loader original (bulk_load_gtfs.ps1 →
# schema_gtfs.sql) hace DROP TABLE ... CASCADE, lo que elimina la vista
# `lineas` (depende de gtfs.routes) y NO la recrea → rompe consumidores.
# Este recarga con TRUNCATE + \copy DENTRO DE UNA TRANSACCIÓN: si algún
# COPY falla, ROLLBACK y gtfs queda intacto (nunca vacío a mitad).
#
# Uso: ./reload_gtfs_safe.sh <dir_con_txt_gtfs>
#   ej: ./reload_gtfs_safe.sh /c/SkillRoute_Master/data_imports/gtfs_premium
set -euo pipefail

DIR="${1:?Falta directorio con los .txt de GTFS}"
PSQL='/c/Program Files/PostgreSQL/15/bin/psql.exe'
export PGPASSWORD="${DB_PASS:-I0SAv9zhoQDUfTPc7L+KmkAw}"
PG=(-U "${DB_USER:-postgres}" -d "${DB_NAME:-skillroute_master}" -h "${DB_HOST:-127.0.0.1}" -p "${DB_PORT:-5432}" -v ON_ERROR_STOP=1)

for f in agency calendar routes trips stops shapes stop_times; do
  [ -f "$DIR/$f.txt" ] || { echo "FALTA $DIR/$f.txt"; exit 1; }
done

echo "[reload_gtfs_safe] recarga transaccional desde $DIR"
"$PSQL" "${PG[@]}" <<SQL
BEGIN;
TRUNCATE gtfs.agency, gtfs.calendar, gtfs.routes, gtfs.trips,
         gtfs.stops, gtfs.shapes, gtfs.stop_times RESTART IDENTITY CASCADE;
\copy gtfs.agency      FROM '$DIR/agency.txt'      WITH CSV HEADER ENCODING 'UTF-8'
\copy gtfs.calendar    FROM '$DIR/calendar.txt'    WITH CSV HEADER ENCODING 'UTF-8'
\copy gtfs.routes      FROM '$DIR/routes.txt'      WITH CSV HEADER ENCODING 'UTF-8'
\copy gtfs.trips       FROM '$DIR/trips.txt'       WITH CSV HEADER ENCODING 'UTF-8'
\copy gtfs.stops(stop_id,stop_name,stop_code,stop_lat,stop_lon,location_type,stop_url) FROM '$DIR/stops.txt' WITH CSV HEADER ENCODING 'UTF-8'
\copy gtfs.shapes      FROM '$DIR/shapes.txt'      WITH CSV HEADER ENCODING 'UTF-8'
\copy gtfs.stop_times  FROM '$DIR/stop_times.txt'  WITH CSV HEADER ENCODING 'UTF-8'
UPDATE gtfs.stops SET geom = ST_SetSRID(ST_MakePoint(stop_lon, stop_lat), 4326);
COMMIT;
SQL

echo "[reload_gtfs_safe] ANALYZE…"
"$PSQL" "${PG[@]}" -c "ANALYZE gtfs.stop_times; ANALYZE gtfs.stops; ANALYZE gtfs.routes; ANALYZE gtfs.trips;" >/dev/null
"$PSQL" "${PG[@]}" -c "SELECT 'routes' t, count(*) FROM gtfs.routes UNION ALL SELECT 'trips', count(*) FROM gtfs.trips UNION ALL SELECT 'stop_times', count(*) FROM gtfs.stop_times;"
echo "[reload_gtfs_safe] OK — vista 'lineas' preservada."

# Regenerar schedule_index.json para que el motor de compliance (scheduleComplianceEngine.ts)
# use los datos GTFS recién cargados. Sin esto, el poller sigue leyendo el JSON viejo
# y clasifica todos los buses como SIN_HORARIO hasta el próximo reinicio del backend.
BACKEND_DIR="$(dirname "$0")/.."
echo "[reload_gtfs_safe] Regenerando schedule_index.json…"
node "$BACKEND_DIR/scripts/regenerate_schedule_index.js" && \
  echo "[reload_gtfs_safe] schedule_index.json actualizado OK." || \
  echo "[reload_gtfs_safe] WARN: falló la regeneración de schedule_index.json (gtfs DB ok, JSON pendiente)."

