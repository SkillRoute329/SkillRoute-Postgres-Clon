@echo off
set PGPASSWORD=Skill329
set PSQL="C:\Program Files\PostgreSQL\16\bin\psql.exe" -p 5433 -U postgres -d skillroute_soberano
set BASEDIR=C:\Users\jonat\Desktop\PROYECTOS\SkillRoute-Postgres-Remoto\gtfs_data

echo Creando tablas GTFS...
%PSQL% -f "C:\Users\jonat\Desktop\PROYECTOS\SkillRoute-Postgres-Remoto\backend\src\database\schema_gtfs.sql"

echo Cargando Agency...
%PSQL% -c "\copy gtfs.agency FROM '%BASEDIR%\agency.txt' WITH CSV HEADER ENCODING 'UTF-8'"

echo Cargando Calendar...
%PSQL% -c "\copy gtfs.calendar FROM '%BASEDIR%\calendar.txt' WITH CSV HEADER ENCODING 'UTF-8'"

echo Cargando Routes...
%PSQL% -c "\copy gtfs.routes FROM '%BASEDIR%\routes.txt' WITH CSV HEADER ENCODING 'UTF-8'"

echo Cargando Trips...
%PSQL% -c "\copy gtfs.trips FROM '%BASEDIR%\trips.txt' WITH CSV HEADER ENCODING 'UTF-8'"

echo Cargando Stops...
%PSQL% -c "\copy gtfs.stops(stop_id,stop_name,stop_code,stop_lat,stop_lon,location_type,stop_url) FROM '%BASEDIR%\stops.txt' WITH CSV HEADER ENCODING 'UTF-8'"

echo Cargando Shapes...
%PSQL% -c "\copy gtfs.shapes FROM '%BASEDIR%\shapes.txt' WITH CSV HEADER ENCODING 'UTF-8'"

echo Cargando Stop Times...
%PSQL% -c "\copy gtfs.stop_times FROM '%BASEDIR%\stop_times.txt' WITH CSV HEADER ENCODING 'UTF-8'"

echo Ejecutando Post-Procesamiento...
%PSQL% -c "UPDATE gtfs.stops SET geom = ST_SetSRID(ST_MakePoint(stop_lon, stop_lat), 4326) WHERE geom IS NULL;"
%PSQL% -c "CREATE INDEX IF NOT EXISTS idx_stops_geom ON gtfs.stops USING GIST(geom);"
%PSQL% -c "CREATE INDEX IF NOT EXISTS idx_stop_times_trip ON gtfs.stop_times(trip_id);"
%PSQL% -c "CREATE INDEX IF NOT EXISTS idx_stop_times_stop ON gtfs.stop_times(stop_id);"
%PSQL% -c "CREATE INDEX IF NOT EXISTS idx_trips_route ON gtfs.trips(route_id);"
%PSQL% -c "CREATE INDEX IF NOT EXISTS idx_shapes_id ON gtfs.shapes(shape_id);"
%PSQL% -c "ANALYZE gtfs.stop_times;"
%PSQL% -c "ANALYZE gtfs.stops;"

echo DONE.
